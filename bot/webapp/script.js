// telegram-chat-extended.js - ОБЪЕДИНЕННАЯ ВЕРСИЯ

// Telegram WebApp initialization
let tg = window.Telegram.WebApp;
let currentUserId = null;
let currentUser = null;
let messages = [];
let usersCache = {};
let lastMessageId = 0;
let chatId = 'main_chat';
let messageInterval = null;

// РАСШИРЕННЫЙ ФУНКЦИОНАЛ
let sections = {
    main: { id: 'main', name: 'Основной чат', write: 'all', unread: 0 },
    news: { id: 'news', name: 'Новости', write: 'all', unread: 0 },
    rules: { id: 'rules', name: 'Правила', write: 'admins', unread: 0, locked: true },
    announcements: { id: 'announcements', name: 'Объявления', write: 'admins', unread: 0 }
};
let currentSection = 'main';
let userRoles = {}; // {userId: 'main_admin'|'admin'|'moderator'|'user'}
let unreadMessages = 0;
let pendingInvites = [];
let isAdmin = false;
let isMainAdmin = false;

// Эмодзи для выбора
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️'],
    nature: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄'],
    food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒']
};

// Initialize the app
function initApp() {
    console.log("🚀 Инициализация расширенного приложения...");
    
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
        tg.BackButton.onClick(handleBackButton);
        
        // Устанавливаем тему из Telegram
        updateTheme();
        tg.onEvent('themeChanged', updateTheme);
        
        // Получаем данные пользователя из Telegram
        const user = tg.initDataUnsafe?.user;
        
        if (user) {
            currentUserId = user.id.toString();
            currentUser = {
                user_id: user.id,
                first_name: user.first_name || 'Пользователь',
                last_name: user.last_name || '',
                username: user.username || '',
                language_code: user.language_code || 'ru',
                photo_url: user.photo_url || null
            };
            
            console.log("✅ Пользователь Telegram:", currentUser);
        } else {
            showError('Не удалось получить данные пользователя из Telegram');
            return;
        }
        
        // Проверяем роль пользователя
        checkUserRole();
        
        // Инициализируем интерфейс
        initUI();
        
        // Настраиваем обработчики событий
        setupEventListeners();
        
        // Загружаем данные
        loadDataFromStorage();
        startPolling();
        
        console.log("✅ Расширенное приложение инициализировано");
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка инициализации приложения');
    }
}

// Инициализация UI
function initUI() {
    // Устанавливаем фото пользователя если есть
    if (currentUser.photo_url) {
        const avatarImg = document.getElementById('user-avatar-img');
        if (avatarImg) {
            avatarImg.src = currentUser.photo_url;
            avatarImg.style.display = 'block';
            const avatarIcon = document.getElementById('user-avatar-icon');
            if (avatarIcon) avatarIcon.style.display = 'none';
        }
    }
    
    // Обновляем информацию о пользователе
    updateUserInfo();
    
    // Загружаем участников
    loadUsers();
    
    // Показываем текущий раздел
    showSection('main');
}

// НОВАЯ ФУНКЦИЯ: Проверка роли пользователя
function checkUserRole() {
    // Загружаем роли из localStorage
    const savedRoles = localStorage.getItem('telegram_chat_roles');
    if (savedRoles) {
        userRoles = JSON.parse(savedRoles);
    }
    
    // Если пользователь первый раз, устанавливаем роль
    if (!userRoles[currentUserId]) {
        // Первый пользователь становится главным админом
        const isFirstUser = Object.keys(userRoles).length === 0;
        userRoles[currentUserId] = isFirstUser ? 'main_admin' : 'user';
        saveRoles();
    }
    
    isAdmin = ['main_admin', 'admin'].includes(userRoles[currentUserId]);
    isMainAdmin = userRoles[currentUserId] === 'main_admin';
    
    // Показываем/скрываем админ-элементы
    updateAdminUI();
}

// НОВАЯ ФУНКЦИЯ: Обновление админ UI
function updateAdminUI() {
    const adminMenuItem = document.getElementById('admin-menu-item');
    const adminButton = document.getElementById('btn-admin');
    const mentionButton = document.getElementById('btn-mention-all');
    
    if (adminMenuItem) {
        adminMenuItem.style.display = isAdmin ? 'flex' : 'none';
    }
    
    if (adminButton) {
        adminButton.style.display = isAdmin ? 'flex' : 'none';
    }
    
    if (mentionButton) {
        mentionButton.style.display = isAdmin ? 'flex' : 'none';
    }
    
    // Обновляем роль в UI
    const userRoleElement = document.getElementById('user-role');
    if (userRoleElement) {
        const roleText = getRoleText(userRoles[currentUserId]);
        userRoleElement.textContent = roleText;
        userRoleElement.className = `user-role ${userRoles[currentUserId]}`;
    }
}

// НОВАЯ ФУНКЦИЯ: Загрузка данных из localStorage
function loadDataFromStorage() {
    // Загружаем сообщения по разделам
    Object.keys(sections).forEach(sectionId => {
        const savedMessages = localStorage.getItem(`telegram_chat_messages_${sectionId}`);
        
        if (savedMessages) {
            try {
                const sectionMessages = JSON.parse(savedMessages);
                if (sectionMessages.length > 0) {
                    // Сохраняем в глобальную структуру
                    if (!window.chatData) window.chatData = {};
                    window.chatData[sectionId] = sectionMessages;
                    
                    // Находим максимальный ID
                    const maxId = Math.max(...sectionMessages.map(m => m.id));
                    if (maxId > lastMessageId) lastMessageId = maxId;
                    
                    // Считаем непрочитанные
                    if (sectionId === currentSection) {
                        const userLastRead = localStorage.getItem(`last_read_${sectionId}_${currentUserId}`) || 0;
                        sections[sectionId].unread = sectionMessages.filter(m => 
                            m.id > userLastRead && m.user_id !== currentUserId
                        ).length;
                    }
                }
            } catch (e) {
                console.error('Ошибка загрузки сообщений:', e);
            }
        }
    });
    
    // Загружаем приглашения
    const savedInvites = localStorage.getItem('telegram_chat_invites');
    if (savedInvites) {
        pendingInvites = JSON.parse(savedInvites);
    }
    
    updateUnreadBadges();
    displayCurrentSectionMessages();
}

// НОВАЯ ФУНКЦИЯ: Отображение сообщений текущего раздела
function displayCurrentSectionMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!window.chatData || !window.chatData[currentSection]) {
        // Создаем приветственное сообщение
        const welcomeMessage = {
            id: 1,
            user_id: 'system',
            user: { first_name: 'Система', user_id: 'system' },
            message_type: 'text',
            content: `👋 Добро пожаловать в раздел "${sections[currentSection].name}"!`,
            timestamp: Date.now(),
            read: true,
            section: currentSection
        };
        
        if (!window.chatData) window.chatData = {};
        window.chatData[currentSection] = [welcomeMessage];
        saveMessagesToStorage(currentSection);
    }
    
    const messages = window.chatData[currentSection] || [];
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments"></i>
                <p>Раздел пуст. Будьте первым, кто напишет сообщение!</p>
            </div>
        `;
        return;
    }
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
    
    scrollToBottom();
}

// НОВАЯ ФУНКЦИЯ: Переключение разделов
function switchSection(sectionId) {
    if (!sections[sectionId]) return;
    
    // Сохраняем время последнего прочтения для текущего раздела
    if (window.chatData && window.chatData[currentSection]) {
        const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
        if (lastMessage) {
            localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
        }
    }
    
    // Сбрасываем непрочитанные для текущего раздела
    sections[currentSection].unread = 0;
    
    // Переключаемся на новый раздел
    currentSection = sectionId;
    
    // Обновляем активный элемент в UI
    updateActiveSection();
    
    // Показываем сообщения раздела
    displayCurrentSectionMessages();
    
    // Обновляем заголовок
    updateChatTitle();
    
    // Проверяем права на запись
    checkWritePermissions();
    
    // Обновляем бейджи
    updateUnreadBadges();
}

// НОВАЯ ФУНКЦИЯ: Показать раздел с проверкой прав
function showSection(sectionId) {
    // Проверяем доступ к разделу
    const section = sections[sectionId];
    if (!section) return;
    
    // Если раздел заблокирован и пользователь не админ
    if (section.locked && !isAdmin) {
        showNotification('Этот раздел заблокирован для вас', 'error');
        return;
    }
    
    switchSection(sectionId);
}

// НОВАЯ ФУНКЦИЯ: Проверка прав на запись
function checkWritePermissions() {
    const section = sections[currentSection];
    if (!section) return;
    
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = section.write === 'all' || 
                     (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                     (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));
    
    // Обновляем поле ввода
    const messageInput = document.getElementById('message-input');
    const sendButton = document.querySelector('.btn-send');
    
    if (messageInput) {
        messageInput.disabled = !canWrite;
        messageInput.placeholder = canWrite ? 'Сообщение...' : 'Только чтение...';
    }
    
    if (sendButton) {
        sendButton.disabled = !canWrite;
        sendButton.style.opacity = canWrite ? '1' : '0.5';
    }
}

// НОВАЯ ФУНКЦИЯ: Обновление активного раздела в UI
function updateActiveSection() {
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.section-item[onclick*="${currentSection}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

// Обновление информации о пользователе
function updateUserInfo() {
    if (!currentUser) return;
    
    const userName = currentUser.first_name + (currentUser.last_name ? ' ' + currentUser.last_name : '');
    const username = currentUser.username ? '@' + currentUser.username : 'без username';
    
    // Обновляем везде где нужно
    const elements = {
        'user-name': userName,
        'profile-name': userName,
        'user-username': username,
        'profile-username': username,
        'profile-id': currentUser.user_id
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
    
    // Обновляем статистику сообщений
    let totalMessages = 0;
    Object.keys(sections).forEach(sectionId => {
        if (window.chatData && window.chatData[sectionId]) {
            totalMessages += window.chatData[sectionId].filter(m => m.user_id === currentUserId).length;
        }
    });
    
    const messageCountElement = document.getElementById('user-message-count');
    if (messageCountElement) {
        messageCountElement.textContent = totalMessages;
    }
}

// Сохранение сообщений в localStorage
function saveMessagesToStorage(sectionId = currentSection) {
    if (window.chatData && window.chatData[sectionId]) {
        localStorage.setItem(`telegram_chat_messages_${sectionId}`, JSON.stringify(window.chatData[sectionId]));
    }
}

// НОВАЯ ФУНКЦИЯ: Сохранение ролей
function saveRoles() {
    localStorage.setItem('telegram_chat_roles', JSON.stringify(userRoles));
}

// НОВАЯ ФУНКЦИЯ: Сохранение приглашений
function saveInvites() {
    localStorage.setItem('telegram_chat_invites', JSON.stringify(pendingInvites));
}

// Создание элемента сообщения с реакциями
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
    
    // Проверяем, прочитано ли сообщение
    if (!isOutgoing && !isSystem) {
        const lastRead = localStorage.getItem(`last_read_${currentSection}_${currentUserId}`) || 0;
        if (message.id > lastRead) {
            messageDiv.classList.add('unread');
        }
    }
    
    // Форматируем время
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const user = message.user || { first_name: 'User', user_id: message.user_id };
    const userName = user.first_name || 'User';
    const userRole = userRoles[user.user_id] || 'user';
    
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
                    <div class="voice-waveform"></div>
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
    
    // Добавляем реакции если есть
    let reactionsHTML = '';
    if (message.reactions && Object.keys(message.reactions).length > 0) {
        reactionsHTML = `<div class="message-reactions">`;
        Object.entries(message.reactions).forEach(([emoji, users]) => {
            const userReacted = users.includes(currentUserId);
            reactionsHTML += `
                <div class="reaction ${userReacted ? 'user-reacted' : ''}" onclick="toggleReaction('${message.id}', '${emoji}')">
                    ${emoji} <span class="reaction-count">${users.length}</span>
                </div>
            `;
        });
        reactionsHTML += `</div>`;
    }
    
    // Кнопки действий
    const actionsHTML = `
        <div class="message-actions">
            <button class="btn-reaction" onclick="showReactionPopup('${message.id}')">
                <i class="far fa-smile"></i>
            </button>
            <button class="btn-reply" onclick="replyToMessage('${message.id}')">
                <i class="fas fa-reply"></i>
            </button>
            <button class="btn-forward" onclick="forwardMessage('${message.id}')">
                <i class="fas fa-share"></i>
            </button>
            ${isAdmin || isOutgoing ? `
            <button class="btn-more" onclick="showMessageMenu('${message.id}')">
                <i class="fas fa-ellipsis-h"></i>
            </button>
            ` : ''}
        </div>
    `;
    
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
                        <div class="message-sender">
                            ${userName}
                            ${userRole !== 'user' ? `<span class="message-sender-role ${userRole}">${getRoleText(userRole)}</span>` : ''}
                        </div>
                        <div class="message-time">${time}</div>
                    </div>
                ` : ''}
                
                ${contentHTML}
                ${reactionsHTML}
                
                ${isOutgoing ? `
                    <div class="message-status">
                        <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                        <div class="message-time">${time}</div>
                    </div>
                ` : ''}
                
                ${actionsHTML}
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
    
    // Проверяем права на запись в текущий раздел
    const section = sections[currentSection];
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = section.write === 'all' || 
                     (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                     (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));
    
    if (!canWrite) {
        showNotification('У вас нет прав для отправки сообщений в этом разделе', 'error');
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
            read: false,
            reactions: {},
            section: currentSection
        };
        
        // Добавляем сообщение
        if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
        window.chatData[currentSection].push(newMessage);
        lastMessageId = newMessage.id;
        
        // Сохраняем
        saveMessagesToStorage(currentSection);
        
        // Отображаем
        const messageElement = createMessageElement(newMessage);
        document.getElementById('messages-container').appendChild(messageElement);
        
        // Очищаем поле ввода
        input.value = '';
        hideSendingIndicator();
        
        // Прокручиваем вниз
        scrollToBottom();
        input.focus();
        
        // Обновляем статистику
        updateUserInfo();
        
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
            message_count: 0,
            role: userRoles[currentUserId] || 'user'
        }
    };
    
    // Подсчитываем сообщения пользователя
    Object.keys(sections).forEach(sectionId => {
        if (window.chatData && window.chatData[sectionId]) {
            usersCache[currentUserId].message_count += window.chatData[sectionId].filter(m => m.user_id === currentUserId).length;
        }
    });
    
    // Добавляем "виртуальных" пользователей для демо с ролями
    const demoUsers = [
        {
            user_id: 'demo_1',
            first_name: 'Анна',
            last_name: 'Иванова',
            username: 'anna_ivanova',
            is_online: true,
            message_count: Math.floor(Math.random() * 50),
            role: 'admin'
        },
        {
            user_id: 'demo_2',
            first_name: 'Сергей',
            last_name: 'Петров',
            username: 'sergey_petrov',
            is_online: false,
            message_count: Math.floor(Math.random() * 30),
            role: 'moderator'
        },
        {
            user_id: 'demo_3',
            first_name: 'Мария',
            last_name: 'Сидорова',
            username: 'maria_sidorova',
            is_online: true,
            message_count: Math.floor(Math.random() * 20),
            role: 'user'
        }
    ];
    
    demoUsers.forEach(user => {
        usersCache[user.user_id] = user;
        if (!userRoles[user.user_id]) {
            userRoles[user.user_id] = user.role;
        }
    });
    
    saveRoles();
    displayUsers();
    updateOnlineUsers();
}

// Отображение пользователей
function displayUsers() {
    const container = document.getElementById('users-list');
    if (!container) return;
    
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
    
    // Группируем пользователей по статусу и роли
    const onlineAdmins = users.filter(user => 
        user.is_online && 
        user.user_id !== currentUserId && 
        ['main_admin', 'admin'].includes(user.role || 'user')
    );
    
    const onlineModerators = users.filter(user => 
        user.is_online && 
        user.user_id !== currentUserId && 
        user.role === 'moderator'
    );
    
    const onlineUsers = users.filter(user => 
        user.is_online && 
        user.user_id !== currentUserId && 
        user.role === 'user'
    );
    
    const offlineUsers = users.filter(user => 
        !user.is_online && 
        user.user_id !== currentUserId
    );
    
    // Добавляем онлайн админов
    if (onlineAdmins.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header';
        header.innerHTML = `<i class="fas fa-user-shield"></i> Админы онлайн (${onlineAdmins.length})`;
        container.appendChild(header);
        
        onlineAdmins.forEach(user => {
            const userElement = createUserElement(user);
            container.appendChild(userElement);
        });
    }
    
    // Добавляем онлайн модераторов
    if (onlineModerators.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header';
        header.innerHTML = `<i class="fas fa-star"></i> Модераторы онлайн (${onlineModerators.length})`;
        container.appendChild(header);
        
        onlineModerators.forEach(user => {
            const userElement = createUserElement(user);
            container.appendChild(userElement);
        });
    }
    
    // Добавляем онлайн пользователей
    if (onlineUsers.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header';
        header.innerHTML = `<i class="fas fa-circle online-dot"></i> Участники онлайн (${onlineUsers.length})`;
        container.appendChild(header);
        
        onlineUsers.forEach(user => {
            const userElement = createUserElement(user);
            container.appendChild(userElement);
        });
    }
    
    // Добавляем оффлайн пользователей
    if (offlineUsers.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header';
        header.innerHTML = `<i class="fas fa-moon"></i> Оффлайн (${offlineUsers.length})`;
        container.appendChild(header);
        
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
    const userRole = user.role || 'user';
    const roleText = getRoleText(userRole);
    const status = user.is_online ? 
        '<span class="user-item-online">онлайн</span>' : 
        `<span>сообщений: ${user.message_count || 0}</span>`;
    
    userElement.innerHTML = `
        <div class="user-item-avatar" style="background-color: ${stringToColor(user.user_id)}">
            ${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="user-item-info">
            <div class="user-item-name">
                ${userName}
                ${userRole !== 'user' ? `<span class="user-role-badge ${userRole}">${roleText}</span>` : ''}
            </div>
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
    
    const userRole = user.role || 'user';
    const roleText = getRoleText(userRole);
    
    tg.showPopup({
        title: `Профиль: ${user.first_name}`,
        message: `
👤 Имя: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}
📛 Username: ${user.username || 'нет'}
🎭 Роль: ${roleText}
🆔 ID: ${user.user_id}
📊 Сообщений: ${user.message_count || 0}
${user.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}
        `.trim(),
        buttons: [
            { id: 'mention', type: 'default', text: 'Упомянуть' },
            isAdmin ? { id: 'role', type: 'default', text: 'Изменить роль' } : null,
            { type: 'cancel', text: 'Закрыть' }
        ].filter(Boolean)
    }, (buttonId) => {
        if (buttonId === 'mention') {
            const input = document.getElementById('message-input');
            input.value += `@${user.username || user.first_name} `;
            input.focus();
            showChat();
        } else if (buttonId === 'role' && isAdmin) {
            changeUserRole(userId);
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Показать список пользователей
function showUsersList() {
    document.querySelectorAll('.chat-container, .admin-container, .users-container').forEach(view => {
        view.classList.remove('active');
    });
    
    const usersView = document.getElementById('users-view');
    if (usersView) {
        usersView.classList.add('active');
        usersView.style.display = 'flex';
        loadUsers();
    }
    
    updateMenuActive(1);
    
    // Показываем кнопку назад
    tg.BackButton.show();
    tg.BackButton.onClick(() => showSection(currentSection));
}

// Управление вьюхами
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function showChat() {
    document.querySelectorAll('.chat-container, .admin-container, .users-container').forEach(view => {
        view.classList.remove('active');
        if (view.id !== 'chat-view') {
            view.style.display = 'none';
        }
    });
    
    const chatView = document.getElementById('chat-view');
    if (chatView) {
        chatView.classList.add('active');
        chatView.style.display = 'flex';
    }
    
    updateMenuActive(0);
    document.getElementById('message-input').focus();
    
    // Скрываем кнопку назад если мы в основном чате
    tg.BackButton.hide();
}

function showProfile() {
    showView('profile-view');
    updateMenuActive(1);
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

// НОВАЯ ФУНКЦИЯ: Показать админ панель
function showAdminPanel() {
    if (!isAdmin) {
        showNotification('У вас нет прав администратора', 'error');
        return;
    }
    
    document.querySelectorAll('.chat-container, .admin-container, .users-container').forEach(view => {
        view.classList.remove('active');
        if (view.id !== 'admin-view') {
            view.style.display = 'none';
        }
    });
    
    const adminView = document.getElementById('admin-view');
    if (adminView) {
        adminView.classList.add('active');
        adminView.style.display = 'flex';
        loadAdminUsersList();
        loadInvitesList();
    }
    
    updateMenuActive(2);
    
    // Показываем кнопку назад
    tg.BackButton.show();
    tg.BackButton.onClick(() => showSection(currentSection));
}

// НОВАЯ ФУНКЦИЯ: Реакции на сообщения
function showReactionPopup(messageId) {
    const popup = document.getElementById('reactions-popup');
    if (!popup) return;
    
    // Позиционируем попап
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const rect = messageElement.getBoundingClientRect();
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.top - 60}px`;
        popup.dataset.messageId = messageId;
        popup.classList.add('active');
        
        // Закрытие при клике вне попапа
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popup.contains(e.target) && !messageElement.contains(e.target)) {
                    popup.classList.remove('active');
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    }
}

// НОВАЯ ФУНКЦИЯ: Добавление реакции
function addReaction(emoji) {
    const popup = document.getElementById('reactions-popup');
    const messageId = popup.dataset.messageId;
    
    if (!messageId || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    if (!message.reactions) message.reactions = {};
    if (!message.reactions[emoji]) message.reactions[emoji] = [];
    
    const userIndex = message.reactions[emoji].indexOf(currentUserId);
    
    if (userIndex > -1) {
        // Удаляем реакцию
        message.reactions[emoji].splice(userIndex, 1);
        if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
        }
    } else {
        // Добавляем реакцию
        message.reactions[emoji].push(currentUserId);
    }
    
    // Сохраняем
    saveMessagesToStorage(currentSection);
    
    // Обновляем отображение
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const newElement = createMessageElement(message);
        messageElement.replaceWith(newElement);
    }
    
    popup.classList.remove('active');
}

// НОВАЯ ФУНКЦИЯ: Переключение реакции
function toggleReaction(messageId, emoji) {
    if (!window.chatData || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message || !message.reactions || !message.reactions[emoji]) return;
    
    const userIndex = message.reactions[emoji].indexOf(currentUserId);
    
    if (userIndex > -1) {
        message.reactions[emoji].splice(userIndex, 1);
        if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
        }
    } else {
        if (!message.reactions[emoji]) message.reactions[emoji] = [];
        message.reactions[emoji].push(currentUserId);
    }
    
    saveMessagesToStorage(currentSection);
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const newElement = createMessageElement(message);
        messageElement.replaceWith(newElement);
    }
}

// НОВАЯ ФУНКЦИЯ: Ответ на сообщение
function replyToMessage(messageId) {
    if (!window.chatData || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const input = document.getElementById('message-input');
    const userName = message.user?.first_name || 'Пользователь';
    const text = message.content?.substring(0, 50) + (message.content?.length > 50 ? '...' : '');
    
    // Показываем превью ответа
    showReplyPreview(messageId);
    
    input.focus();
}

// НОВАЯ ФУНКЦИЯ: Показать превью ответа
function showReplyPreview(messageId) {
    if (!window.chatData || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const container = document.getElementById('reply-preview-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="reply-preview">
            <div class="reply-header">
                <div class="reply-sender">${message.user?.first_name || 'Пользователь'}</div>
                <button class="btn-close-reply" onclick="closeReplyPreview()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="reply-text">${escapeHtml(message.content?.substring(0, 100) || '')}</div>
        </div>
    `;
    container.style.display = 'block';
    container.dataset.replyTo = messageId;
}

// НОВАЯ ФУНКЦИЯ: Закрыть превью ответа
function closeReplyPreview() {
    const container = document.getElementById('reply-preview-container');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
        delete container.dataset.replyTo;
    }
}

// НОВАЯ ФУНКЦИЯ: Пересылка сообщения
function forwardMessage(messageId) {
    if (!window.chatData || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    // Показываем попап с выбором раздела
    const popup = document.getElementById('forward-popup');
    const options = document.getElementById('forward-options');
    
    if (!popup || !options) return;
    
    options.innerHTML = '';
    
    // Добавляем опции для всех разделов, кроме текущего
    Object.values(sections).forEach(section => {
        if (section.id !== currentSection) {
            const option = document.createElement('div');
            option.className = 'forward-option';
            option.innerHTML = `<i class="fas fa-folder"></i> ${section.name}`;
            option.onclick = () => {
                forwardToSection(message, section.id);
                popup.style.display = 'none';
            };
            options.appendChild(option);
        }
    });
    
    // Показываем попап
    popup.style.display = 'block';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '10000';
}

// НОВАЯ ФУНКЦИЯ: Переслать в раздел
function forwardToSection(message, sectionId) {
    const forwardedMessage = {
        ...message,
        id: lastMessageId + 1,
        forwarded_from: currentSection,
        forwarded_by: currentUserId,
        timestamp: Date.now(),
        read: false,
        section: sectionId,
        reactions: {}
    };
    
    if (!window.chatData[sectionId]) window.chatData[sectionId] = [];
    window.chatData[sectionId].push(forwardedMessage);
    lastMessageId++;
    
    saveMessagesToStorage(sectionId);
    
    // Увеличиваем счетчик непрочитанных
    sections[sectionId].unread++;
    updateUnreadBadges();
    
    showNotification(`Сообщение переслано в "${sections[sectionId].name}"`, 'success');
}

// НОВАЯ ФУНКЦИЯ: Меню сообщения
function showMessageMenu(messageId) {
    if (!window.chatData || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const isOwnMessage = message.user_id == currentUserId;
    
    tg.showPopup({
        title: 'Действия с сообщением',
        message: `Сообщение от ${message.user?.first_name || 'пользователя'}`,
        buttons: [
            { id: 'reply', type: 'default', text: 'Ответить' },
            { id: 'copy', type: 'default', text: 'Копировать текст' },
            { id: 'copy_link', type: 'default', text: 'Копировать ссылку' },
            { id: 'forward', type: 'default', text: 'Переслать' },
            isOwnMessage ? { id: 'edit', type: 'default', text: 'Редактировать' } : null,
            isOwnMessage || isAdmin ? { id: 'delete', type: 'destructive', text: 'Удалить' } : null,
            !isOwnMessage ? { id: 'report', type: 'default', text: 'Пожаловаться' } : null,
            { type: 'cancel', text: 'Отмена' }
        ].filter(Boolean)
    }, (action) => {
        switch(action) {
            case 'reply':
                replyToMessage(messageId);
                break;
            case 'copy':
                navigator.clipboard.writeText(message.content || '');
                showNotification('Текст скопирован', 'success');
                break;
            case 'copy_link':
                const link = `https://t.me/botfs23/message/${messageId}`;
                navigator.clipboard.writeText(link);
                showNotification('Ссылка скопирована', 'success');
                break;
            case 'forward':
                forwardMessage(messageId);
                break;
            case 'edit':
                editMessage(messageId);
                break;
            case 'delete':
                deleteMessage(messageId);
                break;
            case 'report':
                reportMessage(messageId);
                break;
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Редактирование сообщения
function editMessage(messageId) {
    if (!window.chatData || !window.chatData[currentSection]) return;
    
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const isOwnMessage = message.user_id == currentUserId;
    if (!isOwnMessage) {
        showNotification('Вы можете редактировать только свои сообщения', 'error');
        return;
    }
    
    tg.showPopup({
        title: 'Редактирование сообщения',
        message: 'Введите новый текст сообщения:',
        buttons: [
            { id: 'save', type: 'default', text: 'Сохранить' },
            { type: 'cancel', text: 'Отмена' }
        ]
    }, (action) => {
        if (action === 'save') {
            // Здесь будет логика сохранения отредактированного сообщения
            showNotification('Редактирование сообщений в разработке', 'info');
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Удаление сообщения
function deleteMessage(messageId) {
    tg.showConfirm('Удалить это сообщение?', (confirmed) => {
        if (!confirmed) return;
        
        if (window.chatData && window.chatData[currentSection]) {
            const index = window.chatData[currentSection].findIndex(m => m.id == messageId);
            if (index > -1) {
                window.chatData[currentSection].splice(index, 1);
                saveMessagesToStorage(currentSection);
                
                // Удаляем из DOM
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                }
                
                showNotification('Сообщение удалено', 'success');
            }
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Жалоба на сообщение
function reportMessage(messageId) {
    tg.showPopup({
        title: 'Пожаловаться на сообщение',
        message: 'Выберите причину жалобы:',
        buttons: [
            { id: 'spam', type: 'default', text: 'Спам' },
            { id: 'violence', type: 'default', text: 'Насилие' },
            { id: 'porn', type: 'default', text: 'Порнография' },
            { id: 'other', type: 'default', text: 'Другое' },
            { type: 'cancel', text: 'Отмена' }
        ]
    }, (reason) => {
        if (reason && reason !== 'cancel') {
            // Здесь будет отправка жалобы на сервер
            showNotification('Жалоба отправлена администраторам', 'success');
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Загрузка списка пользователей для админки
function loadAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;
    
    const users = Object.values(usersCache);
    container.innerHTML = '';
    
    users.forEach(user => {
        const userRole = user.role || 'user';
        const canChangeRole = isMainAdmin && user.user_id !== currentUserId;
        
        const userElement = document.createElement('div');
        userElement.className = 'admin-user-item';
        userElement.innerHTML = `
            <div class="admin-user-info">
                <div class="admin-user-avatar" style="background-color: ${stringToColor(user.user_id)}">
                    ${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                    <div class="admin-user-name">
                        ${user.first_name} ${user.last_name || ''}
                        <span class="user-role-badge ${userRole}">${getRoleText(userRole)}</span>
                    </div>
                    <div class="admin-user-id">ID: ${user.user_id}</div>
                    <div class="admin-user-status">
                        ${user.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}
                        • Сообщений: ${user.message_count || 0}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                ${canChangeRole ? `
                <select class="role-select" onchange="changeUserRole('${user.user_id}', this.value)" style="padding: 5px; border-radius: 5px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color);">
                    <option value="user" ${userRole === 'user' ? 'selected' : ''}>Участник</option>
                    <option value="moderator" ${userRole === 'moderator' ? 'selected' : ''}>Модератор</option>
                    <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Админ</option>
                </select>
                ` : ''}
                ${isMainAdmin && user.user_id !== currentUserId ? `
                <button class="btn-admin-action danger" onclick="kickUser('${user.user_id}')" style="margin-left: 5px;">
                    <i class="fas fa-ban"></i>
                </button>
                ` : ''}
            </div>
        `;
        
        container.appendChild(userElement);
    });
}

// НОВАЯ ФУНКЦИЯ: Изменение роли пользователя
function changeUserRole(userId, newRole = null) {
    if (!isMainAdmin) {
        showNotification('Только главный админ может менять роли', 'error');
        return;
    }
    
    if (userId === currentUserId) {
        showNotification('Вы не можете изменить свою роль', 'error');
        return;
    }
    
    if (!newRole) {
        // Показываем попап для выбора роли
        tg.showPopup({
            title: 'Изменение роли пользователя',
            message: 'Выберите новую роль:',
            buttons: [
                { id: 'admin', type: 'default', text: 'Админ' },
                { id: 'moderator', type: 'default', text: 'Модератор' },
                { id: 'user', type: 'default', text: 'Участник' },
                { type: 'cancel', text: 'Отмена' }
            ]
        }, (selectedRole) => {
            if (selectedRole && selectedRole !== 'cancel') {
                updateUserRole(userId, selectedRole);
            }
        });
    } else {
        updateUserRole(userId, newRole);
    }
}

// НОВАЯ ФУНКЦИЯ: Обновление роли пользователя
function updateUserRole(userId, newRole) {
    tg.showConfirm(`Назначить пользователю роль "${getRoleText(newRole)}"?`, (confirmed) => {
        if (confirmed) {
            userRoles[userId] = newRole;
            saveRoles();
            
            // Обновляем кэш пользователей
            if (usersCache[userId]) {
                usersCache[userId].role = newRole;
            }
            
            // Обновляем UI
            loadAdminUsersList();
            loadUsers();
            
            showNotification('Роль обновлена', 'success');
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Исключение пользователя
function kickUser(userId) {
    if (!isMainAdmin) {
        showNotification('Только главный админ может удалять пользователей', 'error');
        return;
    }
    
    const user = usersCache[userId];
    if (!user) return;
    
    tg.showConfirm(`Исключить ${user.first_name} из чата?`, (confirmed) => {
        if (confirmed) {
            // Удаляем из кэша
            delete usersCache[userId];
            
            // Удаляем роль
            delete userRoles[userId];
            saveRoles();
            
            // Обновляем UI
            loadAdminUsersList();
            loadUsers();
            
            showNotification('Пользователь исключен', 'success');
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Загрузка списка приглашений
function loadInvitesList() {
    const container = document.getElementById('invites-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (pendingInvites.length === 0) {
        container.innerHTML = '<p>Нет активных приглашений</p>';
        return;
    }
    
    pendingInvites.forEach((invite, index) => {
        const inviteElement = document.createElement('div');
        inviteElement.className = 'invite-item';
        
        const expiresDate = new Date(invite.expires_at).toLocaleDateString('ru-RU');
        
        inviteElement.innerHTML = `
            <div>
                <div class="invite-code">${invite.code}</div>
                <div class="invite-stats">
                    Использовано: ${invite.uses}/${invite.max_uses} • Истекает: ${expiresDate}
                </div>
            </div>
            <button class="btn-admin-action small" onclick="deleteInvite(${index})">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        container.appendChild(inviteElement);
    });
}

// НОВАЯ ФУНКЦИЯ: Созыв всех онлайн пользователей
function mentionAll() {
    const input = document.getElementById('message-input');
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online && u.user_id !== currentUserId);
    
    if (onlineUsers.length === 0) {
        showNotification('Нет онлайн пользователей для упоминания', 'info');
        return;
    }
    
    const mentions = onlineUsers.map(user => `@${user.username || user.first_name}`).join(' ');
    input.value += `Внимание ${mentions}! `;
    input.focus();
    
    showNotification(`Упомянуто ${onlineUsers.length} пользователей`, 'success');
}

// НОВАЯ ФУНКЦИЯ: Создание приглашения
function createInvite() {
    if (!isAdmin) {
        showNotification('Только админы могут создавать приглашения', 'error');
        return;
    }
    
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const invite = {
        code: inviteCode,
        created_by: currentUserId,
        created_at: Date.now(),
        expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 дней
        max_uses: 5,
        uses: 0,
        active: true
    };
    
    pendingInvites.push(invite);
    saveInvites();
    
    // Показываем код приглашения
    tg.showPopup({
        title: 'Приглашение создано',
        message: `Код приглашения: ${inviteCode}\n\nСкопируйте и отправьте его новым участникам.`,
        buttons: [
            { id: 'copy', type: 'default', text: 'Копировать код' },
            { id: 'share', type: 'default', text: 'Поделиться' },
            { type: 'cancel', text: 'Закрыть' }
        ]
    }, (action) => {
        if (action === 'copy') {
            navigator.clipboard.writeText(inviteCode);
            showNotification('Код скопирован', 'success');
        } else if (action === 'share') {
            shareInvite(inviteCode);
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Удаление приглашения
function deleteInvite(index) {
    tg.showConfirm('Удалить это приглашение?', (confirmed) => {
        if (confirmed) {
            pendingInvites.splice(index, 1);
            saveInvites();
            loadInvitesList();
            showNotification('Приглашение удалено', 'success');
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Поделиться приглашением
function shareInvite(code) {
    const text = `Присоединяйтесь к нашему чату! Код приглашения: ${code}\n\nСсылка: https://t.me/botfs23?start=${code}`;
    
    if (tg.platform !== 'unknown') {
        tg.shareText(text);
    } else {
        navigator.clipboard.writeText(text);
        showNotification('Текст приглашения скопирован', 'success');
    }
}

// НОВАЯ ФУНКЦИЯ: Прыжок к непрочитанным
function jumpToUnread() {
    const unreadMessages = document.querySelectorAll('.message.unread');
    
    if (unreadMessages.length === 0) {
        showNotification('Нет непрочитанных сообщений', 'info');
        return;
    }
    
    // Прокручиваем к первому непрочитанному
    unreadMessages[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Помечаем как прочитанные
    if (window.chatData && window.chatData[currentSection]) {
        const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
        if (lastMessage) {
            localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
        }
    }
    
    // Убираем стиль непрочитанных
    unreadMessages.forEach(msg => msg.classList.remove('unread'));
    
    // Обновляем счетчик
    sections[currentSection].unread = 0;
    updateUnreadBadges();
    
    showNotification(`Прокручено к непрочитанным (${unreadMessages.length})`, 'success');
}

// НОВАЯ ФУНКЦИЯ: Обновление бейджей непрочитанных
function updateUnreadBadges() {
    // Общий счетчик непрочитанных
    const totalUnread = Object.values(sections).reduce((sum, section) => sum + section.unread, 0);
    
    // Бейдж в хедере
    const unreadBadge = document.getElementById('unread-badge');
    if (unreadBadge) {
        unreadBadge.textContent = totalUnread > 0 ? totalUnread : '';
        unreadBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
    }
    
    // Бейджи разделов
    Object.entries(sections).forEach(([sectionId, section]) => {
        const badge = document.getElementById(`${sectionId}-unread`);
        if (badge) {
            badge.textContent = section.unread > 0 ? section.unread : '';
            badge.style.display = section.unread > 0 ? 'flex' : 'none';
        }
    });
    
    // Бейдж чата
    const chatBadge = document.getElementById('chat-badge');
    if (chatBadge) {
        const chatUnread = sections[currentSection].unread;
        chatBadge.textContent = chatUnread > 0 ? chatUnread : '';
        chatBadge.style.display = chatUnread > 0 ? 'flex' : 'none';
    }
}

// НОВАЯ ФУНКЦИЯ: Обновление темы
function updateTheme() {
    if (tg.colorScheme === 'dark') {
        document.body.classList.add('dark-theme');
        updateThemeButtons('dark');
    } else {
        document.body.classList.remove('dark-theme');
        updateThemeButtons('light');
    }
}

// НОВАЯ ФУНКЦИЯ: Обновление заголовка чата
function updateChatTitle() {
    const titleElement = document.getElementById('chat-title');
    if (titleElement && sections[currentSection]) {
        titleElement.textContent = sections[currentSection].name;
    }
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
    showNotification(message, 'error');
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
    
    // Поиск во всех разделах
    let results = [];
    Object.keys(sections).forEach(sectionId => {
        if (window.chatData && window.chatData[sectionId]) {
            const sectionResults = window.chatData[sectionId].filter(msg => 
                msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
            ).map(msg => ({...msg, section: sectionId}));
            
            results = results.concat(sectionResults);
        }
    });
    
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

// Прикрепление файлов
function toggleAttachMenu() {
    const attachMenu = document.getElementById('attach-menu');
    attachMenu.classList.toggle('active');
}

function attachFile(type) {
    switch(type) {
        case 'photo':
            showNotification('Отправка фото в разработке', 'info');
            break;
        case 'sticker':
            showStickerPicker();
            break;
        default:
            showNotification('Эта функция в разработке', 'info');
    }
    
    toggleAttachMenu();
}

function showStickerPicker() {
    const stickers = ['😊', '😂', '🤣', '❤️', '🔥', '👍', '👏', '🎉', '🙏', '🤔'];
    
    tg.showPopup({
        title: 'Выберите стикер',
        message: stickers.join(' '),
        buttons: stickers.map((sticker, index) => ({
            id: `sticker_${index}`,
            type: 'default',
            text: sticker
        })).concat([{ type: 'cancel', text: 'Отмена' }])
    }, (buttonId) => {
        if (buttonId && buttonId.startsWith('sticker_')) {
            const index = parseInt(buttonId.split('_')[1]);
            sendSticker(stickers[index]);
        }
    });
}

function sendSticker(emoji) {
    try {
        showSendingIndicator();
        
        const newMessage = {
            id: lastMessageId + 1,
            user_id: currentUserId,
            user: currentUser,
            message_type: 'sticker',
            emoji: emoji,
            timestamp: Date.now(),
            read: false,
            section: currentSection
        };
        
        // Добавляем сообщение
        if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
        window.chatData[currentSection].push(newMessage);
        lastMessageId = newMessage.id;
        
        // Сохраняем
        saveMessagesToStorage(currentSection);
        
        // Отображаем
        const messageElement = createMessageElement(newMessage);
        document.getElementById('messages-container').appendChild(messageElement);
        
        hideSendingIndicator();
        
        // Прокручиваем вниз
        scrollToBottom();
        
        console.log("✅ Стикер отправлен:", newMessage);
        
    } catch (error) {
        console.error('Ошибка отправки стикера:', error);
        hideSendingIndicator();
        showNotification('Ошибка отправки стикера', 'error');
    }
}

// НОВАЯ ФУНКЦИЯ: Обработка кнопки назад
function handleBackButton() {
    const adminView = document.getElementById('admin-view');
    const usersView = document.getElementById('users-view');
    
    if (adminView && adminView.style.display === 'flex') {
        showChat();
    } else if (usersView && usersView.style.display === 'flex') {
        showChat();
    } else if (document.getElementById('sidebar').classList.contains('active')) {
        toggleSidebar();
    } else if (document.getElementById('emoji-picker').classList.contains('active')) {
        toggleEmojiPicker();
    } else if (document.getElementById('attach-menu').classList.contains('active')) {
        toggleAttachMenu();
    } else {
        tg.showConfirm("Выйти из приложения?", (confirmed) => {
            if (confirmed) {
                tg.close();
            }
        });
    }
}

// НОВАЯ ФУНКЦИЯ: Настройка обработчиков событий
function setupEventListeners() {
    // Отправка сообщения по Enter
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Поиск по Enter
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchMessages(this.value);
                toggleSearch();
            }
        });
    }
    
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
        
        const reactionsPopup = document.getElementById('reactions-popup');
        if (reactionsPopup && reactionsPopup.classList.contains('active') && 
            !e.target.closest('.reactions-popup') && !e.target.closest('.btn-reaction')) {
            reactionsPopup.classList.remove('active');
        }
        
        const forwardPopup = document.getElementById('forward-popup');
        if (forwardPopup && forwardPopup.style.display === 'block' && 
            !e.target.closest('.forward-popup') && !e.target.closest('.btn-forward')) {
            forwardPopup.style.display = 'none';
        }
    });
}

// НОВАЯ ФУНКЦИЯ: Опрос обновлений
function startPolling() {
    // Обновляем онлайн статус каждые 30 секунд
    setInterval(() => {
        updateOnlineStatus();
        checkForNewMessages();
    }, 30000);
}

// НОВАЯ ФУНКЦИЯ: Обновление онлайн статуса
function updateOnlineStatus() {
    // В реальном приложении здесь был бы запрос к серверу
    // Для демо случайным образом меняем статусы
    Object.values(usersCache).forEach(user => {
        if (user.user_id !== currentUserId) {
            user.is_online = Math.random() > 0.3; // 70% шанс быть онлайн
        }
    });
    
    loadUsers();
    updateOnlineUsers();
}

// НОВАЯ ФУНКЦИЯ: Проверка новых сообщений
function checkForNewMessages() {
    // В реальном приложении здесь была бы проверка новых сообщений с сервера
    // Для демо просто обновляем счетчики
    updateUnreadBadges();
}

// Утилиты
function getRoleText(role) {
    const roles = {
        'main_admin': '👑 Главный админ',
        'admin': '🛡️ Админ',
        'moderator': '⚡ Модератор',
        'user': 'Участник'
    };
    return roles[role] || 'Участник';
}

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

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
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
window.showUsers = showUsersList;
window.showSettings = showSettings;
window.showAdminPanel = showAdminPanel;
window.sendMessage = sendMessage;
window.toggleSearch = toggleSearch;
window.toggleAttachMenu = toggleAttachMenu;
window.attachFile = attachFile;
window.toggleEmojiPicker = toggleEmojiPicker;
window.showEmojiCategory = showEmojiCategory;
window.insertEmoji = insertEmoji;
window.searchMessages = searchMessages;

// НОВЫЕ ГЛОБАЛЬНЫЕ ФУНКЦИИ
window.switchSection = switchSection;
window.showSection = showSection;
window.jumpToUnread = jumpToUnread;
window.mentionAll = mentionAll;
window.createInvite = createInvite;
window.showReactionPopup = showReactionPopup;
window.addReaction = addReaction;
window.toggleReaction = toggleReaction;
window.replyToMessage = replyToMessage;
window.forwardMessage = forwardMessage;
window.showMessageMenu = showMessageMenu;
window.changeUserRole = changeUserRole;
window.kickUser = kickUser;
window.deleteInvite = deleteInvite;
window.closeReplyPreview = closeReplyPreview;

window.handleKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
};

window.autoResize = function(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
};

window.closeForwardPopup = function() {
    const popup = document.getElementById('forward-popup');
    if (popup) popup.style.display = 'none';
};
