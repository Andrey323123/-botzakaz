// Telegram WebApp initialization
let tg = window.Telegram.WebApp;
let currentUserId = null;
let currentUser = null;
let usersOnline = new Set();
let messageInterval = null;
let usersCache = {};
let typingTimeout = null;
let isTyping = false;
let pollingInterval = 3000; // 3 секунды
let lastMessageId = 0;

// Initialize the app
function initApp() {
    console.log("🚀 Инициализация приложения...");
    
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
    
    // Загружаем пользователя
    loadUserData();
    
    // Загружаем сообщения
    loadMessages();
    
    // Начинаем опрос новых сообщений
    startMessagePolling();
    
    // Загружаем пользователей онлайн
    updateOnlineUsers();
    
    // Загружаем настройки группы
    loadGroupSettings();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Обновляем UI
    updateUI();
    
    console.log("✅ Приложение инициализировано");
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const response = await fetch(`/api/user/${currentUserId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                currentUser = data.user;
                updateUserUI();
                return;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
    }
    
    // Fallback к параметрам URL
    const urlParams = new URLSearchParams(window.location.search);
    currentUser = {
        user_id: currentUserId,
        first_name: urlParams.get('first_name') || 'User',
        username: urlParams.get('username') || '',
        last_name: urlParams.get('last_name') || ''
    };
    updateUserUI();
}

// Обновление UI пользователя
function updateUserUI() {
    if (!currentUser) return;
    
    // Обновляем имя пользователя
    const userName = currentUser.first_name + (currentUser.last_name ? ' ' + currentUser.last_name : '');
    document.getElementById('user-name').textContent = userName;
    document.getElementById('profile-name').textContent = userName;
    
    // Обновляем username
    const username = currentUser.username ? '@' + currentUser.username : 'без username';
    document.getElementById('user-username').textContent = username;
    document.getElementById('profile-username').textContent = username;
    
    // Обновляем ID
    document.getElementById('profile-id').textContent = currentUser.user_id;
    
    // Обновляем дату вступления
    if (currentUser.created_at) {
        const joinedDate = new Date(currentUser.created_at);
        document.getElementById('profile-joined').textContent = 
            joinedDate.toLocaleDateString('ru-RU');
    }
    
    // Обновляем количество сообщений
    document.getElementById('profile-messages').textContent = currentUser.message_count || 0;
}

// Загрузка сообщений
async function loadMessages(showLoading = true) {
    try {
        if (showLoading) {
            showLoadingIndicator();
        }
        
        const response = await fetch('/api/messages');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                // Обновляем ID последнего сообщения
                if (data.messages.length > 0) {
                    lastMessageId = Math.max(...data.messages.map(m => m.id));
                }
                displayMessages(data.messages);
                hideLoadingIndicator();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        hideLoadingIndicator();
        showNotification('Ошибка загрузки сообщений', 'error');
    }
}

// Отображение сообщений
function displayMessages(messages) {
    const container = document.getElementById('messages-container');
    
    // Если сообщений нет, показываем информационное сообщение
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments"></i>
                <p>Чат пуст. Будьте первым, кто напишет сообщение!</p>
            </div>
        `;
        return;
    }
    
    // Очищаем контейнер только если это полная перезагрузка
    if (container.children.length === 0 || container.querySelector('.empty-chat')) {
        container.innerHTML = '';
    }
    
    // Добавляем новые сообщения
    messages.forEach(message => {
        // Проверяем, нет ли уже этого сообщения
        const existingMessage = container.querySelector(`[data-message-id="${message.id}"]`);
        if (!existingMessage) {
            const messageElement = createMessageElement(message);
            container.appendChild(messageElement);
        }
    });
    
    // Прокручиваем вниз
    scrollToBottom();
}

// Создание элемента сообщения
function createMessageElement(message) {
    const isOutgoing = message.user.user_id == currentUserId;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    messageDiv.dataset.messageId = message.id;
    
    // Форматируем время
    const time = message.timestamp ? 
        new Date(message.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        }) : 'сейчас';
    
    // Получаем информацию о пользователе
    const user = message.user || { first_name: 'User', username: '', user_id: message.user_id };
    const userName = user.first_name || 'User';
    
    let contentHTML = '';
    
    switch (message.message_type) {
        case 'photo':
            contentHTML = `
                <div class="message-media">
                    <img src="${message.file_url || 'https://via.placeholder.com/200x150/5682a3/ffffff?text=Photo'}" 
                         alt="Photo" 
                         onerror="this.src='https://via.placeholder.com/200x150/5682a3/ffffff?text=Photo'">
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
                    <i class="fas fa-file-pdf"></i>
                    <div class="document-info">
                        <div class="document-name">${message.content || 'Документ'}</div>
                        <div class="document-size">1.2 MB</div>
                    </div>
                    <button class="download-btn" onclick="downloadFile('${message.file_url}')">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
            break;
            
        default:
            // Обрабатываем упоминания и эмодзи
            let text = message.content || '';
            text = escapeHtml(text);
            text = parseMentions(text);
            text = parseEmojis(text);
            text = text.replace(/\n/g, '<br>');
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
                <div class="message-status">
                    <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                    <div class="message-time">${time}</div>
                </div>
            ` : ''}
        </div>
    `;
    
    return messageDiv;
}

// Отправка сообщения
async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) {
        input.focus();
        return;
    }
    
    try {
        const messageData = {
            user_id: parseInt(currentUserId),
            message_type: 'text',
            content: text
        };
        
        // Показываем отправку
        showSendingIndicator();
        
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
            hideSendingIndicator();
            loadMessages(false); // Перезагружаем сообщения без индикатора загрузки
            input.focus();
        } else {
            hideSendingIndicator();
            showNotification(data.message || 'Ошибка отправки', 'error');
        }
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        hideSendingIndicator();
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Загрузка пользователей
async function loadUsers() {
    try {
        showLoadingIndicator('users');
        
        const response = await fetch('/api/users');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                usersCache = {};
                data.users.forEach(user => {
                    usersCache[user.user_id] = user;
                });
                
                displayUsers(data.users);
                hideLoadingIndicator('users');
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        hideLoadingIndicator('users');
        showNotification('Ошибка загрузки пользователей', 'error');
    }
}

// Отображение пользователей
function displayUsers(users) {
    const container = document.getElementById('users-list');
    container.innerHTML = '';
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>Нет пользователей</p>
            </div>
        `;
        return;
    }
    
    // Группируем пользователей по статусу
    const onlineUsers = [];
    const offlineUsers = [];
    
    users.forEach(user => {
        if (user.is_online && !user.is_banned) {
            onlineUsers.push(user);
        } else if (!user.is_banned) {
            offlineUsers.push(user);
        }
    });
    
    // Добавляем онлайн пользователей
    if (onlineUsers.length > 0) {
        const onlineHeader = document.createElement('div');
        onlineHeader.className = 'users-header';
        onlineHeader.innerHTML = `<i class="fas fa-circle online-dot"></i> Онлайн (${onlineUsers.length})`;
        container.appendChild(onlineHeader);
        
        onlineUsers.forEach(user => {
            const userElement = createUserElement(user);
            container.appendChild(userElement);
        });
    }
    
    // Добавляем оффлайн пользователей
    if (offlineUsers.length > 0) {
        const offlineHeader = document.createElement('div');
        offlineHeader.className = 'users-header';
        offlineHeader.innerHTML = `<i class="fas fa-moon"></i> Оффлайн (${offlineUsers.length})`;
        container.appendChild(offlineHeader);
        
        offlineUsers.forEach(user => {
            const userElement = createUserElement(user);
            container.appendChild(userElement);
        });
    }
    
    // Добавляем забаненных пользователей
    const bannedUsers = users.filter(u => u.is_banned);
    if (bannedUsers.length > 0) {
        const bannedHeader = document.createElement('div');
        bannedHeader.className = 'users-header';
        bannedHeader.innerHTML = `<i class="fas fa-ban"></i> Забанены (${bannedUsers.length})`;
        container.appendChild(bannedHeader);
        
        bannedUsers.forEach(user => {
            const userElement = createUserElement(user);
            container.appendChild(userElement);
        });
    }
}

// Создание элемента пользователя
function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.onclick = () => showUserProfile(user.user_id);
    
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const status = user.is_online ? 
        '<span class="user-item-online">онлайн</span>' : 
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
          user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
    `;
    
    return userElement;
}

// Обновление онлайн пользователей
async function updateOnlineUsers() {
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const onlineCount = data.stats.online_users || 0;
                
                // Обновляем счетчики
                document.getElementById('online-count').textContent = onlineCount;
                document.getElementById('sidebar-online-count').textContent = onlineCount;
                
                // Обновляем список пользователей, если он открыт
                if (document.getElementById('users-view').classList.contains('active')) {
                    loadUsers();
                }
            }
        }
    } catch (error) {
        console.error('Ошибка обновления онлайн пользователей:', error);
    }
}

// Загрузка настроек группы
async function loadGroupSettings() {
    try {
        const response = await fetch('/api/group/settings');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                // Обновляем название чата
                const chatTitle = document.querySelector('.chat-title');
                if (chatTitle && data.settings.group_name) {
                    chatTitle.textContent = data.settings.group_name;
                }
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки настроек группы:', error);
    }
}

// Показать профиль пользователя
function showUserProfile(userId) {
    const user = usersCache[userId];
    if (!user) return;
    
    tg.showPopup({
        title: `Профиль: ${user.first_name}`,
        message: `
👤 Имя: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}
📛 Username: ${user.username || 'нет'}
🆔 ID: ${user.user_id}
📊 Сообщений: ${user.message_count || 0}
📅 В чате с: ${new Date(user.created_at).toLocaleDateString('ru-RU')}
${user.is_banned ? '🚫 Забанен' : ''}
${user.is_muted ? '🔇 В муте' : ''}
${user.is_online ? '🟢 Онлайн' : ''}
        `.trim(),
        buttons: [
            { id: 'mention', type: 'default', text: 'Упомянуть' },
            userId != currentUserId ? { id: 'message', type: 'default', text: 'Написать' } : null,
            { type: 'cancel', text: 'Закрыть' }
        ].filter(Boolean)
    }, (buttonId) => {
        if (buttonId === 'mention') {
            const input = document.getElementById('message-input');
            input.value += `@${user.username || user.first_name} `;
            input.focus();
            showChat();
        } else if (buttonId === 'message') {
            // В будущем можно добавить ЛС
            showNotification('Личные сообщения в разработке', 'info');
        }
    });
}

// Управление вьюхами
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function showChat() {
    showView('chat-view');
    updateMenuActive(0);
    document.getElementById('message-input').focus();
}

function showProfile() {
    showView('profile-view');
    updateMenuActive(1);
}

function showUsers() {
    showView('users-view');
    updateMenuActive(2);
    loadUsers();
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
    
    // Закрываем сайдбар на мобильных
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

// Поиск сообщений
async function searchMessages(query) {
    if (!query.trim()) return;
    
    try {
        showLoadingIndicator();
        
        const response = await fetch(`/api/messages/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                displaySearchResults(data.messages, query);
                hideLoadingIndicator();
            }
        }
    } catch (error) {
        console.error('Ошибка поиска:', error);
        hideLoadingIndicator();
        showNotification('Ошибка поиска', 'error');
    }
}

// Отображение результатов поиска
function displaySearchResults(messages, query) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-search">
                <i class="fas fa-search"></i>
                <p>По запросу "${query}" ничего не найдено</p>
                <button onclick="showChat()" class="btn-back">Вернуться в чат</button>
            </div>
        `;
        return;
    }
    
    const searchHeader = document.createElement('div');
    searchHeader.className = 'search-results-header';
    searchHeader.innerHTML = `
        <div class="search-results-info">
            <i class="fas fa-search"></i>
            <span>Найдено ${messages.length} сообщений по запросу "${query}"</span>
        </div>
        <button onclick="showChat()" class="btn-back-search">
            <i class="fas fa-arrow-left"></i> Назад
        </button>
    `;
    container.appendChild(searchHeader);
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
}

// Утилиты
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 65%)`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function parseEmojis(text) {
    const emojiMap = {
        ':)': '😊', ':(': '😢', ':D': '😄',
        ';)': '😉', ':P': '😛', ':*': '😘',
        '<3': '❤️', ':O': '😮', ':|': '😐',
        ':/': '😕', ':3': '😺', '>_<': '😣',
        '^.^': '😊', 'T_T': '😭', 'O_O': '😲',
        '^_^': '😄', '-_-': '😑', 'o_O': '😕'
    };
    
    Object.keys(emojiMap).forEach(emoji => {
        text = text.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emojiMap[emoji]);
    });
    
    return text;
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
}

// Уведомления
function showNotification(message, type = 'info') {
    tg.showPopup({
        title: type === 'error' ? 'Ошибка' : 
               type === 'success' ? 'Успех' : 'Информация',
        message: message,
        buttons: [{ type: 'close', text: 'OK' }]
    });
}

function showError(message) {
    const container = document.getElementById('messages-container');
    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
            <button onclick="loadMessages()" class="btn-retry">Попробовать снова</button>
        </div>
    `;
}

// Индикаторы
function showLoadingIndicator(type = 'messages') {
    const container = document.getElementById(`${type === 'users' ? 'users-list' : 'messages-container'}`);
    const loader = document.createElement('div');
    loader.className = 'loading-indicator';
    loader.id = `${type}-loader`;
    loader.innerHTML = '<div class="spinner"></div>';
    container.appendChild(loader);
}

function hideLoadingIndicator(type = 'messages') {
    const loader = document.getElementById(`${type}-loader`);
    if (loader) loader.remove();
}

function showSendingIndicator() {
    const inputArea = document.querySelector('.message-input-area');
    const sendingIndicator = document.createElement('div');
    sendingIndicator.className = 'sending-indicator';
    sendingIndicator.innerHTML = '<div class="sending-dot"></div><div class="sending-dot"></div><div class="sending-dot"></div>';
    inputArea.appendChild(sendingIndicator);
}

function hideSendingIndicator() {
    const sendingIndicator = document.querySelector('.sending-indicator');
    if (sendingIndicator) sendingIndicator.remove();
}

// Опрос новых сообщений
function startMessagePolling() {
    messageInterval = setInterval(() => {
        loadMessages(false); // Без показа индикатора загрузки
        updateOnlineUsers();
    }, pollingInterval);
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Отправка сообщения по Enter
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Поиск по нажатию Enter в поле поиска
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchMessages(this.value);
            toggleSearch();
        }
    });
    
    // Обработка ввода для индикатора "печатает"
    messageInput.addEventListener('input', function() {
        if (this.value.trim() && !isTyping) {
            isTyping = true;
            // Здесь можно добавить отправку события "печатает"
        } else if (!this.value.trim() && isTyping) {
            isTyping = false;
            // Здесь можно добавить остановку события "печатает"
        }
    });
    
    // Обработка кликов вне меню
    document.addEventListener('click', (e) => {
        const attachMenu = document.getElementById('attach-menu');
        if (attachMenu && !e.target.closest('.btn-attach') && !e.target.closest('.attach-menu')) {
            attachMenu.classList.remove('active');
        }
    });
}

// Меню вложений
function toggleAttachMenu() {
    const attachMenu = document.getElementById('attach-menu');
    attachMenu.classList.toggle('active');
}

function sendPhoto() {
    // В реальном приложении используйте Telegram file picker
    showNotification('Выбор фото в разработке', 'info');
    toggleAttachMenu();
}

function sendVoice() {
    // В реальном приложении используйте запись голоса через Telegram
    showNotification('Запись голоса в разработке', 'info');
    toggleAttachMenu();
}

function sendDocument() {
    // В реальном приложении используйте Telegram file picker
    showNotification('Выбор файла в разработке', 'info');
    toggleAttachMenu();
}

function mentionUser() {
    // Показываем список пользователей для упоминания
    if (Object.keys(usersCache).length === 0) {
        showNotification('Сначала загрузите список пользователей', 'info');
        return;
    }
    
    tg.showPopup({
        title: 'Упомянуть пользователя',
        message: 'Выберите пользователя:',
        buttons: Object.values(usersCache)
            .filter(user => user.user_id != currentUserId)
            .slice(0, 8) // Ограничиваем 8 пользователями
            .map(user => ({
                id: `mention_${user.user_id}`,
                type: 'default',
                text: `@${user.username || user.first_name}`
            }))
            .concat([{ type: 'cancel', text: 'Отмена' }])
    }, (buttonId) => {
        if (buttonId && buttonId.startsWith('mention_')) {
            const userId = buttonId.split('_')[1];
            const user = usersCache[userId];
            if (user) {
                const input = document.getElementById('message-input');
                input.value += `@${user.username || user.first_name} `;
                input.focus();
                showChat();
            }
        }
    });
    
    toggleAttachMenu();
}

// Переключение поиска
function toggleSearch() {
    const searchBar = document.getElementById('search-bar');
    searchBar.classList.toggle('active');
    
    if (searchBar.classList.contains('active')) {
        document.getElementById('search-input').focus();
    } else {
        document.getElementById('search-input').value = '';
        showChat();
    }
}

// Настройки темы
function setTheme(theme) {
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    
    event.target.closest('.theme-option').classList.add('active');
    
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
    } else {
        // Системная тема
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

// Очистка чата
function clearChat() {
    tg.showPopup({
        title: 'Очистить историю',
        message: 'Вы уверены, что хотите очистить всю историю чата? Это действие нельзя отменить.',
        buttons: [
            { id: 'clear', type: 'destructive', text: 'Очистить' },
            { type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'clear') {
            showNotification('История чата очищена', 'success');
            // В реальном приложении здесь был бы вызов API для очистки
        }
    });
}

// Выход из чата
function leaveChat() {
    tg.showPopup({
        title: 'Покинуть чат',
        message: 'Вы уверены, что хотите покинуть чат?',
        buttons: [
            { id: 'leave', type: 'destructive', text: 'Покинуть' },
            { type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'leave') {
            tg.close();
        }
    });
}

// Обновление UI
function updateUI() {
    // Обновляем заголовок
    document.title = 'Telegram Chat';
    
    // Добавляем иконку загрузки
    const style = document.createElement('style');
    style.textContent = `
        .loading-indicator {
            text-align: center;
            padding: 20px;
        }
        .spinner {
            border: 3px solid rgba(86, 130, 163, 0.3);
            border-radius: 50%;
            border-top-color: var(--primary-color);
            width: 30px;
            height: 30px;
            margin: 0 auto;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .empty-chat, .empty-state, .empty-search, .error-state {
            text-align: center;
            padding: 50px 20px;
            color: var(--secondary-color);
        }
        .empty-chat i, .empty-state i, .empty-search i, .error-state i {
            font-size: 48px;
            margin-bottom: 15px;
            opacity: 0.5;
        }
        .btn-back, .btn-retry, .btn-back-search {
            margin-top: 15px;
            padding: 8px 16px;
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
        }
        .users-header {
            padding: 10px 15px;
            font-size: 12px;
            color: var(--secondary-color);
            background-color: rgba(0,0,0,0.03);
            border-bottom: 1px solid var(--border-color);
        }
        .dark-theme .users-header {
            background-color: rgba(255,255,255,0.03);
        }
    `;
    document.head.appendChild(style);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initApp);

// Очистка при выгрузке страницы
window.addEventListener('beforeunload', () => {
    if (messageInterval) {
        clearInterval(messageInterval);
    }
});

// Глобальные функции для HTML
window.toggleSidebar = toggleSidebar;
window.showChat = showChat;
window.showProfile = showProfile;
window.showUsers = showUsers;
window.showSettings = showSettings;
window.sendMessage = sendMessage;
window.toggleSearch = toggleSearch;
window.toggleAttachMenu = toggleAttachMenu;
window.sendPhoto = sendPhoto;
window.sendVoice = sendVoice;
window.sendDocument = sendDocument;
window.mentionUser = mentionUser;
window.setTheme = setTheme;
window.clearChat = clearChat;
window.leaveChat = leaveChat;

// Обработка нажатия клавиш
window.handleKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
};
