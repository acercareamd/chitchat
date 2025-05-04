function initializeSocket(username, security_code) {
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 30000
    });

    let connectionState = false;
    let accessBlocked = false;
    let currentStatus = 'offline';
    let wasOffline = false;

    socket.on('join_ack', function (data) {
        if (!connectionState) {
            appendStatusMessage(data.username, data.status);
            connectionState = true;
            accessBlocked = false;
            wasOffline = false;
            setupFocusListeners();
            hideUsernameBlock();
            emitStatusIfChanged('online');
            console.log('Joined room, messaging enabled for', username);
        }
    });

    socket.on('username_error', function (data) {
        accessBlocked = data.block || false;
        if (accessBlocked) {
            showUsernameBlock(data.message);
            socket.disconnect();
            console.log('Username error, messaging disabled:', data.message);
        }
    });

    socket.on('connect', function () {
        if (!connectionState && !accessBlocked) {
            socket.emit('join_room', { username: username, security_code: security_code });
            console.log('Connected, attempting to join room for', username);
        }
    });

    socket.on('reconnect', function () {
        console.log('Reconnected, rejoining room for', username);
        connectionState = false;
        accessBlocked = false;
        wasOffline = false;
        currentStatus = 'offline';
        if (!accessBlocked) {
            socket.emit('join_room', { username: username, security_code: security_code });
        }
    });

    socket.on('connect_error', function (error) {
        console.log('Connection error:', error);
    });

    socket.on('connect_timeout', function () {
        console.log('Connection timeout');
    });

    function emitStatusIfChanged(newStatus) {
        if (newStatus !== currentStatus && !accessBlocked) {
            currentStatus = newStatus;
            socket.emit('user_status', {
                username: username,
                status: newStatus,
                security_code: security_code
            });
            if (newStatus === 'offline') {
                wasOffline = true;
            } else if (newStatus === 'online' && wasOffline) {
                socket.emit('join_room', { username: username, security_code: security_code });
                wasOffline = false;
            }
            console.log('Status changed to', newStatus, 'for', username, 'wasOffline:', wasOffline);
        }
    }

    function setupFocusListeners() {
        window.addEventListener('focus', function () {
            emitStatusIfChanged('online');
        });

        window.addEventListener('blur', function () {
            emitStatusIfChanged('offline');
        });

        setInterval(() => {
            if (document.hasFocus()) {
                emitStatusIfChanged('online');
            }
        }, 30000);
    }

    socket.on('disconnect', function () {
        if (!accessBlocked) {
            emitStatusIfChanged('offline');
        }
        connectionState = false;
        console.log('Disconnected from server for', username);
    });

    socket.on('message', function (data) {
        console.log('Received message:', data);
        appendMessage(data.username, data.message, data.timestamp);
    });

    socket.on('image', function (data) {
        console.log('Received image:', data.filename);
        appendImageMessage(data.username, data.image_data, data.filename, data.mime_type, data.timestamp);
    });

    socket.on('user_status', function (data) {
        console.log(`Received user_status: ${data.username} is ${data.status}`);
        appendStatusMessage(data.username, data.status);
    });

    document.getElementById('message-input').addEventListener('keypress', function (event) {
        if (event.key === 'Enter' && !accessBlocked) {
            event.preventDefault();
            sendMessage(socket, username, security_code);
        } else if (accessBlocked) {
            console.log('Messaging blocked for', username);
        }
    });

    document.getElementById('send-button').addEventListener('click', function () {
        if (!accessBlocked) {
            sendMessage(socket, username, security_code);
        } else {
            console.log('Messaging blocked for', username);
        }
    });

    document.getElementById('image-input').addEventListener('change', function () {
        if (!accessBlocked) {
            var file = this.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    var arrayBuffer = e.target.result;
                    var image_data = new Uint8Array(arrayBuffer);
                    var filename = file.name;
                    var mime_type = file.type;
                    socket.emit('image', {
                        username: username,
                        image_data: image_data,
                        filename: filename,
                        mime_type: mime_type,
                        security_code: security_code
                    });
                    console.log('Sent image:', filename);
                };
                reader.onerror = function () {
                    alert("Error reading file.");
                    console.error('File read error for', filename);
                };
                reader.readAsArrayBuffer(file);
            }
        } else {
            console.log('Image upload blocked for', username);
        }
    });

    const chatBox = document.getElementById('chat-box');
    const messageInput = document.getElementById('message-input');
    let isKeyboardActive = false;

    messageInput.addEventListener('focus', function () {
        if (window.innerWidth <= 600) {
            isKeyboardActive = true;
        }
    });

    messageInput.addEventListener('blur', function () {
        isKeyboardActive = false;
    });

    chatBox.addEventListener('touchmove', function (event) {
        if (window.innerWidth <= 600) {
            event.stopPropagation();
            if (isKeyboardActive) {
                const atTop = chatBox.scrollTop <= 0;
                const atBottom = chatBox.scrollTop >= chatBox.scrollHeight - chatBox.clientHeight;
                if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY < 0)) {
                    event.preventDefault();
                }
            } else {
                const atTop = chatBox.scrollTop <= 0;
                const atBottom = chatBox.scrollTop >= chatBox.scrollHeight - chatBox.clientHeight;
                if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) {
                    event.preventDefault();
                }
            }
        }
    }, { passive: false });

    document.addEventListener('touchmove', function (event) {
        if (window.innerWidth <= 600) {
            event.preventDefault();
        }
    }, { passive: false });
}



function showUsernameBlock(message) {
    const blockDiv = document.createElement('div');
    blockDiv.id = 'username-block';
    blockDiv.className = 'username-block';
    blockDiv.innerHTML = `
        <div class="block-content">
            <p>${message}</p>
            <button onclick="window.location.href='/'">Choose Different Username</button>
        </div>
    `;
    document.body.appendChild(blockDiv);
    accessBlocked = true;
}

function hideUsernameBlock() {
    const blockDiv = document.getElementById('username-block');
    if (blockDiv) {
        document.body.removeChild(blockDiv);
        accessBlocked = false;
    }
}

function sendMessage(socket, username, security_code) {
    var input = document.getElementById('message-input');
    var message = input.value;
    if (message.trim() !== "") {
        var timestamp = new Date().toISOString();
        socket.emit('message', {
            username: username,
            message: message,
            timestamp: timestamp,
            security_code: security_code
        });
        input.value = '';
        console.log('Sent message:', { username, message, timestamp });
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        console.error('Invalid timestamp:', timestamp);
        return 'Invalid Time';
    }
    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function appendMessage(username, message, timestamp) {
    try {
        var chatBox = document.getElementById('chat-box');
        var messageContainer = document.createElement('div');
        messageContainer.classList.add('message-container');
        var messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.innerHTML = `<div class="text">${message}</div>`;
        var usernameDiv = document.createElement('div');
        usernameDiv.classList.add('username');
        usernameDiv.textContent = `${username} • ${formatTimestamp(new Date(timestamp))}`;
        messageContainer.appendChild(messageDiv);
        messageContainer.appendChild(usernameDiv);
        chatBox.appendChild(messageContainer);
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        console.error('Error appending message:', error, { username, message, timestamp });
    }
}

function appendImageMessage(username, imageData, filename, mimeType, timestamp) {
    try {
        var chatBox = document.getElementById('chat-box');
        var messageContainer = document.createElement('div');
        messageContainer.classList.add('message-container');
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
        usernameDiv.textContent = `${username} • ${formatTimestamp(new Date(timestamp))}`;
        messageContainer.appendChild(messageDiv);
        messageContainer.appendChild(usernameDiv);
        chatBox.appendChild(messageContainer);
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        console.error('Error appending image message:', error, { username, filename, timestamp });
    }
}

function appendStatusMessage(username, status) {
    try {
        var chatBox = document.getElementById('chat-box');
        var existingMessages = chatBox.getElementsByClassName('status-message');
        
        for (var i = existingMessages.length - 1; i >= 0; i--) {
            if (existingMessages[i].dataset.username === username) {
                chatBox.removeChild(existingMessages[i]);
            }
        }
        
        var newMessage = document.createElement('div');
        newMessage.classList.add('status-message');
        newMessage.dataset.username = username;
        newMessage.innerHTML = `<em>${username} is ${status} • ${formatTimestamp(new Date())}</em>`;
        chatBox.appendChild(newMessage);
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        console.error('Error appending status message:', error, { username, status });
    }
}

function openImageModal(imageUrl, filename) {
    try {
        var modal = document.getElementById('image-modal');
        var modalImg = document.getElementById('modal-image');
        var captionText = document.getElementById('caption');
        modal.style.display = "block";
        modalImg.src = imageUrl;
        captionText.innerHTML = filename;
        var closeModal = document.getElementsByClassName('close-modal')[0];
        closeModal.onclick = function () {
            modal.style.display = "none";
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
    } catch (error) {
        console.error('Error opening image modal:', error, { imageUrl, filename });
    }
}
