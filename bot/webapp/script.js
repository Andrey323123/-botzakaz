// Telegram WebApp initialization
let tg = window.Telegram.WebApp;
let currentUserId = null;
let currentUser = null;
let usersOnline = new Set();
let messageInterval = null;
let voiceRecognition = null;
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let usersCache = {};

// Initialize the app
function initApp() {
    // Expand WebApp to full screen
    tg.expand();
    
    // Set theme based on Telegram theme
    if (tg.colorScheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    
    // Get user ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('user_id');
    
    if (!currentUserId) {
        showError('User ID not found. Use Telegram bot to open chat.');
        return;
    }
    
    // Load user data
    loadUserData();
    
    // Start loading messages
    loadMessages();
    
    // Start polling for new messages
    startMessagePolling();
    
    // Load online users
    updateOnlineUsers();
    
    // Load group settings
    loadGroupSettings();
    
    // Set up event listeners
    setupEventListeners();
}

// Load user data from backend
async function loadUserData() {
    try {
        const response = await fetch(`/api/user/${currentUserId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                currentUser = data.user;
                updateUserUI();
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fallback to URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        currentUser = {
            user_id: currentUserId,
            first_name: urlParams.get('first_name') || 'User',
            username: urlParams.get('username') || ''
        };
        updateUserUI();
    }
}

// Update user interface
function updateUserUI() {
    if (!currentUser) return;
    
    // Update user name
    const userName = currentUser.first_name + (currentUser.last_name ? ' ' + currentUser.last_name : '');
    document.getElementById('user-name').textContent = userName;
    document.getElementById('profile-name').textContent = userName;
    
    // Update username
    const username = currentUser.username ? '@' + currentUser.username : 'без username';
    document.getElementById('user-username').textContent = username;
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-id').textContent = currentUser.user_id;
    
    // Update profile info
    if (currentUser.created_at) {
        const joinedDate = new Date(currentUser.created_at);
        document.getElementById('profile-joined').textContent = 
            joinedDate.toLocaleDateString('ru-RU');
    }
    
    document.getElementById('profile-messages').textContent = currentUser.message_count || 0;
}

// Load messages from backend
async function loadMessages() {
    try {
        const response = await fetch('/api/messages');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                displayMessages(data.messages);
            }
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display messages in chat
function displayMessages(messages) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Create message element
function createMessageElement(message) {
    const isOutgoing = message.user.user_id == currentUserId;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    // Format time
    const time = message.timestamp ? 
        new Date(message.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        }) : 'now';
    
    // Get user info
    const user = message.user || { first_name: 'User', username: '' };
    const userName = user.first_name;
    
    let contentHTML = '';
    
    switch (message.message_type) {
        case 'photo':
            contentHTML = `
                <div class="message-media">
                    <img src="${message.file_url || 'https://via.placeholder.com/200x150/5682a3/ffffff?text=Photo'}" alt="Photo" onclick="openMedia('${message.file_url}')">
                </div>
            `;
            break;
            
        case 'voice':
            contentHTML = `
                <div class="message-voice">
                    <button class="voice-play-btn" onclick="playVoice('${message.file_id}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <div class="voice-waveform"></div>
                    <div class="voice-duration">0:30</div>
                </div>
            `;
            break;
            
        case 'document':
            contentHTML = `
                <div class="message-document" onclick="downloadFile('${message.file_url}')">
                    <i class="fas fa-file"></i>
                    <span>${message.content || 'Документ'}</span>
                </div>
            `;
            break;
            
        default:
            // Parse mentions and emojis
            let text = message.content || '';
            text = parseMentions(text);
            text = parseEmojis(text);
            contentHTML = `<div class="message-text">${text}</div>`;
    }
    
    messageDiv.innerHTML = `
        ${!isOutgoing ? `
            <div class="message-avatar" style="background-color: ${stringToColor(user.user_id || 'user')}">
                ${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
            </div>
        ` : ''}
        
        <div class="message-content">
            ${!isOutgoing ? `
                <div class="message-header">
                    <div class="message-sender">${userName}</div>
                    <div class="message-time">${time}</div>
                </div>
            ` : ''}
            
            ${contentHTML}
            
            ${isOutgoing ? `
                <div class="message-header" style="justify-content: flex-end;">
                    <div class="message-time">${time}</div>
                </div>
            ` : ''}
        </div>
    `;
    
    return messageDiv;
}

// Send message
async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text && !isRecording) return;
    
    try {
        const messageData = {
            user_id: parseInt(currentUserId),
            message_type: 'text',
            content: text
        };
        
        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageData)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            input.value = '';
            loadMessages(); // Reload messages
        } else {
            showNotification(data.message || 'Ошибка отправки', 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Send photo
async function sendPhoto() {
    // In real app, use Telegram file picker
    // For demo, simulate photo upload
    showNotification('Загрузка фото...', 'info');
    
    setTimeout(async () => {
        const messageData = {
            user_id: parseInt(currentUserId),
            message_type: 'photo',
            file_url: 'https://via.placeholder.com/200x150/5682a3/ffffff?text=Photo',
            content: 'Фото'
        };
        
        try {
            const response = await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageData)
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                loadMessages();
                showNotification('Фото отправлено', 'success');
            }
        } catch (error) {
            showNotification('Ошибка отправки фото', 'error');
        }
    }, 1000);
}

// Send voice message
async function sendVoice() {
    if (!isRecording) {
        startVoiceRecording();
    } else {
        sendVoiceMessage();
    }
}

// Start voice recording
function startVoiceRecording() {
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Show recording UI
    document.getElementById('voice-recording').classList.add('active');
    document.getElementById('message-input').style.display = 'none';
    
    // Start timer
    updateRecordingTimer();
    recordingTimer = setInterval(updateRecordingTimer, 1000);
    
    showNotification('Запись голосового сообщения...', 'info');
}

// Update recording timer
function updateRecordingTimer() {
    if (!isRecording) return;
    
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    document.querySelector('.voice-time').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Limit recording to 2 minutes
    if (elapsed >= 120) {
        sendVoiceMessage();
    }
}

// Send voice message
async function sendVoiceMessage() {
    if (!isRecording) return;
    
    isRecording = false;
    clearInterval(recordingTimer);
    
    // Hide recording UI
    document.getElementById('voice-recording').classList.remove('active');
    document.getElementById('message-input').style.display = '';
    
    showNotification('Отправка голосового сообщения...', 'info');
    
    // Simulate voice message upload
    setTimeout(async () => {
        const messageData = {
            user_id: parseInt(currentUserId),
            message_type: 'voice',
            file_url: '/voice-message.mp3',
            content: 'Голосовое сообщение'
        };
        
        try {
            const response = await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageData)
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                loadMessages();
                showNotification('Голосовое сообщение отправлено', 'success');
            }
        } catch (error) {
            showNotification('Ошибка отправки голосового сообщения', 'error');
        }
    }, 1000);
}

// Cancel voice recording
function cancelVoiceRecording() {
    isRecording = false;
    clearInterval(recordingTimer);
    
    document.getElementById('voice-recording').classList.remove('active');
    document.getElementById('message-input').style.display = '';
    
    showNotification('Запись отменена', 'warning');
}

// Send document
async function sendDocument() {
    showNotification('Загрузка файла...', 'info');
    
    setTimeout(async () => {
        const messageData = {
            user_id: parseInt(currentUserId),
            message_type: 'document',
            content: 'Документ',
            file_url: '/document.pdf'
        };
        
        try {
            const response = await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageData)
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                loadMessages();
                showNotification('Файл отправлен', 'success');
            }
        } catch (error) {
            showNotification('Ошибка отправки файла', 'error');
        }
    }, 1000);
}

// Mention user
function mentionUser() {
    showUserMentionList();
}

// Show user mention list
function showUserMentionList() {
    const mentionList = document.getElementById('mention-list');
    mentionList.innerHTML = '';
    
    Object.values(usersCache).forEach(user => {
        if (user.user_id != currentUserId) {
            const item = document.createElement('div');
            item.className = 'mention-item';
            item.textContent = `@${user.username || user.first_name}`;
            item.onclick = () => {
                const input = document.getElementById('message-input');
                input.value += `@${user.username || user.first_name} `;
                input.focus();
                mentionList.style.display = 'none';
            };
            mentionList.appendChild(item);
        }
    });
    
    mentionList.style.display = 'block';
}

// Parse mentions in text
function parseMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// Parse emojis in text
function parseEmojis(text) {
    const emojiMap = {
        ':)': '😊',
        ':(': '😢',
        ':D': '😄',
        ';)': '😉',
        ':P': '😛',
        ':*': '😘',
        '<3': '❤️',
        ':O': '😮',
        ':|': '😐'
    };
    
    Object.keys(emojiMap).forEach(emoji => {
        text = text.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emojiMap[emoji]);
    });
    
    return text;
}

// Start polling for new messages
function startMessagePolling() {
    messageInterval = setInterval(loadMessages, 3000);
}

// Update online users
async function updateOnlineUsers() {
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                usersOnline = new Set(data.stats.online_users || []);
                
                // Update counters
                document.getElementById('online-count').textContent = data.stats.online_users || 0;
                document.getElementById('sidebar-online-count').textContent = data.stats.online_users || 0;
            }
        }
    } catch (error) {
        console.error('Error updating online users:', error);
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                usersCache = {};
                data.users.forEach(user => {
                    usersCache[user.user_id] = user;
                });
                
                displayUsers(data.users);
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Display users
function displayUsers(users) {
    const container = document.getElementById('users-list');
    container.innerHTML = '';
    
    users.forEach(user => {
        const userElement = createUserElement(user);
        container.appendChild(userElement);
    });
}

// Create user element
function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.onclick = () => showUserActions(user.user_id);
    
    const isOnline = usersOnline.has(user.user_id);
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const status = isOnline ? 
        `<span class="user-item-online">онлайн</span>` : 
        `<span>сообщений: ${user.message_count || 0}</span>`;
    
    userElement.innerHTML = `
        <div class="user-item-avatar" style="background-color: ${stringToColor(user.user_id)}">
            ${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="user-item-info">
            <div class="user-item-name">${userName}</div>
            <div class="user-item-status">${status}</div>
        </div>
        ${user.is_banned ? '<i class="fas fa-ban banned-icon"></i>' : 
          user.is_muted ? '<i class="fas fa-volume-mute muted-icon"></i>' : 
          isOnline ? '<i class="fas fa-circle online-dot"></i>' : ''}
    `;
    
    return userElement;
}

// Load group settings
async function loadGroupSettings() {
    try {
        const response = await fetch('/api/group/settings');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                document.getElementById('chat-title').textContent = data.settings.group_name;
                document.querySelector('.chat-title').textContent = data.settings.group_name;
            }
        }
    } catch (error) {
        console.error('Error loading group settings:', error);
    }
}

// Show user actions
function showUserActions(userId) {
    tg.showPopup({
        title: 'Действия с пользователем',
        message: 'Выберите действие:',
        buttons: [
            { id: 'mention', type: 'default', text: 'Упомянуть' },
            { id: 'profile', type: 'default', text: 'Профиль' },
            userId != currentUserId ? { id: 'message', type: 'default', text: 'Написать в ЛС' } : null,
            { type: 'cancel' }
        ].filter(Boolean)
    }, (buttonId) => {
        if (buttonId === 'mention') {
            const user = usersCache[userId];
            if (user) {
                const input = document.getElementById('message-input');
                input.value += `@${user.username || user.first_name} `;
                input.focus();
                showChat();
            }
        } else if (buttonId === 'profile') {
            showUserProfile(userId);
        } else if (buttonId === 'message') {
            // В будущем можно добавить ЛС
            showNotification('Личные сообщения в разработке', 'info');
        }
    });
}

// Show user profile
function showUserProfile(userId) {
    const user = usersCache[userId];
    if (!user) return;
    
    tg.showPopup({
        title: `Профиль: ${user.first_name}`,
        message: `Username: ${user.username || 'нет'}\nID: ${user.user_id}\nСообщений: ${user.message_count || 0}\nВ чате с: ${new Date(user.created_at).toLocaleDateString('ru-RU')}`,
        buttons: [
            { id: 'close', type: 'cancel', text: 'Закрыть' }
        ]
    });
}

// Setup event listeners
function setupEventListeners() {
    // Send message on Enter
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Close mention list when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.mention-list') && !e.target.closest('.btn-mention')) {
            document.getElementById('mention-list').style.display = 'none';
        }
    });
}

// Utility functions
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 65%)`;
}

function showNotification(message, type = 'info') {
    tg.showPopup({
        title: type === 'error' ? 'Ошибка' : 
               type === 'success' ? 'Успех' : 'Информация',
        message: message,
        buttons: [{ type: 'close' }]
    });
}

function showError(message) {
    const container = document.getElementById('messages-container');
    container.innerHTML = `<div class="error-message">${message}</div>`;
}

// View management functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function showChat() {
    showView('chat-view');
    updateMenuActive(0);
}

function showProfile() {
    showView('profile-view');
    updateMenuActive(1);
}

function showUsers() {
    loadUsers();
    showView('users-view');
    updateMenuActive(2);
}

function showSettings() {
    showView('settings-view');
    updateMenuActive(3);
}

function showView(viewId) {
    document.querySelectorAll('.chat-container, .profile-container, .users-container, .settings-container').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

function updateMenuActive(index) {
    document.querySelectorAll('.menu-item').forEach((item, i) => {
        if (i === index) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initApp);

// Clean up on unload
window.addEventListener('beforeunload', () => {
    if (messageInterval) {
        clearInterval(messageInterval);
    }
    if (recordingTimer) {
        clearInterval(recordingTimer);
    }
});
