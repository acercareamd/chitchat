from flask import Flask, render_template, request, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit, disconnect
import os
from datetime import datetime
import time

app = Flask(__name__)
# app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')

app.config['SECRET_KEY'] = 'your_secret_key'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

socketio = SocketIO(app)

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

@socketio.on('message')
def handle_message(data):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    emit('message', {'username': data['username'], 'message': data['message'], 'timestamp': timestamp}, broadcast=True)

@socketio.on('image')
def handle_image(data):
    image_data = data['image_data']
    filename = data['filename']
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    with open(filepath, 'wb') as f:
        f.write(image_data)

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    emit('image', {'username': data['username'], 'image_url': url_for('uploaded_file', filename=filename), 'filename': filename, 'timestamp': timestamp}, broadcast=True)

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
        time.sleep(1)  # Check every second
        current_time = time.time()
        for username in list(users.keys()):
            last_active = users[username]['last_active']
            if users[username]['status'] == 'online' and (current_time - last_active > 10):
                handle_user_status({'username': username, 'status': 'offline'})
        socketio.sleep(1)  # Yield control to avoid blocking

if __name__ == '__main__':
    socketio.start_background_task(check_user_status)
    socketio.run(app, debug=True)
