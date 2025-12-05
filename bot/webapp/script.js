// Telegram Chat App - Botfs23
// Полная синхронизация через S3 Selectel с Flask API
// ПОЛНАЯ ВЕРСИЯ СО ВСЕМИ ФУНКЦИЯМИ

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let tg = null;
let currentUserId = null;
let currentUser = null;
let currentSection = 'main';
let isAdmin = false;
let usersCache = {};
let attachedFiles = [];
let s3Status = 'Не проверено';
let lastUpdateTime = 0;
let isSyncing = false;
let syncInterval = null;
let selectedMessageId = null;
let replyMessageId = null;

let appData = {
    users: {},
    messages_main: [],
    messages_news: []
};

// API endpoints
const API_CONFIG = {
    baseUrl: window.location.origin,
    endpoints: {
        checkS3: '/api/s3/check',
        uploadFile: '/api/s3/proxy-upload',
        saveMessage: '/api/s3/save-message',
        getMessages: '/api/s3/get-messages',
        getUsers: '/api/s3/get-users',
        updateUser: '/api/s3/update-user',
        health: '/health',
        initDb: '/init-db'
    },
    maxFileSize: 10 * 1024 * 1024,
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        document: ['application/pdf', 'text/plain', 'application/msword', 
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    }
};

// Настройки запросов
const FETCH_CONFIG = {
    timeout: 10000,
    retries: 2,
    retryDelay: 1000
};

// Эмодзи
const EMOJI_CATEGORIES = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷'],
    objects: ['💡', '📱', '💻', '⌚️', '📷', '🎥', '📡', '💎', '🔑', '📦', '🎁', '📚', '✏️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💞', '💓', '💗', '💖'],
    people: ['👋', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '🦵', '🦶', '👂', '👃', '🧠'],
    food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🛴'],
    flags: ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏴‍☠️', '🇷🇺', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇯🇵', '🇨🇳', '🇰🇷']
};

// Реакции
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С API =====
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_CONFIG.timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Таймаут запроса');
        }
        throw error;
    }
}

async function fetchWithRetry(url, options = {}, retries = FETCH_CONFIG.retries) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fetchWithTimeout(url, options);
        } catch (error) {
            if (i === retries) throw error;
            console.log(`Повтор запроса ${i + 1}/${retries}...`);
            await new Promise(resolve => setTimeout(resolve, FETCH_CONFIG.retryDelay));
        }
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
async function initApp() {
    console.log('🚀 Инициализация приложения с полной синхронизацией...');
    
    try {
        updateLoadingProgress(5, 'Подключение к Telegram...');
        
        // Инициализация Telegram
        initTelegram();
        
        updateLoadingProgress(20, 'Настройка интерфейса...');
        
        // Настройка темы
        initTheme();
        
        // Инициализация UI
        initUI();
        
        updateLoadingProgress(40, 'Проверка S3 через API...');
        
        // Проверка S3 через API
        const s3Connected = await checkS3Connection();
        
        if (!s3Connected) {
            showNotification('S3 не доступен, используется локальный режим', 'warning');
        }
        
        updateLoadingProgress(60, 'Загрузка данных...');
        
        // Загрузка данных из S3 через API
        await loadAllDataFromS3();
        
        updateLoadingProgress(80, 'Обновление интерфейса...');
        
        // Обновление интерфейса
        updateUserInfo();
        
        // Загружаем пользователей
        await loadUsers();
        
        // Загружаем сообщения
        await loadMessages();
        
        // Запускаем синхронизацию
        startAutoSync();
        
        updateLoadingProgress(100, 'Готово!');
        
        // Небольшая задержка для плавного перехода
        await new Promise(resolve => setTimeout(resolve, 500));
        hideLoadingScreen();
        
        console.log('✅ Приложение инициализировано');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        updateLoadingProgress(50, `Ошибка: ${error.message}`);
        
        // Пробуем аварийный режим
        try {
            loadFromLocalStorage();
            updateLoadingProgress(80, 'Аварийный режим...');
            initUI();
            updateLoadingProgress(100, 'Готово (оффлайн)');
            
            setTimeout(hideLoadingScreen, 1000);
            showNotification('Работаем в оффлайн режиме', 'warning');
        } catch (fallbackError) {
            showErrorScreen(error);
        }
    }
}

function updateLoadingProgress(percent, text) {
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('loading-subtext');
    
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.style.transition = 'width 0.3s ease';
    }
    if (progressText) {
        progressText.textContent = text;
    }
}

function showErrorScreen(error) {
    const loadingScreen = document.getElementById('loading-screen');
    if (!loadingScreen) return;
    
    loadingScreen.innerHTML = `
        <div class="error-container">
            <i class="fas fa-exclamation-triangle"></i>
            <h2>Ошибка загрузки</h2>
            <p>${error.message || 'Не удалось загрузить приложение'}</p>
            <div style="margin-top: 20px;">
                <button onclick="retryLoading()" class="btn-primary" style="margin-bottom: 10px;">
                    <i class="fas fa-redo"></i> Попробовать снова
                </button>
                <button onclick="continueOffline()" class="btn-secondary">
                    <i class="fas fa-wifi-slash"></i> Продолжить оффлайн
                </button>
            </div>
        </div>
    `;
}

window.retryLoading = function() {
    location.reload();
};

window.continueOffline = function() {
    loadFromLocalStorage();
    initUI();
    hideLoadingScreen();
    showNotification('Оффлайн режим активирован', 'warning');
};

// ===== API ФУНКЦИИ =====
async function checkS3Connection() {
    console.log('🔌 Проверка подключения к S3 через API...');
    
    try {
        const response = await fetchWithTimeout(API_CONFIG.endpoints.checkS3, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.connected) {
                s3Status = '✅ Работает';
                updateS3Status('✅ Работает', 'success');
                console.log('✅ S3 подключение успешно');
                return true;
            } else {
                s3Status = `❌ ${data.message}`;
                updateS3Status(`❌ ${data.message}`, 'error');
                console.error('❌ Ошибка S3:', data.message);
                return false;
            }
        } else {
            s3Status = '❌ Ошибка API';
            updateS3Status('❌ Ошибка API', 'error');
            console.error('❌ Ошибка API:', response.status);
            return false;
        }
        
    } catch (error) {
        s3Status = '❌ Нет подключения';
        updateS3Status('❌ Нет подключения', 'error');
        console.error('❌ Ошибка подключения к API:', error);
        return false;
    }
}

async function loadAllDataFromS3() {
    console.log('📥 Загрузка всех данных через API...');
    
    try {
        // Загружаем пользователей
        const usersResponse = await fetchWithRetry(API_CONFIG.endpoints.getUsers);
        if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            if (usersData.status === 'success') {
                usersCache = usersData.users || {};
                appData.users = usersCache;
                console.log(`👥 Загружено ${Object.keys(usersCache).length} пользователей`);
            }
        }
        
        // Загружаем сообщения для текущей секции
        await loadMessagesFromS3(currentSection);
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        return false;
    }
}

function loadFromLocalStorage() {
    console.log('📦 Загрузка данных из локального хранилища...');
    
    try {
        // Пользователи
        const localUsers = localStorage.getItem('local_users_backup');
        if (localUsers) {
            usersCache = JSON.parse(localUsers);
            appData.users = usersCache;
            console.log(`👥 Локальные пользователи: ${Object.keys(usersCache).length}`);
        }
        
        // Сообщения
        const localMessages = localStorage.getItem(`local_messages_${currentSection}_backup`);
        if (localMessages) {
            if (currentSection === 'main') {
                appData.messages_main = JSON.parse(localMessages);
            } else {
                appData.messages_news = JSON.parse(localMessages);
            }
            console.log(`📨 Локальные сообщения: ${JSON.parse(localMessages).length}`);
        }
        
        // Обновляем UI
        updateUsersList();
        updateMessagesDisplay();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки из localStorage:', error);
    }
}

async function loadMessagesFromS3(section = 'main') {
    try {
        const response = await fetchWithRetry(`${API_CONFIG.endpoints.getMessages}?section=${section}&since=${lastUpdateTime}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const messages = data.messages || [];
                
                // Обновляем сообщения
                if (section === 'main') {
                    appData.messages_main = messages;
                } else {
                    appData.messages_news = messages;
                }
                
                lastUpdateTime = data.lastUpdate || Date.now();
                
                console.log(`📨 Загружено ${messages.length} сообщений из ${section}`);
                
                // Обновляем отображение
                if (currentSection === section) {
                    updateMessagesDisplay();
                }
                
                return true;
            }
        }
        return false;
        
    } catch (error) {
        console.error(`❌ Ошибка загрузки сообщений из ${section}:`, error);
        return false;
    }
}

async function uploadFileToS3(file, type) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', currentUserId);
        formData.append('user_name', currentUser.first_name || 'User');
        formData.append('type', type);
        
        console.log(`📤 Загрузка файла через API: ${file.name}`);
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_CONFIG.endpoints.uploadFile, true);
        xhr.timeout = 30000;
        
        xhr.onload = function() {
            try {
                const response = JSON.parse(xhr.responseText);
                
                if (xhr.status === 200 && response.status === 'success') {
                    console.log('✅ Файл загружен успешно через API');
                    
                    const fileInfo = {
                        id: response.file_id || `file_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
                        url: response.file_url,
                        s3_key: response.s3_key,
                        name: file.name,
                        type: type,
                        size: file.size,
                        mimeType: file.type,
                        uploadedBy: currentUserId,
                        uploadedAt: Date.now(),
                        uploadedByName: currentUser.first_name || 'Неизвестно',
                        isLocal: false
                    };
                    
                    resolve(fileInfo);
                } else {
                    console.error('❌ Ошибка API:', response.message);
                    reject(new Error(response.message || 'API error'));
                }
            } catch (parseError) {
                console.error('❌ Ошибка парсинга ответа:', parseError);
                reject(new Error('Invalid response from server'));
            }
        };
        
        xhr.onerror = function() {
            console.error('❌ Ошибка сети');
            reject(new Error('Network error'));
        };
        
        xhr.ontimeout = function() {
            console.error('❌ Таймаут загрузки файла');
            reject(new Error('Upload timeout'));
        };
        
        xhr.send(formData);
    });
}

async function saveMessageToS3(message) {
    try {
        const response = await fetchWithRetry(API_CONFIG.endpoints.saveMessage, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...message,
                section: currentSection
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                console.log('✅ Сообщение сохранено в S3 через API');
                
                // Обновляем время последнего обновления
                if (data.lastUpdate) {
                    lastUpdateTime = data.lastUpdate;
                }
                
                return data.message_id || message.id;
            } else {
                console.error('❌ Ошибка API при сохранении:', data.message);
                return null;
            }
        } else {
            console.error('❌ Ошибка HTTP при сохранении:', response.status);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщения:', error);
        return null;
    }
}

async function updateUserOnlineStatus() {
    try {
        const response = await fetchWithRetry(API_CONFIG.endpoints.updateUser, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: currentUserId,
                user_data: {
                    ...currentUser,
                    is_online: true,
                    last_seen: Date.now(),
                    last_active: new Date().toISOString()
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.status === 'success';
        }
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка обновления статуса пользователя:', error);
        return false;
    }
}

// ===== СИНХРОНИЗАЦИЯ ДАННЫХ =====
function startAutoSync() {
    // Синхронизация каждые 10 секунд
    syncInterval = setInterval(async () => {
        if (isSyncing) return;
        
        isSyncing = true;
        
        try {
            // Обновляем статус пользователя
            await updateUserOnlineStatus();
            
            // Загружаем новые сообщения
            await loadMessagesFromS3(currentSection);
            
            // Загружаем обновленных пользователей
            await syncUsers();
            
            // Обновляем счетчики онлайн
            updateOnlineCount();
            
        } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
        } finally {
            isSyncing = false;
        }
    }, 10000);
}

async function syncUsers() {
    try {
        const response = await fetchWithTimeout(API_CONFIG.endpoints.getUsers);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                // Обновляем пользователей
                const newUsers = data.users || {};
                
                // Объединяем с локальным кэшем
                usersCache = { ...usersCache, ...newUsers };
                appData.users = usersCache;
                
                // Обновляем отображение списка пользователей
                updateUsersList();
            }
        }
    } catch (error) {
        console.error('❌ Ошибка синхронизации пользователей:', error);
    }
}

// ===== ОСНОВНЫЕ ФУНКЦИИ =====
async function loadUsers() {
    console.log('👥 Загрузка пользователей...');
    
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
            is_online: true,
            last_seen: Date.now(),
            last_active: new Date().toISOString(),
            updated_at: Date.now()
        };
        
        // Отправляем на сервер
        await updateUserOnlineStatus();
        
        console.log(`✅ Пользователь ${currentUser.first_name} добавлен`);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
    }
}

async function saveMessage(message) {
    try {
        // Сохраняем сообщение в S3 через API
        const messageId = await saveMessageToS3(message);
        
        if (messageId) {
            // Обновляем ID сообщения
            message.id = messageId;
            
            // Добавляем в локальный кэш для немедленного отображения
            if (currentSection === 'main') {
                appData.messages_main.push(message);
            } else {
                appData.messages_news.push(message);
            }
            
            // Обновляем отображение
            updateMessagesDisplay();
            
            // Сохраняем backup
            saveBackupToLocalStorage();
            
            return true;
        } else {
            // Fallback: сохраняем локально
            return await saveMessageLocally(message);
        }
        
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщения:', error);
        return await saveMessageLocally(message);
    }
}

async function saveMessageLocally(message) {
    try {
        const key = `local_message_${currentSection}_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(message));
        
        // Добавляем в локальный кэш
        if (currentSection === 'main') {
            appData.messages_main.push(message);
        } else {
            appData.messages_news.push(message);
        }
        
        // Добавляем в очередь для синхронизации при восстановлении связи
        const pendingKey = `pending_messages_${currentSection}`;
        let pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        pending.push(message);
        localStorage.setItem(pendingKey, JSON.stringify(pending));
        
        // Сохраняем backup
        saveBackupToLocalStorage();
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка локального сохранения:', error);
        return false;
    }
}

function saveBackupToLocalStorage() {
    try {
        localStorage.setItem('local_users_backup', JSON.stringify(usersCache));
        localStorage.setItem(`local_messages_${currentSection}_backup`, 
            JSON.stringify(currentSection === 'main' ? appData.messages_main : appData.messages_news));
    } catch (error) {
        console.warn('⚠️ Не удалось сохранить backup');
    }
}

function getAllMessages() {
    return currentSection === 'main' ? appData.messages_main : appData.messages_news;
}

function updateMessagesDisplay() {
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
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Добавляем все сообщения
    messages.forEach(msg => {
        const element = createMessageElement(msg);
        container.appendChild(element);
        
        // Добавляем обработчик клика для сообщения
        element.addEventListener('click', (e) => {
            if (!e.target.closest('.download-btn') && !e.target.closest('.message-reaction')) {
                showMessageActions(msg.id, e.clientX, e.clientY);
            }
        });
        
        // Добавляем обработчик долгого нажатия
        let pressTimer;
        element.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
                showMessageActions(msg.id, e.touches[0].clientX, e.touches[0].clientY);
            }, 500);
        });
        
        element.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        
        element.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });
    });
    
    // Прокручиваем вниз
    scrollToBottom();
}

function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    div.dataset.messageId = message.id;
    
    const user = usersCache[message.user_id] || message.user || {};
    const userName = user.first_name || 'User';
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let content = escapeHtml(message.content || '').replace(/\n/g, '<br>');
    content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
    
    // Файлы
    let filesHTML = '';
    if (message.files && message.files.length > 0) {
        filesHTML = message.files.map(file => {
            const isImage = file.type === 'photo' || 
                           (file.mimeType && file.mimeType.startsWith('image/')) ||
                           (file.url && file.url.match(/\.(jpg|jpeg|png|gif|webp)$/i));
            
            if (isImage) {
                return `
                    <div class="message-file">
                        <div class="message-file-header">
                            <i class="fas fa-image"></i>
                            <span class="message-file-name">${escapeHtml(file.name || 'Изображение')}</span>
                            <a href="${file.url}" target="_blank" class="download-btn" title="Открыть">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                        <img src="${file.url}" alt="${escapeHtml(file.name || 'Изображение')}" class="message-file-image" loading="lazy"
                             onclick="showImagePreview('${file.url}', '${escapeHtml(file.name || 'Изображение')}')">
                    </div>
                `;
            } else {
                return `
                    <div class="message-file">
                        <div class="message-file-header">
                            <i class="fas fa-file"></i>
                            <span class="message-file-name">${escapeHtml(file.name || 'Документ')}</span>
                            <a href="${file.url}" target="_blank" class="download-btn" title="Открыть">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                `;
            }
        }).join('');
    }
    
    // Реакции
    let reactionsHTML = '';
    if (message.reactions && message.reactions.length > 0) {
        reactionsHTML = `
            <div class="message-reactions">
                ${message.reactions.map(reaction => `
                    <div class="reaction ${reaction.users && reaction.users.includes(currentUserId) ? 'user-reacted' : ''}"
                         onclick="toggleReaction('${message.id}', '${reaction.emoji}')">
                        <span class="reaction-emoji">${reaction.emoji}</span>
                        <span class="reaction-count">${reaction.count || 1}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Ответ на сообщение
    let replyHTML = '';
    if (message.reply_to) {
        const repliedMessage = getAllMessages().find(m => m.id === message.reply_to);
        if (repliedMessage) {
            const repliedUser = usersCache[repliedMessage.user_id] || repliedMessage.user || {};
            replyHTML = `
                <div class="message-reply">
                    <div class="reply-line"></div>
                    <div class="reply-content">
                        <div class="reply-sender">${repliedUser.first_name || 'User'}</div>
                        <div class="reply-text">${escapeHtml(repliedMessage.content || '').substring(0, 50)}${repliedMessage.content && repliedMessage.content.length > 50 ? '...' : ''}</div>
                    </div>
                </div>
            `;
        }
    }
    
    div.innerHTML = `
        ${!isOutgoing ? `
            <div class="message-avatar" style="background-color: ${stringToColor(user.id || 'default')}">
                ${userName.charAt(0).toUpperCase()}
            </div>
        ` : ''}
        <div class="message-content">
            ${!isOutgoing ? `
                <div class="message-header">
                    <div class="message-sender">${userName}</div>
                    <div class="message-time">${time}</div>
                </div>
            ` : ''}
            ${replyHTML}
            ${filesHTML}
            ${content ? `<div class="message-text">${content}</div>` : ''}
            ${reactionsHTML}
            ${isOutgoing ? `
                <div class="message-status">
                    <div class="message-time">${time}</div>
                    ${message.status === 'sent' ? '<i class="fas fa-check"></i>' : ''}
                    ${message.status === 'read' ? '<i class="fas fa-check-double"></i>' : ''}
                    ${!message.status ? '<i class="fas fa-clock"></i>' : ''}
                </div>
            ` : ''}
        </div>
        ${!isOutgoing ? `
            <div class="message-reaction-btn" onclick="showReactionPicker('${message.id}', event)">
                <i class="far fa-smile"></i>
            </div>
        ` : ''}
    `;
    
    return div;
}

async function loadMessages() {
    // Просто обновляем отображение
    updateMessagesDisplay();
}

async function uploadFile(file, type) {
    try {
        const allowedTypes = [...API_CONFIG.allowedTypes.image, ...API_CONFIG.allowedTypes.document];
        
        if (!allowedTypes.includes(file.type)) {
            throw new Error(`Тип файла ${file.type} не поддерживается`);
        }
        
        if (file.size > API_CONFIG.maxFileSize) {
            throw new Error(`Файл слишком большой. Максимум: ${API_CONFIG.maxFileSize / 1024 / 1024}MB`);
        }
        
        console.log(`📤 Начало загрузки файла: ${file.name}`);
        
        const fileInfo = await uploadFileToS3(file, type);
        
        showNotification('Файл загружен в облако', 'success');
        return fileInfo;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки файла:', error);
        showNotification('Ошибка загрузки файла в облако', 'error');
        
        // Fallback на локальное хранилище
        return await uploadFileLocally(file, type);
    }
}

async function uploadFileLocally(file, type) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const fileInfo = {
                id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                url: e.target.result,
                name: file.name,
                type: type,
                size: file.size,
                mimeType: file.type,
                uploadedBy: currentUserId,
                uploadedAt: Date.now(),
                uploadedByName: currentUser.first_name || 'Неизвестно',
                isLocal: true
            };
            
            resolve(fileInfo);
        };
        
        reader.readAsDataURL(file);
    });
}

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
            is_online: true,
            last_seen: Date.now()
        },
        content: text,
        timestamp: Date.now(),
        section: currentSection,
        files: [...attachedFiles],
        reply_to: replyMessageId || null
    };
    
    const saved = await saveMessage(message);
    
    if (saved) {
        // Очищаем форму
        input.value = '';
        input.style.height = 'auto';
        clearAttachments();
        cancelReply();
        
        // Прокручиваем вниз
        scrollToBottom();
        
        // Обновляем статус пользователя
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].last_seen = Date.now();
        }
        
        showNotification('Сообщение отправлено', 'success');
        
        console.log(`📤 Сообщение отправлено: ${text.substring(0, 50)}...`);
    } else {
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// ===== UI ФУНКЦИИ =====
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
                
                // Проверяем администратора
                if (tg.initDataUnsafe.user && tg.initDataUnsafe.user.id === 123456789) {
                    isAdmin = true;
                    document.getElementById('admin-section').style.display = 'block';
                }
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
    
    // Кнопки заголовка
    const btnUsers = document.getElementById('btn-users');
    const btnAdmin = document.getElementById('btn-admin');
    const btnMentionAll = document.getElementById('btn-mention-all');
    const btnJump = document.getElementById('btn-jump');
    
    if (btnUsers) btnUsers.addEventListener('click', () => switchView('users'));
    if (btnAdmin) btnAdmin.addEventListener('click', () => switchView('admin'));
    if (btnMentionAll) btnMentionAll.addEventListener('click', mentionAllOnline);
    if (btnJump) btnJump.addEventListener('click', scrollToBottom);
    
    // Поиск
    const btnSearch = document.getElementById('btn-search');
    const searchBar = document.getElementById('search-bar');
    const btnCloseSearch = document.getElementById('btn-close-search');
    
    if (btnSearch) {
        btnSearch.addEventListener('click', () => {
            searchBar.style.display = searchBar.style.display === 'none' ? 'flex' : 'none';
            if (searchBar.style.display === 'flex') {
                document.getElementById('search-input').focus();
            }
        });
    }
    
    if (btnCloseSearch) {
        btnCloseSearch.addEventListener('click', () => {
            searchBar.style.display = 'none';
            document.getElementById('search-input').value = '';
        });
    }
    
    // Ввод сообщения
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    if (messageInput && sendButton) {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (sendButton) {
                sendButton.disabled = this.value.trim() === '' && attachedFiles.length === 0;
            }
        });
        
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        if (sendButton) {
            sendButton.addEventListener('click', sendMessage);
        }
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
    
    // Голосовые сообщения
    const btnVoice = document.getElementById('btn-voice');
    const voiceRecorder = document.getElementById('voice-recorder');
    let isRecording = false;
    let recordingTimer = null;
    let recordingStartTime = null;
    
    if (btnVoice) {
        btnVoice.addEventListener('mousedown', startRecording);
        btnVoice.addEventListener('touchstart', startRecording);
        btnVoice.addEventListener('mouseup', stopRecording);
        btnVoice.addEventListener('touchend', stopRecording);
        
        document.getElementById('btn-cancel-recording')?.addEventListener('click', cancelRecording);
        document.getElementById('btn-send-voice')?.addEventListener('click', sendVoiceMessage);
    }
    
    function startRecording(e) {
        e.preventDefault();
        if (isRecording) return;
        
        isRecording = true;
        recordingStartTime = Date.now();
        voiceRecorder.style.display = 'block';
        
        // Обновляем таймер
        recordingTimer = setInterval(() => {
            const elapsed = Date.now() - recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            document.getElementById('recording-timer').textContent = 
                `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    function stopRecording() {
        if (!isRecording) return;
        isRecording = false;
        
        if (recordingTimer) {
            clearInterval(recordingTimer);
        }
        
        // Если запись длилась больше 1 секунды, показываем меню
        if (Date.now() - recordingStartTime > 1000) {
            // Оставляем запись открытой для подтверждения
        } else {
            cancelRecording();
        }
    }
    
    function cancelRecording() {
        isRecording = false;
        voiceRecorder.style.display = 'none';
        if (recordingTimer) {
            clearInterval(recordingTimer);
        }
    }
    
    async function sendVoiceMessage() {
        // В реальном приложении здесь была бы загрузка аудио
        showNotification('Голосовое сообщение отправлено', 'success');
        voiceRecorder.style.display = 'none';
        if (recordingTimer) {
            clearInterval(recordingTimer);
        }
    }
    
    // Поиск пользователей
    const searchInput = document.getElementById('users-search-input');
    const btnCloseUsersSearch = document.getElementById('btn-close-users-search');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            updateUsersList(this.value);
        });
    }
    
    if (btnCloseUsersSearch) {
        btnCloseUsersSearch.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            updateUsersList('');
        });
    }
    
    // Настройки
    const themeToggle = document.getElementById('theme-toggle');
    const btnClearCache = document.getElementById('btn-clear-cache');
    
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);
    if (btnClearCache) btnClearCache.addEventListener('click', clearCache);
    
    // Закрытие меню при клике вне
    document.addEventListener('click', closeMenus);
    
    // Модальные окна
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.dataset.modal;
            closeModal(modalId);
        });
    });
    
    document.querySelectorAll('.btn-modal-secondary').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.dataset.modal;
            closeModal(modalId);
        });
    });
    
    // Создание канала
    document.getElementById('btn-create-channel')?.addEventListener('click', createChannel);
    
    // Кнопка добавления роли
    document.getElementById('btn-add-role')?.addEventListener('click', addRole);
}

function updateUsersList(filter = '') {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
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
            <div class="user-item-avatar" style="background-color: ${stringToColor(user.id || 'default')}">
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
    if (userRole) userRole.textContent = isAdmin ? 'администратор' : 'участник';
    
    if (userAvatar && currentUser.first_name) {
        userAvatar.style.backgroundColor = stringToColor(currentUserId);
        userAvatar.textContent = currentUser.first_name.charAt(0).toUpperCase();
        const icon = document.getElementById('user-avatar-icon');
        if (icon) icon.style.display = 'none';
    }
}

function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
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
            <button class="btn-remove-file" onclick="removeFilePreview(this)">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="file-preview-content">
            ${previewContent}
        </div>
        <div class="file-preview-footer">
            <span class="file-size">${formatFileSize(fileInfo.size)}</span>
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
    if (picker) picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    if (input) {
        input.value += emoji;
        input.focus();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
        
        const picker = document.getElementById('emoji-picker');
        if (picker) picker.style.display = 'none';
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
        chatTitle.textContent = sectionId === 'main' ? 'Основной чат' : 'Новости';
    }
    
    // Загружаем сообщения для новой секции
    loadMessagesFromS3(sectionId);
    toggleSidebar();
}

function switchView(viewId) {
    // Скрываем все контейнеры
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });
    
    // Показываем выбранный
    const targetView = document.getElementById(`${viewId}-view`);
    if (targetView) {
        targetView.style.display = 'block';
        targetView.classList.add('active');
    }
    
    // Обновляем меню
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
    } else if (viewId === 'admin') {
        loadAdminData();
    }
}

function updateProfile() {
    const user = usersCache[currentUserId] || currentUser;
    
    const profileName = document.getElementById('profile-name');
    const profileId = document.getElementById('profile-id');
    const profileRole = document.getElementById('profile-role');
    const profileAvatar = document.getElementById('profile-avatar');
    
    if (profileName) profileName.textContent = user.first_name || 'Гость';
    if (profileId) profileId.textContent = user.id;
    if (profileRole) profileRole.textContent = isAdmin ? 'администратор' : 'участник';
    
    if (profileAvatar) {
        profileAvatar.style.backgroundColor = stringToColor(currentUserId);
        profileAvatar.innerHTML = `<span>${(user.first_name || 'G').charAt(0).toUpperCase()}</span>`;
    }
}

function loadAdminData() {
    // Загрузка статистики
    const statsElement = document.getElementById('admin-stats');
    if (statsElement) {
        statsElement.innerHTML = `
            <div class="stat-item">
                <i class="fas fa-users"></i>
                <div class="stat-value">${Object.keys(usersCache).length}</div>
                <div class="stat-label">Пользователей</div>
            </div>
            <div class="stat-item">
                <i class="fas fa-comments"></i>
                <div class="stat-value">${appData.messages_main.length + appData.messages_news.length}</div>
                <div class="stat-label">Сообщений</div>
            </div>
            <div class="stat-item">
                <i class="fas fa-wifi"></i>
                <div class="stat-value">${Object.values(usersCache).filter(u => u.is_online).length}</div>
                <div class="stat-label">Онлайн</div>
            </div>
            <div class="stat-item">
                <i class="fas fa-database"></i>
                <div class="stat-value">${s3Status.includes('✅') ? 'Online' : 'Offline'}</div>
                <div class="stat-label">Хранилище</div>
            </div>
        `;
    }
}

function closeMenus(e) {
    const attachMenu = document.getElementById('attach-menu');
    const btnAttach = document.getElementById('btn-attach');
    
    if (attachMenu && btnAttach) {
        if (!attachMenu.contains(e.target) && !btnAttach.contains(e.target)) {
            attachMenu.style.display = 'none';
        }
    }
    
    const emojiPicker = document.getElementById('emoji-picker');
    const btnEmoji = document.getElementById('btn-emoji');
    
    if (emojiPicker && btnEmoji) {
        if (!emojiPicker.contains(e.target) && !btnEmoji.contains(e.target)) {
            emojiPicker.style.display = 'none';
        }
    }
    
    const messageActionsMenu = document.getElementById('message-actions-menu');
    if (messageActionsMenu && !messageActionsMenu.contains(e.target)) {
        messageActionsMenu.style.display = 'none';
    }
    
    const reactionPicker = document.getElementById('reaction-picker');
    if (reactionPicker && !reactionPicker.contains(e.target)) {
        reactionPicker.style.display = 'none';
    }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С СООБЩЕНИЯМИ =====
function showMessageActions(messageId, x, y) {
    selectedMessageId = messageId;
    const menu = document.getElementById('message-actions-menu');
    if (!menu) return;
    
    // Позиционируем меню
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'flex';
    
    // Добавляем обработчики для пунктов меню
    document.querySelectorAll('.action-item').forEach(item => {
        item.onclick = function() {
            const action = this.dataset.action;
            handleMessageAction(action, messageId);
            menu.style.display = 'none';
        };
    });
}

function handleMessageAction(action, messageId) {
    const message = getAllMessages().find(m => m.id === messageId);
    if (!message) return;
    
    switch (action) {
        case 'reply':
            setReplyToMessage(messageId);
            break;
        case 'edit':
            editMessage(messageId);
            break;
        case 'forward':
            showForwardMenu(messageId);
            break;
        case 'pin':
            pinMessage(messageId);
            break;
        case 'copy':
            copyMessageText(messageId);
            break;
        case 'delete':
            deleteMessage(messageId);
            break;
    }
}

function setReplyToMessage(messageId) {
    const message = getAllMessages().find(m => m.id === messageId);
    if (!message) return;
    
    replyMessageId = messageId;
    const user = usersCache[message.user_id] || message.user || {};
    
    const replyPreview = document.getElementById('reply-preview');
    const replySender = document.getElementById('reply-sender');
    const replyText = document.getElementById('reply-text');
    
    if (replyPreview && replySender && replyText) {
        replySender.textContent = user.first_name || 'User';
        replyText.textContent = message.content ? 
            (message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content) : 
            'Вложение';
        replyPreview.style.display = 'flex';
    }
    
    showNotification('Ответ на сообщение установлен', 'info');
}

function cancelReply() {
    replyMessageId = null;
    const replyPreview = document.getElementById('reply-preview');
    if (replyPreview) {
        replyPreview.style.display = 'none';
    }
}

function editMessage(messageId) {
    const message = getAllMessages().find(m => m.id === messageId);
    if (!message || message.user_id != currentUserId) return;
    
    const input = document.getElementById('message-input');
    if (input) {
        input.value = message.content || '';
        input.focus();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
        
        // В реальном приложении здесь была бы логика редактирования
        showNotification('Редактирование сообщения', 'info');
    }
}

function showForwardMenu(messageId) {
    selectedMessageId = messageId;
    const forwardMenu = document.getElementById('forward-menu');
    if (forwardMenu) {
        forwardMenu.style.display = 'flex';
        
        // Загрузка каналов для пересылки
        loadChannelsForForward();
    }
}

function loadChannelsForForward() {
    const channelsList = document.getElementById('channels-list');
    if (!channelsList) return;
    
    channelsList.innerHTML = `
        <div class="channel-forward-item" onclick="forwardToChannel('main')">
            <div class="channel-forward-icon">
                <i class="fas fa-hashtag"></i>
            </div>
            <div class="channel-forward-info">
                <div class="channel-forward-name">Основной чат</div>
                <div class="channel-forward-members">${Object.keys(usersCache).length} участников</div>
            </div>
        </div>
        <div class="channel-forward-item" onclick="forwardToChannel('news')">
            <div class="channel-forward-icon">
                <i class="fas fa-newspaper"></i>
            </div>
            <div class="channel-forward-info">
                <div class="channel-forward-name">Новости</div>
                <div class="channel-forward-members">Все участники</div>
            </div>
        </div>
    `;
}

function forwardToChannel(channel) {
    const message = getAllMessages().find(m => m.id === selectedMessageId);
    if (!message) return;
    
    // В реальном приложении здесь была бы пересылка сообщения
    showNotification(`Сообщение переслано в ${channel === 'main' ? 'основной чат' : 'новости'}`, 'success');
    
    const forwardMenu = document.getElementById('forward-menu');
    if (forwardMenu) {
        forwardMenu.style.display = 'none';
    }
}

function pinMessage(messageId) {
    const message = getAllMessages().find(m => m.id === messageId);
    if (!message) return;
    
    // В реальном приложении здесь было бы закрепление
    showNotification('Сообщение закреплено', 'success');
}

function copyMessageText(messageId) {
    const message = getAllMessages().find(m => m.id === messageId);
    if (!message) return;
    
    navigator.clipboard.writeText(message.content || '').then(() => {
        showNotification('Текст скопирован в буфер', 'success');
    });
}

function deleteMessage(messageId) {
    if (!confirm('Удалить это сообщение?')) return;
    
    const messages = getAllMessages();
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
        messages.splice(index, 1);
        updateMessagesDisplay();
        showNotification('Сообщение удалено', 'success');
    }
}

function showReactionPicker(messageId, event) {
    selectedMessageId = messageId;
    const picker = document.getElementById('reaction-picker');
    if (!picker) return;
    
    // Позиционируем picker
    const rect = event.target.getBoundingClientRect();
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.top - 60}px`;
    picker.style.display = 'flex';
    
    // Добавляем обработчики реакций
    document.querySelectorAll('.reaction-option').forEach(option => {
        option.onclick = function() {
            const reaction = this.dataset.reaction;
            addReaction(messageId, reaction);
            picker.style.display = 'none';
        };
    });
}

function addReaction(messageId, reaction) {
    const messages = getAllMessages();
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    if (!message.reactions) {
        message.reactions = [];
    }
    
    // Проверяем, есть ли уже такая реакция от пользователя
    const existingReaction = message.reactions.find(r => r.emoji === reaction);
    if (existingReaction) {
        if (existingReaction.users && existingReaction.users.includes(currentUserId)) {
            // Убираем реакцию
            existingReaction.count--;
            if (existingReaction.users) {
                const userIndex = existingReaction.users.indexOf(currentUserId);
                if (userIndex > -1) {
                    existingReaction.users.splice(userIndex, 1);
                }
            }
            if (existingReaction.count <= 0) {
                message.reactions = message.reactions.filter(r => r.emoji !== reaction);
            }
        } else {
            // Добавляем реакцию
            existingReaction.count++;
            if (existingReaction.users) {
                existingReaction.users.push(currentUserId);
            }
        }
    } else {
        // Новая реакция
        message.reactions.push({
            emoji: reaction,
            count: 1,
            users: [currentUserId]
        });
    }
    
    updateMessagesDisplay();
}

function toggleReaction(messageId, reaction) {
    addReaction(messageId, reaction);
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ИЗОБРАЖЕНИЯМИ =====
window.showImagePreview = function(url, title) {
    const modal = document.getElementById('image-preview-modal');
    const image = document.getElementById('preview-image');
    
    if (modal && image) {
        image.src = url;
        image.alt = title;
        modal.style.display = 'flex';
        
        // Добавляем обработчики для кнопок
        document.getElementById('btn-download-image')?.addEventListener('click', () => downloadImage(url, title));
        document.getElementById('btn-share-image')?.addEventListener('click', () => shareImage(url, title));
    }
};

function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function shareImage(url, title) {
    if (navigator.share) {
        navigator.share({
            title: title || 'Изображение из чата',
            url: url
        });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showNotification('Ссылка скопирована в буфер', 'success');
        });
    }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С МОДАЛЬНЫМИ ОКНАМИ =====
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function createChannel() {
    const nameInput = document.getElementById('channel-name');
    const descriptionInput = document.getElementById('channel-description');
    const typeSelect = document.getElementById('channel-type');
    
    if (!nameInput || !nameInput.value.trim()) {
        showNotification('Введите название канала', 'error');
        return;
    }
    
    const channel = {
        id: 'channel_' + Date.now(),
        name: nameInput.value.trim(),
        description: descriptionInput ? descriptionInput.value.trim() : '',
        type: typeSelect ? typeSelect.value : 'public',
        created_at: Date.now(),
        created_by: currentUserId,
        members: [currentUserId]
    };
    
    // В реальном приложении здесь было бы сохранение канала
    showNotification(`Канал "${channel.name}" создан`, 'success');
    
    // Очищаем форму
    nameInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    
    // Закрываем модальное окно
    closeModal('create-channel-modal');
}

function addRole() {
    // В реальном приложении здесь было бы добавление роли
    showNotification('Функция добавления роли в разработке', 'info');
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Скопировано в буфер', 'success');
    });
};

window.exportS3Data = function() {
    const data = {
        users: appData.users,
        messages_main: appData.messages_main,
        messages_news: appData.messages_news,
        timestamp: new Date().toISOString(),
        s3_status: s3Status,
        api_config: API_CONFIG
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

window.clearCache = function() {
    if (confirm('Очистить весь локальный кэш? Все неотправленные сообщения будут потеряны.')) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('backup') || key.includes('local_') || key.includes('pending_') || key === 'telegram_chat_theme') {
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

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }
    
    if (app) {
        app.style.display = 'flex';
        setTimeout(() => {
            app.classList.add('active');
        }, 50);
    }
}

// ===== ЗАПУСК ПРИЛОЖЕНИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    // Устанавливаем высоту для мобильных устройств
    function setVh() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    
    // Запускаем приложение
    setTimeout(initApp, 100);
});

if (document.readyState === 'complete') {
    setTimeout(initApp, 100);
}
