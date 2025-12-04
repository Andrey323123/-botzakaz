// telegram-chat.js - С ИСПРАВЛЕННОЙ ИНТЕГРАЦИЕЙ SELECTEL

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
let S3Client = null;

// Selectel S3 Конфигурация (Selectel Cloud Storage совместимый с S3)
const S3_CONFIG = {
    endpoint: 'https://s3.storage.selcloud.ru',
    region: 'ru-1',
    bucket: 'telegram-chat-media',
    accessKeyId: '7508531e4e684de2bc5d039c74c4441d',
    secretAccessKey: '9a9c1682a5b247019acafa4489060d61',
    maxFileSize: 50 * 1024 * 1024,
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        video: ['video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/x-matroska'],
        audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a'],
        document: ['application/pdf', 'application/msword', 
                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                   'text/plain', 'application/vnd.ms-excel',
                   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    }
};

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

// Эмодзи для реакций
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '👏'];

// ===== ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP =====
function initTelegramWebApp() {
    try {
        // Проверяем, находимся ли мы в Telegram WebApp
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            
            // Расширяем на весь экран
            tg.expand();
            tg.enableClosingConfirmation();
            
            // Настраиваем тему Telegram
            tg.setHeaderColor('#3390ec');
            tg.setBackgroundColor('#ffffff');
            
            // Получаем данные пользователя
            const initData = tg.initDataUnsafe;
            if (initData && initData.user) {
                currentUser = initData.user;
                currentUserId = currentUser.id.toString();
                
                // Сохраняем язык пользователя
                if (initData.user.language_code) {
                    localStorage.setItem('user_language', initData.user.language_code);
                }
                
                console.log('👤 Telegram пользователь:', currentUser);
                
                // Показываем кнопку меню Telegram
                tg.MainButton.setText('Открыть меню');
                tg.MainButton.show();
                tg.MainButton.onClick(() => {
                    toggleSidebar();
                });
            } else {
                // Если нет данных пользователя, используем демо режим
                setupDemoMode();
            }
            
            // Настраиваем обработчики событий Telegram
            tg.onEvent('viewportChanged', (e) => {
                console.log('Viewport изменился:', e);
            });
            
            tg.onEvent('themeChanged', () => {
                updateTheme();
            });
            
            tg.onEvent('mainButtonClicked', () => {
                console.log('Main button clicked');
            });
            
            return true;
        } else {
            console.log('📱 Режим браузера (не в Telegram)');
            setupDemoMode();
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка инициализации Telegram WebApp:', error);
        setupDemoMode();
        return false;
    }
}

function setupDemoMode() {
    // Демо данные для режима браузера
    currentUser = {
        id: Math.floor(Math.random() * 1000000),
        first_name: 'Гость',
        last_name: 'Тестовый',
        username: 'guest_' + Math.floor(Math.random() * 1000),
        language_code: 'ru'
    };
    currentUserId = currentUser.id.toString();
    console.log('👤 Демо пользователь:', currentUser);
}

// ===== S3 ИНТЕГРАЦИЯ SELECTEL =====
async function initS3Client() {
    try {
        // Проверяем наличие AWS SDK
        if (typeof AWS === 'undefined') {
            console.warn('⚠️ AWS SDK не загружен');
            return false;
        }
        
        // Конфигурация для Selectel (S3 совместимое)
        AWS.config.update({
            accessKeyId: S3_CONFIG.accessKeyId,
            secretAccessKey: S3_CONFIG.secretAccessKey,
            region: S3_CONFIG.region,
            s3ForcePathStyle: true,
            signatureVersion: 'v4'
        });
        
        // Создаем S3 клиент с кастомным эндпоинтом
        S3Client = new AWS.S3({
            endpoint: new AWS.Endpoint(S3_CONFIG.endpoint),
            s3ForcePathStyle: true,
            signatureVersion: 'v4'
        });
        
        // Проверяем подключение
        await testS3Connection();
        
        console.log('✅ S3 клиент инициализирован (Selectel)');
        updateS3Status('Подключено ✓', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка инициализации S3:', error);
        updateS3Status('Ошибка подключения', 'error');
        return false;
    }
}

async function testS3Connection() {
    try {
        // Пробуем получить список бакетов
        const data = await S3Client.listBuckets().promise();
        console.log('📦 Доступные бакеты:', data.Buckets);
        
        // Проверяем существование нашего бакета
        const bucketExists = data.Buckets.some(bucket => bucket.Name === S3_CONFIG.bucket);
        
        if (!bucketExists) {
            console.warn(`⚠️ Бакет "${S3_CONFIG.bucket}" не найден`);
            updateS3Status('Бакет не найден', 'warning');
        } else {
            console.log(`✅ Бакет "${S3_CONFIG.bucket}" найден`);
        }
        
        return bucketExists;
    } catch (error) {
        console.error('❌ Ошибка проверки S3:', error);
        throw error;
    }
}

function updateS3Status(text, type = 'info') {
    const statusElement = document.getElementById('s3-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `settings-status ${type}`;
    }
}

async function uploadToS3(file, category) {
    return new Promise((resolve, reject) => {
        if (!S3Client) {
            reject(new Error('S3 клиент не инициализирован'));
            return;
        }
        
        // Проверка размера файла
        if (file.size > S3_CONFIG.maxFileSize) {
            reject(new Error(`Файл слишком большой. Максимум: ${S3_CONFIG.maxFileSize / 1024 / 1024}MB`));
            return;
        }
        
        // Проверка типа файла
        const mimeType = file.type;
        const allowedTypes = S3_CONFIG.allowedTypes[category];
        if (!allowedTypes || !allowedTypes.includes(mimeType)) {
            reject(new Error(`Тип файла ${mimeType} не поддерживается для ${category}`));
            return;
        }
        
        // Генерируем уникальное имя файла
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${category}/${timestamp}_${randomId}_${safeFileName}`;
        
        // Параметры загрузки
        const params = {
            Bucket: S3_CONFIG.bucket,
            Key: fileName,
            Body: file,
            ContentType: mimeType,
            ACL: 'public-read',
            Metadata: {
                'uploader-id': currentUserId,
                'uploader-name': encodeURIComponent(currentUser.first_name || 'Anonymous'),
                'original-filename': encodeURIComponent(file.name),
                'upload-timestamp': timestamp.toString()
            }
        };
        
        console.log(`📤 Загрузка файла: ${file.name} (${formatFileSize(file.size)})`);
        
        // Показываем прогресс
        showUploadProgress(true);
        
        // Загружаем файл
        S3Client.upload(params)
            .on('httpUploadProgress', (progress) => {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                updateUploadProgress(percent);
            })
            .send((err, data) => {
                showUploadProgress(false);
                
                if (err) {
                    console.error('❌ Ошибка загрузки в S3:', err);
                    reject(new Error(`Ошибка загрузки: ${err.message}`));
                    return;
                }
                
                console.log('✅ Файл загружен:', data.Location);
                
                // Возвращаем информацию о файле
                resolve({
                    url: data.Location,
                    key: fileName,
                    type: category,
                    name: file.name,
                    size: file.size,
                    mimeType: mimeType,
                    uploadDate: timestamp
                });
            });
    });
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    // Инициализируем Telegram WebApp
    const isTelegram = initTelegramWebApp();
    
    // Обновляем текст загрузки
    updateLoadingText(isTelegram ? 'Подключение к Telegram...' : 'Загрузка приложения...');
    
    // Загружаем данные из localStorage
    loadDataFromStorage();
    
    // Проверяем роль пользователя
    checkUserRole();
    
    // Обновляем информацию о пользователе
    updateUserInfo();
    
    // Инициализируем S3 клиент
    updateLoadingText('Подключение к хранилищу...');
    await initS3Client();
    
    // Настраиваем UI
    updateLoadingText('Настройка интерфейса...');
    initializeUI();
    
    // Загружаем сообщения и пользователей
    displayCurrentSectionMessages();
    loadUsers();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Запускаем polling для обновлений
    startPolling();
    
    // Скрываем экран загрузки
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }
        
        console.log('✅ Приложение инициализировано');
        showNotification('Приложение готово к работе!', 'success');
        
        // Отправляем системное сообщение
        sendSystemMessage('Пользователь присоединился к чату');
        
    }, 500);
}

function updateLoadingText(text) {
    const loadingSubtext = document.getElementById('loading-subtext');
    if (loadingSubtext) {
        loadingSubtext.textContent = text;
    }
}

// ===== УПРАВЛЕНИЕ UI =====
function initializeUI() {
    // Настраиваем кнопки
    document.getElementById('btn-menu').addEventListener('click', toggleSidebar);
    document.getElementById('btn-close-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('overlay').addEventListener('click', toggleSidebar);
    
    document.getElementById('btn-users').addEventListener('click', showUsersList);
    document.getElementById('btn-admin').addEventListener('click', showAdminPanel);
    document.getElementById('btn-jump').addEventListener('click', scrollToUnread);
    document.getElementById('btn-mention-all').addEventListener('click', mentionAllOnline);
    
    // Настраиваем поле ввода
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        
        // Активируем кнопку отправки если есть текст
        const hasText = this.value.trim().length > 0;
        sendButton.disabled = !hasText;
    });
    
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Настраиваем кнопку отправки
    sendButton.addEventListener('click', sendMessage);
    
    // Настраиваем кнопку прикрепления файлов
    document.getElementById('btn-attach').addEventListener('click', function(e) {
        e.stopPropagation();
        toggleAttachMenu();
    });
    
    // Закрываем меню прикрепления при клике вне его
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.attach-menu') && !e.target.closest('#btn-attach')) {
            document.getElementById('attach-menu').classList.remove('active');
        }
    });
    
    // Настраиваем поиск пользователей
    const searchInput = document.getElementById('users-search-input');
    searchInput.addEventListener('input', function() {
        searchUsers(this.value);
    });
    
    document.getElementById('btn-close-search').addEventListener('click', function() {
        searchInput.value = '';
        searchUsers('');
    });
    
    // Настраиваем тему
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);
    
    // Настраиваем высоту textarea при загрузке
    setTimeout(() => {
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight) + 'px';
    }, 100);
}

function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('active');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// ===== УПРАВЛЕНИЕ СООБЩЕНИЯМИ =====
function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    // Проверяем прикрепленные файлы
    const filePreviews = document.querySelectorAll('.file-preview-item');
    const files = [];
    
    filePreviews.forEach(preview => {
        try {
            const fileInfo = JSON.parse(preview.dataset.fileInfo);
            files.push(fileInfo);
        } catch (e) {
            console.error('Ошибка чтения информации о файле:', e);
        }
    });
    
    if (!text && files.length === 0) {
        showNotification('Введите сообщение или прикрепите файл', 'warning');
        return;
    }
    
    // Проверяем права на отправку
    const section = sections[currentSection];
    const userRole = userRoles[currentUserId] || 'user';
    const canWrite = checkWritePermission(userRole, section.write);
    
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
        message_type: files.length > 0 ? 'file' : 'text',
        content: text,
        timestamp: Date.now(),
        read: false,
        section: currentSection,
        files: files.length > 0 ? files : undefined,
        reactions: {},
        edited: false
    };
    
    // Сохраняем сообщение
    saveMessage(newMessage);
    
    // Добавляем сообщение в UI
    displayMessage(newMessage);
    
    // Очищаем поле ввода
    input.value = '';
    input.style.height = 'auto';
    input.focus();
    
    // Очищаем прикрепленные файлы
    clearAttachments();
    
    // Обновляем статистику пользователя
    updateUserMessageCount();
    
    // Прокручиваем к новому сообщению
    scrollToBottom();
    
    // Показываем уведомление
    showNotification('Сообщение отправлено', 'success');
    
    // Воспроизводим звук отправки
    playSound('send');
}

function sendMessageWithFiles() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    sendMessage();
}

function saveMessage(message) {
    // Сохраняем в localStorage
    if (!window.chatData) window.chatData = {};
    if (!window.chatData[message.section]) window.chatData[message.section] = [];
    
    window.chatData[message.section].push(message);
    localStorage.setItem('chatData', JSON.stringify(window.chatData));
    
    // Обновляем lastMessageId
    localStorage.setItem('lastMessageId', lastMessageId.toString());
}

function displayMessage(message) {
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    // Убираем пустое состояние
    if (emptyChat && emptyChat.style.display !== 'none') {
        emptyChat.style.display = 'none';
    }
    
    // Создаем элемент сообщения
    const messageElement = createMessageElement(message);
    container.appendChild(messageElement);
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
                    <span>${escapeHtml(message.content)}</span>
                    <div class="message-time">${formatTime(message.timestamp)}</div>
                </div>
            </div>
        `;
    } else {
        div.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        const user = usersCache[message.user_id] || message.user;
        const userName = user.first_name || 'User';
        const userRole = user.role || userRoles[user.user_id] || 'user';
        const time = formatTime(message.timestamp);
        
        let content = message.content || '';
        content = escapeHtml(content).replace(/\n/g, '<br>');
        
        // Обработка ссылок и упоминаний
        content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
        content = content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        
        // Создаем HTML для файлов
        let filesHTML = '';
        if (message.files && message.files.length > 0) {
            filesHTML = message.files.map(file => createFileElement(file)).join('');
        }
        
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
                ${filesHTML}
                ${content ? `<div class="message-text">${content}</div>` : ''}
                ${isOutgoing ? `
                    <div class="message-status">
                        <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                        <div class="message-time">${time}</div>
                    </div>
                ` : ''}
                ${Object.keys(message.reactions || {}).length > 0 ? `
                    <div class="message-reactions">
                        ${Object.entries(message.reactions).map(([emoji, users]) => `
                            <span class="reaction ${users.includes(currentUserId) ? 'user-reacted' : ''}" 
                                  onclick="toggleReaction(${message.id}, '${emoji}')">
                                ${emoji} <span class="reaction-count">${users.length}</span>
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    return div;
}

function createFileElement(fileInfo) {
    let icon = 'fa-file';
    let content = '';
    
    switch(fileInfo.type) {
        case 'image':
            icon = 'fa-image';
            content = `
                <div class="message-media">
                    <img src="${fileInfo.url}" alt="${fileInfo.name}" 
                         onclick="openFilePreview('${fileInfo.url}', 'image')">
                </div>`;
            break;
        case 'video':
            icon = 'fa-video';
            content = `
                <div class="message-media">
                    <video controls>
                        <source src="${fileInfo.url}" type="${fileInfo.mimeType}">
                    </video>
                </div>`;
            break;
        case 'audio':
            icon = 'fa-volume-up';
            content = `
                <div class="message-file-audio">
                    <audio controls>
                        <source src="${fileInfo.url}" type="${fileInfo.mimeType}">
                    </audio>
                </div>`;
            break;
        case 'document':
            icon = 'fa-file-pdf';
            content = `
                <div class="message-document">
                    <i class="fas ${icon}"></i>
                    <div class="document-info">
                        <div class="document-name">${fileInfo.name}</div>
                        <div class="document-size">${formatFileSize(fileInfo.size)}</div>
                    </div>
                    <button class="download-btn" onclick="downloadFile('${fileInfo.url}', '${fileInfo.name}')">
                        <i class="fas fa-download"></i>
                    </button>
                </div>`;
            break;
    }
    
    return content;
}

// ===== УПРАВЛЕНИЕ ФАЙЛАМИ =====
function attachFile(type) {
    toggleAttachMenu();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = getAcceptString(type);
    input.multiple = false;
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // Определяем категорию файла
            const category = getFileCategory(file.type);
            if (!category) {
                throw new Error('Тип файла не поддерживается');
            }
            
            // Загружаем файл в S3
            const fileInfo = await uploadToS3(file, category);
            
            // Показываем превью файла
            showFilePreview(fileInfo);
            
        } catch (error) {
            console.error('❌ Ошибка прикрепления файла:', error);
            showNotification(error.message, 'error');
        }
    };
    
    input.click();
}

function getAcceptString(type) {
    switch(type) {
        case 'photo':
            return S3_CONFIG.allowedTypes.image.join(',');
        case 'video':
            return S3_CONFIG.allowedTypes.video.join(',');
        case 'voice':
            return S3_CONFIG.allowedTypes.audio.join(',');
        case 'document':
            return S3_CONFIG.allowedTypes.document.join(',');
        default:
            return '*/*';
    }
}

function getFileCategory(mimeType) {
    for (const [category, types] of Object.entries(S3_CONFIG.allowedTypes)) {
        if (types.includes(mimeType)) {
            return category;
        }
    }
    return null;
}

function showFilePreview(fileInfo) {
    const previewContainer = document.getElementById('file-preview-container');
    const previewDiv = document.createElement('div');
    previewDiv.className = 'file-preview-item';
    
    let icon = 'fa-file';
    switch(fileInfo.type) {
        case 'image': icon = 'fa-image'; break;
        case 'video': icon = 'fa-video'; break;
        case 'audio': icon = 'fa-volume-up'; break;
        case 'document': icon = 'fa-file-pdf'; break;
    }
    
    previewDiv.innerHTML = `
        <div class="file-preview-content">
            <i class="fas ${icon} file-preview-icon"></i>
            <div class="file-preview-info">
                <div class="file-preview-name">${fileInfo.name}</div>
                <div class="file-preview-size">${formatFileSize(fileInfo.size)}</div>
            </div>
            <button class="btn-remove-file" onclick="removeFilePreview(this)">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    previewDiv.dataset.fileInfo = JSON.stringify(fileInfo);
    previewContainer.appendChild(previewDiv);
    
    // Показываем контейнер превью
    document.getElementById('file-preview').style.display = 'block';
}

function removeFilePreview(button) {
    const previewItem = button.closest('.file-preview-item');
    previewItem.remove();
    
    // Скрываем контейнер превью если файлов больше нет
    const previewContainer = document.getElementById('file-preview-container');
    if (previewContainer.children.length === 0) {
        document.getElementById('file-preview').style.display = 'none';
    }
}

function clearAttachments() {
    document.getElementById('file-preview-container').innerHTML = '';
    document.getElementById('file-preview').style.display = 'none';
}

// ===== ПОЛЬЗОВАТЕЛИ И РОЛИ =====
function loadUsers() {
    // Загружаем пользователей из localStorage
    const savedUsers = localStorage.getItem('users');
    if (savedUsers) {
        try {
            usersCache = JSON.parse(savedUsers);
        } catch (e) {
            console.error('Ошибка загрузки пользователей:', e);
            usersCache = {};
        }
    }
    
    // Добавляем текущего пользователя если его нет
    if (!usersCache[currentUserId]) {
        usersCache[currentUserId] = {
            ...currentUser,
            role: 'user',
            join_date: Date.now(),
            message_count: 0,
            is_online: true,
            last_seen: Date.now()
        };
        saveUsersToStorage();
    } else {
        // Обновляем статус онлайн
        usersCache[currentUserId].is_online = true;
        usersCache[currentUserId].last_seen = Date.now();
        saveUsersToStorage();
    }
    
    // Обновляем список пользователей в UI
    updateUsersList();
    updateOnlineCount();
}

function updateUsersList(filter = '') {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    // Сортируем пользователей: онлайн сначала, потом по имени
    const sortedUsers = Object.values(usersCache).sort((a, b) => {
        if (a.is_online !== b.is_online) return b.is_online - a.is_online;
        return (a.first_name || '').localeCompare(b.first_name || '');
    });
    
    // Фильтруем пользователей
    const filteredUsers = sortedUsers.filter(user => {
        const searchTerm = filter.toLowerCase();
        return (
            (user.first_name && user.first_name.toLowerCase().includes(searchTerm)) ||
            (user.last_name && user.last_name.toLowerCase().includes(searchTerm)) ||
            (user.username && user.username.toLowerCase().includes(searchTerm))
        );
    });
    
    // Группируем по статусу
    const onlineUsers = filteredUsers.filter(u => u.is_online);
    const offlineUsers = filteredUsers.filter(u => !u.is_online);
    
    // Отображаем онлайн пользователей
    if (onlineUsers.length > 0) {
        const onlineHeader = document.createElement('div');
        onlineHeader.className = 'users-header-title';
        onlineHeader.innerHTML = `<i class="fas fa-circle online-dot"></i> В сети (${onlineUsers.length})`;
        usersList.appendChild(onlineHeader);
        
        onlineUsers.forEach(user => {
            usersList.appendChild(createUserListItem(user));
        });
    }
    
    // Отображаем офлайн пользователей
    if (offlineUsers.length > 0) {
        const offlineHeader = document.createElement('div');
        offlineHeader.className = 'users-header-title';
        offlineHeader.innerHTML = `<i class="fas fa-clock"></i> Не в сети (${offlineUsers.length})`;
        usersList.appendChild(offlineHeader);
        
        offlineUsers.forEach(user => {
            usersList.appendChild(createUserListItem(user));
        });
    }
    
    // Если пользователей нет
    if (filteredUsers.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-chat';
        emptyState.innerHTML = `
            <i class="fas fa-user-slash"></i>
            <p>Пользователи не найдены</p>
            <small>${filter ? 'Попробуйте другой запрос' : 'Пригласите друзей в чат'}</small>
        `;
        usersList.appendChild(emptyState);
    }
}

function createUserListItem(user) {
    const div = document.createElement('div');
    div.className = 'user-item';
    
    const userName = user.first_name || 'User';
    const userRole = user.role || 'user';
    const statusText = user.is_online ? 'В сети' : `Был(а) ${formatTime(user.last_seen, true)}`;
    
    div.innerHTML = `
        <div class="user-item-avatar" style="background-color: ${stringToColor(user.id)}">
            ${userName.charAt(0).toUpperCase()}
        </div>
        <div class="user-item-info">
            <div class="user-item-name">
                ${userName}
                ${userRole !== 'user' ? `<span class="user-role-badge ${userRole}">${getRoleText(userRole)}</span>` : ''}
                ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
            </div>
            <div class="user-item-status ${user.is_online ? 'online' : ''}">
                ${statusText}
            </div>
        </div>
    `;
    
    div.addEventListener('click', () => {
        showUserProfile(user);
    });
    
    return div;
}

function checkUserRole() {
    // Проверяем роль пользователя в localStorage
    const savedRoles = localStorage.getItem('userRoles');
    if (savedRoles) {
        try {
            userRoles = JSON.parse(savedRoles);
        } catch (e) {
            console.error('Ошибка загрузки ролей:', e);
            userRoles = {};
        }
    }
    
    // Устанавливаем роль по умолчанию
    if (!userRoles[currentUserId]) {
        userRoles[currentUserId] = 'user';
        saveRolesToStorage();
    }
    
    // Проверяем является ли пользователь админом
    const userRole = userRoles[currentUserId];
    isAdmin = ['admin', 'main_admin', 'moderator'].includes(userRole);
    isMainAdmin = userRole === 'main_admin';
    
    // Показываем/скрываем админ панель
    const adminBtn = document.getElementById('btn-admin');
    const adminMenuItem = document.getElementById('admin-menu-item');
    
    if (isAdmin) {
        if (adminBtn) adminBtn.style.display = 'flex';
        if (adminMenuItem) adminMenuItem.style.display = 'flex';
    }
}

function getRoleText(role) {
    const roles = {
        'main_admin': 'Главный админ',
        'admin': 'Администратор',
        'moderator': 'Модератор',
        'user': 'Участник'
    };
    return roles[role] || role;
}

function checkWritePermission(userRole, sectionPermission) {
    switch(sectionPermission) {
        case 'all':
            return true;
        case 'moderators':
            return ['moderator', 'admin', 'main_admin'].includes(userRole);
        case 'admins':
            return ['admin', 'main_admin'].includes(userRole);
        default:
            return false;
    }
}

// ===== УПРАВЛЕНИЕ РАЗДЕЛАМИ =====
function switchSection(sectionId) {
    // Проверяем доступ
    const section = sections[sectionId];
    const userRole = userRoles[currentUserId] || 'user';
    
    if (section.locked && !isAdmin) {
        showNotification('Этот раздел заблокирован', 'warning');
        return;
    }
    
    // Обновляем активный раздел
    currentSection = sectionId;
    
    // Обновляем UI
    updateSectionUI();
    
    // Загружаем сообщения раздела
    displayCurrentSectionMessages();
    
    // Закрываем сайдбар
    toggleSidebar();
    
    // Обновляем заголовок
    updateChatTitle(section.name);
}

function updateSectionUI() {
    // Обновляем активные элементы в сайдбаре
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Активируем текущий раздел
    const activeSection = document.querySelector(`.section-item[onclick*="${currentSection}"]`);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    // Активируем пункт "Чат" в меню
    const chatMenuItem = document.querySelector('.menu-item[onclick*="showChat"]');
    if (chatMenuItem) {
        chatMenuItem.classList.add('active');
    }
}

function displayCurrentSectionMessages() {
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Загружаем сообщения для текущего раздела
    if (window.chatData && window.chatData[currentSection]) {
        const messages = window.chatData[currentSection];
        
        if (messages.length === 0) {
            // Показываем пустое состояние
            if (emptyChat) {
                emptyChat.style.display = 'flex';
                container.appendChild(emptyChat);
            }
        } else {
            // Отображаем сообщения
            messages.forEach(message => {
                container.appendChild(createMessageElement(message));
            });
            
            // Прокручиваем к последнему сообщению
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    } else {
        // Показываем пустое состояние
        if (emptyChat) {
            emptyChat.style.display = 'flex';
            container.appendChild(emptyChat);
        }
    }
}

// ===== УПРАВЛЕНИЕ ВИДАМИ (VIEWS) =====
function showChat() {
    switchView('chat-view');
    updateSectionUI();
}

function showUsersList() {
    switchView('users-view');
    loadUsers();
}

function showAdminPanel() {
    if (!isAdmin) {
        showNotification('Доступ запрещен', 'error');
        return;
    }
    switchView('admin-view');
    loadAdminData();
}

function showSettings() {
    switchView('settings-view');
}

function showProfile() {
    switchView('profile-view');
    updateProfileInfo();
}

function switchView(viewId) {
    // Скрываем все виды
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(view => {
            view.classList.remove('active');
        });
    
    // Показываем выбранный вид
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }
    
    // Закрываем сайдбар
    toggleSidebar();
    
    // Обновляем активные пункты меню
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeMenuItem = document.querySelector(`.menu-item[onclick*="${viewId.replace('-view', '')}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
}

// ===== УПРАВЛЕНИЕ ТЕМОЙ =====
function toggleTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const isDark = themeToggle.checked;
    
    applyTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleThemeManual() {
    const currentTheme = localStorage.getItem('theme') || 'auto';
    let newTheme;
    
    if (currentTheme === 'dark') {
        newTheme = 'light';
    } else if (currentTheme === 'light') {
        newTheme = 'auto';
    } else {
        newTheme = 'dark';
    }
    
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Обновляем иконку
    updateThemeIcon(newTheme);
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
    
    // Обновляем переключатель
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.checked = isDark;
    }
    
    // Обновляем иконку
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    
    if (theme === 'dark') {
        icon.className = 'fas fa-sun';
    } else if (theme === 'light') {
        icon.className = 'fas fa-moon';
    } else {
        icon.className = 'fas fa-adjust';
    }
}

function updateTheme() {
    if (tg) {
        tg.setHeaderColor(tg.themeParams.bg_color || '#3390ec');
        tg.setBackgroundColor(tg.themeParams.bg_color || '#ffffff');
    }
}

// ===== УТИЛИТЫ =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp, relative = false) {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (relative) {
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} мин назад`;
        if (hours < 24) return `${hours} ч назад`;
        if (days < 7) return `${days} дн назад`;
    }
    
    return date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
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
    
    const colors = [
        '#3390ec', '#34c759', '#ff9500', '#5856d6', 
        '#ff3b30', '#5ac8fa', '#ff2d55', '#ffcc00'
    ];
    
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

function showUploadProgress(show) {
    const progress = document.getElementById('upload-progress');
    if (progress) {
        progress.style.display = show ? 'flex' : 'none';
    }
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function scrollToUnread() {
    // TODO: Реализовать прокрутку к непрочитанным сообщениям
    scrollToBottom();
}

function mentionAllOnline() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online);
    const mentions = onlineUsers.map(u => `@${u.username || u.first_name}`).join(' ');
    
    const input = document.getElementById('message-input');
    input.value = mentions + ' ' + (input.value || '');
    input.focus();
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
    
    showNotification('Упомянуты все онлайн пользователи', 'info');
}

// ===== УВЕДОМЛЕНИЯ И ЗВУКИ =====
function showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Показываем уведомление
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Скрываем через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
    
    // Воспроизводим звук
    playSound(type === 'error' ? 'error' : 'notification');
}

function playSound(type) {
    // Проверяем настройки звука
    const soundsEnabled = localStorage.getItem('sounds') !== 'false';
    if (!soundsEnabled) return;
    
    // Создаем звуковой элемент
    const audio = new Audio();
    
    // Базовые звуки (можно заменить на свои)
    const sounds = {
        'send': 'https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3',
        'notification': 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3',
        'error': 'https://assets.mixkit.co/sfx/preview/mixkit-warning-alarm-buzzer-895.mp3',
        'message': 'https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3'
    };
    
    if (sounds[type]) {
        audio.src = sounds[type];
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Не удалось воспроизвести звук:', e));
    }
}

// ===== LOCALSTORAGE УПРАВЛЕНИЕ =====
function loadDataFromStorage() {
    // Загружаем сообщения
    const savedChatData = localStorage.getItem('chatData');
    if (savedChatData) {
        try {
            window.chatData = JSON.parse(savedChatData);
        } catch (e) {
            console.error('Ошибка загрузки чата:', e);
            window.chatData = {};
        }
    } else {
        window.chatData = {};
    }
    
    // Загружаем lastMessageId
    const savedLastId = localStorage.getItem('lastMessageId');
    if (savedLastId) {
        lastMessageId = parseInt(savedLastId) || 0;
    }
    
    // Загружаем приглашения
    const savedInvites = localStorage.getItem('invites');
    if (savedInvites) {
        try {
            pendingInvites = JSON.parse(savedInvites);
        } catch (e) {
            console.error('Ошибка загрузки приглашений:', e);
            pendingInvites = [];
        }
    }
    
    // Загружаем настройки разделов
    const savedSections = localStorage.getItem('sections');
    if (savedSections) {
        try {
            const loadedSections = JSON.parse(savedSections);
            Object.assign(sections, loadedSections);
        } catch (e) {
            console.error('Ошибка загрузки разделов:', e);
        }
    }
}

function saveUsersToStorage() {
    localStorage.setItem('users', JSON.stringify(usersCache));
}

function saveRolesToStorage() {
    localStorage.setItem('userRoles', JSON.stringify(userRoles));
}

function saveInvitesToStorage() {
    localStorage.setItem('invites', JSON.stringify(pendingInvites));
}

function clearLocalStorage() {
    if (confirm('Вы уверены, что хотите очистить весь кэш приложения?')) {
        localStorage.clear();
        location.reload();
    }
}

// ===== СИСТЕМНЫЕ ФУНКЦИИ =====
function sendSystemMessage(text) {
    const message = {
        id: ++lastMessageId,
        user_id: 'system',
        message_type: 'text',
        content: text,
        timestamp: Date.now(),
        read: true,
        section: currentSection
    };
    
    saveMessage(message);
    displayMessage(message);
}

function updateUserInfo() {
    // Обновляем информацию в сайдбаре
    const userName = document.getElementById('user-name');
    const userRole = document.getElementById('user-role');
    const userAvatar = document.getElementById('user-avatar');
    const userAvatarIcon = document.getElementById('user-avatar-icon');
    
    if (userName) {
        userName.textContent = currentUser.first_name || 'Гость';
    }
    
    if (userRole) {
        const role = userRoles[currentUserId] || 'user';
        userRole.textContent = getRoleText(role);
    }
    
    if (userAvatar && currentUser.first_name) {
        userAvatar.style.backgroundColor = stringToColor(currentUserId);
        userAvatar.textContent = currentUser.first_name.charAt(0).toUpperCase();
        if (userAvatarIcon) userAvatarIcon.style.display = 'none';
    }
}

function updateProfileInfo() {
    const user = usersCache[currentUserId] || currentUser;
    
    document.getElementById('profile-name').textContent = user.first_name || 'Гость';
    document.getElementById('profile-username').textContent = user.username ? '@' + user.username : 'не установлен';
    document.getElementById('profile-id').textContent = user.id;
    document.getElementById('profile-role').textContent = getRoleText(user.role || 'user');
    document.getElementById('profile-messages').textContent = user.message_count || 0;
    document.getElementById('profile-online').textContent = user.is_online ? 'В сети' : formatTime(user.last_seen, true);
    
    // Аватар профиля
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
        profileAvatar.style.backgroundColor = stringToColor(currentUserId);
        profileAvatar.innerHTML = `<span>${(user.first_name || 'G').charAt(0).toUpperCase()}</span>`;
    }
}

function updateOnlineCount() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online).length;
    
    document.getElementById('online-count').textContent = onlineUsers;
    document.getElementById('sidebar-online-count').textContent = onlineUsers;
}

function updateChatTitle(title) {
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) {
        chatTitle.textContent = title || 'Botfs23 Chat';
    }
}

// ===== POLLING ДЛЯ ОБНОВЛЕНИЙ =====
function startPolling() {
    // Обновляем статус онлайн каждые 30 секунд
    setInterval(() => {
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].last_seen = Date.now();
            saveUsersToStorage();
        }
    }, 30000);
    
    // Проверяем новые сообщения каждые 10 секунд (для демо)
    setInterval(() => {
        // В реальном приложении здесь был бы запрос к серверу
        updateOnlineCount();
    }, 10000);
}

// ===== SETUP EVENT LISTENERS =====
function setupEventListeners() {
    // Закрытие меню прикрепления при клике вне
    document.addEventListener('click', (e) => {
        const attachMenu = document.getElementById('attach-menu');
        const btnAttach = document.getElementById('btn-attach');
        
        if (attachMenu && btnAttach) {
            if (!attachMenu.contains(e.target) && !btnAttach.contains(e.target)) {
                attachMenu.classList.remove('active');
            }
        }
    });
    
    // Обработка изменений темы системы
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'auto') {
            applyTheme('auto');
        }
    });
    
    // Сохраняем статус при закрытии
    window.addEventListener('beforeunload', () => {
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].is_online = false;
            usersCache[currentUserId].last_seen = Date.now();
            saveUsersToStorage();
        }
    });
    
    // Обработка PWA установки
    window.addEventListener('appinstalled', () => {
        showNotification('Приложение успешно установлено!', 'success');
    });
}

// ===== ПУБЛИЧНЫЕ ФУНКЦИИ ДЛЯ HTML =====
window.attachFile = attachFile;
window.toggleThemeManual = toggleThemeManual;
window.sendMessage = sendMessage;
window.sendMessageWithFiles = sendMessageWithFiles;
window.clearAttachments = clearAttachments;
window.removeFilePreview = removeFilePreview;
window.showChat = showChat;
window.showUsersList = showUsersList;
window.showAdminPanel = showAdminPanel;
window.showSettings = showSettings;
window.showProfile = showProfile;
window.switchSection = switchSection;
window.toggleTheme = toggleTheme;
window.clearLocalStorage = clearLocalStorage;
window.downloadFile = function(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};
window.openFilePreview = function(url, type) {
    // TODO: Реализовать превью файла
    window.open(url, '_blank');
};

// Запускаем приложение при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
