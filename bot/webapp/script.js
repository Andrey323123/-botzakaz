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

// Initialize the app
function initApp() {
    // Expand WebApp to full screen
    tg.expand();
    
    // Set theme based on Telegram theme
    if (tg.colorScheme === 'dark') {
        setTheme('dark');
    }
    
    // Get user ID from URL parameters or Telegram
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('user_id') || tg.initDataUnsafe.user?.id;
    
    if (!currentUserId) {
        console.error('User ID not found');
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
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize voice recognition if available
    initVoiceRecognition();
}

// Load user data from backend
async function loadUserData() {
    try {
        const response = await fetch(`/api/user/${currentUserId}`);
        if (response.ok) {
            currentUser = await response.json();
            updateUserUI();
        } else {
            // Create user from Telegram data
            const tgUser = tg.initDataUnsafe.user;
            currentUser = {
                id: tgUser.id,
                username: tgUser.username,
                first_name: tgUser.first_name,
                last_name: tgUser.last_name,
                photo_url: tgUser.photo_url
            };
            
            // Register user on backend
            await registerUser(currentUser);
            updateUserUI();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fallback to Telegram data
        const tgUser = tg.initDataUnsafe.user || {
            id: currentUserId,
            username: 'user' + currentUserId,
            first_name: 'User',
            last_name: ''
        };
        currentUser = tgUser;
        updateUserUI();
    }
}

// Register new user
async function registerUser(userData) {
    try {
        await fetch('/api/user/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });
    } catch (error) {
        console.error('Error registering user:', error);
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
    document.getElementById('profile-id').textContent = currentUser.id;
    
    // Update avatar
    if (currentUser.photo_url) {
        document.getElementById('user-avatar').style.backgroundImage = `url(${currentUser.photo_url})`;
        document.getElementById('user-avatar').innerHTML = '';
        document.getElementById('profile-avatar').style.backgroundImage = `url(${currentUser.photo_url})`;
        document.getElementById('profile-avatar').innerHTML = '';
    }
}

// Load messages from backend
async function loadMessages() {
    try {
        const response = await fetch('/api/messages');
        if (response.ok) {
            const messages = await response.json();
            displayMessages(messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        // Show sample messages for demo
        showSampleMessages();
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
    const isOutgoing = message.user_id == currentUserId;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    // Format time
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Get user info
    const user = message.user || { first_name: 'User', username: '' };
    const userName = user.first_name;
    
    let contentHTML = '';
    
    switch (message.message_type) {
        case 'photo':
            contentHTML = `
                <div class="message-media">
                    <img src="${message.file_url || '/placeholder-image.jpg'}" alt="Photo">
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
                <div class="message-document">
                    <i class="fas fa-file"></i>
                    <span>Документ</span>
                </div>
            `;
            break;
            
        default:
            // Parse mentions
            let text = message.content || '';
            text = parseMentions(text);
            text = parseEmojis(text);
            contentHTML = `<div class="message-text">${text}</div>`;
    }
    
    messageDiv.innerHTML = `
        ${!isOutgoing ? `
            <div class="message-avatar">
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
            user_id: currentUserId,
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
        
        if (response.ok) {
            input.value = '';
            loadMessages(); // Reload messages
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Send photo
async function sendPhoto() {
    tg.showPopup({
        title: 'Отправить фото',
        message: 'Выберите фото',
        buttons: [
            { id: 'camera', type: 'default', text: 'Камера' },
            { id: 'gallery', type: 'default', text: 'Галерея' },
            { type: 'cancel' }
        ]
    }, (buttonId) => {
        if (buttonId === 'camera' || buttonId === 'gallery') {
            // In real app, use Telegram file picker
            // For demo, simulate photo upload
            simulatePhotoUpload();
        }
    });
}

// Simulate photo upload (for demo)
function simulatePhotoUpload() {
    showNotification('Загрузка фото...', 'info');
    
    setTimeout(async () => {
        const messageData = {
            user_id: currentUserId,
            message_type: 'photo',
            file_url: 'https://via.placeholder.com/200x150/5682a3/ffffff?text=Photo'
        };
        
        try {
            await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageData)
            });
            loadMessages();
            showNotification('Фото отправлено', 'success');
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
    if (!voiceRecognition) {
        showNotification('Голосовые сообщения не поддерживаются в вашем браузере', 'error');
        return;
    }
    
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Show recording UI
    document.getElementById('voice-recording').classList.add('active');
    document.getElementById('message-input').style.display = 'none';
    
    // Start timer
    updateRecordingTimer();
    recordingTimer = setInterval(updateRecordingTimer, 1000);
    
    // Start voice recognition (simulated)
    voiceRecognition.start();
    
    // Show notification
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
    
    if (voiceRecognition) {
        voiceRecognition.stop();
    }
    
    showNotification('Отправка голосового сообщения...', 'info');
    
    // Simulate voice message upload
    setTimeout(async () => {
        const messageData = {
            user_id: currentUserId,
            message_type: 'voice',
            file_url: '/voice-message.mp3',
            content: 'Голосовое сообщение'
        };
        
        try {
            await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageData)
            });
            loadMessages();
            showNotification('Голосовое сообщение отправлено', 'success');
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
    
    if (voiceRecognition) {
        voiceRecognition.stop();
    }
    
    showNotification('Запись отменена', 'warning');
}

// Send document
async function sendDocument() {
    tg.showPopup({
        title: 'Отправить файл',
        message: 'Выберите файл',
        buttons: [
            { id: 'document', type: 'default', text: 'Документ' },
            { id: 'video', type: 'default', text: 'Видео' },
            { id: 'audio', type: 'default', text: 'Аудио' },
            { type: 'cancel' }
        ]
    }, async (buttonId) => {
        if (buttonId) {
            const messageData = {
                user_id: currentUserId,
                message_type: 'document',
                content: `${buttonId.charAt(0).toUpperCase() + buttonId.slice(1)} файл`
            };
            
            try {
                await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(messageData)
                });
                loadMessages();
                showNotification('Файл отправлен', 'success');
            } catch (error) {
                showNotification('Ошибка отправки файла', 'error');
            }
        }
    });
}

// Mention user
function mentionUser() {
    const input = document.getElementById('message-input');
    input.value += '@';
    input.focus();
    showMentionSuggestions();
}

// Show mention suggestions
function showMentionSuggestions() {
    // In real app, show dropdown with users
    showNotification('Начните вводить имя пользователя для упоминания', 'info');
}

// Parse mentions in text
function parseMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// Parse emojis in text
function parseEmojis(text) {
    // Simple emoji mapping
    const emojiMap = {
        ':)': '😊',
        ':(': '😢',
        ':D': '😄',
        ';)': '😉',
        ':P': '😛',
        ':*': '😘',
        '<3': '❤️',
        ':O': '😮'
    };
    
    Object.keys(emojiMap).forEach(emoji => {
        text = text.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emojiMap[emoji]);
    });
    
    return text;
}

// Play voice message
function playVoice(fileId) {
    showNotification('Воспроизведение голосового сообщения', 'info');
    // In real app, implement audio playback
}

// Start polling for new messages
function startMessagePolling() {
    messageInterval = setInterval(loadMessages, 3000); // Poll every 3 seconds
}

// Update online users
async function updateOnlineUsers() {
    try {
        const response = await fetch('/api/users/online');
        if (response.ok) {
            const onlineUsers = await response.json();
            usersOnline = new Set(onlineUsers);
            
            // Update counters
            document.getElementById('online-count').textContent = usersOnline.size;
            document.getElementById('sidebar-online-count').textContent = usersOnline.size;
        }
    } catch (error) {
        console.error('Error updating online users:', error);
    }
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// Toggle search
function toggleSearch() {
    document.getElementById('search-bar').classList.toggle('active');
}

// Toggle attach menu
function toggleAttachMenu() {
    document.getElementById('attach-menu').classList.toggle('active');
}

// Show chat view
function showChat() {
    showView('chat-view');
    document.querySelector('.menu-item:nth-child(1)').classList.add('active');
    document.querySelectorAll('.menu-item:not(:nth-child(1))').forEach(item => {
        item.classList.remove('active');
    });
}

// Show profile view
function showProfile() {
    showView('profile-view');
    document.querySelector('.menu-item:nth-child(2)').classList.add('active');
    document.querySelectorAll('.menu-item:not(:nth-child(2))').forEach(item => {
        item.classList.remove('active');
    });
    
    // Load profile data
    loadProfileData();
}

// Show users view
function showUsers() {
    showView('users-view');
    document.querySelector('.menu-item:nth-child(3)').classList.add('active');
    document.querySelectorAll('.menu-item:not(:nth-child(3))').forEach(item => {
        item.classList.remove('active');
    });
    
    // Load users
    loadUsers();
}

// Show settings view
function showSettings() {
    showView('settings-view');
    document.querySelector('.menu-item:nth-child(4)').classList.add('active');
    document.querySelectorAll('.menu-item:not(:nth-child(4))').forEach(item => {
        item.classList.remove('active');
    });
}

// Show specific view
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

// Load profile data
async function loadProfileData() {
    try {
        const response = await fetch(`/api/user/${currentUserId}/profile`);
        if (response.ok) {
            const profile = await response.json();
            document.getElementById('profile-joined').textContent = 
                new Date(profile.joined_at).toLocaleDateString('ru-RU');
            document.getElementById('profile-messages').textContent = profile.message_count || 0;
        }
    } catch (error) {
        console.error('Error loading profile data:', error);
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
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
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.onclick = () => showUserProfile(user.id);
        
        const isOnline = usersOnline.has(user.id);
        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        const status = isOnline ? 
            `<span class="user-item-online">онлайн</span>` : 
            `<span>был(а) недавно</span>`;
        
        userElement.innerHTML = `
            <div class="user-item-avatar">
                ${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div class="user-item-info">
                <div class="user-item-name">${userName}</div>
                <div class="user-item-status">${status}</div>
            </div>
            ${isOnline ? '<i class="fas fa-circle online-dot"></i>' : ''}
        `;
        
        container.appendChild(userElement);
    });
}

// Show user profile
function showUserProfile(userId) {
    tg.showPopup({
        title: 'Профиль пользователя',
        message: 'Действия с пользователем',
        buttons: [
            { id: 'message', type: 'default', text: 'Написать' },
            { id: 'mention', type: 'default', text: 'Упомянуть' },
            { id: 'mute', type: 'default', text: 'Замутить' },
            { id: 'ban', type: 'default', text: 'Забанить' },
            { type: 'cancel' }
        ]
    }, (buttonId) => {
        if (buttonId === 'message') {
            // Switch to chat and focus input
            showChat();
            const input = document.getElementById('message-input');
            input.value += `@${userId} `;
            input.focus();
        } else if (buttonId === 'mention') {
            const input = document.getElementById('message-input');
            input.value += `@${userId} `;
            input.focus();
            showChat();
        } else if (buttonId === 'mute') {
            muteUser(userId);
        } else if (buttonId === 'ban') {
            banUser(userId);
        }
    });
}

// Mute user
async function muteUser(userId) {
    try {
        await fetch(`/api/user/${userId}/mute`, { method: 'POST' });
        showNotification('Пользователь замучен', 'success');
        loadUsers();
    } catch (error) {
        showNotification('Ошибка', 'error');
    }
}

// Ban user
async function banUser(userId) {
    try {
        await fetch(`/api/user/${userId}/ban`, { method: 'POST' });
        showNotification('Пользователь забанен', 'success');
        loadUsers();
    } catch (error) {
        showNotification('Ошибка', 'error');
    }
}

// Change avatar
function changeAvatar() {
    tg.showPopup({
        title: 'Сменить аватар',
        message: 'Выберите новое фото профиля',
        buttons: [
            { id: 'camera', type: 'default', text: 'Сделать фото' },
            { id: 'gallery', type: 'default', text: 'Выбрать из галереи' },
            { type: 'cancel' }
        ]
    }, (buttonId) => {
        if (buttonId) {
            showNotification('Функция в разработке', 'info');
        }
    });
}

// Edit profile
function editProfile() {
    tg.showPopup({
        title: 'Редактировать профиль',
        message: 'Что вы хотите изменить?',
        buttons: [
            { id: 'name', type: 'default', text: 'Имя' },
            { id: 'username', type: 'default', text: 'Username' },
            { type: 'cancel' }
        ]
    }, (buttonId) => {
        if (buttonId === 'name') {
            tg.showPopup({
                title: 'Изменить имя',
                message: 'Введите новое имя:',
                buttons: [
                    { id: 'save', type: 'ok', text: 'Сохранить' },
                    { type: 'cancel' }
                ]
            });
        } else if (buttonId === 'username') {
            showNotification('Функция в разработке', 'info');
        }
    });
}

// Set theme
function setTheme(theme) {
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    
    event.target.closest('.theme-option').classList.add('active');
    
    document.body.classList.remove('dark-theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'system') {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        }
    }
    
    // Save theme preference
    localStorage.setItem('theme', theme);
    showNotification('Тема изменена', 'success');
}

// Clear chat
function clearChat() {
    tg.showPopup({
        title: 'Очистить историю',
        message: 'Вы уверены? Это действие нельзя отменить.',
        buttons: [
            { id: 'clear', type: 'destructive', text: 'Очистить' },
            { type: 'cancel' }
        ]
    }, async (buttonId) => {
        if (buttonId === 'clear') {
            try {
                await fetch('/api/messages/clear', { method: 'POST' });
                loadMessages();
                showNotification('История очищена', 'success');
            } catch (error) {
                showNotification('Ошибка', 'error');
            }
        }
    });
}

// Leave chat
function leaveChat() {
    tg.showPopup({
        title: 'Покинуть чат',
        message: 'Вы уверены, что хотите покинуть чат?',
        buttons: [
            { id: 'leave', type: 'destructive', text: 'Покинуть' },
            { type: 'cancel' }
        ]
    }, (buttonId) => {
        if (buttonId === 'leave') {
            tg.close();
        }
    });
}

// Show notification
function showNotification(message, type = 'info') {
    tg.showPopup({
        title: type === 'error' ? 'Ошибка' : 
               type === 'success' ? 'Успех' : 'Информация',
        message: message,
        buttons: [{ type: 'close' }]
    });
}

// Handle key press in message input
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Initialize voice recognition
function initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
        
        voiceRecognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            document.getElementById('message-input').value = transcript;
        };
        
        voiceRecognition.onerror = (event) => {
            console.error('Voice recognition error:', event.error);
        };
    }
}

// Setup event listeners
function setupEventListeners() {
    // Close sidebar when clicking overlay
    document.getElementById('overlay').addEventListener('click', toggleSidebar);
    
    // Close attach menu when clicking outside
    document.addEventListener('click', (event) => {
        const attachMenu = document.getElementById('attach-menu');
        const attachBtn = document.querySelector('.btn-attach');
        
        if (!attachMenu.contains(event.target) && !attachBtn.contains(event.target)) {
            attachMenu.classList.remove('active');
        }
    });
    
    // Handle back button
    tg.BackButton.onClick(() => {
        if (document.getElementById('sidebar').classList.contains('active')) {
            toggleSidebar();
        } else if (!document.getElementById('chat-view').classList.contains('active')) {
            showChat();
        }
    });
    
    // Update BackButton state
    const updateBackButton = () => {
        if (!document.getElementById('chat-view').classList.contains('active')) {
            tg.BackButton.show();
        } else {
            tg.BackButton.hide();
        }
    };
    
    // Observe view changes
    const observer = new MutationObserver(updateBackButton);
    observer.observe(document.getElementById('main-content'), { 
        attributes: true, 
        attributeFilter: ['class'],
        subtree: true 
    });
    
    // Set initial BackButton state
    updateBackButton();
}

// Show sample messages for demo
function showSampleMessages() {
    const sampleMessages = [
        {
            id: 1,
            user_id: 123456,
            user: { first_name: 'Алексей', username: 'alexey' },
            message_type: 'text',
            content: 'Привет всем! Как дела?',
            timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
            id: 2,
            user_id: 789012,
            user: { first_name: 'Мария', username: 'maria' },
            message_type: 'text',
            content: 'Всем привет! У меня все отлично :)',
            timestamp: new Date(Date.now() - 3500000).toISOString()
        },
        {
            id: 3,
            user_id: currentUserId,
            user: currentUser,
            message_type: 'text',
            content: 'Рад всех видеть в нашем чате!',
            timestamp: new Date(Date.now() - 3400000).toISOString()
        },
        {
            id: 4,
            user_id: 345678,
            user: { first_name: 'Иван', username: 'ivan' },
            message_type: 'photo',
            file_url: 'https://via.placeholder.com/200x150/5682a3/ffffff?text=Photo',
            timestamp: new Date(Date.now() - 3300000).toISOString()
        }
    ];
    
    displayMessages(sampleMessages);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initApp);

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    if (messageInterval) {
        clearInterval(messageInterval);
    }
});