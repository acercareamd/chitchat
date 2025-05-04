import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import threading
import time
from datetime import datetime

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Uploads')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_secret_key')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    ping_timeout=120,
    ping_interval=30
)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

users = {}
active_usernames = {}  # {security_code: set(active_usernames)}
user_lock = threading.Lock()

@app.after_request
def skip_ngrok_warning(response):
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

@app.route('/')
def index():
    error = request.args.get('error')
    return render_template('index.html', error=error)

@app.route('/check_username', methods=['POST'])
def check_username():
    data = request.get_json()
    username = data.get('username', '').lower()
    security_code = data.get('security_code', '')
    
    if not username or not security_code:
        return jsonify({'error': 'Username and security code are required.'}), 400
    
    with user_lock:
        if security_code not in active_usernames:
            active_usernames[security_code] = set()
        
        if username in active_usernames[security_code]:
            return jsonify({'error': 'This username is already reserved in this room. Please choose a different username.'}), 409
        
        for user, info in users.items():
            if user == username and info['security_code'] == security_code:
                return jsonify({'error': 'This username is already active in this room. Please choose a different username.'}), 409
        
        active_usernames[security_code].add(username)
    
    return jsonify({'success': True})

@app.route('/chat')
def chat():
    username = request.args.get('username')
    security_code = request.args.get('security_code')
    if not username or not security_code:
        return redirect(url_for('index', error='Username and security code are required'))
    
    username = username.lower()
    with user_lock:
        if security_code not in active_usernames or username not in active_usernames[security_code]:
            return redirect(url_for('index', error='Invalid username or security code'))
        
        for user, info in users.items():
            if user == username and info['security_code'] == security_code:
                active_usernames[security_code].discard(username)
                return redirect(url_for('index', error='Username is already active in this room'))
    
    return render_template('chat.html', username=username, security_code=security_code)

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('join_room')
def handle_join_room(data):
    username = data['username'].lower()
    security_code = data['security_code']
    
    with user_lock:
        if security_code not in active_usernames:
            active_usernames[security_code] = set()

        # Allow rejoin if user was already in the room
        if username in users and users[username]['security_code'] == security_code:
            print(f"{username} rejoined room {security_code}")
            users[username]['status'] = 'online'
            users[username]['last_active'] = time.time()
            users[username]['sid'] = request.sid
            join_room(security_code)
            active_usernames[security_code].add(username)
            emit('join_ack', {'username': username, 'status': 'online'}, room=request.sid)
            return

        # Check if not previously joined or blocked
        if username not in active_usernames[security_code]:
            emit('username_error', {
                'message': 'Invalid username or security code.',
                'block': True
            })
            print(f"Rejected join for {username} in {security_code}: Not reserved")
            return
        
        for user, info in users.items():
            if user == username and info['security_code'] == security_code:
                active_usernames[security_code].discard(username)
                emit('username_error', {
                    'message': 'This username is already active in this room.',
                    'block': True
                })
                print(f"Rejected join for {username} in {security_code}: Already active")
                return
        
        join_room(security_code)
        users[username] = {'status': 'online', 'last_active': time.time(), 'security_code': security_code, 'sid': request.sid}
        active_usernames[security_code].add(username)
        print(f"{username} joined room {security_code}")
    
    emit('join_ack', {'username': username, 'status': 'online'}, room=request.sid)

@socketio.on('message')
def handle_message(data):
    security_code = data['security_code']
    username = data['username'].lower()
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    with user_lock:
        conditions = {
            'in_users': username in users,
            'security_code_match': users.get(username, {}).get('security_code') == security_code,
            'status_online': users.get(username, {}).get('status') == 'online',
            'in_active_usernames': username in active_usernames.get(security_code, set())
        }
        if not all(conditions.values()):
            print(f"Message rejected for {username}: {conditions}")
        else:
            users[username]['last_active'] = time.time()
            print(f"Broadcasting message from {username} to room {security_code}: {data['message']}")
            emit('message', {
                'username': username,
                'message': data['message'],
                'timestamp': timestamp
            }, room=security_code)

@socketio.on('image')
def handle_image(data):
    try:
        security_code = data['security_code']
        username = data['username'].lower()
        image_data = data['image_data']
        filename = data['filename']
        mime_type = data['mime_type']
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with user_lock:
            conditions = {
                'in_users': username in users,
                'security_code_match': users.get(username, {}).get('security_code') == security_code,
                'status_online': users.get(username, {}).get('status') == 'online',
                'in_active_usernames': username in active_usernames.get(security_code, set())
            }
            if not all(conditions.values()):
                print(f"Image rejected for {username}: {conditions}")
            else:
                users[username]['last_active'] = time.time()
                print(f"Broadcasting image from {username} to room {security_code}: {filename}")
                emit('image', {
                    'username': username,
                    'image_data': image_data,
                    'filename': filename,
                    'mime_type': mime_type,
                    'timestamp': timestamp
                }, room=security_code)
    except Exception as e:
        print(f"Error handling image: {e}")
        emit('image_error', {'message': 'Failed to upload image.'}, room=security_code)

@socketio.on('user_status')
def handle_user_status(data):
    username = data['username'].lower()
    status = data['status']
    security_code = data['security_code']
    
    with user_lock:
        if username in users and users[username]['security_code'] == security_code:
            if users[username]['status'] != status:
                users[username]['status'] = status
                users[username]['last_active'] = time.time()
                if status == 'online':
                    active_usernames.setdefault(security_code, set()).add(username)
                elif status == 'offline' and username in active_usernames.get(security_code, set()):
                    active_usernames[security_code].discard(username)
                print(f"Emitting user_status: {username} is {status} to room {security_code}")
                emit('user_status', {'username': username, 'status': status}, room=security_code)
            print(f"User status updated: {username} is {status}")

@socketio.on('disconnect')
def handle_disconnect():
    with user_lock:
        for username in list(users.keys()):
            if users[username]['sid'] == request.sid:
                security_code = users[username]['security_code']
                print(f"User {username} disconnected from {security_code}")
                active_usernames.get(security_code, set()).discard(username)
                emit('user_status', {'username': username, 'status': 'offline'}, room=security_code)
                leave_room(security_code)
                del users[username]
                break



def check_user_status():
    while True:
        with user_lock:
            current_time = time.time()
            offline_users = []
            for username in list(users.keys()):
                last_active = users[username]['last_active']
                if users[username]['status'] == 'online' and (current_time - last_active > 60):
                    offline_users.append(username)

            for user in offline_users:
                users[user]['status'] = 'offline'
                security_code = users[user]['security_code']
                active_usernames.get(security_code, set()).discard(user)
                print(f"Auto-updating {user} to offline in room {security_code}")
                emit('user_status', {'username': user, 'status': 'offline'}, room=security_code)
        time.sleep(10)

status_thread = threading.Thread(target=check_user_status)
status_thread.daemon = True
status_thread.start()

if __name__ == '__main__':
    socketio.run(app, debug=True,host='0.0.0.0', port=5000)
