// Telegram Chat App - Botfs23
// Полная версия с отладкой S3 и общими данными

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let tg = null;
let currentUserId = null;
let currentUser = null;
let lastMessageId = 0;
let currentSection = 'main';
let userRoles = {};
let isAdmin = false;
let usersCache = {};
let attachedFiles = [];
let s3Status = 'Не проверено';

// ===== КОНФИГУРАЦИЯ SELECTEL S3 =====
const S3_CONFIG = {
    endpoint: 'https://s3.ru-3.storage.selcloud.ru',
    region: 'ru-3',
    bucket: 'telegram-chat-files',
    accessKeyId: '7508531e4e684de2bc5d039c74c4441d',
    secretAccessKey: '9a9c1682a5b247019acafa4489060d61',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        document: ['application/pdf', 'text/plain', 'application/msword', 
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    }
};

// Префикс для хранения данных
const STORAGE_PREFIX = 'telegram_chat_shared_v2_';

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
    console.log('👤 ID пользователя:', currentUserId);
    
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
    
    // Загружаем пользователей ДО сообщений
    await loadUsers();
    
    // Загружаем сообщения
    loadMessages();
    
    // Периодическая проверка новых сообщений и пользователей
    setInterval(checkForUpdates, 2000);
    
    // Проверка S3
    setTimeout(checkS3Connection, 1000);
    
    // Дебаг информация
    setTimeout(showDebugInfo, 2000);
    
    console.log('✅ Приложение инициализировано');
}

// ===== ОТЛАДОЧНАЯ ИНФОРМАЦИЯ =====
function showDebugInfo() {
    console.group('🔍 ДЕБАГ ИНФОРМАЦИЯ');
    console.log('👤 Текущий пользователь:', currentUser);
    console.log('🔑 Префикс хранилища:', STORAGE_PREFIX);
    
    // Проверяем сообщения
    const messagesKey = `${STORAGE_PREFIX}messages_${currentSection}`;
    const messages = localStorage.getItem(messagesKey);
    console.log(`💬 Сообщения в ${currentSection}:`, messages ? JSON.parse(messages).length : 0);
    
    // Проверяем пользователей
    const usersKey = `${STORAGE_PREFIX}users`;
    const users = localStorage.getItem(usersKey);
    console.log(`👥 Пользователей всего:`, users ? Object.keys(JSON.parse(users)).length : 0);
    
    // Проверяем файлы
    const filesKey = `${STORAGE_PREFIX}files`;
    const files = localStorage.getItem(filesKey);
    console.log(`📁 Файлов в хранилище:`, files ? JSON.parse(files).length : 0);
    
    console.groupEnd();
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
        last_name: 'Тестовый',
        username: 'guest_' + Math.floor(Math.random() * 1000)
    };
    currentUserId = currentUser.id.toString();
}

// ===== ПРОВЕРКА ПОДКЛЮЧЕНИЯ S3 =====
async function checkS3Connection() {
    console.log('🔌 Проверка подключения к Selectel S3...');
    updateS3Status('Проверка...', 'info');
    
    try {
        // Проверяем доступность endpoint
        const testUrl = S3_CONFIG.endpoint;
        
        // Создаем простой запрос для проверки CORS
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(testUrl, {
            method: 'HEAD',
            mode: 'cors',
            signal: controller.signal
        }).catch(e => {
            if (e.name === 'AbortError') {
                throw new Error('Таймаут подключения к S3');
            }
            throw e;
        });
        
        clearTimeout(timeoutId);
        
        if (response.status) {
            // Пробуем создать тестовый файл
            const testResult = await testS3Upload();
            
            if (testResult.success) {
                s3Status = 'Работает';
                updateS3Status('✅ S3 доступен', 'success');
                console.log('✅ S3 подключение успешно');
                return true;
            } else {
                s3Status = 'Ошибка загрузки';
                updateS3Status('⚠️ S3: Ошибка загрузки', 'warning');
                console.warn('⚠️ S3: Можно подключиться, но ошибка загрузки');
                return false;
            }
        }
        
    } catch (error) {
        s3Status = 'Нет подключения';
        updateS3Status('❌ Нет подключения к S3', 'error');
        console.error('❌ Ошибка подключения к S3:', error.message);
        return false;
    }
}

async function testS3Upload() {
    try {
        // Создаем тестовый текстовый файл
        const testContent = 'Test file for S3 connection check';
        const testFile = new Blob([testContent], { type: 'text/plain' });
        const testFileName = `test_connection_${Date.now()}.txt`;
        
        // Создаем FormData
        const formData = new FormData();
        formData.append('file', testFile, testFileName);
        
        // Пробуем загрузить через наш метод
        const fileInfo = await uploadFileToS3Direct(testFile, 'document', testFileName);
        
        return {
            success: true,
            url: fileInfo.url,
            message: 'Тестовый файл загружен'
        };
        
    } catch (error) {
        console.error('❌ Тестовая загрузка не удалась:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

function updateS3Status(text, type = 'info') {
    const statusElement = document.getElementById('s3-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `settings-status ${type}`;
    }
}

// ===== ХРАНЕНИЕ ПОЛЬЗОВАТЕЛЕЙ (ОБЩЕЕ ДЛЯ ВСЕХ) =====
async function loadUsers() {
    console.log('👥 Загрузка пользователей...');
    
    try {
        const usersKey = `${STORAGE_PREFIX}users`;
        const savedUsers = localStorage.getItem(usersKey);
        
        if (savedUsers) {
            usersCache = JSON.parse(savedUsers);
            console.log(`📊 Загружено ${Object.keys(usersCache).length} пользователей`);
        } else {
            usersCache = {};
            console.log('📭 Нет сохраненных пользователей');
        }
        
        // Добавляем/обновляем текущего пользователя
        if (!currentUser.id) {
            console.error('❌ Нет ID пользователя!');
            return;
        }
        
        const userId = currentUser.id.toString();
        
        usersCache[userId] = {
            ...currentUser,
            id: userId,
            role: userRoles[userId] || 'user',
            is_online: true,
            last_seen: Date.now(),
            last_active: new Date().toISOString(),
            device: navigator.userAgent.substring(0, 50),
            updated_at: Date.now()
        };
        
        // Убираем устаревших пользователей (неактивны более 5 минут)
        cleanupOldUsers();
        
        // Сохраняем обратно
        saveUsersToStorage();
        
        // Обновляем UI
        updateUsersList();
        updateOnlineCount();
        
        console.log(`✅ Пользователь ${currentUser.first_name} добавлен/обновлен`);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
    }
}

function cleanupOldUsers() {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const usersToRemove = [];
    
    Object.keys(usersCache).forEach(userId => {
        const user = usersCache[userId];
        if (userId !== currentUserId && user.last_seen) {
            const timeDiff = now - user.last_seen;
            if (timeDiff > fiveMinutes) {
                user.is_online = false;
                
                // Удаляем если неактивен более сутки
                if (timeDiff > 24 * 60 * 60 * 1000) {
                    usersToRemove.push(userId);
                }
            }
        }
    });
    
    // Удаляем старых пользователей
    usersToRemove.forEach(userId => {
        delete usersCache[userId];
    });
    
    if (usersToRemove.length > 0) {
        console.log(`🗑️ Удалено ${usersToRemove.length} неактивных пользователей`);
    }
}

function saveUsersToStorage() {
    try {
        const usersKey = `${STORAGE_PREFIX}users`;
        localStorage.setItem(usersKey, JSON.stringify(usersCache));
        
        // Также обновляем время последнего обновления
        localStorage.setItem(`${STORAGE_PREFIX}users_updated`, Date.now().toString());
        
    } catch (error) {
        console.error('❌ Ошибка сохранения пользователей:', error);
    }
}

function updateUsersList(filter = '') {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    // Обновляем статусы
    updateUserStatuses();
    
    const sortedUsers = Object.values(usersCache).sort((a, b) => {
        if (a.is_online !== b.is_online) return b.is_online - a.is_online;
        return (a.first_name || '').localeCompare(b.first_name || '');
    });
    
    const filteredUsers = sortedUsers.filter(user => {
        if (!filter) return true;
        const searchTerm = filter.toLowerCase();
        return (
            (user.first_name && user.first_name.toLowerCase().includes(searchTerm)) ||
            (user.last_name && user.last_name.toLowerCase().includes(searchTerm)) ||
            (user.username && user.username.toLowerCase().includes(searchTerm))
        );
    });
    
    usersList.innerHTML = '';
    
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
        div.dataset.userId = user.id;
        
        const userName = user.first_name || 'User';
        const lastSeen = user.last_seen ? 
            new Date(user.last_seen).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : '';
        
        let statusText = 'Не в сети';
        let statusClass = '';
        
        if (user.is_online) {
            statusText = 'В сети';
            statusClass = 'online';
        } else if (lastSeen) {
            statusText = `Был(а) в ${lastSeen}`;
        }
        
        div.innerHTML = `
            <div class="user-item-avatar" style="background-color: ${stringToColor(user.id)}">
                ${userName.charAt(0).toUpperCase()}
            </div>
            <div class="user-item-info">
                <div class="user-item-name">
                    ${userName}
                    ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
                    ${user.id === currentUserId ? '<span class="user-you">(Вы)</span>' : ''}
                </div>
                <div class="user-item-status ${statusClass}">
                    ${statusText}
                </div>
            </div>
        `;
        
        usersList.appendChild(div);
    });
}

function updateUserStatuses() {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    Object.keys(usersCache).forEach(userId => {
        const user = usersCache[userId];
        if (userId === currentUserId) {
            user.is_online = true;
            user.last_seen = now;
            user.last_active = new Date().toISOString();
        } else if (user.last_seen) {
            const timeDiff = now - user.last_seen;
            user.is_online = timeDiff < oneMinute;
        }
    });
}

function updateOnlineCount() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online).length;
    const totalUsers = Object.keys(usersCache).length;
    
    console.log(`📊 Онлайн: ${onlineUsers}/${totalUsers}`);
    
    document.getElementById('online-count').textContent = onlineUsers;
    document.getElementById('sidebar-online-count').textContent = `${onlineUsers}/${totalUsers}`;
}

// ===== ХРАНЕНИЕ СООБЩЕНИЙ =====
function saveMessage(message) {
    try {
        const key = `${STORAGE_PREFIX}messages_${currentSection}`;
        let messages = getAllMessages();
        
        // Проверяем дубликаты
        const existingIndex = messages.findIndex(m => m.id === message.id);
        if (existingIndex === -1) {
            messages.push(message);
        } else {
            messages[existingIndex] = message;
        }
        
        // Сортируем по времени
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Сохраняем
        localStorage.setItem(key, JSON.stringify(messages));
        
        // Обновляем последний ID
        const maxId = Math.max(...messages.map(m => m.id), 0);
        if (maxId > lastMessageId) {
            lastMessageId = maxId;
            localStorage.setItem(`${STORAGE_PREFIX}lastMessageId`, lastMessageId.toString());
        }
        
        console.log(`💾 Сообщение #${message.id} сохранено`);
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщения:', error);
        return false;
    }
}

function loadMessages() {
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    if (!container) return;
    
    const messages = getAllMessages();
    
    if (messages.length === 0) {
        if (emptyChat) {
            emptyChat.style.display = 'flex';
            container.innerHTML = '';
            container.appendChild(emptyChat);
        }
        return;
    }
    
    if (emptyChat) emptyChat.style.display = 'none';
    
    // Проверяем, нужно ли обновлять
    const currentIds = Array.from(container.querySelectorAll('.message'))
        .map(el => parseInt(el.dataset.messageId))
        .filter(id => !isNaN(id));
    
    const newMessages = messages.filter(msg => !currentIds.includes(msg.id));
    
    if (newMessages.length > 0 || container.innerHTML === '') {
        container.innerHTML = '';
        
        messages.forEach(msg => {
            const element = createMessageElement(msg);
            container.appendChild(element);
        });
        
        scrollToBottom();
        console.log(`📨 Отображено ${messages.length} сообщений`);
    }
}

function getAllMessages() {
    try {
        const key = `${STORAGE_PREFIX}messages_${currentSection}`;
        const savedMessages = localStorage.getItem(key);
        
        if (savedMessages) {
            return JSON.parse(savedMessages);
        }
    } catch (e) {
        console.error('Ошибка получения сообщений:', e);
    }
    
    return [];
}

// ===== ПРОВЕРКА ОБНОВЛЕНИЙ =====
function checkForUpdates() {
    // Обновляем статус текущего пользователя
    if (usersCache[currentUserId]) {
        usersCache[currentUserId].last_seen = Date.now();
        usersCache[currentUserId].last_active = new Date().toISOString();
        saveUsersToStorage();
    }
    
    // Проверяем новые сообщения
    checkNewMessages();
    
    // Обновляем список пользователей каждые 10 секунд
    if (Date.now() % 10000 < 2000) {
        updateUsersList();
        updateOnlineCount();
    }
}

function checkNewMessages() {
    const container = document.getElementById('messages-container');
    if (!container || currentSection !== 'main') return;
    
    const messages = getAllMessages();
    const currentIds = Array.from(container.querySelectorAll('.message'))
        .map(el => parseInt(el.dataset.messageId))
        .filter(id => !isNaN(id));
    
    if (messages.length > currentIds.length) {
        console.log('🔄 Обнаружены новые сообщения');
        loadMessages();
    }
}

// ===== ЗАГРУЗКА В S3 (ПРЯМАЯ) =====
async function uploadFileToS3Direct(file, type, customName = null) {
    return new Promise((resolve, reject) => {
        showUploadProgress(true, `Загрузка ${file.name}...`);
        
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substr(2, 8);
        const fileExt = file.name.split('.').pop().toLowerCase();
        const fileName = customName || `file_${timestamp}_${randomStr}.${fileExt}`;
        const filePath = `uploads/${currentUserId}/${fileName}`;
        
        // Публичный URL
        const publicUrl = `${S3_CONFIG.endpoint}/${S3_CONFIG.bucket}/${filePath}`;
        
        console.log(`📤 Загрузка в S3: ${fileName}`);
        console.log(`📍 Путь: ${filePath}`);
        
        // Используем PUT запрос
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', publicUrl, true);
        
        // Устанавливаем заголовки
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('x-amz-acl', 'public-read');
        
        // Basic auth (небезопасно для продакшена!)
        const credentials = btoa(`${S3_CONFIG.accessKeyId}:${S3_CONFIG.secretAccessKey}`);
        xhr.setRequestHeader('Authorization', `Basic ${credentials}`);
        
        // Прогресс
        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updateUploadProgress(percent);
            }
        };
        
        xhr.onload = function() {
            showUploadProgress(false);
            
            if (xhr.status === 200) {
                console.log('✅ Файл загружен успешно');
                
                const fileInfo = {
                    id: `s3_${timestamp}_${randomStr}`,
                    url: publicUrl,
                    s3Key: filePath,
                    name: file.name,
                    type: type,
                    size: file.size,
                    mimeType: file.type,
                    uploadedBy: currentUserId,
                    uploadedAt: timestamp,
                    uploadedByName: currentUser.first_name || 'Неизвестно',
                    section: currentSection
                };
                
                // Сохраняем информацию о файле
                saveFileToStorage(fileInfo);
                
                resolve(fileInfo);
            } else {
                console.error(`❌ Ошибка S3: ${xhr.status}`, xhr.statusText);
                reject(new Error(`S3 error: ${xhr.status}`));
            }
        };
        
        xhr.onerror = function() {
            showUploadProgress(false);
            console.error('❌ Ошибка сети');
            reject(new Error('Network error'));
        };
        
        xhr.send(file);
    });
}

async function uploadFile(file, type) {
    try {
        // Проверка типа
        const allowedTypes = [...S3_CONFIG.allowedTypes.image, ...S3_CONFIG.allowedTypes.document];
        if (!allowedTypes.includes(file.type)) {
            throw new Error(`Тип файла ${file.type} не поддерживается`);
        }
        
        // Проверка размера
        if (file.size > S3_CONFIG.maxFileSize) {
            throw new Error(`Файл слишком большой. Максимум: ${S3_CONFIG.maxFileSize / 1024 / 1024}MB`);
        }
        
        console.log(`📤 Начало загрузки: ${file.name} (${formatFileSize(file.size)})`);
        
        // Пробуем загрузить в S3
        try {
            const fileInfo = await uploadFileToS3Direct(file, type);
            showNotification('Файл загружен в облако', 'success');
            return fileInfo;
        } catch (s3Error) {
            console.warn('⚠️ Не удалось загрузить в S3, использую локальное хранилище:', s3Error);
            
            // Fallback на локальное хранилище
            return await uploadFileLocally(file, type);
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки файла:', error);
        showNotification(error.message, 'error');
        throw error;
    }
}

async function uploadFileLocally(file, type) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const fileInfo = {
                id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                url: e.target.result,
                name: file.name,
                type: type,
                size: file.size,
                mimeType: file.type,
                uploadedBy: currentUserId,
                uploadedAt: Date.now(),
                uploadedByName: currentUser.first_name || 'Неизвестно',
                section: currentSection,
                isLocal: true
            };
            
            saveFileToStorage(fileInfo);
            resolve(fileInfo);
        };
        
        reader.readAsDataURL(file);
    });
}

function saveFileToStorage(fileInfo) {
    try {
        const key = `${STORAGE_PREFIX}files`;
        let files = [];
        
        const savedFiles = localStorage.getItem(key);
        if (savedFiles) {
            files = JSON.parse(savedFiles);
        }
        
        // Удаляем дубликаты
        files = files.filter(f => f.id !== fileInfo.id);
        files.push(fileInfo);
        
        localStorage.setItem(key, JSON.stringify(files));
        console.log(`💾 Информация о файле сохранена: ${fileInfo.name}`);
        
    } catch (error) {
        console.error('❌ Ошибка сохранения файла:', error);
    }
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
    
    // Добавляем пункт для отладки
    addDebugMenuItems();
    
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

function addDebugMenuItems() {
    const menuList = document.querySelector('.menu-list');
    if (!menuList) return;
    
    // Кнопка отладки
    const debugItem = document.createElement('div');
    debugItem.className = 'menu-item';
    debugItem.innerHTML = `
        <i class="fas fa-bug"></i>
        <span>Отладка</span>
    `;
    debugItem.addEventListener('click', showDebugPanel);
    menuList.appendChild(debugItem);
    
    // Кнопка файлов S3
    const filesItem = document.createElement('div');
    filesItem.className = 'menu-item';
    filesItem.innerHTML = `
        <i class="fas fa-cloud"></i>
        <span>Файлы в S3</span>
    `;
    filesItem.addEventListener('click', showS3Files);
    menuList.appendChild(filesItem);
}

// ===== ПАНЕЛЬ ОТЛАДКИ =====
function showDebugPanel() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    // Собираем статистику
    const messages = getAllMessages();
    const usersKey = `${STORAGE_PREFIX}users`;
    const users = localStorage.getItem(usersKey) ? JSON.parse(localStorage.getItem(usersKey)) : {};
    const filesKey = `${STORAGE_PREFIX}files`;
    const files = localStorage.getItem(filesKey) ? JSON.parse(localStorage.getItem(filesKey)) : [];
    
    const s3Files = files.filter(f => f.url && f.url.includes('s3.ru-3.storage.selcloud.ru'));
    const localFiles = files.filter(f => f.isLocal);
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3>🔧 Панель отладки</h3>
                <button class="btn-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="debug-stats">
                    <h4>📊 Статистика</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-label">Пользователи</div>
                            <div class="stat-value">${Object.keys(users).length}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Онлайн сейчас</div>
                            <div class="stat-value">${Object.values(users).filter(u => u.is_online).length}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Сообщения</div>
                            <div class="stat-value">${messages.length}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Файлы всего</div>
                            <div class="stat-value">${files.length}</div>
                        </div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-label">Файлы в S3</div>
                            <div class="stat-value">${s3Files.length}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Локальные файлы</div>
                            <div class="stat-value">${localFiles.length}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Статус S3</div>
                            <div class="stat-value ${s3Status === 'Работает' ? 'success' : 'error'}">${s3Status}</div>
                        </div>
                    </div>
                </div>
                
                <div class="debug-actions">
                    <h4>⚡ Действия</h4>
                    <div class="actions-grid">
                        <button class="btn" onclick="checkS3Connection()">
                            <i class="fas fa-sync"></i> Проверить S3
                        </button>
                        <button class="btn" onclick="showDebugInfo()">
                            <i class="fas fa-info-circle"></i> Консоль
                        </button>
                        <button class="btn" onclick="exportAllData()">
                            <i class="fas fa-download"></i> Экспорт данных
                        </button>
                        <button class="btn btn-danger" onclick="clearTestData()">
                            <i class="fas fa-trash"></i> Очистить тест
                        </button>
                    </div>
                </div>
                
                <div class="debug-info">
                    <h4>ℹ️ Информация</h4>
                    <div class="info-item">
                        <strong>ID пользователя:</strong> ${currentUserId}
                    </div>
                    <div class="info-item">
                        <strong>Имя:</strong> ${currentUser.first_name}
                    </div>
                    <div class="info-item">
                        <strong>Префикс хранилища:</strong> ${STORAGE_PREFIX}
                    </div>
                    <div class="info-item">
                        <strong>Раздел:</strong> ${currentSection}
                    </div>
                    <div class="info-item">
                        <strong>S3 бакет:</strong> ${S3_CONFIG.bucket}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="this.closest('.modal').remove()">Закрыть</button>
                <button class="btn btn-primary" onclick="location.reload()">
                    <i class="fas fa-redo"></i> Перезагрузить
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function showS3Files() {
    const filesKey = `${STORAGE_PREFIX}files`;
    const savedFiles = localStorage.getItem(filesKey);
    
    if (!savedFiles) {
        showNotification('Нет файлов', 'warning');
        return;
    }
    
    const files = JSON.parse(savedFiles);
    const s3Files = files.filter(f => f.url && f.url.includes('s3.ru-3.storage.selcloud.ru'));
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
            <div class="modal-header">
                <h3>☁️ Файлы в Selectel S3 (${s3Files.length})</h3>
                <button class="btn-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
                <table class="files-table">
                    <thead>
                        <tr>
                            <th>Имя файла</th>
                            <th>Тип</th>
                            <th>Размер</th>
                            <th>Загрузил</th>
                            <th>Дата</th>
                            <th>URL</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${s3Files.map(file => `
                            <tr>
                                <td>
                                    <i class="fas fa-${file.type === 'photo' ? 'image' : 'file'}"></i>
                                    ${file.name}
                                </td>
                                <td>${file.type}</td>
                                <td>${formatFileSize(file.size)}</td>
                                <td>${file.uploadedByName || file.uploadedBy}</td>
                                <td>${new Date(file.uploadedAt).toLocaleString('ru-RU')}</td>
                                <td class="url-cell">
                                    <input type="text" readonly value="${file.url}" 
                                        onclick="this.select()" style="width: 250px; font-size: 12px;">
                                </td>
                                <td>
                                    <button class="btn-small" onclick="window.open('${file.url}', '_blank')" title="Открыть">
                                        <i class="fas fa-external-link-alt"></i>
                                    </button>
                                    <button class="btn-small" onclick="copyToClipboard('${file.url}')" title="Копировать URL">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                ${s3Files.length === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-cloud"></i>
                        <p>Нет файлов в S3</p>
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="this.closest('.modal').remove()">Закрыть</button>
                <button class="btn btn-primary" onclick="checkS3Connection()">
                    <i class="fas fa-sync"></i> Проверить S3
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== ОСТАЛЬНЫЕ ФУНКЦИИ =====
function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('active');
}

function attachFile(type) {
    toggleAttachMenu();
    
    const input = document.createElement('input');
    input.type = 'file';
    
    if (type === 'photo') {
        input.accept = 'image/*';
    } else if (type === 'document') {
        input.accept = '.pdf,.txt,.doc,.docx';
    }
    
    input.multiple = false;
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const fileInfo = await uploadFile(file, type);
            attachedFiles.push(fileInfo);
            showFilePreview(fileInfo);
            showNotification('Файл прикреплен', 'success');
        } catch (error) {
            showNotification('Ошибка загрузки файла', 'error');
        }
    };
    
    input.click();
}

function showFilePreview(fileInfo) {
    const container = document.getElementById('file-preview-container');
    const preview = document.createElement('div');
    preview.className = 'file-preview-item';
    preview.dataset.fileId = fileInfo.id;
    
    let icon = 'fa-file';
    let previewContent = '';
    
    if (fileInfo.type === 'photo') {
        icon = 'fa-image';
        previewContent = `<img src="${fileInfo.url}" alt="${fileInfo.name}" class="file-preview-image" loading="lazy">`;
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
            <span class="file-source">${fileInfo.isLocal ? 'Локальный' : 'S3'}</span>
            <button class="btn-remove-file" onclick="removeFilePreview(this)">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="file-preview-content">
            ${previewContent}
        </div>
        <div class="file-preview-footer">
            <span class="file-size">${formatFileSize(fileInfo.size)}</span>
            <span class="file-status ${fileInfo.isLocal ? 'local' : 's3'}">
                ${fileInfo.isLocal ? 'Локальный' : 'S3'}
            </span>
        </div>
    `;
    
    preview.dataset.fileInfo = JSON.stringify(fileInfo);
    container.appendChild(preview);
    document.getElementById('file-preview').style.display = 'block';
}

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

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

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

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (text === '' && attachedFiles.length === 0) {
        showNotification('Введите сообщение или прикрепите файл', 'warning');
        return;
    }
    
    const messageId = Date.now() + Math.floor(Math.random() * 1000);
    
    const message = {
        id: messageId,
        user_id: currentUserId,
        user: { 
            ...currentUser, 
            role: userRoles[currentUserId] || 'user',
            is_online: true,
            last_seen: Date.now()
        },
        content: text,
        timestamp: Date.now(),
        section: currentSection,
        files: [...attachedFiles],
        reactions: {}
    };
    
    const saved = saveMessage(message);
    
    if (saved) {
        const container = document.getElementById('messages-container');
        const emptyChat = document.getElementById('empty-chat');
        
        if (emptyChat && emptyChat.style.display !== 'none') {
            emptyChat.style.display = 'none';
        }
        
        container.appendChild(createMessageElement(message));
        
        input.value = '';
        input.style.height = 'auto';
        clearAttachments();
        
        scrollToBottom();
        
        // Обновляем статус
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].last_seen = Date.now();
            saveUsersToStorage();
        }
        
        showNotification('Сообщение отправлено', 'success');
        
        // Консоль логи
        console.log(`📤 Сообщение отправлено: ${text.substring(0, 50)}...`);
        if (attachedFiles.length > 0) {
            console.log(`📎 Прикреплено файлов: ${attachedFiles.length}`);
        }
    }
}

function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    div.dataset.messageId = message.id;
    
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
                    <span class="file-source-badge ${file.isLocal ? 'local' : 's3'}">
                        ${file.isLocal ? 'локальный' : 'S3'}
                    </span>
                    <a href="${file.url}" target="_blank" class="download-btn" title="Открыть">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
                ${file.type === 'photo' ? `<img src="${file.url}" alt="${escapeHtml(file.name)}" class="message-file-image" loading="lazy">` : ''}
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
                        ${user.id === currentUserId ? '<span class="you-badge">(Вы)</span>' : ''}
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

function initTheme() {
    const savedTheme = localStorage.getItem(`${STORAGE_PREFIX}theme`) || 'auto';
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
    localStorage.setItem(`${STORAGE_PREFIX}theme`, isDark ? 'dark' : 'light');
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

// ===== УТИЛИТЫ =====
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
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online && u.id !== currentUserId);
    
    if (onlineUsers.length === 0) {
        showNotification('Нет других пользователей онлайн', 'warning');
        return;
    }
    
    const mentions = onlineUsers.map(u => `@${u.first_name}`).join(' ');
    const input = document.getElementById('message-input');
    
    input.value = mentions + ' ' + (input.value || '');
    input.focus();
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
    
    showNotification(`Упомянуто ${onlineUsers.length} пользователей`, 'info');
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

function loadData() {
    const savedLastId = localStorage.getItem(`${STORAGE_PREFIX}lastMessageId`);
    if (savedLastId) {
        lastMessageId = parseInt(savedLastId) || 0;
    }
    
    const savedRoles = localStorage.getItem(`${STORAGE_PREFIX}userRoles`);
    if (savedRoles) {
        try {
            userRoles = JSON.parse(savedRoles);
        } catch (e) {
            userRoles = {};
        }
    }
    
    if (!userRoles[currentUserId]) {
        userRoles[currentUserId] = 'user';
        localStorage.setItem(`${STORAGE_PREFIX}userRoles`, JSON.stringify(userRoles));
    }
}

function clearCache() {
    if (confirm('Очистить ВЕСЬ кэш? Все сообщения, пользователи и файлы будут удалены!')) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        showNotification('Кэш полностью очищен', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}

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
        const icon = document.getElementById('user-avatar-icon');
        if (icon) icon.style.display = 'none';
    }
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

function searchUsers(query) {
    updateUsersList(query);
}

function removeFilePreview(button) {
    const preview = button.closest('.file-preview-item');
    const fileInfo = JSON.parse(preview.dataset.fileInfo);
    
    attachedFiles = attachedFiles.filter(file => file.id !== fileInfo.id);
    
    if (fileInfo.isLocal && fileInfo.url.startsWith('data:')) {
        URL.revokeObjectURL(fileInfo.url);
    }
    
    preview.remove();
    
    if (document.querySelectorAll('.file-preview-item').length === 0) {
        document.getElementById('file-preview').style.display = 'none';
    }
}

function clearAttachments() {
    attachedFiles.forEach(file => {
        if (file.isLocal && file.url.startsWith('data:')) {
            URL.revokeObjectURL(file.url);
        }
    });
    
    attachedFiles = [];
    document.getElementById('file-preview-container').innerHTML = '';
    document.getElementById('file-preview').style.display = 'none';
}

function closeMenus(e) {
    const attachMenu = document.getElementById('attach-menu');
    const btnAttach = document.getElementById('btn-attach');
    
    if (attachMenu && btnAttach) {
        if (!attachMenu.contains(e.target) && !btnAttach.contains(e.target)) {
            attachMenu.classList.remove('active');
        }
    }
    
    const emojiPicker = document.getElementById('emoji-picker');
    const btnEmoji = document.getElementById('btn-emoji');
    
    if (emojiPicker && btnEmoji) {
        if (!emojiPicker.contains(e.target) && !btnEmoji.contains(e.target)) {
            emojiPicker.classList.remove('active');
        }
    }
}

// ===== ДЕБАГ ФУНКЦИИ ДЛЯ КОНСОЛИ =====
window.debug = {
    showUsers: function() {
        console.table(Object.values(usersCache).map(u => ({
            ID: u.id,
            Имя: u.first_name,
            Онлайн: u.is_online ? '✅' : '❌',
            'Последний раз': new Date(u.last_seen).toLocaleTimeString(),
            'Всего сообщений': getAllMessages().filter(m => m.user_id === u.id).length
        })));
    },
    
    showMessages: function() {
        const messages = getAllMessages();
        console.log(`Всего сообщений: ${messages.length}`);
        messages.forEach((msg, i) => {
            console.log(`${i+1}. [${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.user.first_name}: ${msg.content.substring(0, 50)}...`);
        });
    },
    
    showFiles: function() {
        const filesKey = `${STORAGE_PREFIX}files`;
        const savedFiles = localStorage.getItem(filesKey);
        if (savedFiles) {
            const files = JSON.parse(savedFiles);
            console.table(files.map(f => ({
                Имя: f.name,
                Тип: f.type,
                Размер: formatFileSize(f.size),
                Источник: f.isLocal ? 'Локальный' : 'S3',
                URL: f.url.substring(0, 50) + '...'
            })));
        }
    },
    
    checkStorage: function() {
        console.group('📦 Хранилище');
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX)) {
                const value = localStorage.getItem(key);
                console.log(`${key}: ${value.length} chars`);
            }
        }
        console.groupEnd();
    },
    
    testS3: function() {
        checkS3Connection();
    }
};

// Глобальные функции
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Скопировано в буфер', 'success');
    });
};

window.exportAllData = function() {
    const data = {
        users: usersCache,
        messages_main: getAllMessages(),
        files: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}files`) || '[]'),
        timestamp: new Date().toISOString(),
        s3_status: s3Status
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telegram_chat_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Данные экспортированы', 'success');
};

window.clearTestData = function() {
    if (confirm('Очистить только тестовые данные (сообщения и файлы)? Пользователи останутся.')) {
        const keys = [
            `${STORAGE_PREFIX}messages_main`,
            `${STORAGE_PREFIX}messages_news`,
            `${STORAGE_PREFIX}files`
        ];
        
        keys.forEach(key => localStorage.removeItem(key));
        
        showNotification('Тестовые данные очищены', 'success');
        setTimeout(() => location.reload(), 1000);
    }
};

// ===== ЗАПУСК ПРИЛОЖЕНИЯ =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Экспортируем функции для HTML
window.removeFilePreview = removeFilePreview;
window.clearAttachments = clearAttachments;
