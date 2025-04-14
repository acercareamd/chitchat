function initializeSocket(username) {
    const socket = io();
    let currentStatus = null; // Tracks the current status (online/offline)
    let statusEmitted = false; // Flag to ensure emission happens only once per focus/blur

    // Function to emit the status change if it has changed
    function emitStatusIfChanged(newStatus) {
        if (newStatus !== currentStatus) {
            currentStatus = newStatus;
            socket.emit('user_status', { username: username, status: newStatus });
            statusEmitted = true; // Mark that we've emitted the status
        }
    }

    // Handle page focus (user is active on the page)
    function handleFocus() {
        if (!statusEmitted) {
            emitStatusIfChanged('online'); // User is now online
        }
    }

    // Handle page blur (user switches tabs or minimizes the window)
    function handleBlur() {
        if (!statusEmitted) {
            emitStatusIfChanged('offline'); // User is now offline
        }
    }

    // Listen for focus and blur events to detect when the user is active or inactive
    window.addEventListener('focus', function () {
        statusEmitted = false; // Reset flag when the page gains focus
        handleFocus(); // Check if status should be changed to online
    });

    window.addEventListener('blur', function () {
        statusEmitted = false; // Reset flag when the page loses focus
        handleBlur(); // Check if status should be changed to offline
    });

    // Emit status when socket connects or disconnects
    socket.on('connect', function () {
        emitStatusIfChanged('online');
    });

    socket.on('disconnect', function () {
        emitStatusIfChanged('offline');
    });

    // Handle incoming messages
    socket.on('message', function (data) {
        appendMessage(data.username, data.message, data.timestamp);
    });

    // Handle incoming image messages
    socket.on('image', function (data) {
        appendImageMessage(data.username, data.image_data, data.filename, data.mime_type, data.timestamp);
    });

    // Handle user status updates
    socket.on('user_status', function (data) {
        appendStatusMessage(data.username, data.status);
    });

    // Send message when enter key is pressed or send button is clicked
    document.getElementById('message-input').addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage(socket, username);
        }
    });

    document.getElementById('send-button').addEventListener('click', function () {
        sendMessage(socket, username);
    });

    // Image input change handler
    document.getElementById('image-input').addEventListener('change', function () {
        var file = this.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var arrayBuffer = e.target.result;
                var image_data = new Uint8Array(arrayBuffer); // Raw binary data
                var filename = file.name;
                var mime_type = file.type; // e.g., 'image/png'
                socket.emit('image', {
                    'username': username,
                    'image_data': image_data, // Send raw binary data
                    'filename': filename,
                    'mime_type': mime_type
                });
            };
            reader.onerror = function () {
                alert("Error reading file.");
            };
            reader.readAsArrayBuffer(file); // Read as ArrayBuffer
        }
    });

    // Initial check when the page is loaded (in case user is already focused)
    if (document.hasFocus()) {
        emitStatusIfChanged('online');
    }
}

// Send a message
function sendMessage(socket, username) {
    var input = document.getElementById('message-input');
    var message = input.value;
    if (message.trim() !== "") {
        var timestamp = new Date().toISOString();
        socket.send({ 'username': username, 'message': message, 'timestamp': timestamp });
        input.value = '';
    }
}

// Format timestamp (24-hour with seconds)
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// Append text message to chat box
function appendMessage(username, message, timestamp) {
    var chatBox = document.getElementById('chat-box');

    var messageContainer = document.createElement('div');
    messageContainer.classList.add('message-container');

    var messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.innerHTML = `<div class="text">${message}</div>`;

    var usernameDiv = document.createElement('div');
    usernameDiv.classList.add('username');
    // Use client's local time by creating a new Date object
    usernameDiv.textContent = `${username}  ${formatTimestamp(new Date())}`;

    messageContainer.appendChild(messageDiv);
    messageContainer.appendChild(usernameDiv);

    chatBox.appendChild(messageContainer);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Append image message to chat box
function appendImageMessage(username, imageData, filename, mimeType, timestamp) {
    var chatBox = document.getElementById('chat-box');

    var messageContainer = document.createElement('div');
    messageContainer.classList.add('message-container');

    // Create Blob from binary data
    var blob = new Blob([imageData], { type: mimeType });
    var imageUrl = URL.createObjectURL(blob);

    var messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.innerHTML = `
        <div class="text">
            <button class="view-button" onclick="openImageModal('${imageUrl}', '${filename}')">View Image</button>
            
        </div>
    `;

    var usernameDiv = document.createElement('div');
    usernameDiv.classList.add('username');
    // Use client's local time by creating a new Date object
    usernameDiv.textContent = `${username} • ${formatTimestamp(new Date())}`;

    messageContainer.appendChild(messageDiv);
    messageContainer.appendChild(usernameDiv);

    chatBox.appendChild(messageContainer);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Append status message to chat box
function appendStatusMessage(username, status) {
    var chatBox = document.getElementById('chat-box');
    var newMessage = document.createElement('div');
    newMessage.classList.add('status-message');
    newMessage.innerHTML = `<em>${username} is ${status}</em>`;
    chatBox.appendChild(newMessage);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Open image modal
function openImageModal(imageUrl, filename) {
    var modal = document.getElementById('image-modal');
    var modalImg = document.getElementById('modal-image');
    var captionText = document.getElementById('caption');

    modal.style.display = "block";
    modalImg.src = imageUrl; // Use Blob URL
    captionText.innerHTML = filename;

    var closeModal = document.getElementsByClassName('close-modal')[0];
    closeModal.onclick = function () {
        modal.style.display = "none";
        // Revoke Blob URL to free memory
        URL.revokeObjectURL(imageUrl);
    };

    window.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = "none";
            URL.revokeObjectURL(imageUrl);
        }
    };

    document.onkeydown = function (event) {
        if (event.key === "Escape") {
            modal.style.display = "none";
            URL.revokeObjectURL(imageUrl);
        }
    };
}