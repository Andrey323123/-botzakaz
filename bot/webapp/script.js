// Telegram WebApp initialization
let tg = window.Telegram.WebApp;
let currentUserId = null;
let currentUser = null;
let messages = [];
let usersCache = {};
let lastMessageId = 0;
let chatId = 'main_chat';
let messageInterval = null;

// Эмодзи для выбора
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️']
};

// Initialize the app
function initApp() {
    console.log("🚀 Инициализация приложения...");
    
    // Проверяем, доступен ли Telegram WebApp
    if (!window.Telegram || !window.Telegram.WebApp) {
        console.error("Telegram WebApp не доступен");
        showError('Откройте приложение через Telegram бота');
        return;
    }
    
    try {
        // Expand WebApp to full screen
        tg.expand();
        
        // Говорим Telegram, что приложение готово
        tg.ready();
        
        // Включаем кнопку назад
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            if (document.getElementById('emoji-picker').classList.contains('active')) {
                toggleEmojiPicker();
            } else if (document.getElementById('attach-menu').classList.contains('active')) {
                toggleAttachMenu();
            } else if (document.getElementById('sidebar').classList.contains('active')) {
                toggleSidebar();
            } else if (!document.getElementById('chat-view').classList.contains('active')) {
                showChat();
            } else {
                // Если в чате, спрашиваем о выходе
                tg.showConfirm("Выйти из приложения?", (confirmed) => {
                    if (confirmed) {
                        tg.close();
                    }
                });
            }
        });
        
        // Устанавливаем тему из Telegram
        if (tg.colorScheme === 'dark') {
            document.body.classList.add('dark-theme');
            updateThemeButtons('dark');
        } else {
            document.body.classList.remove('dark-theme');
            updateThemeButtons('light');
        }
        
        // Слушаем изменение темы
        tg.onEvent('themeChanged', () => {
            if (tg.colorScheme === 'dark') {
                document.body.classList.add('dark-theme');
                updateThemeButtons('dark');
            } else {
                document.body.classList.remove('dark-theme');
                updateThemeButtons('light');
            }
        });
        
        // Получаем данные пользователя из Telegram
        const user = tg.initDataUnsafe?.user;
        
        if (user) {
            currentUserId = user.id.toString();
            currentUser = {
                user_id: user.id,
                first_name: user.first_name || 'Пользователь',
                last_name: user.last_name || '',
                username: user.username || '',
                language_code: user.language_code || 'ru'
            };
            
            console.log("✅ Пользователь Telegram:", currentUser);
        } else {
            showError('Не удалось получить данные пользователя из Telegram');
            return;
        }
        
        // Инициализируем UI
        updateUserUI();
        
        // Загружаем сообщения из localStorage
        loadMessagesFromStorage();
        
        // Загружаем пользователей
        loadUsers();
        
        // Настраиваем обработчики событий
        setupEventListeners();
        
        // Обновляем UI
        updateUI();
        
        // Начинаем "опрос" сообщений (для демо)
        startMessagePolling();
        
        console.log("✅ Приложение инициализировано");
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка инициализации приложения');
    }
}

// Обновление UI пользователя
function updateUserUI() {
    if (!currentUser) return;
    
    const userName = currentUser.first_name + (currentUser.last_name ? ' ' + currentUser.last_name : '');
    const username = currentUser.username ? '@' + currentUser.username : 'без username';
    
    document.getElementById('user-name').textContent = userName;
    document.getElementById('profile-name').textContent = userName;
    document.getElementById('user-username').textContent = username;
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-id').textContent = currentUser.user_id;
    
    // Обновляем дату вступления
    const joinedDate = new Date();
    document.getElementById('profile-joined').textContent = joinedDate.toLocaleDateString('ru-RU');
    
    // Обновляем количество сообщений
    const userMessages = messages.filter(m => m.user_id === currentUserId).length;
    document.getElementById('profile-messages').textContent = userMessages;
}

// Загрузка сообщений из localStorage
function loadMessagesFromStorage() {
    const savedMessages = localStorage.getItem(`telegram_chat_messages_${chatId}`);
    
    if (savedMessages) {
        messages = JSON.parse(savedMessages);
        if (messages.length > 0) {
            lastMessageId = Math.max(...messages.map(m => m.id));
        }
    } else {
        // Создаем приветственное сообщение
        messages = [{
            id: 1,
            user_id: 'system',
            user: {
                first_name: 'Система',
                user_id: 'system'
            },
            message_type: 'text',
            content: '👋 Добро пожаловать в чат! Начните общение.',
            timestamp: Date.now(),
            read: true
        }];
        lastMessageId = 1;
        saveMessagesToStorage();
    }
    
    displayMessages();
}

// Сохранение сообщений в localStorage
function saveMessagesToStorage() {
    localStorage.setItem(`telegram_chat_messages_${chatId}`, JSON.stringify(messages));
}

// Отображение сообщений
function displayMessages() {
    const container = document.getElementById('messages-container');
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments"></i>
                <p>Чат пуст. Будьте первым, кто напишет сообщение!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
    
    scrollToBottom();
}

// Создание элемента сообщения
function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const isSystem = message.user_id === 'system';
    const messageDiv = document.createElement('div');
    
    if (isSystem) {
        messageDiv.className = 'message system';
    } else {
        messageDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    }
    
    messageDiv.dataset.messageId = message.id;
    
    // Форматируем время
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const user = message.user || { first_name: 'User', user_id: message.user_id };
    const userName = user.first_name || 'User';
    
    let contentHTML = '';
    
    switch (message.message_type) {
        case 'photo':
            contentHTML = `
                <div class="message-media">
                    <img src="${message.file_url}" alt="Photo" onerror="this.style.display='none'">
                    ${message.content ? `<div class="media-caption">${escapeHtml(message.content)}</div>` : ''}
                </div>
            `;
            break;
            
        case 'voice':
            contentHTML = `
                <div class="message-voice">
                    <button class="voice-play-btn">
                        <i class="fas fa-play"></i>
                    </button>
                    <div class="voice-duration">${message.duration || '0:15'}</div>
                </div>
            `;
            break;
            
        case 'document':
            contentHTML = `
                <div class="message-document">
                    <i class="fas fa-file"></i>
                    <div class="document-info">
                        <div class="document-name">${message.file_name || 'Документ'}</div>
                        <div class="document-size">${message.file_size || '1.2 MB'}</div>
                    </div>
                    <button class="download-btn">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
            break;
            
        case 'sticker':
            contentHTML = `
                <div class="message-sticker">
                    <div class="sticker-emoji">${message.emoji || '😊'}</div>
                </div>
            `;
            break;
            
        default:
            let text = message.content || '';
            text = escapeHtml(text);
            text = text.replace(/\n/g, '<br>');
            contentHTML = `<div class="message-text">${text}</div>`;
    }
    
    if (isSystem) {
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-system">
                    <i class="fas fa-info-circle"></i>
                    ${contentHTML}
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            ${!isOutgoing ? `
                <div class="message-avatar" style="background-color: ${stringToColor(user.user_id)}">
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
    }
    
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
        showSendingIndicator();
        
        const newMessage = {
            id: lastMessageId + 1,
            user_id: currentUserId,
            user: currentUser,
            message_type: 'text',
            content: text,
            timestamp: Date.now(),
            read: false
        };
        
        // Добавляем сообщение
        messages.push(newMessage);
        lastMessageId = newMessage.id;
        
        // Сохраняем в localStorage
        saveMessagesToStorage();
        
        // Отображаем
        const messageElement = createMessageElement(newMessage);
        document.getElementById('messages-container').appendChild(messageElement);
        
        // Очищаем поле ввода
        input.value = '';
        hideSendingIndicator();
        
        // Прокручиваем вниз
        scrollToBottom();
        input.focus();
        
        // Обновляем статистику сообщений пользователя
        updateUserUI();
        
        console.log("✅ Сообщение отправлено:", newMessage);
        
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        hideSendingIndicator();
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Загрузка пользователей
function loadUsers() {
    // Начинаем с текущего пользователя
    usersCache = {
        [currentUserId]: {
            ...currentUser,
            is_online: true,
            message_count: messages.filter(m => m.user_id === currentUserId).length
        }
    };
    
    // Добавляем "виртуальных" пользователей для демо
    const demoUsers = [
        {
            user_id: 'demo_1',
            first_name: 'Анна',
            last_name: 'Иванова',
            username: 'anna_ivanova',
            is_online: true,
            message_count: Math.floor(Math.random() * 50)
        },
        {
            user_id: 'demo_2',
            first_name: 'Сергей',
            last_name: 'Петров',
            username: 'sergey_petrov',
            is_online: false,
            message_count: Math.floor(Math.random() * 30)
        }
    ];
    
    demoUsers.forEach(user => {
        usersCache[user.user_id] = user;
    });
    
    displayUsers();
    updateOnlineUsers();
}

// Отображение пользователей
function displayUsers() {
    const container = document.getElementById('users-list');
    const users = Object.values(usersCache);
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>Нет пользователей</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    // Группируем пользователей по статусу
    const onlineUsers = users.filter(user => user.is_online && user.user_id !== currentUserId);
    const offlineUsers = users.filter(user => !user.is_online && user.user_id !== currentUserId);
    
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
        ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
    `;
    
    return userElement;
}

// Обновление онлайн пользователей
function updateOnlineUsers() {
    const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
    
    document.getElementById('online-count').textContent = onlineCount;
    document.getElementById('sidebar-online-count').textContent = onlineCount;
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
${user.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}
        `.trim(),
        buttons: [
            { id: 'mention', type: 'default', text: 'Упомянуть' },
            { type: 'cancel', text: 'Закрыть' }
        ]
    }, (buttonId) => {
        if (buttonId === 'mention') {
            const input = document.getElementById('message-input');
            input.value += `@${user.username || user.first_name} `;
            input.focus();
            showChat();
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

async function searchMessages(query) {
    if (!query.trim()) return;
    
    const results = messages.filter(msg => 
        msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
    );
    
    const container = document.getElementById('messages-container');
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="empty-search">
                <i class="fas fa-search"></i>
                <p>По запросу "${query}" ничего не найдено</p>
                <button onclick="showChat()" class="btn-back">Вернуться в чат</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    const searchHeader = document.createElement('div');
    searchHeader.className = 'search-results-header';
    searchHeader.innerHTML = `
        <div class="search-results-info">
            <i class="fas fa-search"></i>
            <span>Найдено ${results.length} сообщений по запросу "${query}"</span>
        </div>
        <button onclick="showChat()" class="btn-back-search">
            <i class="fas fa-arrow-left"></i> Назад
        </button>
    `;
    container.appendChild(searchHeader);
    
    results.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
}

// Прикрепление файлов
function toggleAttachMenu() {
    const attachMenu = document.getElementById('attach-menu');
    attachMenu.classList.toggle('active');
}

function attachFile(type) {
    switch(type) {
        case 'photo':
            // Используем Telegram CloudStorage для загрузки фото
            if (tg.platform !== 'unknown') {
                tg.showPopup({
                    title: 'Отправка фото',
                    message: 'Выберите фото из галереи Telegram',
                    buttons: [{ type: 'close', text: 'OK' }]
                });
            } else {
                showNotification('Отправка фото в разработке', 'info');
            }
            break;
            
        case 'video':
            showNotification('Отправка видео в разработке', 'info');
            break;
            
        case 'document':
            // Для документов можно использовать showFileSelector
            if (tg.platform !== 'unknown') {
                tg.showPopup({
                    title: 'Отправка документа',
                    message: 'Функция выбора файлов будет доступна в следующих обновлениях',
                    buttons: [{ type: 'close', text: 'OK' }]
                });
            } else {
                showNotification('Отправка документов в разработке', 'info');
            }
            break;
            
        case 'audio':
        case 'sticker':
        case 'location':
        case 'contact':
        case 'poll':
            showNotification('Эта функция в разработке', 'info');
            break;
    }
    
    toggleAttachMenu();
}

// Эмодзи пикер
function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emoji-picker');
    emojiPicker.classList.toggle('active');
    
    if (emojiPicker.classList.contains('active') && document.getElementById('emoji-grid').innerHTML === '') {
        showEmojiCategory('smileys');
    }
}

function showEmojiCategory(category) {
    const emojiGrid = document.getElementById('emoji-grid');
    const emojis = emojiCategories[category] || [];
    
    emojiGrid.innerHTML = '';
    
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-btn';
        emojiBtn.textContent = emoji;
        emojiBtn.onclick = () => insertEmoji(emoji);
        emojiGrid.appendChild(emojiBtn);
    });
    
    // Обновляем активную категорию
    document.querySelectorAll('.emoji-category').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
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
    tg.showPopup({
        title: 'Ошибка',
        message: message,
        buttons: [{ type: 'close', text: 'OK' }]
    });
}

// Настройки темы
function setTheme(theme) {
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    
    event.target.closest('.theme-option').classList.add('active');
    
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
    } else {
        // Авто тема
        localStorage.removeItem('theme');
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

function updateThemeButtons(theme) {
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
        if (option.querySelector('i').className.includes(theme === 'dark' ? 'moon' : 'sun')) {
            option.classList.add('active');
        }
    });
}

// Редактирование профиля
function editProfile() {
    tg.showPopup({
        title: 'Редактирование профиля',
        message: 'Имя пользователя: ' + (currentUser.username || 'не указан') + '\n\nЭта функция будет доступна в следующих обновлениях.',
        buttons: [
            { id: 'change_avatar', type: 'default', text: 'Сменить аватар' },
            { type: 'cancel', text: 'Закрыть' }
        ]
    }, (buttonId) => {
        if (buttonId === 'change_avatar') {
            showNotification('Смена аватара в разработке', 'info');
        }
    });
}

// Настройки уведомлений
function showNotificationSettings() {
    tg.showPopup({
        title: 'Настройки уведомлений',
        message: 'Управление уведомлениями о новых сообщениях',
        buttons: [
            { id: 'enable', type: 'default', text: 'Включить уведомления' },
            { id: 'disable', type: 'default', text: 'Выключить уведомления' },
            { type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'enable') {
            showNotification('Уведомления включены', 'success');
            localStorage.setItem('notifications', 'enabled');
        } else if (buttonId === 'disable') {
            showNotification('Уведомления выключены', 'info');
            localStorage.setItem('notifications', 'disabled');
        }
    });
}

// Конфиденциальность
function showPrivacySettings() {
    tg.showPopup({
        title: 'Конфиденциальность',
        message: 'Настройки видимости профиля и управления данными',
        buttons: [
            { id: 'privacy', type: 'default', text: 'Настройки приватности' },
            { id: 'blocked', type: 'default', text: 'Заблокированные' },
            { type: 'cancel', text: 'Закрыть' }
        ]
    }, (buttonId) => {
        if (buttonId === 'privacy') {
            showNotification('Настройки приватности в разработке', 'info');
        } else if (buttonId === 'blocked') {
            showNotification('Управление заблокированными в разработке', 'info');
        }
    });
}

// Очистка чата
function clearChat() {
    tg.showConfirm('Очистить всю историю чата? Это действие нельзя отменить.', (confirmed) => {
        if (confirmed) {
            messages = [{
                id: 1,
                user_id: 'system',
                user: { first_name: 'Система', user_id: 'system' },
                message_type: 'text',
                content: 'История чата была очищена',
                timestamp: Date.now(),
                read: true
            }];
            
            lastMessageId = 1;
            saveMessagesToStorage();
            displayMessages();
            
            showNotification('История чата очищена', 'success');
            updateUserUI();
        }
    });
}

// Выход из чата
function leaveChat() {
    tg.showConfirm('Покинуть чат? Вы сможете вернуться позже.', (confirmed) => {
        if (confirmed) {
            tg.close();
        }
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
        ':/': '😕', ':3': '😺', '>_<': '😣'
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

// Индикаторы
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

// Опрос "новых" сообщений (для демо)
function startMessagePolling() {
    messageInterval = setInterval(() => {
        updateOnlineUsers();
    }, 10000); // Проверяем каждые 10 секунд
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
    
    // Поиск по Enter
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchMessages(this.value);
            toggleSearch();
        }
    });
    
    // Закрытие меню при клике вне
    document.addEventListener('click', (e) => {
        const attachMenu = document.getElementById('attach-menu');
        if (attachMenu && !e.target.closest('.btn-attach') && !e.target.closest('.attach-menu')) {
            attachMenu.classList.remove('active');
        }
        
        const emojiPicker = document.getElementById('emoji-picker');
        if (emojiPicker && !e.target.closest('.btn-emoji') && !e.target.closest('.emoji-picker')) {
            emojiPicker.classList.remove('active');
        }
    });
}

// Обновление UI
function updateUI() {
    // Загружаем сохраненную тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        updateThemeButtons('dark');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        updateThemeButtons('light');
    }
    
    // Обновляем заголовок
    document.title = 'Telegram Chat';
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
window.attachFile = attachFile;
window.toggleEmojiPicker = toggleEmojiPicker;
window.showEmojiCategory = showEmojiCategory;
window.insertEmoji = insertEmoji;
window.searchMessages = searchMessages;
window.setTheme = setTheme;
window.editProfile = editProfile;
window.showNotificationSettings = showNotificationSettings;
window.showPrivacySettings = showPrivacySettings;
window.clearChat = clearChat;
window.leaveChat = leaveChat;

window.handleKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
};
