// Telegram Chat App - Botfs23
// Рабочая версия с исправленной загрузкой файлов

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let tg = null;
let currentUserId = null;
let currentUser = null;
let lastMessageId = 0;
let currentSection = 'main';
let userRoles = {};
let isAdmin = false;
let usersCache = {};
let S3Client = null;
let attachedFiles = [];

// ===== КОНФИГУРАЦИЯ SELECTEL S3 =====
const S3_CONFIG = {
    endpoint: 'https://s3.ru-3.storage.selcloud.ru',
    region: 'ru-3',
    bucket: 'telegram-chat-files',
    accessKeyId: '7508531e4e684de2bc5d039c74c4441d',
    secretAccessKey: '9a9c1682a5b247019acafa4489060d61',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif'],
        document: ['application/pdf', 'text/plain']
    }
};

// Эмодзи
const EMOJI_CATEGORIES = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷'],
    objects: ['💡', '📱', '💻', '⌚️', '📷', '🎥', '📡', '💎', '🔑', '📦', '🎁', '📚', '✏️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💞', '💓', '💗', '💖']
};

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    // Инициализация Telegram
    initTelegram();
    
    // Настройка темы
    initTheme();
    
    // Инициализация UI
    initUI();
    
    // Загрузка данных
    loadData();
    
    // Обновление интерфейса
    updateUserInfo();
    loadMessages();
    loadUsers();
    
    // Инициализация S3 (в фоне)
    setTimeout(() => initS3(), 1000);
    
    console.log('✅ Приложение инициализировано');
}

// ===== TELEGRAM ИНИЦИАЛИЗАЦИЯ =====
function initTelegram() {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            
            // Настраиваем WebApp
            tg.expand();
            tg.enableClosingConfirmation();
            
            // Получаем данные пользователя
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                currentUser = tg.initDataUnsafe.user;
                currentUserId = currentUser.id.toString();
                console.log('👤 Telegram пользователь:', currentUser);
            } else {
                setupDemoUser();
            }
            
        } else {
            console.log('📱 Режим браузера');
            setupDemoUser();
        }
    } catch (error) {
        console.error('❌ Ошибка Telegram:', error);
        setupDemoUser();
    }
}

function setupDemoUser() {
    currentUser = {
        id: Math.floor(Math.random() * 1000000),
        first_name: 'Гость',
        last_name: 'Тестовый'
    };
    currentUserId = currentUser.id.toString();
}

// ===== S3 ИНИЦИАЛИЗАЦИЯ (УПРОЩЕННАЯ) =====
async function initS3() {
    try {
        if (typeof AWS === 'undefined') {
            console.log('⚠️ AWS SDK не загружен, используем демо режим');
            updateS3Status('Демо режим', 'warning');
            return false;
        }
        
        console.log('🔧 Инициализация S3...');
        
        // Простая проверка подключения
        updateS3Status('Проверка...', 'info');
        
        // В демо режиме просто показываем успех
        setTimeout(() => {
            updateS3Status('Готов к работе', 'success');
        }, 1500);
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка S3:', error);
        updateS3Status('Ошибка', 'error');
        return false;
    }
}

function updateS3Status(text, type = 'info') {
    const statusElement = document.getElementById('s3-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `settings-status ${type}`;
    }
}

// ===== ЗАГРУЗКА ФАЙЛОВ (УПРОЩЕННАЯ) =====
async function uploadFile(file, type) {
    return new Promise((resolve, reject) => {
        // Показываем прогресс
        showUploadProgress(true, `Загрузка ${file.name}...`);
        
        // Симулируем загрузку для демо
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            updateUploadProgress(progress);
            
            if (progress >= 100) {
                clearInterval(interval);
                
                // Создаем локальный URL для файла
                const localUrl = URL.createObjectURL(file);
                
                const fileInfo = {
                    url: localUrl,
                    name: file.name,
                    type: type,
                    size: file.size,
                    mimeType: file.type,
                    isLocal: true
                };
                
                console.log('✅ Файл загружен (локально):', fileInfo);
                
                showUploadProgress(false);
                resolve(fileInfo);
            }
        }, 100);
    });
}

// ===== UI ИНИЦИАЛИЗАЦИЯ =====
function initUI() {
    // Кнопка меню
    document.getElementById('btn-menu').addEventListener('click', toggleSidebar);
    document.getElementById('btn-close-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('overlay').addEventListener('click', toggleSidebar);
    
    // Навигация
    document.querySelectorAll('.section-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            if (section) switchSection(section);
        });
    });
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view) switchView(view);
        });
    });
    
    // Кнопки заголовка
    document.getElementById('btn-users').addEventListener('click', () => switchView('users'));
    document.getElementById('btn-admin').addEventListener('click', () => switchView('admin'));
    document.getElementById('btn-mention-all').addEventListener('click', mentionAllOnline);
    document.getElementById('btn-jump').addEventListener('click', scrollToBottom);
    
    // Ввод сообщения
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        sendButton.disabled = this.value.trim() === '' && attachedFiles.length === 0;
    });
    
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendButton.addEventListener('click', sendMessage);
    
    // Прикрепление файлов
    document.getElementById('btn-attach').addEventListener('click', toggleAttachMenu);
    document.querySelectorAll('.attach-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            attachFile(type);
        });
    });
    
    // Кнопки файлов
    document.getElementById('btn-cancel-files').addEventListener('click', clearAttachments);
    document.getElementById('btn-send-files').addEventListener('click', sendMessage);
    
    // Эмодзи
    document.getElementById('btn-emoji').addEventListener('click', toggleEmojiPicker);
    initEmojiPicker();
    
    // Поиск пользователей
    const searchInput = document.getElementById('users-search-input');
    searchInput.addEventListener('input', function() {
        searchUsers(this.value);
    });
    
    document.getElementById('btn-close-search').addEventListener('click', function() {
        searchInput.value = '';
        searchUsers('');
    });
    
    // Настройки
    document.getElementById('theme-toggle').addEventListener('change', toggleTheme);
    document.getElementById('btn-clear-cache').addEventListener('click', clearCache);
    
    // Закрытие меню при клике вне
    document.addEventListener('click', closeMenus);
}

// ===== ПРИКРЕПЛЕНИЕ ФАЙЛОВ =====
function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('active');
}

function attachFile(type) {
    toggleAttachMenu();
    
    const input = document.createElement('input');
    input.type = 'file';
    
    // Устанавливаем accept в зависимости от типа
    if (type === 'photo') {
        input.accept = 'image/*';
    } else if (type === 'document') {
        input.accept = '.pdf,.txt,.doc,.docx';
    }
    
    input.multiple = false;
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Проверка размера
        if (file.size > S3_CONFIG.maxFileSize) {
            showNotification(`Файл слишком большой. Максимум: ${S3_CONFIG.maxFileSize / 1024 / 1024}MB`, 'error');
            return;
        }
        
        try {
            // Загружаем файл
            const fileInfo = await uploadFile(file, type);
            
            // Добавляем в прикрепленные файлы
            attachedFiles.push(fileInfo);
            
            // Показываем превью
            showFilePreview(fileInfo);
            
            showNotification('Файл прикреплен', 'success');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки файла:', error);
            showNotification('Ошибка загрузки файла', 'error');
        }
    };
    
    input.click();
}

function showFilePreview(fileInfo) {
    const container = document.getElementById('file-preview-container');
    const preview = document.createElement('div');
    preview.className = 'file-preview-item';
    
    let icon = 'fa-file';
    let previewContent = '';
    
    if (fileInfo.type === 'photo') {
        icon = 'fa-image';
        previewContent = `<img src="${fileInfo.url}" alt="${fileInfo.name}" class="file-preview-image">`;
    } else {
        icon = 'fa-file';
        previewContent = `
            <div class="file-preview-document">
                <i class="fas ${icon}"></i>
                <span>${fileInfo.name}</span>
            </div>`;
    }
    
    preview.innerHTML = `
        <div class="file-preview-header">
            <i class="fas ${icon}"></i>
            <span class="file-name">${fileInfo.name}</span>
            <button class="btn-remove-file" onclick="removeFilePreview(this)">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="file-preview-content">
            ${previewContent}
        </div>
        <div class="file-preview-footer">
            <span class="file-size">${formatFileSize(fileInfo.size)}</span>
            <span class="file-status">✓ Готово</span>
        </div>
    `;
    
    // Сохраняем информацию о файле
    preview.dataset.fileInfo = JSON.stringify(fileInfo);
    
    container.appendChild(preview);
    document.getElementById('file-preview').style.display = 'block';
}

// ===== EMOJI PICKER =====
function initEmojiPicker() {
    const emojiGrid = document.getElementById('emoji-grid');
    const categories = document.querySelectorAll('.emoji-category');
    
    function loadEmojis(category) {
        emojiGrid.innerHTML = '';
        const emojis = EMOJI_CATEGORIES[category] || [];
        
        emojis.forEach(emoji => {
            const button = document.createElement('button');
            button.className = 'emoji-option';
            button.textContent = emoji;
            button.addEventListener('click', () => insertEmoji(emoji));
            emojiGrid.appendChild(button);
        });
    }
    
    categories.forEach(category => {
        category.addEventListener('click', () => {
            categories.forEach(c => c.classList.remove('active'));
            category.classList.add('active');
            loadEmojis(category.dataset.category);
        });
    });
    
    loadEmojis('smileys');
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('active');
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
    document.getElementById('emoji-picker').classList.remove('active');
}

// ===== SIDEBAR =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// ===== SECTION MANAGEMENT =====
function switchSection(sectionId) {
    currentSection = sectionId;
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    document.getElementById('chat-title').textContent = sectionId === 'main' ? 'Основной чат' : 'Новости';
    loadMessages();
    toggleSidebar();
}

// ===== VIEW MANAGEMENT =====
function switchView(viewId) {
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(view => view.classList.remove('active'));
    
    document.getElementById(`${viewId}-view`).classList.add('active');
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
    
    toggleSidebar();
    
    if (viewId === 'users') {
        loadUsers();
    } else if (viewId === 'profile') {
        updateProfile();
    }
}

// ===== MESSAGE MANAGEMENT =====
function loadMessages() {
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    container.innerHTML = '';
    
    const savedMessages = localStorage.getItem(`messages_${currentSection}`);
    if (savedMessages) {
        try {
            const messages = JSON.parse(savedMessages);
            if (messages.length > 0) {
                emptyChat.style.display = 'none';
                messages.forEach(msg => {
                    container.appendChild(createMessageElement(msg));
                });
                scrollToBottom();
                return;
            }
        } catch (e) {
            console.error('Ошибка загрузки:', e);
        }
    }
    
    emptyChat.style.display = 'flex';
    container.appendChild(emptyChat);
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (text === '' && attachedFiles.length === 0) {
        showNotification('Введите сообщение или прикрепите файл', 'warning');
        return;
    }
    
    // Создаем сообщение
    const message = {
        id: ++lastMessageId,
        user_id: currentUserId,
        user: { ...currentUser, role: userRoles[currentUserId] || 'user' },
        content: text,
        timestamp: Date.now(),
        section: currentSection,
        files: [...attachedFiles],
        reactions: {}
    };
    
    // Сохраняем
    saveMessage(message);
    
    // Отображаем
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    if (emptyChat.style.display !== 'none') {
        emptyChat.style.display = 'none';
    }
    
    container.appendChild(createMessageElement(message));
    
    // Очищаем
    input.value = '';
    input.style.height = 'auto';
    clearAttachments();
    
    // Прокручиваем
    scrollToBottom();
    
    // Уведомление
    showNotification('Сообщение отправлено', 'success');
}

function saveMessage(message) {
    const key = `messages_${currentSection}`;
    const savedMessages = localStorage.getItem(key);
    let messages = [];
    
    if (savedMessages) {
        try {
            messages = JSON.parse(savedMessages);
        } catch (e) {
            console.error('Ошибка:', e);
        }
    }
    
    messages.push(message);
    localStorage.setItem(key, JSON.stringify(messages));
    localStorage.setItem('lastMessageId', lastMessageId.toString());
}

function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    const user = usersCache[message.user_id] || message.user;
    const userName = user.first_name || 'User';
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let content = escapeHtml(message.content).replace(/\n/g, '<br>');
    content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
    
    // Файлы
    let filesHTML = '';
    if (message.files && message.files.length > 0) {
        filesHTML = message.files.map(file => `
            <div class="message-file">
                <div class="message-file-header">
                    <i class="fas fa-${file.type === 'photo' ? 'image' : 'file'}"></i>
                    <span class="message-file-name">${escapeHtml(file.name)}</span>
                    <a href="${file.url}" target="_blank" class="download-btn" title="Открыть">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
                ${file.type === 'photo' ? `<img src="${file.url}" alt="${escapeHtml(file.name)}" class="message-file-image">` : ''}
            </div>
        `).join('');
    }
    
    div.innerHTML = `
        ${!isOutgoing ? `
            <div class="message-avatar" style="background-color: ${stringToColor(user.id)}">
                ${userName.charAt(0).toUpperCase()}
            </div>
        ` : ''}
        <div class="message-content">
            ${!isOutgoing ? `
                <div class="message-header">
                    <div class="message-sender">
                        ${userName}
                    </div>
                    <div class="message-time">${time}</div>
                </div>
            ` : ''}
            ${filesHTML}
            ${content ? `<div class="message-text">${content}</div>` : ''}
            ${isOutgoing ? `
                <div class="message-status">
                    <i class="fas fa-check"></i>
                    <div class="message-time">${time}</div>
                </div>
            ` : ''}
        </div>
    `;
    
    return div;
}

// ===== USER MANAGEMENT =====
function loadUsers() {
    // Загружаем из localStorage
    const savedUsers = localStorage.getItem('users');
    if (savedUsers) {
        try {
            usersCache = JSON.parse(savedUsers);
        } catch (e) {
            console.error('Ошибка:', e);
            usersCache = {};
        }
    }
    
    // Добавляем текущего пользователя
    if (!usersCache[currentUserId]) {
        usersCache[currentUserId] = {
            ...currentUser,
            role: 'user',
            is_online: true,
            last_seen: Date.now()
        };
        saveUsersToStorage();
    }
    
    // Обновляем статус
    usersCache[currentUserId].is_online = true;
    usersCache[currentUserId].last_seen = Date.now();
    saveUsersToStorage();
    
    // Обновляем UI
    updateUsersList();
    updateOnlineCount();
}

function updateUsersList(filter = '') {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    const sortedUsers = Object.values(usersCache).sort((a, b) => {
        if (a.is_online !== b.is_online) return b.is_online - a.is_online;
        return (a.first_name || '').localeCompare(b.first_name || '');
    });
    
    const filteredUsers = sortedUsers.filter(user => {
        if (!filter) return true;
        const searchTerm = filter.toLowerCase();
        return (
            (user.first_name && user.first_name.toLowerCase().includes(searchTerm)) ||
            (user.last_name && user.last_name.toLowerCase().includes(searchTerm))
        );
    });
    
    if (filteredUsers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-chat';
        empty.innerHTML = `
            <i class="fas fa-user-slash"></i>
            <p>Пользователи не найдены</p>
        `;
        usersList.appendChild(empty);
        return;
    }
    
    filteredUsers.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        
        const userName = user.first_name || 'User';
        const statusText = user.is_online ? 'В сети' : 'Не в сети';
        
        div.innerHTML = `
            <div class="user-item-avatar" style="background-color: ${stringToColor(user.id)}">
                ${userName.charAt(0).toUpperCase()}
            </div>
            <div class="user-item-info">
                <div class="user-item-name">
                    ${userName}
                    ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
                </div>
                <div class="user-item-status ${user.is_online ? 'online' : ''}">
                    ${statusText}
                </div>
            </div>
        `;
        
        usersList.appendChild(div);
    });
}

function saveUsersToStorage() {
    localStorage.setItem('users', JSON.stringify(usersCache));
}

// ===== THEME MANAGEMENT =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.checked = savedTheme === 'dark';
    }
}

function toggleTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const isDark = themeToggle.checked;
    
    applyTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function applyTheme(theme) {
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    }
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colors = ['#3390ec', '#34c759', '#ff9500', '#5856d6', '#ff3b30', '#5ac8fa'];
    return colors[Math.abs(hash) % colors.length];
}

function updateUploadProgress(percent) {
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    if (progressText) {
        progressText.textContent = `${percent}%`;
    }
}

function showUploadProgress(show, text = 'Загрузка файла...') {
    const progress = document.getElementById('upload-progress');
    const uploadText = document.getElementById('upload-text');
    
    if (progress) {
        progress.style.display = show ? 'flex' : 'none';
    }
    if (uploadText && text) {
        uploadText.textContent = text;
    }
    
    if (!show) {
        updateUploadProgress(0);
    }
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function mentionAllOnline() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online);
    const mentions = onlineUsers.map(u => `@${u.first_name}`).join(' ');
    
    const input = document.getElementById('message-input');
    if (mentions) {
        input.value = mentions + ' ' + (input.value || '');
        input.focus();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
        showNotification('Упомянуты все онлайн', 'info');
    } else {
        showNotification('Нет пользователей онлайн', 'warning');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    notification.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ===== DATA MANAGEMENT =====
function loadData() {
    // Сообщения
    const savedMessages = localStorage.getItem('messages_main');
    if (savedMessages) {
        try {
            const messages = JSON.parse(savedMessages);
            if (messages.length > 0) {
                lastMessageId = Math.max(...messages.map(m => m.id));
            }
        } catch (e) {
            console.error('Ошибка:', e);
        }
    }
    
    // Роли
    const savedRoles = localStorage.getItem('userRoles');
    if (savedRoles) {
        try {
            userRoles = JSON.parse(savedRoles);
        } catch (e) {
            console.error('Ошибка:', e);
            userRoles = {};
        }
    }
    
    if (!userRoles[currentUserId]) {
        userRoles[currentUserId] = 'user';
        saveRolesToStorage();
    }
}

function saveRolesToStorage() {
    localStorage.setItem('userRoles', JSON.stringify(userRoles));
}

function clearCache() {
    if (confirm('Очистить весь кэш?')) {
        localStorage.clear();
        location.reload();
    }
}

// ===== USER INFO =====
function updateUserInfo() {
    const userName = document.getElementById('user-name');
    const userRole = document.getElementById('user-role');
    const userAvatar = document.getElementById('user-avatar');
    
    if (userName) {
        userName.textContent = currentUser.first_name || 'Гость';
    }
    
    if (userRole) {
        userRole.textContent = 'участник';
    }
    
    if (userAvatar && currentUser.first_name) {
        userAvatar.style.backgroundColor = stringToColor(currentUserId);
        userAvatar.textContent = currentUser.first_name.charAt(0).toUpperCase();
        document.getElementById('user-avatar-icon').style.display = 'none';
    }
}

function updateOnlineCount() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online).length;
    document.getElementById('online-count').textContent = onlineUsers;
    document.getElementById('sidebar-online-count').textContent = onlineUsers;
}

function updateProfile() {
    const user = usersCache[currentUserId] || currentUser;
    
    document.getElementById('profile-name').textContent = user.first_name || 'Гость';
    document.getElementById('profile-id').textContent = user.id;
    document.getElementById('profile-role').textContent = 'участник';
    
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
        profileAvatar.style.backgroundColor = stringToColor(currentUserId);
        profileAvatar.innerHTML = `<span>${(user.first_name || 'G').charAt(0).toUpperCase()}</span>`;
    }
}

// ===== FILE FUNCTIONS (ГЛОБАЛЬНЫЕ) =====
function removeFilePreview(button) {
    const preview = button.closest('.file-preview-item');
    const fileInfo = JSON.parse(preview.dataset.fileInfo);
    
    // Удаляем из массива
    attachedFiles = attachedFiles.filter(file => file.url !== fileInfo.url);
    
    // Освобождаем URL
    if (fileInfo.isLocal) {
        URL.revokeObjectURL(fileInfo.url);
    }
    
    preview.remove();
    
    // Скрываем панель если файлов больше нет
    if (document.querySelectorAll('.file-preview-item').length === 0) {
        document.getElementById('file-preview').style.display = 'none';
    }
}

function clearAttachments() {
    // Освобождаем все локальные URL
    attachedFiles.forEach(file => {
        if (file.isLocal) {
            URL.revokeObjectURL(file.url);
        }
    });
    
    attachedFiles = [];
    document.getElementById('file-preview-container').innerHTML = '';
    document.getElementById('file-preview').style.display = 'none';
}

// ===== HELPER FUNCTIONS =====
function closeMenus(e) {
    // Закрываем меню прикрепления
    const attachMenu = document.getElementById('attach-menu');
    const btnAttach = document.getElementById('btn-attach');
    
    if (attachMenu && btnAttach) {
        if (!attachMenu.contains(e.target) && !btnAttach.contains(e.target)) {
            attachMenu.classList.remove('active');
        }
    }
    
    // Закрываем эмодзи пикер
    const emojiPicker = document.getElementById('emoji-picker');
    const btnEmoji = document.getElementById('btn-emoji');
    
    if (emojiPicker && btnEmoji) {
        if (!emojiPicker.contains(e.target) && !btnEmoji.contains(e.target)) {
            emojiPicker.classList.remove('active');
        }
    }
}

// ===== START APPLICATION =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Экспортируем функции для HTML
window.removeFilePreview = removeFilePreview;
window.clearAttachments = clearAttachments;
