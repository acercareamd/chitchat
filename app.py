from flask import Flask, render_template, request, redirect, url_for, send_from_directory, jsonify
from flask_socketio import SocketIO, emit
import os
import threading
import base64
import time
from datetime import datetime

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_secret_key')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 🔹 Increase max file size to 100MB

socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

users = {}

@app.after_request
def skip_ngrok_warning(response):
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

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
        image_data = data['image_data']
        filename = f"{int(time.time())}_{data['filename']}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        # 🔹 Save image in chunks for large files
        with open(filepath, 'wb') as f:
            f.write(base64.b64decode(image_data.split(',')[1]))  # Remove "data:image/png;base64," part

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        image_url = url_for('uploaded_file', filename=filename, _external=True)

        # 🔹 Emit success response
        emit('image', {
            'username': data['username'],
            'image_url': image_url,
            'filename': filename,
            'timestamp': timestamp
        }, broadcast=True)
    except Exception as e:
        print(f"Error handling image: {e}")
        emit('image_error', {'message': 'Failed to upload image.'})

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
        offline_users = []
        for username in list(users.keys()):
            last_active = users[username]['last_active']
            if users[username]['status'] == 'online' and (current_time - last_active > 10):
                offline_users.append(username)

        for user in offline_users:
            handle_user_status({'username': user, 'status': 'offline'})

        time.sleep(1)  # Run every 1 second

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))

    # Run background task in a separate thread
    threading.Thread(target=check_user_status, daemon=True).start()

    socketio.run(app, host='0.0.0.0', port=port, debug=True)
