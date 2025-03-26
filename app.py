from flask import Flask, render_template, request, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit
import os
from datetime import datetime
import time
import base64  # Added for image handling

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_secret_key')  # Use env var for security
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

socketio = SocketIO(app, cors_allowed_origins="*")  # Allow all origins for simplicity

# Ensure upload folder exists
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

users = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat')
def chat():
    username = request.args.get('username')
    if not username:
        return redirect(url_for('index'))
    return render_template('chat.html', username=username)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('message')
def handle_message(data):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    emit('message', {
        'username': data['username'],
        'message': data['message'],
        'timestamp': timestamp
    }, broadcast=True)

@socketio.on('image')
def handle_image(data):
    try:
        # Assuming image_data is base64 encoded string from client
        image_data = base64.b64decode(data['image_data'].split(',')[1])  # Remove data URI prefix
        filename = data['filename']
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        with open(filepath, 'wb') as f:
            f.write(image_data)

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        emit('image', {
            'username': data['username'],
            'image_url': url_for('uploaded_file', filename=filename, _external=True),  # Full URL
            'filename': filename,
            'timestamp': timestamp
        }, broadcast=True)
    except Exception as e:
        print(f"Error handling image: {e}")

@socketio.on('user_status')
def handle_user_status(data):
    username = data['username']
    status = data['status']
    users[username] = {'status': status, 'last_active': time.time()}
    emit('user_status', {'username': username, 'status': status}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    for username in list(users.keys()):
        if users[username]['status'] == 'online':
            handle_user_status({'username': username, 'status': 'offline'})

def check_user_status():
    while True:
        current_time = time.time()
        for username in list(users.keys()):
            last_active = users[username]['last_active']
            if users[username]['status'] == 'online' and (current_time - last_active > 10):
                handle_user_status({'username': username, 'status': 'offline'})
        time.sleep(1)  # Non-blocking sleep

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))  # Railway provides PORT env var
    socketio.start_background_task(check_user_status)
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)  # Required for Railway