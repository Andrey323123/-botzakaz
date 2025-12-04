```javascript
// telegram-chat-extended.js - ПОЛНАЯ ВЕРСИЯ

// --- Глобальные переменные ---
let tg = null;
let currentUserId = null;
let currentUser = null;
let lastMessageId = 0;
let chatId = 'main_chat';
let messageInterval = null;
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
let usersCache = {}; // {userId: {first_name, last_name, username, is_online, message_count, role}}

// --- Инициализация ---
function initApp() {
    try {
        console.log('Инициализация приложения...');
        tg = window.Telegram.WebApp;
        if (!tg) {
            throw new Error('Telegram WebApp SDK не загружен');
        }

        // Установка темы
        tg.setBackgroundColor('#f1f1f1');
        tg.setHeaderColor('#5682a3');

        // Получение данных пользователя
        currentUser = tg.initDataUnsafe?.user;
        if (!currentUser || !currentUser.id) {
            throw new Error('Не удалось получить данные пользователя');
        }
        currentUserId = currentUser.id.toString();

        // Загрузка данных из localStorage
        loadDataFromStorage();
        checkUserRole();

        // Инициализация UI
        initializeUI();
        updateUserInfo();
        updateUserPermissions();

        // Загрузка сообщений текущего раздела
        displayCurrentSectionMessages();

        // Установка обработчиков событий
        setupEventListeners();
        setupGlobalEventListeners();

        // Запуск опроса
        startPolling();

        console.log('Приложение инициализировано успешно');
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        alert('Ошибка инициализации приложения: ' + error.message);
    }
}

// --- Загрузка данных из localStorage ---
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
                    const userLastRead = localStorage.getItem(`last_read_${sectionId}_${currentUserId}`) || 0;
                    sections[sectionId].unread = sectionMessages.filter(m => m.id > userLastRead && m.user_id !== currentUserId).length;
                }
            } catch (e) {
                console.error('Ошибка загрузки сообщений:', e);
            }
        }
    });

    // Загружаем роли
    const savedRoles = localStorage.getItem('telegram_chat_roles');
    if (savedRoles) {
        userRoles = JSON.parse(savedRoles);
    }

    // Загружаем приглашения
    const savedInvites = localStorage.getItem('telegram_chat_invites');
    if (savedInvites) {
        pendingInvites = JSON.parse(savedInvites);
    }

    updateUnreadBadges();
    displayCurrentSectionMessages();
}

function saveMessagesToStorage(sectionId = currentSection) {
    if (window.chatData && window.chatData[sectionId]) {
        localStorage.setItem(`telegram_chat_messages_${sectionId}`, JSON.stringify(window.chatData[sectionId]));
    }
}

// --- Проверка роли пользователя ---
function checkUserRole() {
    // Если пользователь первый раз, устанавливаем роль
    if (!userRoles[currentUserId]) {
        if (Object.keys(userRoles).length === 0) {
            userRoles[currentUserId] = 'main_admin'; // Первый пользователь - главный админ
        } else {
            userRoles[currentUserId] = 'user';
        }
        saveRoles();
    }

    const role = userRoles[currentUserId];
    isAdmin = ['main_admin', 'admin'].includes(role);
    isMainAdmin = role === 'main_admin';
}

// --- Инициализация UI ---
function initializeUI() {
    updateChatTitle();
    updateSectionsList();
    updateUnreadBadges();
    updateOnlineUsers();
    updateUserPermissions();

    // Показываем/скрываем кнопки админки
    document.getElementById('admin-menu-item').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('btn-admin').style.display = 'none';
    document.getElementById('btn-mention-all').style.display = 'none';
}

function updateChatTitle() {
    document.getElementById('chat-title').textContent = sections[currentSection].name;
}

function updateSectionsList() {
    Object.keys(sections).forEach(sectionId => {
        const unreadCount = sections[sectionId].unread;
        const unreadBadge = document.getElementById(`${sectionId}-unread`);
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount > 0 ? unreadCount : '';
            unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
    });
}

function updateUnreadBadges() {
    // Общий счетчик непрочитанных
    const totalUnread = Object.values(sections).reduce((sum, section) => sum + section.unread, 0);
    const unreadBadge = document.getElementById('unread-badge');
    if (unreadBadge) {
        unreadBadge.textContent = totalUnread > 0 ? totalUnread : '';
        unreadBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
    }
}

function updateUserPermissions() {
    const section = sections[currentSection];
    if (!section) return;
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = section.write === 'all' ||
                    (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                    (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));

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

function updateOnlineUsers() {
    const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
    document.getElementById('online-count').textContent = onlineCount;
    document.getElementById('sidebar-online-count').textContent = onlineCount;
}

function updateActiveSection() {
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.section-item[onclick*="${currentSection}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

// --- Обработчики событий ---
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

    // Обработка нажатия на кнопку "Назад"
    tg.BackButton.onClick(() => {
        handleBackButton();
    });
}

function setupGlobalEventListeners() {
    document.addEventListener('click', function(e) {
        // Закрытие всплывающих окон при клике вне их области
        const reactionsPopup = document.getElementById('reactions-popup');
        if (reactionsPopup && reactionsPopup.classList.contains('active') && !e.target.closest('.reactions-popup') && !e.target.closest('.btn-reaction')) {
            reactionsPopup.classList.remove('active');
        }
        const forwardPopup = document.getElementById('forward-popup');
        if (forwardPopup && forwardPopup.style.display === 'block' && !e.target.closest('.forward-popup') && !e.target.closest('.btn-forward')) {
            forwardPopup.style.display = 'none';
        }
    });
}

// --- Функции UI ---
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
    tg.BackButton.show();
    tg.BackButton.onClick(() => handleBackButton());
}

function showUsersList() {
    document.querySelectorAll('.chat-container, .admin-container, .users-container').forEach(view => {
        view.classList.remove('active');
        if (view.id !== 'users-view') {
            view.style.display = 'none';
        }
    });
    const usersView = document.getElementById('users-view');
    if (usersView) {
        usersView.classList.add('active');
        usersView.style.display = 'flex';
    }
    updateMenuActive(1);
    loadUsers();
    tg.BackButton.show();
    tg.BackButton.onClick(() => showSection(currentSection));
}

function showAdminPanel() {
    if (!isAdmin) {
        showNotification('У вас нет прав для доступа к админке.', 'error');
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

function updateMenuActive(activeIndex) {
    document.querySelectorAll('.menu-item').forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });
}

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
}

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

// --- Функции сообщений ---
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
        container.innerHTML = `<div class="empty-chat"><i class="fas fa-comments"></i><p>Раздел пуст. Будьте первым, кто напишет сообщение!</p></div>`;
        return;
    }

    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
    scrollToBottom();
}

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
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const user = message.user || { first_name: 'User', user_id: message.user_id };
    const userName = user.first_name || 'User';

    let contentHTML = '';
    switch (message.message_type) {
        case 'photo':
            contentHTML = `<div class="message-media"><img src="${message.photo_url}" alt="Фото" style="max-width: 100%; height: auto; border-radius: 10px;"></div>`;
            break;
        case 'document':
            contentHTML = `<div class="message-document"><i class="fas fa-file"></i><div class="document-info"><div class="document-name">${message.file_name || 'Документ'}</div><div class="document-size">${message.file_size || '1.2 MB'}</div></div><button class="download-btn"><i class="fas fa-download"></i></button></div>`;
            break;
        case 'sticker':
            contentHTML = `<div class="message-sticker"><div class="sticker-emoji">${message.emoji || '😊'}</div></div>`;
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
            reactionsHTML += `<div class="reaction ${userReacted ? 'user-reacted' : ''}" onclick="toggleReaction('${message.id}', '${emoji}')">${emoji} <span class="reaction-count">${users.length}</span></div>`;
        });
        reactionsHTML += `</div>`;
    }

    // Кнопки действий
    const actionsHTML = `<div class="message-actions">
        <button class="btn-reaction" onclick="showReactionPopup('${message.id}')"><i class="far fa-smile"></i></button>
        <button class="btn-reply" onclick="replyToMessage('${message.id}')"><i class="fas fa-reply"></i></button>
        <button class="btn-forward" onclick="forwardMessage('${message.id}')"><i class="fas fa-share"></i></button>
        ${(isAdmin || isOutgoing) ? `<button class="btn-more" onclick="showMessageMenu('${message.id}')"><i class="fas fa-ellipsis-h"></i></button>` : ''}
    </div>`;

    if (isSystem) {
        messageDiv.innerHTML = `<div class="message-content"><div class="message-system"><i class="fas fa-info-circle"></i>${contentHTML}<div class="message-time">${time}</div></div></div>`;
    } else {
        messageDiv.innerHTML = `${!isOutgoing ? `<div class="message-avatar" style="background-color: ${stringToColor(user.user_id)}">${userName.charAt(0).toUpperCase()}</div>` : ''}
        <div class="message-content">
            ${!isOutgoing ? `<div class="message-header"><div class="message-sender">${userName}${user.role !== 'user' ? `<span class="message-sender-role ${user.role}">${getRoleText(user.role)}</span>` : ''}</div><div class="message-time">${time}</div></div>` : ''}
            ${contentHTML}
            ${reactionsHTML}
            ${isOutgoing ? `<div class="message-status"><i class="fas fa-check${message.read ? '-double' : ''}"></i><div class="message-time">${time}</div></div>` : ''}
            ${actionsHTML}
        </div>`;
    }

    return messageDiv;
}

function toggleReaction(messageId, emoji) {
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
    saveMessagesToStorage(currentSection);

    // Обновляем отображение сообщения
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
    const text = message.content ? message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '') : '[медиа]';
    input.value += `@${userName}: ${text}\n`;
    input.focus();
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
    }, (buttonId) => {
        if (buttonId && buttonId !== 'cancel') {
            // Здесь будет отправка жалобы на сервер
            showNotification('Жалоба отправлена администраторам', 'success');
        }
    });
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
            (isOwnMessage || isAdmin) ? { id: 'delete', type: 'destructive', text: 'Удалить' } : null,
            !isOwnMessage ? { id: 'report', type: 'default', text: 'Пожаловаться' } : null,
            { type: 'cancel', text: 'Отмена' }
        ].filter(Boolean)
    }, (action) => {
        switch (action) {
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
    lastMessageId = forwardedMessage.id;
    saveMessagesToStorage(sectionId);

    // Увеличиваем счетчик непрочитанных
    sections[sectionId].unread++;
    updateUnreadBadges();
    showNotification(`Сообщение переслано в "${sections[sectionId].name}"`, 'success');
}

// --- Функции админки ---
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
        userElement.innerHTML = `<div class="admin-user-info">
            <div class="admin-user-avatar" style="background-color: ${stringToColor(user.user_id)}">${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}</div>
            <div>
                <div class="admin-user-name">${user.first_name} ${user.last_name || ''}<span class="user-role-badge ${userRole}">${getRoleText(userRole)}</span></div>
                <div class="admin-user-id">ID: ${user.user_id}</div>
                <div class="admin-user-status">${user.is_online ? 'онлайн' : 'оффлайн'}</div>
            </div>
        </div>
        <div class="admin-user-actions">
            ${canChangeRole ? `<select class="permission-select" onchange="changeUserRole('${user.user_id}', this.value)" value="${userRole}">
                <option value="user" ${userRole === 'user' ? 'selected' : ''}>Участник</option>
                <option value="moderator" ${userRole === 'moderator' ? 'selected' : ''}>Модератор</option>
                <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Админ</option>
                ${isMainAdmin ? '<option value="main_admin" ' + (userRole === 'main_admin' ? 'selected' : '') + '>Глав. Админ</option>' : ''}
            </select>` : ''}
            ${isMainAdmin && user.user_id !== currentUserId ? `<button class="btn-admin-action danger" onclick="kickUser('${user.user_id}')" style="margin-left: 5px;"><i class="fas fa-ban"></i></button>` : ''}
        </div>`;
        container.appendChild(userElement);
    });
}

function changeUserRole(userId, newRole = null) {
    if (!isMainAdmin) {
        showNotification('Только главный админ может изменять роли', 'error');
        return;
    }
    if (newRole) {
        userRoles[userId] = newRole;
    } else {
        // Циклическое изменение роли
        const roles = ['user', 'moderator', 'admin', 'main_admin'];
        const currentRole = userRoles[userId] || 'user';
        const currentIndex = roles.indexOf(currentRole);
        const nextIndex = (currentIndex + 1) % roles.length;
        userRoles[userId] = roles[nextIndex];
    }
    saveRoles();
    loadAdminUsersList();
    loadUsers();
    if (userId === currentUserId) {
        checkUserRole();
        initializeUI();
    }
    showNotification('Роль изменена', 'success');
}

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
        inviteElement.innerHTML = `<div><div class="invite-code">${invite.code}</div><div class="invite-stats">Использовано: ${invite.uses}/${invite.max_uses} • Истекает: ${expiresDate}</div></div>
        <button class="btn-copy-invite" onclick="copyInviteLink('${invite.code}')">Копировать</button>
        <button class="btn-admin-action danger" onclick="deleteInvite(${index})" style="margin-left: 5px;"><i class="fas fa-trash"></i></button>`;
        container.appendChild(inviteElement);
    });
}

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
        message: `Код приглашения: ${inviteCode}\nСкопируйте и отправьте его новым участникам.`,
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

function copyInviteLink(code) {
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Код скопирован', 'success');
    }).catch(err => {
        console.error('Ошибка при копировании: ', err);
        showNotification('Не удалось скопировать', 'error');
    });
}

function shareInvite(code) {
    const text = `Присоединяйтесь к нашему чату! Код приглашения: ${code}\nСсылка: https://t.me/botfs23?start=${code}`;
    if (tg.platform !== 'unknown') {
        tg.shareText(text);
    } else {
        navigator.clipboard.writeText(text);
        showNotification('Текст приглашения скопирован', 'success');
    }
}

function clearChatHistory() {
    if (confirm('Вы уверены, что хотите очистить историю текущего раздела? Это действие необратимо.')) {
        if (window.chatData) {
            window.chatData[currentSection] = [];
            saveMessagesToStorage(currentSection);
            displayCurrentSectionMessages();
            showNotification('История очищена', 'success');
        }
    }
}

function exportChatData() {
    // Простая реализация экспорта в JSON
    const dataStr = JSON.stringify(window.chatData, null, 2);
    const dataUri = 'application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `chat_data_${currentSection}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    showNotification('Данные экспортированы', 'success');
}

function createBackup() {
    // Создает резервную копию всех данных
    const backupData = {
        messages: window.chatData,
        roles: userRoles,
        invites: pendingInvites,
        users: usersCache,
        lastMessageId: lastMessageId
    };
    const dataStr = JSON.stringify(backupData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    showNotification('Резервная копия создана', 'success');
}

// --- Функции списка пользователей ---
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
        if (!usersCache[user.user_id]) {
            usersCache[user.user_id] = user;
        }
    });

    const container = document.getElementById('users-list');
    if (!container) return;

    const allUsers = Object.values(usersCache);
    const onlineUsers = allUsers.filter(u => u.is_online);
    const offlineUsers = allUsers.filter(u => !u.is_online);

    container.innerHTML = '';

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

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.onclick = () => showUserProfile(user.user_id);

    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const userRole = user.role || 'user';
    const roleText = getRoleText(userRole);
    const status = user.is_online ? '<span class="user-item-online">онлайн</span>' : `<span>сообщений: ${user.message_count || 0}</span>`;

    userElement.innerHTML = `
        <div class="user-item-avatar" style="background-color: ${stringToColor(user.user_id)}">${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}</div>
        <div class="user-item-info">
            <div class="user-item-name">${userName}${userRole !== 'user' ? `<span class="user-role-badge ${userRole}">${roleText}</span>` : ''}</div>
            <div class="user-item-status">${status}</div>
        </div>
        ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
    `;
    return userElement;
}

function showUserProfile(userId) {
    const user = usersCache[userId];
    if (!user) return;
    const userRole = user.role || 'user';
    const roleText = getRoleText(userRole);

    tg.showPopup({
        title: `Профиль: ${user.first_name}`,
        message: `👤 Имя: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n📛 Username: ${user.username || 'нет'}\n🎭 Роль: ${roleText}\n🆔 ID: ${user.user_id}\n📊 Сообщений: ${user.message_count || 0}${user.is_online ? '\n🟢 Онлайн' : '\n⚫ Оффлайн'}`.trim(),
        buttons: [
            { id: 'mention', type: 'default', text: 'Упомянуть' },
            isAdmin ? { id: 'role', type: 'default', text: 'Изменить роль' } : null,
            { type: 'cancel', text: 'Закрыть' }
        ].filter(Boolean)
    }, (buttonId) => {
        if (buttonId === 'mention') {
            const input = document.getElementById('message-input');
            input.value += `@${user.username || user.first_name} `;
        }
        if (buttonId === 'role' && isAdmin) {
            changeUserRole(userId);
        }
    });
}

// --- Прочие функции ---
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

// НОВАЯ ФУНКЦИЯ: Сохранение ролей
function saveRoles() {
    localStorage.setItem('telegram_chat_roles', JSON.stringify(userRoles));
}

// НОВАЯ ФУНКЦИЯ: Сохранение приглашений
function saveInvites() {
    localStorage.setItem('telegram_chat_invites', JSON.stringify(pendingInvites));
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

// --- Функции для UI ---
function updateOnlineUsers() {
    // Просто обновляем отображение на основе кэша
    const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
    document.getElementById('online-count').textContent = onlineCount;
    document.getElementById('sidebar-online-count').textContent = onlineCount;
}

function updateChatTitle() {
    document.getElementById('chat-title').textContent = sections[currentSection].name;
}

function updateSectionsList() {
    Object.keys(sections).forEach(sectionId => {
        const unreadCount = sections[sectionId].unread;
        const unreadBadge = document.getElementById(`${sectionId}-unread`);
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount > 0 ? unreadCount : '';
            unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
    });
}

function updateMenuActive(activeIndex) {
    document.querySelectorAll('.menu-item').forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });
}

function updateActiveSection() {
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.section-item[onclick*="${currentSection}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

function checkWritePermissions() {
    const section = sections[currentSection];
    if (!section) return;
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = section.write === 'all' ||
                    (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                    (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));

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

// --- Функции для работы с localStorage ---
function saveMessagesToStorage(sectionId = currentSection) {
    if (window.chatData && window.chatData[sectionId]) {
        localStorage.setItem(`telegram_chat_messages_${sectionId}`, JSON.stringify(window.chatData[sectionId]));
    }
}

function saveRoles() {
    localStorage.setItem('telegram_chat_roles', JSON.stringify(userRoles));
}

function saveInvites() {
    localStorage.setItem('telegram_chat_invites', JSON.stringify(pendingInvites));
}

function saveUsers() {
    localStorage.setItem('telegram_chat_users', JSON.stringify(usersCache));
}

// --- Вспомогательные функции ---
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

function showNotification(message, type = 'info') {
    tg.showPopup({
        title: type === 'error' ? 'Ошибка' : type === 'success' ? 'Успех' : 'Информация',
        message: message,
        buttons: [{ type: 'close', text: 'OK' }]
    });
}

function showError(message) {
    showNotification(message, 'error');
}

// --- Эмодзи ---
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'],
    people: ['👋', '👍', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫦'],
    symbols: ['❤️', '🧡', '-yellow', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🆎', '🔡', '眇', '7⃣', '8⃣', '9⃣', '0⃣', '1⃣', '2⃣', '3⃣', '4⃣', '5⃣', '6⃣', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤'],
    nature: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊', '🥄', '🍴', '🍽️', '🥣', '🥡', '🥢']
};

function showEmojiCategory(category) {
    const grid = document.getElementById('emoji-grid');
    const emojis = emojiCategories[category] || [];
    grid.innerHTML = '';
    emojis.forEach(emoji => {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-option';
        emojiElement.textContent = emoji;
        emojiElement.onclick = () => insertEmoji(emoji);
        grid.appendChild(emojiElement);
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    autoResize(input);
    input.focus();
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('active');
    if (picker.classList.contains('active') && document.getElementById('emoji-grid').innerHTML === '') {
        showEmojiCategory('smileys');
    }
}

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

// --- Опрос обновлений ---
function startPolling() {
    // Обновляем онлайн статус каждые 30 секунд
    setInterval(() => {
        updateOnlineStatus();
        checkForNewMessages();
    }, 30000);
}

function updateOnlineStatus() {
    // Просто обновляем статус текущего пользователя
    if (usersCache[currentUserId]) {
        usersCache[currentUserId].is_online = true;
        saveUsers();
        updateOnlineUsers();
    }
}

function checkForNewMessages() {
    // В реальном приложении здесь была бы проверка новых сообщений с сервера
    // Для демо просто обновляем счетчики
    updateUnreadBadges();
    // Также можно обновлять онлайн-статусы пользователей, если реализована такая логика
    updateOnlineUsers();
}

// --- Глобальные функции (для вызова из HTML) ---
window.toggleSidebar = toggleSidebar;
window.showChat = showChat;
window.showUsersList = showUsersList;
window.showAdminPanel = showAdminPanel;
window.switchSection = switchSection;
window.showSection = showSection;
window.jumpToUnread = function() {
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
    // Обновляем бейджи
    sections[currentSection].unread = 0;
    updateUnreadBadges();
};
window.mentionAll = function() {
    // Фильтруем только онлайн пользователей
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online && u.user_id !== currentUserId);
    const mentions = onlineUsers.map(u => `@${u.username || u.first_name}`).join(', ');

    const input = document.getElementById('message-input');
    input.value += `Внимание ${mentions}! `;
    input.focus();
    showNotification(`Упомянуто ${onlineUsers.length} пользователей`, 'success');
};
window.createInvite = createInvite;
window.showReactionPopup = function(messageId) {
    const popup = document.getElementById('reactions-popup');
    if (!popup) return;

    // Позиционируем попап
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const rect = messageElement.getBoundingClientRect();
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.top - 60}px`;
        popup.style.display = 'block';
        popup.dataset.messageId = messageId;
    }
};
window.addReaction = function(messageId, emoji) {
    // Заглушка, используем toggleReaction
    toggleReaction(messageId, emoji);
};
window.toggleReaction = toggleReaction;
window.replyToMessage = replyToMessage;
window.forwardMessage = forwardMessage;
window.showMessageMenu = showMessageMenu;
window.editMessage = editMessage;
window.deleteMessage = deleteMessage;
window.reportMessage = reportMessage;
window.showUserProfile = showUserProfile;
window.shareInvite = shareInvite;
window.changeUserRole = changeUserRole;
window.kickUser = kickUser;
window.clearChatHistory = clearChatHistory;
window.exportChatData = exportChatData;
window.createBackup = createBackup;
window.clearReplyPreview = function() {
    const container = document.getElementById('reply-preview-container');
    container.innerHTML = '';
    container.style.display = 'none';
    delete container.dataset.replyTo;
};
window.toggleEmojiPicker = toggleEmojiPicker;
window.showEmojiCategory = showEmojiCategory;
window.insertEmoji = insertEmoji;
window.searchMessages = function(query) {
    if (!query.trim()) {
        // Если пустой запрос, просто покажем чат
        showChat();
        return;
    }

    // Простой поиск по текущему разделу
    const results = [];
    if (window.chatData && window.chatData[currentSection]) {
        results.push(...window.chatData[currentSection].filter(m => m.content && m.content.toLowerCase().includes(query.toLowerCase())));
    }

    // Показываем результаты в специальном представлении или просто в чате
    // Для простоты, покажем в чате, отфильтровав и выделив
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = `<div class="empty-chat"><i class="fas fa-search"></i><p>Сообщения по запросу "${query}" не найдены</p></div>`;
        return;
    }

    results.forEach(message => {
        const messageElement = createMessageElement(message);
        // Выделяем найденный текст (упрощённо)
        if (message.content) {
            const highlightedContent = message.content.replace(new RegExp(query, 'gi'), `<mark>$&</mark>`);
            // Это не будет работать напрямую в createMessageElement, так как content туда передаётся как есть
            // Поэтому просто покажем сообщение как есть, поиск будет визуально в отдельном представлении
        }
        container.appendChild(messageElement);
    });

    // Пока что просто покажем, что есть результаты
    // В реальной реализации нужно создать отдельный контейнер для результатов поиска
    showNotification(`Найдено ${results.length} сообщений`, 'info');
};
window.clearUserSearch = function() {
    document.getElementById('users-search-input').value = '';
    searchUsers('');
};
window.closeForwardPopup = function() {
    document.getElementById('forward-popup').style.display = 'none';
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Устанавливаем фото из Telegram, если доступно
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        const user = tg.initDataUnsafe?.user;

        if (user && user.photo_url) {
            const img = document.getElementById('user-avatar-img');
            img.src = user.photo_url;
            img.style.display = 'block';
            const icon = document.getElementById('user-avatar-icon');
            if (icon) icon.style.display = 'none';
        }
    }

    // Скрываем элементы, которые нужно скрыть по умолчанию
    document.getElementById('admin-menu-item').style.display = 'none';
    document.getElementById('btn-admin').style.display = 'none';
    document.getElementById('btn-mention-all').style.display = 'none';
    document.getElementById('admin-view').style.display = 'none';
    document.getElementById('users-view').style.display = 'none';

    // Прячем контекстное меню
    document.getElementById('message-context-menu').style.display = 'none';
    document.getElementById('forward-popup').style.display = 'none';

    // Инициализируем эмодзи пикер
    if (window.showEmojiCategory) {
        window.showEmojiCategory('smileys');
    }

    // Инициализируем приложение
    if (window.initApp) {
        setTimeout(() => window.initApp(), 100);
    }
});
```
