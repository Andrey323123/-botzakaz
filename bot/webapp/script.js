// telegram-chat.js - ЧИСТЫЙ КОД БЕЗ ТЕСТОВЫХ ДАННЫХ

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let tg = null;
let currentUserId = null;
let currentUser = null;
let lastMessageId = 0;
let currentSection = 'main';
let userRoles = {};
let isAdmin = false;
let isMainAdmin = false;
let usersCache = {};
let onlineStatus = {};
let pendingInvites = [];

// Настройки разделов
let sections = {
    main: { 
        id: 'main', 
        name: 'Основной чат', 
        write: 'all', 
        unread: 0, 
        color: '#3390ec',
        locked: false
    },
    news: { 
        id: 'news', 
        name: 'Новости', 
        write: 'all', 
        unread: 0, 
        color: '#34c759',
        locked: false
    },
    rules: { 
        id: 'rules', 
        name: 'Правила', 
        write: 'admins', 
        unread: 0, 
        color: '#ff9500',
        locked: true
    },
    announcements: { 
        id: 'announcements', 
        name: 'Объявления', 
        write: 'admins', 
        unread: 0, 
        color: '#ff3b30',
        locked: false
    }
};

// ===== ИНИЦИАЛИЗАЦИЯ =====
function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    // Скрываем экран загрузки
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('app').style.display = 'flex';
        initializeUI();
    }, 1000);
    
    // Инициализация Telegram WebApp
    try {
        tg = window.Telegram.WebApp;
        if (tg) {
            tg.expand();
            tg.enableClosingConfirmation();
            tg.setHeaderColor('#3390ec');
            tg.setBackgroundColor('#ffffff');
            
            currentUser = tg.initDataUnsafe?.user || {
                id: Math.floor(Math.random() * 1000000),
                first_name: 'Гость',
                last_name: '',
                username: 'guest'
            };
        } else {
            // Режим браузера
            currentUser = {
                id: Math.floor(Math.random() * 1000000),
                first_name: 'Гость',
                last_name: '',
                username: 'guest'
            };
        }
        
        currentUserId = currentUser.id.toString();
        console.log('👤 Пользователь:', currentUser);
        
        // Загрузка данных
        loadDataFromStorage();
        checkUserRole();
        updateUserInfo();
        displayCurrentSectionMessages();
        loadUsers();
        
        // Настройка обработчиков
        setupEventListeners();
        startPolling();
        
        console.log('✅ Приложение инициализировано');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        showNotification('Ошибка инициализации', 'error');
        initializeUI();
    }
}

// ===== ДАННЫЕ И ХРАНЕНИЕ =====
function loadDataFromStorage() {
    console.log('📂 Загрузка данных из localStorage...');
    
    // Загрузка сообщений
    Object.keys(sections).forEach(sectionId => {
        const savedMessages = localStorage.getItem(`chat_messages_${sectionId}`);
        if (savedMessages) {
            try {
                if (!window.chatData) window.chatData = {};
                window.chatData[sectionId] = JSON.parse(savedMessages);
                
                // Находим максимальный ID
                if (window.chatData[sectionId].length > 0) {
                    const maxId = Math.max(...window.chatData[sectionId].map(m => m.id));
                    if (maxId > lastMessageId) lastMessageId = maxId;
                }
            } catch (e) {
                console.error(`Ошибка загрузки сообщений для ${sectionId}:`, e);
            }
        } else {
            // Создаем начальные сообщения для каждого раздела
            if (!window.chatData) window.chatData = {};
            window.chatData[sectionId] = [
                {
                    id: 1,
                    user_id: 'system',
                    user: { first_name: 'Система', user_id: 'system' },
                    message_type: 'text',
                    content: `👋 Добро пожаловать в раздел "${sections[sectionId].name}"!`,
                    timestamp: Date.now(),
                    section: sectionId
                }
            ];
            saveMessagesToStorage(sectionId);
        }
    });

    // Загрузка ролей
    const savedRoles = localStorage.getItem('chat_roles');
    if (savedRoles) {
        try {
            userRoles = JSON.parse(savedRoles);
        } catch (e) {
            console.error('Ошибка загрузки ролей:', e);
            userRoles = {};
        }
    }

    // Загрузка пользователей
    const savedUsers = localStorage.getItem('chat_users');
    if (savedUsers) {
        try {
            usersCache = JSON.parse(savedUsers);
        } catch (e) {
            console.error('Ошибка загрузки пользователей:', e);
            usersCache = {};
        }
    }

    // Загрузка приглашений
    const savedInvites = localStorage.getItem('chat_invites');
    if (savedInvites) {
        try {
            pendingInvites = JSON.parse(savedInvites);
        } catch (e) {
            console.error('Ошибка загрузки приглашений:', e);
            pendingInvites = [];
        }
    }

    updateUnreadBadges();
}

function saveMessagesToStorage(sectionId = currentSection) {
    try {
        if (window.chatData && window.chatData[sectionId]) {
            localStorage.setItem(`chat_messages_${sectionId}`, 
                JSON.stringify(window.chatData[sectionId]));
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщений:', error);
    }
}

function saveRoles() {
    try {
        localStorage.setItem('chat_roles', JSON.stringify(userRoles));
    } catch (error) {
        console.error('❌ Ошибка сохранения ролей:', error);
    }
}

function saveUsers() {
    try {
        localStorage.setItem('chat_users', JSON.stringify(usersCache));
    } catch (error) {
        console.error('❌ Ошибка сохранения пользователей:', error);
    }
}

function saveInvites() {
    try {
        localStorage.setItem('chat_invites', JSON.stringify(pendingInvites));
    } catch (error) {
        console.error('❌ Ошибка сохранения приглашений:', error);
    }
}

// ===== РОЛИ ПОЛЬЗОВАТЕЛЕЙ =====
function checkUserRole() {
    try {
        // Если пользователь первый раз, устанавливаем роль
        if (!userRoles[currentUserId]) {
            if (Object.keys(userRoles).length === 0) {
                // Первый пользователь - главный админ
                userRoles[currentUserId] = 'main_admin';
                console.log('👑 Установлена роль: главный админ (первый пользователь)');
            } else {
                userRoles[currentUserId] = 'user';
                console.log('👤 Установлена роль: участник');
            }
            saveRoles();
        }

        const role = userRoles[currentUserId];
        isAdmin = ['main_admin', 'admin'].includes(role);
        isMainAdmin = role === 'main_admin';
        
        console.log(`🎭 Текущая роль: ${role}, isAdmin: ${isAdmin}, isMainAdmin: ${isMainAdmin}`);
        
        // Обновляем UI в зависимости от роли
        const adminMenuItem = document.getElementById('admin-menu-item');
        const btnAdmin = document.getElementById('btn-admin');
        
        if (adminMenuItem) {
            adminMenuItem.style.display = isAdmin ? 'flex' : 'none';
        }
        if (btnAdmin) {
            btnAdmin.style.display = isAdmin ? 'flex' : 'none';
        }
        
    } catch (error) {
        console.error('❌ Ошибка проверки роли:', error);
        userRoles[currentUserId] = 'user';
        isAdmin = false;
        isMainAdmin = false;
    }
}

// ===== UI ФУНКЦИИ =====
function initializeUI() {
    updateChatTitle();
    updateSectionsList();
    updateUnreadBadges();
    updateOnlineUsers();
    updateUserPermissions();
    
    // Настройка кнопок
    document.getElementById('btn-menu').onclick = toggleSidebar;
    document.getElementById('btn-close-sidebar').onclick = toggleSidebar;
    document.getElementById('overlay').onclick = toggleSidebar;
    
    document.getElementById('send-button').onclick = sendMessage;
    document.getElementById('btn-attach').onclick = toggleAttachMenu;
    document.getElementById('btn-emoji').onclick = toggleEmojiPicker;
    document.getElementById('btn-mention-all').onclick = mentionAll;
    document.getElementById('btn-jump').onclick = jumpToUnread;
    document.getElementById('btn-users').onclick = () => showUsersList();
    document.getElementById('btn-admin').onclick = () => showAdminPanel();
    
    // Настройка ввода сообщения
    const messageInput = document.getElementById('message-input');
    messageInput.onkeypress = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    // Настройка поиска пользователей
    const searchInput = document.getElementById('users-search-input');
    if (searchInput) {
        searchInput.onkeyup = function(e) {
            if (e.key === 'Enter') {
                searchUsers(this.value);
            }
        };
    }
    
    // Инициализация эмодзи
    showEmojiCategory('smileys');
    
    // Загрузка настроек темы
    loadTheme();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('overlay').classList.toggle('active');
}

function updateChatTitle() {
    const section = sections[currentSection];
    document.getElementById('chat-title').textContent = section.name;
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
    const totalUnread = Object.values(sections).reduce((sum, section) => sum + section.unread, 0);
    const unreadBadge = document.getElementById('unread-badge');
    if (unreadBadge) {
        unreadBadge.textContent = totalUnread > 0 ? totalUnread : '';
        unreadBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
    }
}

function updateOnlineUsers() {
    const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
    document.getElementById('online-count').textContent = onlineCount;
    document.getElementById('sidebar-online-count').textContent = onlineCount;
}

function updateUserPermissions() {
    const section = sections[currentSection];
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = section.write === 'all' ||
                    (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                    (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));
    
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    if (messageInput) {
        messageInput.disabled = !canWrite;
        messageInput.placeholder = canWrite ? 'Сообщение...' : 'Только чтение...';
    }
    if (sendButton) {
        sendButton.disabled = !canWrite;
        sendButton.style.opacity = canWrite ? '1' : '0.5';
    }
}

// ===== РАБОТА С РАЗДЕЛАМИ =====
function switchSection(sectionId) {
    if (!sections[sectionId]) return;
    
    // Проверка доступа
    if (sections[sectionId].locked && !isAdmin) {
        showNotification('Этот раздел заблокирован', 'error');
        return;
    }
    
    // Обновляем активный раздел в UI
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.section-item').classList.add('active');
    
    // Сохраняем время последнего прочтения для текущего раздела
    if (window.chatData && window.chatData[currentSection]) {
        const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
        if (lastMessage) {
            localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
        }
    }
    
    // Сбрасываем непрочитанные для текущего раздела
    sections[currentSection].unread = 0;
    updateUnreadBadges();
    
    // Переключаемся
    currentSection = sectionId;
    updateChatTitle();
    updateUserPermissions();
    displayCurrentSectionMessages();
    toggleSidebar();
    
    console.log(`✅ Переключен раздел: ${sectionId}`);
}

// ===== СООБЩЕНИЯ =====
function displayCurrentSectionMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Проверяем есть ли сообщения в этом разделе
    if (!window.chatData || !window.chatData[currentSection] || window.chatData[currentSection].length === 0) {
        // Создаем приветственное сообщение
        const welcomeMessage = {
            id: ++lastMessageId,
            user_id: 'system',
            user: { first_name: 'Система', user_id: 'system' },
            message_type: 'text',
            content: `👋 Добро пожаловать в раздел "${sections[currentSection].name}"!`,
            timestamp: Date.now(),
            section: currentSection,
            read: true
        };
        
        if (!window.chatData) window.chatData = {};
        if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
        window.chatData[currentSection].push(welcomeMessage);
        saveMessagesToStorage();
    }
    
    // Отображаем сообщения
    const messages = window.chatData[currentSection] || [];
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
    
    scrollToBottom();
}

function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const isSystem = message.user_id === 'system';
    const div = document.createElement('div');
    
    if (isSystem) {
        div.className = 'message system';
        div.innerHTML = `
            <div class="message-content">
                <div class="message-system">
                    <i class="fas fa-info-circle"></i>
                    <span>${message.content}</span>
                    <div class="message-time">${new Date(message.timestamp).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
            </div>
        `;
    } else {
        div.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        const user = usersCache[message.user_id] || { 
            first_name: 'User', 
            user_id: message.user_id,
            username: 'user'
        };
        const userName = user.first_name || 'User';
        const userRole = user.role || userRoles[user.user_id] || 'user';
        const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
        
        let content = message.content || '';
        content = escapeHtml(content).replace(/\n/g, '<br>');
        
        // Обработка ссылок и упоминаний
        content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
        content = content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        
        div.innerHTML = `
            ${!isOutgoing ? `
                <div class="message-avatar" style="background-color: ${stringToColor(user.user_id)}">
                    ${userName.charAt(0).toUpperCase()}
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
                <div class="message-text">${content}</div>
                ${isOutgoing ? `
                    <div class="message-status">
                        <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                        <div class="message-time">${time}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    return div;
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    // Проверяем права
    const section = sections[currentSection];
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = section.write === 'all' ||
                    (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                    (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));
    
    if (!canWrite) {
        showNotification('У вас нет прав для отправки сообщений в этом разделе', 'error');
        return;
    }
    
    // Создаем сообщение
    const newMessage = {
        id: ++lastMessageId,
        user_id: currentUserId,
        user: {
            ...currentUser,
            role: userRole
        },
        message_type: 'text',
        content: text,
        timestamp: Date.now(),
        read: false,
        section: currentSection,
        reactions: {},
        edited: false
    };
    
    // Добавляем в хранилище
    if (!window.chatData) window.chatData = {};
    if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
    window.chatData[currentSection].push(newMessage);
    
    // Сохраняем
    saveMessagesToStorage();
    
    // Обновляем кэш пользователя
    if (usersCache[currentUserId]) {
        usersCache[currentUserId].message_count = (usersCache[currentUserId].message_count || 0) + 1;
    }
    
    // Отображаем сообщение
    const messageElement = createMessageElement(newMessage);
    const container = document.getElementById('messages-container');
    
    // Убираем пустое состояние если есть
    const emptyChat = container.querySelector('.empty-chat');
    if (emptyChat) {
        emptyChat.remove();
    }
    
    container.appendChild(messageElement);
    
    // Очищаем поле
    input.value = '';
    input.focus();
    
    // Прокручиваем вниз
    scrollToBottom();
    
    // Обновляем статистику пользователя
    updateUserInfo();
    
    // Увеличиваем счетчик непрочитанных для других пользователей
    Object.keys(usersCache).forEach(userId => {
        if (userId !== currentUserId && usersCache[userId].is_online) {
            sections[currentSection].unread++;
        }
    });
    
    updateUnreadBadges();
    
    showNotification('Сообщение отправлено', 'success');
}

// ===== ПОЛЬЗОВАТЕЛИ =====
function loadUsers() {
    // Добавляем текущего пользователя
    if (!usersCache[currentUserId]) {
        usersCache[currentUserId] = {
            ...currentUser,
            is_online: true,
            message_count: 0,
            role: userRoles[currentUserId] || 'user',
            last_seen: Date.now(),
            join_date: Date.now()
        };
        saveUsers();
    }
    
    updateUsersList();
}

function updateUsersList() {
    const container = document.getElementById('users-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const allUsers = Object.values(usersCache);
    if (allUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-users"></i>
                <p>Нет пользователей</p>
                <small>Пригласите участников в чат</small>
            </div>`;
        return;
    }
    
    const onlineUsers = allUsers.filter(u => u.is_online);
    const offlineUsers = allUsers.filter(u => !u.is_online);
    
    // Онлайн пользователи
    if (onlineUsers.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header-title';
        header.innerHTML = `<i class="fas fa-circle online-dot"></i> Онлайн (${onlineUsers.length})`;
        container.appendChild(header);
        
        onlineUsers.forEach(user => {
            container.appendChild(createUserElement(user));
        });
    }
    
    // Оффлайн пользователи
    if (offlineUsers.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header-title';
        header.innerHTML = `<i class="fas fa-moon"></i> Оффлайн (${offlineUsers.length})`;
        container.appendChild(header);
        
        offlineUsers.forEach(user => {
            container.appendChild(createUserElement(user));
        });
    }
}

function createUserElement(user) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.onclick = () => showUserProfile(user.user_id);
    
    const userName = (user.first_name || '') + (user.last_name ? ' ' + user.last_name : '');
    const userRole = user.role || 'user';
    
    div.innerHTML = `
        <div class="user-item-avatar" style="background-color: ${stringToColor(user.user_id)}">
            ${userName.charAt(0).toUpperCase()}
        </div>
        <div class="user-item-info">
            <div class="user-item-name">
                ${userName}
                ${userRole !== 'user' ? `<span class="user-role-badge ${userRole}">${getRoleText(userRole)}</span>` : ''}
            </div>
            <div class="user-item-status ${user.is_online ? 'online' : ''}">
                ${user.is_online ? 'онлайн' : `сообщений: ${user.message_count || 0}`}
            </div>
        </div>
        ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
    `;
    
    return div;
}

function showUserProfile(userId) {
    const user = usersCache[userId];
    if (!user) return;
    
    const userRole = user.role || 'user';
    const roleText = getRoleText(userRole);
    const lastSeen = user.last_seen ? new Date(user.last_seen).toLocaleString('ru-RU') : 'неизвестно';
    const joinDate = user.join_date ? new Date(user.join_date).toLocaleDateString('ru-RU') : 'недавно';
    
    showNotification(`
👤 Имя: ${user.first_name || ''} ${user.last_name || ''}
📛 Username: ${user.username || 'нет'}
🎭 Роль: ${roleText}
🆔 ID: ${user.user_id}
📊 Сообщений: ${user.message_count || 0}
📅 В чате с: ${joinDate}
${user.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}
    `.trim(), 'info');
}

function searchUsers(query) {
    const container = document.getElementById('users-list');
    if (!container) return;
    
    const allUsers = Object.values(usersCache);
    const filteredUsers = allUsers.filter(user => {
        const name = (user.first_name || '') + (user.last_name || '');
        const username = user.username || '';
        const role = user.role || '';
        
        return name.toLowerCase().includes(query.toLowerCase()) ||
               username.toLowerCase().includes(query.toLowerCase()) ||
               role.toLowerCase().includes(query.toLowerCase());
    });
    
    if (filteredUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-search"></i>
                <p>Пользователи не найдены</p>
                <small>Попробуйте другой запрос</small>
            </div>`;
        return;
    }
    
    container.innerHTML = '';
    filteredUsers.forEach(user => {
        container.appendChild(createUserElement(user));
    });
}

// ===== АДМИН ПАНЕЛЬ =====
function loadAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    const users = Object.values(usersCache);
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-users"></i>
                <p>Нет пользователей</p>
                <small>Пригласите участников в чат</small>
            </div>`;
        return;
    }

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
                        ${user.first_name || ''} ${user.last_name || ''}
                        <span class="user-role-badge ${userRole}">${getRoleText(userRole)}</span>
                    </div>
                    <div class="admin-user-id">ID: ${user.user_id}</div>
                    <div class="admin-user-status ${user.is_online ? '' : 'offline'}">
                        ${user.is_online ? 'онлайн' : 'оффлайн'}
                    </div>
                </div>
            </div>
            <div class="admin-user-actions">
                ${canChangeRole ? `
                    <select class="permission-select" onchange="changeUserRole('${user.user_id}', this.value)" value="${userRole}">
                        <option value="user" ${userRole === 'user' ? 'selected' : ''}>Участник</option>
                        <option value="moderator" ${userRole === 'moderator' ? 'selected' : ''}>Модератор</option>
                        <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Админ</option>
                        ${isMainAdmin ? '<option value="main_admin" ' + (userRole === 'main_admin' ? 'selected' : '') + '>Глав. Админ</option>' : ''}
                    </select>
                ` : ''}
                ${isMainAdmin && user.user_id !== currentUserId ? `
                    <button class="btn-admin-action danger" onclick="kickUser('${user.user_id}')" style="margin-left: 5px;">
                        <i class="fas fa-ban"></i>
                    </button>
                ` : ''}
            </div>`;
        container.appendChild(userElement);
    });
}

function changeUserRole(userId, newRole) {
    if (!isMainAdmin) {
        showNotification('Только главный админ может изменять роли', 'error');
        return;
    }
    
    if (userId === currentUserId && newRole !== 'main_admin') {
        showNotification('Вы не можете понизить свою роль', 'error');
        return;
    }
    
    userRoles[userId] = newRole;
    
    // Обновляем в кэше пользователей
    if (usersCache[userId]) {
        usersCache[userId].role = newRole;
        saveUsers();
    }
    
    saveRoles();
    loadAdminUsersList();
    
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
    
    if (confirm(`Исключить ${user.first_name} из чата?`)) {
        // Удаляем из кэша
        delete usersCache[userId];
        
        // Удаляем роль
        delete userRoles[userId];
        
        // Сохраняем изменения
        saveRoles();
        saveUsers();
        
        // Обновляем UI
        loadAdminUsersList();
        updateOnlineUsers();
        updateUsersList();
        
        showNotification('Пользователь исключен', 'success');
    }
}

function loadInvitesList() {
    const container = document.getElementById('invites-list');
    if (!container) return;

    container.innerHTML = '';
    
    if (pendingInvites.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-envelope"></i>
                <p>Нет активных приглашений</p>
                <small>Создайте первое приглашение</small>
            </div>`;
        return;
    }

    pendingInvites.forEach((invite, index) => {
        const inviteElement = document.createElement('div');
        inviteElement.className = 'invite-item';
        
        const expiresDate = new Date(invite.expires_at).toLocaleDateString('ru-RU');
        const expiresTime = new Date(invite.expires_at).toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        inviteElement.innerHTML = `
            <div>
                <div class="invite-code">${invite.code}</div>
                <div class="invite-stats">
                    Использовано: ${invite.uses || 0}/${invite.max_uses} • 
                    Истекает: ${expiresDate} ${expiresTime}
                </div>
            </div>
            <div>
                <button class="btn-copy-invite" onclick="copyInviteLink('${invite.code}')">
                    Копировать
                </button>
                <button class="btn-admin-action danger" onclick="deleteInvite(${index})" style="margin-left: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
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
    loadInvitesList();

    showNotification(`Приглашение создано: ${inviteCode}`, 'success');
}

function deleteInvite(index) {
    if (confirm('Удалить это приглашение?')) {
        pendingInvites.splice(index, 1);
        saveInvites();
        loadInvitesList();
        showNotification('Приглашение удалено', 'success');
    }
}

function copyInviteLink(code) {
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Код скопирован', 'success');
    }).catch(err => {
        console.error('Ошибка при копировании:', err);
        showNotification('Не удалось скопировать', 'error');
    });
}

function updateSectionPermission(sectionId, type, value) {
    if (!isAdmin) {
        showNotification('Только админы могут изменять права доступа', 'error');
        return;
    }
    
    sections[sectionId][type] = value;
    showNotification('Права доступа обновлены', 'success');
    
    if (sectionId === currentSection) {
        updateUserPermissions();
    }
}

function clearChatHistory() {
    if (!isAdmin) {
        showNotification('Только админы могут очищать историю', 'error');
        return;
    }
    
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
    if (!isAdmin) {
        showNotification('Только админы могут экспортировать данные', 'error');
        return;
    }
    
    const dataStr = JSON.stringify(window.chatData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `chat_data_${currentSection}_${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('Данные экспортированы', 'success');
}

function createBackup() {
    if (!isAdmin) {
        showNotification('Только админы могут создавать резервные копии', 'error');
        return;
    }
    
    const backupData = {
        messages: window.chatData,
        roles: userRoles,
        invites: pendingInvites,
        users: usersCache,
        lastMessageId: lastMessageId,
        sections: sections,
        backupDate: new Date().toISOString()
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

// ===== ОБЩИЕ ФУНКЦИИ =====
function updateUserInfo() {
    if (!currentUser) return;
    
    const userName = (currentUser.first_name || '') + (currentUser.last_name ? ' ' + currentUser.last_name : '');
    const username = currentUser.username ? '@' + currentUser.username : 'без username';
    const userRole = userRoles[currentUserId] || 'user';
    const roleText = getRoleText(userRole);

    // Обновляем информацию
    const elements = {
        'user-name': userName,
        'user-role': roleText,
        'profile-name': userName,
        'profile-username': username,
        'profile-id': currentUser.id,
        'profile-role': roleText,
        'profile-status': 'онлайн'
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    // Обновляем статистику сообщений
    let totalMessages = 0;
    Object.keys(sections).forEach(sectionId => {
        if (window.chatData && window.chatData[sectionId]) {
            totalMessages += window.chatData[sectionId]
                .filter(m => m.user_id === currentUserId).length;
        }
    });
    
    const messageCountElement = document.getElementById('profile-messages');
    if (messageCountElement) {
        messageCountElement.textContent = totalMessages;
    }
}

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
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
}

function showNotification(message, type = 'info') {
    console.log(`${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'} ${message}`);
    
    if (tg && tg.showAlert) {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}

function mentionAll() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online && u.user_id !== currentUserId);
    
    if (onlineUsers.length === 0) {
        showNotification('Нет других пользователей онлайн', 'info');
        return;
    }
    
    const mentions = onlineUsers.map(u => `@${u.username || u.first_name}`).join(', ');
    const input = document.getElementById('message-input');
    input.value += `Внимание ${mentions}! `;
    input.focus();
    
    showNotification(`Упомянуто ${onlineUsers.length} пользователей`, 'success');
}

function jumpToUnread() {
    const container = document.getElementById('messages-container');
    if (container) {
        const unreadMessages = container.querySelectorAll('.message.unread');
        if (unreadMessages.length === 0) {
            showNotification('Нет непрочитанных сообщений', 'info');
            return;
        }
        
        unreadMessages[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Помечаем как прочитанные
        if (window.chatData && window.chatData[currentSection]) {
            const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
            if (lastMessage) {
                localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
            }
        }
        
        // Обновляем бейджи
        sections[currentSection].unread = 0;
        updateUnreadBadges();
    }
}

// ===== ФАЙЛЫ И ВЛОЖЕНИЯ =====
function toggleAttachMenu() {
    document.getElementById('attach-menu').classList.toggle('active');
}

function attachFile(type) {
    toggleAttachMenu();
    
    switch(type) {
        case 'photo':
            simulateFileUpload('photo', 'photo.jpg', '2.1 MB');
            break;
        case 'document':
            simulateFileUpload('document', 'document.pdf', '1.5 MB');
            break;
        case 'sticker':
            showNotification('Стикеры в разработке', 'info');
            break;
        case 'voice':
            showNotification('Голосовые в разработке', 'info');
            break;
    }
}

function simulateFileUpload(type, fileName, fileSize) {
    const progressBar = document.getElementById('progress-bar-fill');
    const uploadProgress = document.getElementById('upload-progress');
    
    uploadProgress.classList.add('active');
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            
            setTimeout(() => {
                uploadProgress.classList.remove('active');
                
                // Показываем превью
                document.getElementById('file-preview-name').textContent = fileName;
                document.getElementById('file-preview-size').textContent = fileSize;
                document.getElementById('file-preview-icon').className = 
                    type === 'photo' ? 'fas fa-image file-preview-icon' : 'fas fa-file file-preview-icon';
                document.getElementById('file-preview').classList.add('active');
                
                window.currentFile = { type, name: fileName, size: fileSize };
            }, 500);
        }
    }, 100);
}

function sendFile() {
    if (!window.currentFile) return;
    
    const file = window.currentFile;
    const newMessage = {
        id: ++lastMessageId,
        user_id: currentUserId,
        user: {
            ...currentUser,
            role: userRoles[currentUserId] || 'user'
        },
        message_type: file.type,
        content: file.type === 'photo' ? 'Фото' : 'Документ',
        timestamp: Date.now(),
        read: false,
        section: currentSection,
        file_name: file.name,
        file_size: file.size
    };
    
    if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
    window.chatData[currentSection].push(newMessage);
    
    saveMessagesToStorage();
    
    // Скрываем превью
    document.getElementById('file-preview').classList.remove('active');
    delete window.currentFile;
    
    // Обновляем чат
    displayCurrentSectionMessages();
    
    showNotification('Файл отправлен', 'success');
}

function cancelFile() {
    document.getElementById('file-preview').classList.remove('active');
    delete window.currentFile;
}

// ===== ЭМОДЗИ =====
function toggleEmojiPicker() {
    document.getElementById('emoji-picker').classList.toggle('active');
}

const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖'],
    nature: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈'],
    food: ['🍕', '🍔', '🍟', '🌭', '🍿', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞', '🥐', '🥨', '🥯', '🥖']
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
    toggleEmojiPicker();
}

// ===== ТЕМЫ И НАСТРОЙКИ =====
function loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    const isDark = theme === 'dark';
    
    document.getElementById('theme-toggle').checked = isDark;
    document.body.classList.toggle('dark-theme', isDark);
    
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
}

function toggleTheme() {
    const isDark = document.getElementById('theme-toggle').checked;
    document.body.classList.toggle('dark-theme', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    showNotification(isDark ? 'Темная тема включена' : 'Светлая тема включена');
}

function toggleThemeManual() {
    const toggle = document.getElementById('theme-toggle');
    toggle.checked = !toggle.checked;
    toggleTheme();
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function setupEventListeners() {
    // Закрытие всплывающих окон при клике вне
    document.addEventListener('click', function(e) {
        const attachMenu = document.getElementById('attach-menu');
        if (attachMenu && attachMenu.classList.contains('active') && 
            !e.target.closest('.attach-menu') && !e.target.closest('.btn-attach')) {
            attachMenu.classList.remove('active');
        }
        
        const emojiPicker = document.getElementById('emoji-picker');
        if (emojiPicker && emojiPicker.classList.contains('active') && 
            !e.target.closest('.emoji-picker') && !e.target.closest('.btn-emoji')) {
            emojiPicker.classList.remove('active');
        }
    });
}

// ===== ФОНОВЫЕ ПРОЦЕССЫ =====
function startPolling() {
    // Обновляем онлайн статус каждые 30 секунд
    setInterval(() => {
        updateOnlineStatus();
    }, 30000);
}

function updateOnlineStatus() {
    // Обновляем статус текущего пользователя
    if (usersCache[currentUserId]) {
        usersCache[currentUserId].is_online = true;
        usersCache[currentUserId].last_seen = Date.now();
    }
    
    // Помечаем других пользователей как оффлайн если они долго не активны
    Object.keys(usersCache).forEach(userId => {
        if (userId !== currentUserId && usersCache[userId]) {
            const lastSeen = usersCache[userId].last_seen || 0;
            const inactiveTime = Date.now() - lastSeen;
            usersCache[userId].is_online = inactiveTime < 60000; // 1 минута
        }
    });
    
    updateOnlineUsers();
    saveUsers();
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
window.toggleSidebar = toggleSidebar;
window.switchSection = switchSection;
window.sendMessage = sendMessage;
window.toggleAttachMenu = toggleAttachMenu;
window.attachFile = attachFile;
window.toggleEmojiPicker = toggleEmojiPicker;
window.showEmojiCategory = showEmojiCategory;
window.insertEmoji = insertEmoji;
window.mentionAll = mentionAll;
window.jumpToUnread = jumpToUnread;
window.showUserProfile = showUserProfile;
window.searchUsers = searchUsers;
window.changeUserRole = changeUserRole;
window.kickUser = kickUser;
window.createInvite = createInvite;
window.copyInviteLink = copyInviteLink;
window.deleteInvite = deleteInvite;
window.updateSectionPermission = updateSectionPermission;
window.clearChatHistory = clearChatHistory;
window.exportChatData = exportChatData;
window.createBackup = createBackup;
window.sendFile = sendFile;
window.cancelFile = cancelFile;
window.toggleTheme = toggleTheme;
window.toggleThemeManual = toggleThemeManual;
window.loadTheme = loadTheme;
window.initApp = initApp;

// Базовые функции навигации
window.showChat = function() {
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(container => container.classList.remove('active'));
    document.getElementById('chat-view').classList.add('active');
    updateMenuActive(0);
};

window.showUsersList = function() {
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(container => container.classList.remove('active'));
    document.getElementById('users-view').classList.add('active');
    loadUsers();
    updateMenuActive(1);
};

window.showAdminPanel = function() {
    if (!isAdmin) {
        showNotification('У вас нет прав доступа', 'error');
        return;
    }
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(container => container.classList.remove('active'));
    document.getElementById('admin-view').classList.add('active');
    loadAdminUsersList();
    loadInvitesList();
    updateMenuActive(2);
};

window.showSettings = function() {
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(container => container.classList.remove('active'));
    document.getElementById('settings-view').classList.add('active');
    loadTheme();
    updateMenuActive(3);
};

window.showProfile = function() {
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(container => container.classList.remove('active'));
    document.getElementById('profile-view').classList.add('active');
    updateUserInfo();
    updateMenuActive(4);
};

// Вспомогательная функция для обновления активного меню
function updateMenuActive(index) {
    document.querySelectorAll('.menu-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
}

console.log('📦 Telegram Chat WebApp загружен!');
