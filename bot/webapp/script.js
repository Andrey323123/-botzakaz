// Telegram Chat App - Botfs23
// Версия с хранением всех данных в Selectel S3

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
let s3Data = {
    users: {},
    messages_main: [],
    messages_news: [],
    metadata: {}
};

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

// Пути к данным в S3
const S3_PATHS = {
    users: 'data/users.json',
    messages_main: 'data/messages_main.json',
    messages_news: 'data/messages_news.json',
    metadata: 'data/metadata.json',
    files_index: 'data/files_index.json'
};

// Эмодзи
const EMOJI_CATEGORIES = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷'],
    objects: ['💡', '📱', '💻', '⌚️', '📷', '🎥', '📡', '💎', '🔑', '📦', '🎁', '📚', '✏️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💞', '💓', '💗', '💖']
};

// ===== S3 DATA STORAGE =====
class S3DataStorage {
    constructor(config) {
        this.config = config;
        this.endpoint = config.endpoint;
        this.bucket = config.bucket;
        this.accessKey = config.accessKeyId;
        this.secretKey = config.secretAccessKey;
        this.cache = {};
        this.cacheTimeout = 30000;
    }

    getAuthHeader() {
        const credentials = btoa(`${this.accessKey}:${this.secretKey}`);
        return `Basic ${credentials}`;
    }

    getFileUrl(path) {
        return `${this.endpoint}/${this.bucket}/${path}`;
    }

    async loadData(path, defaultValue = null) {
        try {
            const url = this.getFileUrl(path);
            
            if (this.cache[path] && Date.now() - this.cache[path].timestamp < this.cacheTimeout) {
                return this.cache[path].data;
            }
            
            console.log(`📥 Загрузка из S3: ${path}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.cache[path] = {
                    data: data,
                    timestamp: Date.now()
                };
                console.log(`✅ Загружено из S3: ${path}`);
                return data;
            } else if (response.status === 404 && defaultValue !== null) {
                console.log(`📝 Файл ${path} не найден, создаем...`);
                await this.saveData(path, defaultValue);
                return defaultValue;
            }
            
            return defaultValue;
            
        } catch (error) {
            console.error(`❌ Ошибка загрузки ${path}:`, error);
            const localStorageKey = `s3_backup_${path.replace(/\//g, '_')}`;
            const backup = localStorage.getItem(localStorageKey);
            
            if (backup) {
                console.log(`🔄 Используем backup из localStorage: ${path}`);
                return JSON.parse(backup);
            }
            
            return defaultValue;
        }
    }

    async saveData(path, data) {
        try {
            const url = this.getFileUrl(path);
            const content = JSON.stringify(data, null, 2);
            
            console.log(`💾 Сохранение в S3: ${path}`);
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-amz-acl': 'public-read',
                    'Authorization': this.getAuthHeader()
                },
                body: content
            });
            
            if (response.ok) {
                this.cache[path] = {
                    data: data,
                    timestamp: Date.now()
                };
                
                const localStorageKey = `s3_backup_${path.replace(/\//g, '_')}`;
                localStorage.setItem(localStorageKey, content);
                
                console.log(`✅ Сохранено в S3: ${path}`);
                return true;
            } else {
                console.error(`❌ Ошибка сохранения ${path}: ${response.status}`);
                return false;
            }
            
        } catch (error) {
            console.error(`❌ Ошибка сохранения ${path}:`, error);
            return false;
        }
    }

    async uploadFile(file, type, userId, userName) {
        return new Promise((resolve, reject) => {
            showUploadProgress(true, `Загрузка ${file.name} в S3...`);
            
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substr(2, 8);
            const fileExt = file.name.split('.').pop().toLowerCase();
            const fileName = `file_${timestamp}_${randomStr}.${fileExt}`;
            const filePath = `uploads/${userId}/${fileName}`;
            const fileUrl = this.getFileUrl(filePath);
            
            console.log(`📤 Загрузка файла в S3: ${fileName}`);
            
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', fileUrl, true);
            
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.setRequestHeader('x-amz-acl', 'public-read');
            xhr.setRequestHeader('Authorization', this.getAuthHeader());
            
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    updateUploadProgress(percent);
                }
            };
            
            xhr.onload = function() {
                showUploadProgress(false);
                
                if (xhr.status === 200) {
                    console.log('✅ Файл загружен успешно в S3');
                    
                    const fileInfo = {
                        id: `s3_${timestamp}_${randomStr}`,
                        url: fileUrl,
                        s3Key: filePath,
                        name: file.name,
                        type: type,
                        size: file.size,
                        mimeType: file.type,
                        uploadedBy: userId,
                        uploadedAt: timestamp,
                        uploadedByName: userName || 'Неизвестно',
                        section: 'main',
                        isLocal: false
                    };
                    
                    resolve(fileInfo);
                } else {
                    console.error(`❌ Ошибка S3: ${xhr.status}`);
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
}

// Инициализация хранилища
const s3Storage = new S3DataStorage(S3_CONFIG);

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
async function initApp() {
    console.log('🚀 Инициализация приложения с S3...');
    
    // Инициализация Telegram
    initTelegram();
    
    // Настройка темы
    initTheme();
    
    // Инициализация UI
    initUI();
    
    // Проверка S3
    await checkS3Connection();
    
    // Загрузка данных из S3
    await loadDataFromS3();
    
    // Обновление интерфейса
    updateUserInfo();
    
    // Загружаем пользователей
    await loadUsers();
    
    // Загружаем сообщения
    await loadMessages();
    
    // Периодическая проверка новых сообщений
    setInterval(checkForUpdates, 5000);
    
    // Дебаг информация
    setTimeout(showDebugInfo, 2000);
    
    console.log('✅ Приложение инициализировано с S3');
}

// ===== РАБОТА С S3 =====
async function checkS3Connection() {
    console.log('🔌 Проверка подключения к Selectel S3...');
    updateS3Status('Проверка...', 'info');
    
    try {
        const testUrl = `${S3_CONFIG.endpoint}/${S3_CONFIG.bucket}/data/test.txt`;
        
        const response = await fetch(testUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain',
                'x-amz-acl': 'public-read',
                'Authorization': `Basic ${btoa(`${S3_CONFIG.accessKeyId}:${S3_CONFIG.secretAccessKey}`)}`
            },
            body: 'S3 connection test ' + new Date().toISOString()
        });
        
        if (response.ok) {
            s3Status = 'Работает';
            updateS3Status('✅ S3 доступен', 'success');
            console.log('✅ S3 подключение успешно');
            return true;
        } else {
            s3Status = 'Ошибка';
            updateS3Status(`❌ S3 ошибка: ${response.status}`, 'error');
            console.error('❌ Ошибка S3:', response.status);
            return false;
        }
        
    } catch (error) {
        s3Status = 'Нет подключения';
        updateS3Status('❌ Нет подключения к S3', 'error');
        console.error('❌ Ошибка подключения к S3:', error.message);
        return false;
    }
}

async function loadDataFromS3() {
    console.log('📥 Загрузка всех данных из S3...');
    
    try {
        const [usersData, messagesMainData, messagesNewsData, metadata] = await Promise.all([
            s3Storage.loadData(S3_PATHS.users, { 
                meta: { 
                    version: '1.0', 
                    created_at: new Date().toISOString(),
                    total_users: 0
                },
                users: {} 
            }),
            s3Storage.loadData(S3_PATHS.messages_main, { 
                meta: { 
                    version: '1.0', 
                    created_at: new Date().toISOString(),
                    total_messages: 0
                },
                messages: [] 
            }),
            s3Storage.loadData(S3_PATHS.messages_news, { 
                meta: { 
                    version: '1.0', 
                    created_at: new Date().toISOString(),
                    total_messages: 0
                },
                messages: [] 
            }),
            s3Storage.loadData(S3_PATHS.metadata, { 
                app_name: 'Telegram Chat S3',
                version: '1.0',
                initialized: true,
                initialized_at: new Date().toISOString(),
                s3_configured: true,
                last_backup: null
            })
        ]);
        
        s3Data.users = usersData.users || {};
        s3Data.messages_main = messagesMainData.messages || [];
        s3Data.messages_news = messagesNewsData.messages || [];
        s3Data.metadata = metadata;
        
        usersCache = s3Data.users;
        
        console.log(`📊 Данные загружены: ${Object.keys(s3Data.users).length} пользователей, ${s3Data.messages_main.length} сообщений в основном чате`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных из S3:', error);
        
        // Используем локальные данные как fallback
        const localUsers = localStorage.getItem('local_users_backup');
        const localMessages = localStorage.getItem(`local_messages_${currentSection}_backup`);
        
        if (localUsers) {
            s3Data.users = JSON.parse(localUsers);
            usersCache = s3Data.users;
        }
        
        if (localMessages) {
            if (currentSection === 'main') {
                s3Data.messages_main = JSON.parse(localMessages);
            } else {
                s3Data.messages_news = JSON.parse(localMessages);
            }
        }
        
        return false;
    }
}

async function saveUsersToS3() {
    try {
        const data = {
            meta: {
                version: '1.0',
                updated_at: new Date().toISOString(),
                total_users: Object.keys(s3Data.users).length
            },
            users: s3Data.users
        };
        
        const success = await s3Storage.saveData(S3_PATHS.users, data);
        
        if (success) {
            localStorage.setItem('local_users_backup', JSON.stringify(s3Data.users));
            return true;
        }
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения пользователей в S3:', error);
        return false;
    }
}

async function saveMessagesToS3() {
    try {
        const path = currentSection === 'main' ? S3_PATHS.messages_main : S3_PATHS.messages_news;
        const messages = currentSection === 'main' ? s3Data.messages_main : s3Data.messages_news;
        
        const data = {
            meta: {
                version: '1.0',
                updated_at: new Date().toISOString(),
                total_messages: messages.length
            },
            messages: messages
        };
        
        const success = await s3Storage.saveData(path, data);
        
        if (success) {
            localStorage.setItem(`local_messages_${currentSection}_backup`, JSON.stringify(messages));
            return true;
        }
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщений в S3:', error);
        return false;
    }
}

// ===== ПОЛЬЗОВАТЕЛИ =====
async function loadUsers() {
    console.log('👥 Загрузка пользователей из S3...');
    
    try {
        if (!currentUser.id) {
            console.error('❌ Нет ID пользователя!');
            return;
        }
        
        const userId = currentUser.id.toString();
        
        // Добавляем/обновляем текущего пользователя
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
        
        // Обновляем данные в S3
        s3Data.users = usersCache;
        
        // Сохраняем в S3
        await saveUsersToS3();
        
        // Обновляем UI
        updateUsersList();
        updateOnlineCount();
        
        console.log(`✅ Пользователь ${currentUser.first_name} добавлен в S3`);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
    }
}

function cleanupOldUsers() {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    Object.keys(usersCache).forEach(userId => {
        const user = usersCache[userId];
        if (userId !== currentUserId && user.last_seen) {
            const timeDiff = now - user.last_seen;
            if (timeDiff > fiveMinutes) {
                user.is_online = false;
            }
        }
    });
    
    // Сохраняем изменения
    saveUsersToS3();
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

function updateUsersList(filter = '') {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
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

function updateOnlineCount() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online).length;
    const totalUsers = Object.keys(usersCache).length;
    
    const onlineCountElement = document.getElementById('online-count');
    const sidebarOnlineCountElement = document.getElementById('sidebar-online-count');
    
    if (onlineCountElement) onlineCountElement.textContent = onlineUsers;
    if (sidebarOnlineCountElement) sidebarOnlineCountElement.textContent = `${onlineUsers}/${totalUsers}`;
}

// ===== СООБЩЕНИЯ =====
async function saveMessage(message) {
    try {
        // Добавляем сообщение в соответствующий массив
        if (currentSection === 'main') {
            s3Data.messages_main.push(message);
            s3Data.messages_main.sort((a, b) => a.timestamp - b.timestamp);
        } else {
            s3Data.messages_news.push(message);
            s3Data.messages_news.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        // Сохраняем в S3
        const success = await saveMessagesToS3();
        
        if (success) {
            lastMessageId = Math.max(message.id, lastMessageId);
            console.log(`💾 Сообщение #${message.id} сохранено в S3`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщения в S3:', error);
        
        // Fallback: сохраняем локально
        const key = `local_message_backup_${currentSection}`;
        let messages = JSON.parse(localStorage.getItem(key) || '[]');
        messages.push(message);
        localStorage.setItem(key, JSON.stringify(messages));
        
        return true;
    }
}

function getAllMessages() {
    return currentSection === 'main' ? s3Data.messages_main : s3Data.messages_news;
}

async function loadMessages() {
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
    
    container.innerHTML = '';
    
    messages.forEach(msg => {
        const element = createMessageElement(msg);
        container.appendChild(element);
    });
    
    scrollToBottom();
    console.log(`📨 Отображено ${messages.length} сообщений из S3`);
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

// ===== ФАЙЛЫ =====
async function uploadFile(file, type) {
    try {
        const allowedTypes = [...S3_CONFIG.allowedTypes.image, ...S3_CONFIG.allowedTypes.document];
        if (!allowedTypes.includes(file.type)) {
            throw new Error(`Тип файла ${file.type} не поддерживается`);
        }
        
        if (file.size > S3_CONFIG.maxFileSize) {
            throw new Error(`Файл слишком большой. Максимум: ${S3_CONFIG.maxFileSize / 1024 / 1024}MB`);
        }
        
        console.log(`📤 Начало загрузки в S3: ${file.name}`);
        
        const fileInfo = await s3Storage.uploadFile(file, type, currentUserId, currentUser.first_name);
        showNotification('Файл загружен в облако S3', 'success');
        return fileInfo;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки файла в S3:', error);
        showNotification('Ошибка загрузки файла в облако, использую локальное хранилище', 'warning');
        
        // Fallback на локальное хранилище
        return await uploadFileLocally(file, type);
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
            
            resolve(fileInfo);
        };
        
        reader.readAsDataURL(file);
    });
}

// ===== ОТПРАВКА СООБЩЕНИЙ =====
async function sendMessage() {
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
    
    const saved = await saveMessage(message);
    
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
        
        // Обновляем статус пользователя
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].last_seen = Date.now();
            await saveUsersToS3();
        }
        
        showNotification('Сообщение отправлено и сохранено в облаке S3', 'success');
        
        console.log(`📤 Сообщение сохранено в S3: ${text.substring(0, 50)}...`);
    }
}

// ===== ОБНОВЛЕНИЕ ДАННЫХ =====
async function checkForUpdates() {
    // Обновляем статус текущего пользователя
    if (usersCache[currentUserId]) {
        usersCache[currentUserId].last_seen = Date.now();
        usersCache[currentUserId].last_active = new Date().toISOString();
        
        // Сохраняем статус каждые 30 секунд
        if (Date.now() % 30000 < 2000) {
            await saveUsersToS3();
        }
    }
    
    // Обновляем онлайн статус каждые 10 секунд
    if (Date.now() % 10000 < 2000) {
        updateUsersList();
        updateOnlineCount();
    }
}

// ===== TELEGRAM ИНИЦИАЛИЗАЦИЯ =====
function initTelegram() {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            
            tg.expand();
            tg.enableClosingConfirmation();
            
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

// ===== UI ИНИЦИАЛИЗАЦИЯ =====
function initUI() {
    // Кнопка меню
    const btnMenu = document.getElementById('btn-menu');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const overlay = document.getElementById('overlay');
    
    if (btnMenu) btnMenu.addEventListener('click', toggleSidebar);
    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);
    
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
    
    // Добавляем пункт для отладки S3
    addDebugMenuItems();
    
    // Кнопки заголовка
    const btnUsers = document.getElementById('btn-users');
    const btnAdmin = document.getElementById('btn-admin');
    const btnMentionAll = document.getElementById('btn-mention-all');
    const btnJump = document.getElementById('btn-jump');
    
    if (btnUsers) btnUsers.addEventListener('click', () => switchView('users'));
    if (btnAdmin) btnAdmin.addEventListener('click', () => switchView('admin'));
    if (btnMentionAll) btnMentionAll.addEventListener('click', mentionAllOnline);
    if (btnJump) btnJump.addEventListener('click', scrollToBottom);
    
    // Ввод сообщения
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    if (messageInput && sendButton) {
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
    }
    
    // Прикрепление файлов
    const btnAttach = document.getElementById('btn-attach');
    if (btnAttach) {
        btnAttach.addEventListener('click', toggleAttachMenu);
    }
    
    document.querySelectorAll('.attach-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            attachFile(type);
        });
    });
    
    // Кнопки файлов
    const btnCancelFiles = document.getElementById('btn-cancel-files');
    const btnSendFiles = document.getElementById('btn-send-files');
    
    if (btnCancelFiles) btnCancelFiles.addEventListener('click', clearAttachments);
    if (btnSendFiles) btnSendFiles.addEventListener('click', sendMessage);
    
    // Эмодзи
    const btnEmoji = document.getElementById('btn-emoji');
    if (btnEmoji) {
        btnEmoji.addEventListener('click', toggleEmojiPicker);
        initEmojiPicker();
    }
    
    // Поиск пользователей
    const searchInput = document.getElementById('users-search-input');
    const btnCloseSearch = document.getElementById('btn-close-search');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            searchUsers(this.value);
        });
    }
    
    if (btnCloseSearch) {
        btnCloseSearch.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            searchUsers('');
        });
    }
    
    // Настройки
    const themeToggle = document.getElementById('theme-toggle');
    const btnClearCache = document.getElementById('btn-clear-cache');
    
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);
    if (btnClearCache) btnClearCache.addEventListener('click', clearCache);
    
    // Закрытие меню при клике вне
    document.addEventListener('click', closeMenus);
}

function addDebugMenuItems() {
    const menuList = document.querySelector('.menu-list');
    if (!menuList) return;
    
    const debugItem = document.createElement('div');
    debugItem.className = 'menu-item';
    debugItem.innerHTML = `
        <i class="fas fa-cloud"></i>
        <span>S3 Статус</span>
    `;
    debugItem.addEventListener('click', showS3StatusPanel);
    menuList.appendChild(debugItem);
}

function showS3StatusPanel() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3>☁️ Статус Selectel S3</h3>
                <button class="btn-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="debug-info">
                    <h4>📊 Статистика данных в S3</h4>
                    <div class="info-item">
                        <strong>Статус S3:</strong> <span class="${s3Status === 'Работает' ? 'success' : 'error'}">${s3Status}</span>
                    </div>
                    <div class="info-item">
                        <strong>Пользователей:</strong> ${Object.keys(s3Data.users).length}
                    </div>
                    <div class="info-item">
                        <strong>Сообщений (main):</strong> ${s3Data.messages_main.length}
                    </div>
                    <div class="info-item">
                        <strong>Сообщений (news):</strong> ${s3Data.messages_news.length}
                    </div>
                    <div class="info-item">
                        <strong>Бакет:</strong> ${S3_CONFIG.bucket}
                    </div>
                    <div class="info-item">
                        <strong>Endpoint:</strong> ${S3_CONFIG.endpoint}
                    </div>
                </div>
                
                <div class="debug-actions" style="margin-top: 20px;">
                    <h4>⚡ Действия</h4>
                    <div class="actions-grid">
                        <button class="btn" onclick="checkS3Connection()">
                            <i class="fas fa-sync"></i> Проверить S3
                        </button>
                        <button class="btn" onclick="loadDataFromS3()">
                            <i class="fas fa-redo"></i> Перезагрузить данные
                        </button>
                        <button class="btn" onclick="exportS3Data()">
                            <i class="fas fa-download"></i> Экспорт данных
                        </button>
                        <button class="btn btn-danger" onclick="clearS3TestData()">
                            <i class="fas fa-trash"></i> Очистить тест
                        </button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="this.closest('.modal').remove()">Закрыть</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
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
    
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
}

function showUploadProgress(show, text = 'Загрузка файла...') {
    const progress = document.getElementById('upload-progress');
    const uploadText = document.getElementById('upload-text');
    
    if (progress) progress.style.display = show ? 'flex' : 'none';
    if (uploadText && text) uploadText.textContent = text;
    
    if (!show) updateUploadProgress(0);
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
    
    if (input) {
        input.value = mentions + ' ' + (input.value || '');
        input.focus();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    }
    
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

function initTheme() {
    const savedTheme = localStorage.getItem('telegram_chat_theme') || 'auto';
    applyTheme(savedTheme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.checked = savedTheme === 'dark';
    }
}

function toggleTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    const isDark = themeToggle.checked;
    applyTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('telegram_chat_theme', isDark ? 'dark' : 'light');
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

function updateS3Status(text, type = 'info') {
    const statusElement = document.getElementById('s3-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `settings-status ${type}`;
    }
}

function updateUserInfo() {
    const userName = document.getElementById('user-name');
    const userRole = document.getElementById('user-role');
    const userAvatar = document.getElementById('user-avatar');
    
    if (userName) userName.textContent = currentUser.first_name || 'Гость';
    if (userRole) userRole.textContent = 'участник';
    
    if (userAvatar && currentUser.first_name) {
        userAvatar.style.backgroundColor = stringToColor(currentUserId);
        userAvatar.textContent = currentUser.first_name.charAt(0).toUpperCase();
        const icon = document.getElementById('user-avatar-icon');
        if (icon) icon.style.display = 'none';
    }
}

function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    if (menu) menu.classList.toggle('active');
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
    if (!container) return;
    
    const preview = document.createElement('div');
    preview.className = 'file-preview-item';
    preview.dataset.fileId = fileInfo.id;
    
    let icon = 'fa-file';
    let previewContent = '';
    
    if (fileInfo.type === 'photo') {
        icon = 'fa-image';
        previewContent = `<img src="${fileInfo.url}" alt="${fileInfo.name}" class="file-preview-image" loading="lazy">`;
    } else {
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
    
    const filePreview = document.getElementById('file-preview');
    if (filePreview) filePreview.style.display = 'block';
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
        const filePreview = document.getElementById('file-preview');
        if (filePreview) filePreview.style.display = 'none';
    }
}

function clearAttachments() {
    attachedFiles.forEach(file => {
        if (file.isLocal && file.url.startsWith('data:')) {
            URL.revokeObjectURL(file.url);
        }
    });
    
    attachedFiles = [];
    const container = document.getElementById('file-preview-container');
    if (container) container.innerHTML = '';
    
    const filePreview = document.getElementById('file-preview');
    if (filePreview) filePreview.style.display = 'none';
}

function initEmojiPicker() {
    const emojiGrid = document.getElementById('emoji-grid');
    const categories = document.querySelectorAll('.emoji-category');
    
    if (!emojiGrid || categories.length === 0) return;
    
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
    if (picker) picker.classList.toggle('active');
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    if (input) {
        input.value += emoji;
        input.focus();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
        
        const picker = document.getElementById('emoji-picker');
        if (picker) picker.classList.remove('active');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

function switchSection(sectionId) {
    currentSection = sectionId;
    
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeSection = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeSection) activeSection.classList.add('active');
    
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) {
        chatTitle.textContent = sectionId === 'main' ? 'Основной чат (S3)' : 'Новости (S3)';
    }
    
    loadMessages();
    toggleSidebar();
}

function switchView(viewId) {
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(view => view.classList.remove('active'));
    
    const targetView = document.getElementById(`${viewId}-view`);
    if (targetView) targetView.classList.add('active');
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeMenuItem = document.querySelector(`[data-view="${viewId}"]`);
    if (activeMenuItem) activeMenuItem.classList.add('active');
    
    toggleSidebar();
    
    if (viewId === 'users') {
        updateUsersList();
    } else if (viewId === 'profile') {
        updateProfile();
    }
}

function searchUsers(query) {
    updateUsersList(query);
}

function updateProfile() {
    const user = usersCache[currentUserId] || currentUser;
    
    const profileName = document.getElementById('profile-name');
    const profileId = document.getElementById('profile-id');
    const profileRole = document.getElementById('profile-role');
    const profileAvatar = document.getElementById('profile-avatar');
    
    if (profileName) profileName.textContent = user.first_name || 'Гость';
    if (profileId) profileId.textContent = user.id;
    if (profileRole) profileRole.textContent = 'участник';
    
    if (profileAvatar) {
        profileAvatar.style.backgroundColor = stringToColor(currentUserId);
        profileAvatar.innerHTML = `<span>${(user.first_name || 'G').charAt(0).toUpperCase()}</span>`;
    }
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

function showDebugInfo() {
    console.group('🔍 ДЕБАГ ИНФОРМАЦИЯ S3');
    console.log('👤 Текущий пользователь:', currentUser);
    console.log('☁️ Статус S3:', s3Status);
    console.log('👥 Пользователей в S3:', Object.keys(s3Data.users).length);
    console.log(`💬 Сообщений в S3 (${currentSection}):`, getAllMessages().length);
    console.log('📊 Данные загружены из S3:', {
        users: Object.keys(s3Data.users).length,
        messages_main: s3Data.messages_main.length,
        messages_news: s3Data.messages_news.length
    });
    console.groupEnd();
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Скопировано в буфер', 'success');
    });
};

window.exportS3Data = function() {
    const data = {
        users: s3Data.users,
        messages_main: s3Data.messages_main,
        messages_news: s3Data.messages_news,
        metadata: s3Data.metadata,
        timestamp: new Date().toISOString(),
        s3_status: s3Status,
        s3_config: {
            bucket: S3_CONFIG.bucket,
            endpoint: S3_CONFIG.endpoint
        }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telegram_chat_s3_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Данные из S3 экспортированы', 'success');
};

window.clearS3TestData = function() {
    if (confirm('Очистить тестовые данные из S3? Это удалит сообщения, но сохранит пользователей.')) {
        s3Data.messages_main = [];
        s3Data.messages_news = [];
        
        saveMessagesToS3().then(() => {
            showNotification('Тестовые данные очищены из S3', 'success');
            setTimeout(() => location.reload(), 1000);
        });
    }
};

window.clearCache = function() {
    if (confirm('Очистить весь локальный кэш? Все локальные копии данных будут удалены.')) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('backup') || key.includes('local_') || key === 'telegram_chat_theme') {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        showNotification('Локальный кэш очищен', 'success');
        setTimeout(() => location.reload(), 1000);
    }
};

window.removeFilePreview = removeFilePreview;
window.clearAttachments = clearAttachments;

// ===== ЗАПУСК ПРИЛОЖЕНИЯ =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
