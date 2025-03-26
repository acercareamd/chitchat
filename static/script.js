    function initializeSocket(username) {
        var socket = io();

        // Emit user status when connected or disconnected
        socket.on('connect', function() {
            socket.emit('user_status', { username: username, status: 'online' });
        });

        socket.on('disconnect', function() {
            socket.emit('user_status', { username: username, status: 'offline' });
        });

        // Handle incoming messages
        socket.on('message', function(data) {
            appendMessage(data.username, data.message, data.timestamp);
        });

        // Handle incoming images
        socket.on('image', function(data) {
            appendImageMessage(data.username, data.image_url, data.filename, data.timestamp);
        });

        // Handle user status updates
        socket.on('user_status', function(data) {
            appendStatusMessage(data.username, data.status);
        });

        // Send message on Enter key press or Send button click
        document.getElementById('message-input').addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage(socket, username);
            }
        });

        document.getElementById('send-button').addEventListener('click', function() {
            sendMessage(socket, username);
        });

        // Send image when file input changes
        document.getElementById('image-input').addEventListener('change', function() {
            var file = this.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function(e) {
                    var arrayBuffer = e.target.result;
                    var image_data = new Uint8Array(arrayBuffer);
                    var filename = file.name;
                    socket.emit('image', { 'username': username, 'image_data': image_data, 'filename': filename });
                };
                reader.onerror = function() {
                    alert("Error reading file.");
                };
                reader.readAsArrayBuffer(file);
            }
        });
    }

    // Send a message
    function sendMessage(socket, username) {
        var input = document.getElementById('message-input');
        var message = input.value;
        if (message.trim() !== "") {
            var timestamp = new Date().toISOString(); // Get the current timestamp
            socket.send({ 'username': username, 'message': message, 'timestamp': timestamp });
            input.value = '';
        }
    }

    // Append a message to the chat box
    function appendMessage(username, message, timestamp) {
        var chatBox = document.getElementById('chat-box');
        var newMessage = document.createElement('div');
        newMessage.classList.add('message');
        newMessage.innerHTML = `
            <strong>${username}:</strong> ${message}<br>
            <span class="timestamp">${timestamp}</span>
        `;
        newMessage.onclick = function() {
            this.querySelector('.timestamp').style.display = 'inline';
        };
        chatBox.appendChild(newMessage);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Append an image message to the chat box
    function appendImageMessage(username, imageUrl, filename, timestamp) {
        var chatBox = document.getElementById('chat-box');
        var newMessage = document.createElement('div');
        newMessage.classList.add('message');
        newMessage.innerHTML = `
            <strong>${username}:</strong><br>
            <button class="view-button" onclick="openImageModal('${imageUrl}', '${filename}')">View Image</button><br>
            <span class="timestamp">${timestamp}</span>
        `;
        newMessage.onclick = function() {
            this.querySelector('.timestamp').style.display = 'inline';
        };
        chatBox.appendChild(newMessage);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Append a status message to the chat box
    function appendStatusMessage(username, status) {
        var chatBox = document.getElementById('chat-box');
        var newMessage = document.createElement('div');
        newMessage.classList.add('message');
        newMessage.innerHTML = `<em>${username} is ${status}</em>`;
        chatBox.appendChild(newMessage);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Open the image in a modal
    function openImageModal(imageUrl, filename) {
        var modal = document.getElementById('image-modal');
        var modalImg = document.getElementById('modal-image');
        var captionText = document.getElementById('caption');

        modal.style.display = "block";
        modalImg.src = imageUrl;
        captionText.innerHTML = filename;

        var closeModal = document.getElementsByClassName('close-modal')[0];
        closeModal.onclick = function() {
            modal.style.display = "none";
        };

        // Close modal when clicking outside of the image
        window.onclick = function(event) {
            if (event.target === modal) {
                modal.style.display = "none";
            }
        };

        // Close modal on escape key press
        document.onkeydown = function(event) {
            if (event.key === "Escape") {
                modal.style.display = "none";
            }
        };
    }

