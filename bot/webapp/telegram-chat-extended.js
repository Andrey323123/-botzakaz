// telegram-chat-extended.js

let tg = window.Telegram.WebApp;
let currentUserId = null;
let currentUser = null;
let messages = [];
let usersCache = {};
let sections = {
    main: { id: 'main', name: 'Основной чат', write: 'all', unread: 0 },
    news: { id: 'news', name: 'Новости', write: 'all', unread: 0 },
    rules: { id: 'rules', name: 'Правила', write: 'admins', unread: 0, locked: true },
    announcements: { id: 'announcements', name: 'Объявления', write: 'admins', unread: 0 }
};
let currentSection = 'main';
let userRoles = {}; // {userId: 'admin'|'moderator'|'user'}
let lastMessageId = 0;
let unreadMessages = 0;
let pendingInvites = [];
let isAdmin = false;

// Инициализация приложения
function initApp() {
    console.log("🚀 Инициализация расширенного приложения...");
    
    if (!window.Telegram || !window.Telegram.WebApp) {
        console.error("Telegram WebApp не доступен");
        showError('Откройте приложение через Telegram бота');
        return;
    }
    
    try {
        tg.expand();
        tg.ready();
        
        // Настройка кнопки назад
        tg.BackButton.show();
        tg.BackButton.onClick(handleBackButton);
        
        // Тема
        updateTheme();
        tg.onEvent('themeChanged', updateTheme);
        
        // Получаем данные пользователя
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
            showError('Не удалось получить данные пользователя');
            return;
        }
        
        // Проверяем роль пользователя
        checkUserRole();
        
        // Инициализируем интерфейс
        initUI();
        setupEventListeners();
        
        // Загружаем данные
        loadDataFromStorage();
        startPolling();
        
        console.log("✅ Приложение инициализировано");
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка инициализации приложения');
    }
}

// Проверка роли пользователя
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
    
    // Показываем/скрываем админ-элементы
    updateAdminUI();
}

// Обновление админ UI
function updateAdminUI() {
    const adminMenuItem = document.getElementById('admin-menu-item');
    const adminButton = document.getElementById('btn-admin');
    
    if (adminMenuItem) {
        adminMenuItem.style.display = isAdmin ? 'flex' : 'none';
    }
    
    if (adminButton) {
        adminButton.style.display = isAdmin ? 'flex' : 'none';
    }
    
    // Обновляем роль в UI
    const userRoleElement = document.getElementById('user-role');
    if (userRoleElement) {
        const roleText = {
            'main_admin': '👑 Главный админ',
            'admin': '🛡️ Админ',
            'moderator': '⚡ Модератор',
            'user': '👤 Участник'
        }[userRoles[currentUserId]] || '👤 Участник';
        userRoleElement.textContent = roleText;
        userRoleElement.className = `user-role ${userRoles[currentUserId]}`;
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

// Загрузка данных из localStorage
function loadDataFromStorage() {
    // Загружаем сообщения по разделам
    Object.keys(sections).forEach(sectionId => {
        const savedMessages = localStorage.getItem(`telegram_chat_${sectionId}`);
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

// Сохранение данных
function saveMessagesToStorage(sectionId) {
    if (window.chatData && window.chatData[sectionId]) {
        localStorage.setItem(`telegram_chat_${sectionId}`, JSON.stringify(window.chatData[sectionId]));
    }
}

function saveRoles() {
    localStorage.setItem('telegram_chat_roles', JSON.stringify(userRoles));
}

function saveInvites() {
    localStorage.setItem('telegram_chat_invites', JSON.stringify(pendingInvites));
}

// Работа с разделами
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
    
    // Обновляем бейджи
    updateUnreadBadges();
}

function showSection(sectionId) {
    // Проверяем доступ к разделу
    const section = sections[sectionId];
    if (!section) return;
    
    // Проверяем права на запись
    const canWrite = section.write === 'all' || 
                     (section.write === 'admins' && isAdmin) ||
                     (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRoles[currentUserId]));
    
    // Обновляем поле ввода
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button') || document.querySelector('.btn-send');
    
    if (messageInput) {
        messageInput.disabled = !canWrite;
        messageInput.placeholder = canWrite ? 'Сообщение...' : 'Только чтение...';
    }
    
    if (sendButton) {
        sendButton.disabled = !canWrite;
        sendButton.style.opacity = canWrite ? '1' : '0.5';
    }
    
    switchSection(sectionId);
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
            content: `Добро пожаловать в раздел "${sections[currentSection].name}"!`,
            timestamp: Date.now(),
            read: true
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

// Создание элемента сообщения с реакциями
function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const isSystem = message.user_id === 'system';
    const messageDiv = document.createElement('div');
    
    messageDiv.className = `message ${isSystem ? 'system' : isOutgoing ? 'outgoing' : 'incoming'}`;
    messageDiv.dataset.messageId = message.id;
    
    // Проверяем, прочитано ли сообщение
    if (!isOutgoing && !isSystem) {
        const lastRead = localStorage.getItem(`last_read_${currentSection}_${currentUserId}`) || 0;
        if (message.id > lastRead) {
            messageDiv.classList.add('unread');
        }
    }
    
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
                
                <!-- Кнопки действий -->
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
    const canWrite = section.write === 'all' || 
                     (section.write === 'admins' && isAdmin) ||
                     (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRoles[currentUserId]));
    
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

// Реакции на сообщения
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

function toggleReaction(messageId, emoji) {
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

// Ответ на сообщение
function replyToMessage(messageId) {
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const input = document.getElementById('message-input');
    const userName = message.user?.first_name || 'Пользователь';
    const text = message.content?.substring(0, 50) + (message.content?.length > 50 ? '...' : '');
    
    input.value = `> ${userName}: ${text}\n`;
    input.focus();
    
    // Показываем превью ответа
    showReplyPreview(messageId);
}

function showReplyPreview(messageId) {
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const preview = document.createElement('div');
    preview.className = 'reply-preview';
    preview.innerHTML = `
        <div class="reply-header">
            <div class="reply-sender">${message.user?.first_name || 'Пользователь'}</div>
            <button class="btn-close-reply" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="reply-text">${escapeHtml(message.content?.substring(0, 100) || '')}</div>
    `;
    
    const container = document.getElementById('messages-container');
    if (container) {
        container.appendChild(preview);
        setTimeout(() => {
            preview.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
}

// Пересылка сообщения
function forwardMessage(messageId) {
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    tg.showPopup({
        title: 'Переслать сообщение',
        message: 'Выберите раздел для пересылки:',
        buttons: Object.values(sections)
            .filter(section => section.id !== currentSection)
            .map(section => ({
                id: section.id,
                type: 'default',
                text: section.name
            }))
            .concat([{ type: 'cancel', text: 'Отмена' }])
    }, (sectionId) => {
        if (sectionId && sectionId !== 'cancel') {
            forwardToSection(message, sectionId);
        }
    });
}

function forwardToSection(message, sectionId) {
    const forwardedMessage = {
        ...message,
        id: lastMessageId + 1,
        forwarded_from: message.section || currentSection,
        forwarded_by: currentUserId,
        timestamp: Date.now(),
        read: false,
        section: sectionId
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

// Контекстное меню сообщения
function showMessageMenu(messageId) {
    const message = window.chatData[currentSection].find(m => m.id == messageId);
    if (!message) return;
    
    const isOwnMessage = message.user_id == currentUserId;
    const canDelete = isOwnMessage || isAdmin;
    
    tg.showPopup({
        title: 'Действия с сообщением',
        message: `Сообщение от ${message.user?.first_name || 'пользователя'}`,
        buttons: [
            { id: 'copy', type: 'default', text: 'Копировать текст' },
            { id: 'copy_link', type: 'default', text: 'Копировать ссылку' },
            { id: 'favorite', type: 'default', text: 'В избранное' },
            { id: 'report', type: 'default', text: 'Пожаловаться' },
            canDelete ? { id: 'delete', type: 'destructive', text: 'Удалить' } : null,
            { type: 'cancel', text: 'Отмена' }
        ].filter(Boolean)
    }, (action) => {
        switch(action) {
            case 'copy':
                navigator.clipboard.writeText(message.content || '');
                showNotification('Текст скопирован', 'success');
                break;
            case 'copy_link':
                const link = `https://t.me/botfs23/message/${messageId}`;
                navigator.clipboard.writeText(link);
                showNotification('Ссылка скопирована', 'success');
                break;
            case 'favorite':
                addToFavorites(messageId);
                break;
            case 'report':
                reportMessage(messageId);
                break;
            case 'delete':
                deleteMessage(messageId);
                break;
        }
    });
}

function deleteMessage(messageId) {
    tg.showConfirm('Удалить это сообщение?', (confirmed) => {
        if (!confirmed) return;
        
        if (window.chatData[currentSection]) {
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

// Админ-панель
function showAdminPanel() {
    if (!isAdmin) {
        showNotification('У вас нет прав администратора', 'error');
        return;
    }
    
    // Скрываем все вьюхи
    document.querySelectorAll('.chat-container, .admin-container').forEach(view => {
        view.classList.remove('active');
    });
    
    // Показываем админ панель
    const adminView = document.getElementById('admin-view');
    if (adminView) {
        adminView.classList.add('active');
        loadAdminUsersList();
    }
    
    // Обновляем меню
    updateMenuActive('admin');
    
    // Показываем кнопку назад
    tg.BackButton.show();
    tg.BackButton.onClick(() => showSection('main'));
}

function loadAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;
    
    const users = Object.values(usersCache);
    container.innerHTML = '';
    
    users.forEach(user => {
        const userRole = userRoles[user.user_id] || 'user';
        const canChangeRole = userRoles[currentUserId] === 'main_admin' && user.user_id !== currentUserId;
        
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
                ${userRoles[currentUserId] === 'main_admin' && user.user_id !== currentUserId ? `
                <button class="btn-admin-action danger" onclick="kickUser('${user.user_id}')" style="margin-left: 5px;">
                    <i class="fas fa-ban"></i>
                </button>
                ` : ''}
            </div>
        `;
        
        container.appendChild(userElement);
    });
}

function changeUserRole(userId, newRole) {
    if (userRoles[currentUserId] !== 'main_admin') {
        showNotification('Только главный админ может менять роли', 'error');
        return;
    }
    
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
            loadUsers(); // Обновляем список пользователей
            
            showNotification('Роль обновлена', 'success');
        }
    });
}

function kickUser(userId) {
    if (userRoles[currentUserId] !== 'main_admin') {
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

// Созыв (упоминание всех)
function mentionAll() {
    const input = document.getElementById('message-input');
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online && u.user_id !== currentUserId);
    
    if (onlineUsers.length === 0) {
        showNotification('Нет онлайн пользователей для упоминания', 'info');
        return;
    }
    
    const mentions = onlineUsers.map(user => `@${user.username || user.first_name}`).join(' ');
    input.value += mentions + ' ';
    input.focus();
    
    showNotification(`Упомянуто ${onlineUsers.length} пользователей`, 'success');
}

// Приглашения
function createInvite() {
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

function shareInvite(code) {
    const text = `Присоединяйтесь к нашему чату! Код приглашения: ${code}\n\nСсылка: https://t.me/botfs23?start=${code}`;
    
    if (tg.platform !== 'unknown') {
        tg.shareText(text);
    } else {
        navigator.clipboard.writeText(text);
        showNotification('Текст приглашения скопирован', 'success');
    }
}

// Прыжок к непрочитанным
function jumpToUnread() {
    const unreadMessages = document.querySelectorAll('.message.unread');
    
    if (unreadMessages.length === 0) {
        showNotification('Нет непрочитанных сообщений', 'info');
        return;
    }
    
    // Прокручиваем к первому непрочитанному
    unreadMessages[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Помечаем как прочитанные
    const container = document.getElementById('messages-container');
    const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
    if (lastMessage) {
        localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
    }
    
    // Убираем стиль непрочитанных
    unreadMessages.forEach(msg => msg.classList.remove('unread'));
    
    // Обновляем счетчик
    sections[currentSection].unread = 0;
    updateUnreadBadges();
    
    showNotification(`Прокручено к непрочитанным (${unreadMessages.length})`, 'success');
}

// Обновление бейджей непрочитанных
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

function updateChatTitle() {
    const titleElement = document.querySelector('.chat-title');
    if (titleElement && sections[currentSection]) {
        titleElement.textContent = sections[currentSection].name;
    }
}

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
}

function showNotification(message, type = 'info') {
    const title = type === 'error' ? 'Ошибка' : 
                 type === 'success' ? 'Успех' : 'Информация';
    
    tg.showPopup({
        title: title,
        message: message,
        buttons: [{ type: 'close', text: 'OK' }]
    });
}

function showError(message) {
    showNotification(message, 'error');
}

// Обработка кнопки назад
function handleBackButton() {
    const adminView = document.getElementById('admin-view');
    if (adminView && adminView.classList.contains('active')) {
        showSection('main');
    } else if (document.getElementById('sidebar').classList.contains('active')) {
        toggleSidebar();
    } else {
        tg.showConfirm("Выйти из приложения?", (confirmed) => {
            if (confirmed) tg.close();
        });
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Отправка по Enter
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Клик вне попапов
    document.addEventListener('click', (e) => {
        // Закрытие эмодзи пикера
        const emojiPicker = document.getElementById('emoji-picker');
        if (emojiPicker && emojiPicker.classList.contains('active') && 
            !e.target.closest('.emoji-picker') && !e.target.closest('.btn-emoji')) {
            emojiPicker.classList.remove('active');
        }
        
        // Закрытие реакций
        const reactionsPopup = document.getElementById('reactions-popup');
        if (reactionsPopup && reactionsPopup.classList.contains('active') && 
            !e.target.closest('.reactions-popup') && !e.target.closest('.btn-reaction')) {
            reactionsPopup.classList.remove('active');
        }
    });
}

// Опрос обновлений
function startPolling() {
    // Обновляем онлайн статус каждые 30 секунд
    setInterval(() => {
        updateOnlineStatus();
        checkForNewMessages();
    }, 30000);
}

function updateOnlineStatus() {
    // В реальном приложении здесь был бы запрос к серверу
    // Для демо случайным образом меняем статусы
    Object.values(usersCache).forEach(user => {
        if (user.user_id !== currentUserId) {
            user.is_online = Math.random() > 0.3; // 70% шанс быть онлайн
        }
    });
    
    loadUsers();
    updateOnlineCount();
}

function checkForNewMessages() {
    // В реальном приложении здесь была бы проверка новых сообщений с сервера
    // Для демо просто обновляем счетчики
    updateUnreadBadges();
}

function updateOnlineCount() {
    const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
    
    const elements = ['online-count', 'sidebar-online-count'];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = onlineCount;
    });
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initApp);

// Глобальные функции
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
};

window.showSection = showSection;
window.sendMessage = sendMessage;
window.toggleEmojiPicker = function() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('active');
};

window.showEmojiCategory = function(category) {
    // Реализация выбора категории эмодзи
};

window.insertEmoji = function(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
};

window.attachFile = function(type) {
    showNotification(`Отправка ${type} в разработке`, 'info');
};

window.showAdminPanel = showAdminPanel;
window.jumpToUnread = jumpToUnread;
window.createInvite = createInvite;
window.mentionAll = mentionAll;

// Добавьте эти функции в HTML:
// 1. Кнопка "Созыв" в меню сообщений
// 2. Кнопка "Пригласить" в админ-панели
// 3. Обновленный список участников с ролями
// 4. Система разрешений для разделов
