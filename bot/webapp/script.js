// telegram-chat.js - С ДОБАВЛЕННОЙ S3 ИНТЕГРАЦИЕЙ

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

// S3 Конфигурация
const S3_CONFIG = {
    endpoint: 'https://storage.yandexcloud.net',
    region: 'ru-central1',
    bucket: 'telegram-chat-media', // Укажите название вашего бакета
    accessKeyId: '7508531e4e684de2bc5d039c74c4441d',
    secretAccessKey: '9a9c1682a5b24/7019acafa4489060d61',
    maxFileSize: 50 * 1024 * 1024, // 50MB максимум
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        video: ['video/mp4', 'video/mov', 'video/avi', 'video/webm'],
        audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'],
        document: ['application/pdf', 'application/msword', 'text/plain']
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

// ===== S3 ФУНКЦИИ =====
function initS3Client() {
    try {
        // Проверяем наличие AWS SDK в глобальной области
        if (window.AWS) {
            window.S3 = new AWS.S3({
                endpoint: S3_CONFIG.endpoint,
                region: S3_CONFIG.region,
                credentials: {
                    accessKeyId: S3_CONFIG.accessKeyId,
                    secretAccessKey: S3_CONFIG.secretAccessKey
                },
                s3ForcePathStyle: true,
                signatureVersion: 'v4'
            });
            console.log('✅ S3 клиент инициализирован');
            return true;
        } else {
            console.warn('⚠️ AWS SDK не найден, загружаем...');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка инициализации S3:', error);
        return false;
    }
}

async function uploadToS3(file, fileType) {
    try {
        if (!window.S3) {
            if (!initS3Client()) {
                throw new Error('S3 клиент не доступен');
            }
        }

        // Проверка размера файла
        if (file.size > S3_CONFIG.maxFileSize) {
            throw new Error(`Файл слишком большой. Максимальный размер: ${S3_CONFIG.maxFileSize / 1024 / 1024}MB`);
        }

        // Проверка типа файла
        let category = getFileCategory(file.type);
        if (!category) {
            throw new Error('Тип файла не поддерживается');
        }

        // Генерируем уникальное имя файла
        const fileExt = file.name.split('.').pop();
        const fileName = `${category}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const params = {
            Bucket: S3_CONFIG.bucket,
            Key: fileName,
            Body: file,
            ContentType: file.type,
            ACL: 'public-read',
            Metadata: {
                'uploader-id': currentUserId,
                'uploader-name': currentUser.first_name || 'anonymous',
                'upload-date': new Date().toISOString(),
                'original-name': encodeURIComponent(file.name)
            }
        };

        showNotification(`Загрузка ${file.name}...`, 'info');
        
        const upload = window.S3.upload(params);
        
        upload.on('httpUploadProgress', (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            updateUploadProgress(percent);
        });

        const result = await upload.promise();
        
        console.log('✅ Файл загружен в S3:', result.Location);
        return {
            url: result.Location,
            key: fileName,
            type: category,
            name: file.name,
            size: file.size,
            mimeType: file.type
        };
        
    } catch (error) {
        console.error('❌ Ошибка загрузки в S3:', error);
        throw error;
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

function updateUploadProgress(percent) {
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-bar-text');
    
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    if (progressText) {
        progressText.textContent = `${percent}%`;
    }
}

function generateFilePreview(fileInfo) {
    const previewDiv = document.createElement('div');
    previewDiv.className = 'file-preview-item';
    
    let icon = 'fa-file';
    let previewContent = '';
    
    switch(fileInfo.type) {
        case 'image':
            icon = 'fa-image';
            previewContent = `<img src="${fileInfo.url}" alt="${fileInfo.name}" class="file-preview-image">`;
            break;
        case 'video':
            icon = 'fa-video';
            previewContent = `
                <video controls class="file-preview-video">
                    <source src="${fileInfo.url}" type="${fileInfo.mimeType}">
                </video>`;
            break;
        case 'audio':
            icon = 'fa-volume-up';
            previewContent = `
                <audio controls class="file-preview-audio">
                    <source src="${fileInfo.url}" type="${fileInfo.mimeType}">
                </audio>`;
            break;
        case 'document':
            icon = 'fa-file-pdf';
            previewContent = `<div class="document-preview">
                <i class="fas ${icon}"></i>
                <span>${fileInfo.name}</span>
            </div>`;
            break;
    }
    
    previewDiv.innerHTML = `
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
            <span class="file-status">✓ Загружено</span>
        </div>
    `;
    
    return previewDiv;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFilePreview(button) {
    const previewItem = button.closest('.file-preview-item');
    previewItem.remove();
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    // Загружаем AWS SDK динамически
    loadAWSSDK().then(() => {
        initS3Client();
    }).catch(err => {
        console.warn('⚠️ AWS SDK не загружен, файлы не будут работать:', err);
    });
    
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

async function loadAWSSDK() {
    return new Promise((resolve, reject) => {
        if (window.AWS) {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.1494.0.min.js';
        script.onload = () => {
            console.log('✅ AWS SDK загружен');
            resolve();
        };
        script.onerror = () => {
            console.error('❌ Не удалось загрузить AWS SDK');
            reject(new Error('AWS SDK load failed'));
        };
        document.head.appendChild(script);
    });
}

// ===== ФАЙЛЫ И ВЛОЖЕНИЯ (ОБНОВЛЕННЫЕ) =====
function toggleAttachMenu() {
    document.getElementById('attach-menu').classList.toggle('active');
}

function attachFile(type) {
    toggleAttachMenu();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = getAcceptString(type);
    input.multiple = false;
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        await handleFileUpload(file, type);
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

async function handleFileUpload(file, type) {
    try {
        showUploadProgress(true);
        
        const fileInfo = await uploadToS3(file, type);
        
        // Показываем превью
        showFilePreview(fileInfo);
        
        showNotification(`${type === 'photo' ? 'Фото' : type === 'video' ? 'Видео' : 'Файл'} загружен`, 'success');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки файла:', error);
        showNotification(`Ошибка загрузки: ${error.message}`, 'error');
    } finally {
        showUploadProgress(false);
    }
}

function showUploadProgress(show) {
    const progress = document.getElementById('upload-progress');
    if (show) {
        progress.classList.add('active');
        updateUploadProgress(0);
    } else {
        setTimeout(() => {
            progress.classList.remove('active');
            updateUploadProgress(0);
        }, 500);
    }
}

function showFilePreview(fileInfo) {
    const previewContainer = document.getElementById('file-preview-container');
    const preview = generateFilePreview(fileInfo);
    
    // Сохраняем информацию о файле
    preview.dataset.fileInfo = JSON.stringify(fileInfo);
    
    previewContainer.appendChild(preview);
    document.getElementById('file-preview').classList.add('active');
}

// ===== СООБЩЕНИЯ (ОБНОВЛЕННЫЕ) =====
function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    // Проверяем есть ли прикрепленные файлы
    const filePreviews = document.querySelectorAll('.file-preview-item');
    const files = [];
    
    filePreviews.forEach(preview => {
        try {
            const fileInfo = JSON.parse(preview.dataset.fileInfo);
            files.push(fileInfo);
        } catch (e) {
            console.error('Ошибка парсинга fileInfo:', e);
        }
    });
    
    if (!text && files.length === 0) return;
    
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
        message_type: files.length > 0 ? 'file' : 'text',
        content: text,
        timestamp: Date.now(),
        read: false,
        section: currentSection,
        files: files.length > 0 ? files : undefined,
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
    
    // Очищаем поле и удаляем превью файлов
    input.value = '';
    input.focus();
    clearFilePreviews();
    
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

function clearFilePreviews() {
    document.getElementById('file-preview-container').innerHTML = '';
    document.getElementById('file-preview').classList.remove('active');
}

// ===== СОЗДАНИЕ СООБЩЕНИЙ (ОБНОВЛЕННОЕ) =====
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
            </div>
        `;
    }
    
    return div;
}

function createFileElement(fileInfo) {
    let icon = 'fa-file';
    let preview = '';
    let player = '';
    
    switch(fileInfo.type) {
        case 'image':
            icon = 'fa-image';
            preview = `<img src="${fileInfo.url}" alt="${fileInfo.name}" class="message-file-image" onclick="openFilePreview('${fileInfo.url}', 'image')">`;
            break;
        case 'video':
            icon = 'fa-video';
            player = `
                <div class="message-file-video">
                    <video controls>
                        <source src="${fileInfo.url}" type="${fileInfo.mimeType}">
                    </video>
                </div>`;
            break;
        case 'audio':
            icon = 'fa-volume-up';
            player = `
                <div class="message-file-audio">
                    <audio controls>
                        <source src="${fileInfo.url}" type="${fileInfo.mimeType}">
                    </audio>
                </div>`;
            break;
        case 'document':
            icon = 'fa-file-pdf';
            preview = `<a href="${fileInfo.url}" target="_blank" class="message-file-document">
                <i class="fas ${icon}"></i>
                <span>${fileInfo.name}</span>
            </a>`;
            break;
    }
    
    return `
        <div class="message-file">
            <div class="message-file-header">
                <i class="fas ${icon}"></i>
                <span class="message-file-name">${fileInfo.name}</span>
                <span class="message-file-size">${formatFileSize(fileInfo.size)}</span>
                <button class="btn-download-file" onclick="downloadFile('${fileInfo.url}', '${fileInfo.name}')">
                    <i class="fas fa-download"></i>
                </button>
            </div>
            ${preview || player}
        </div>`;
}

// ===== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ФАЙЛОВ =====
function openFilePreview(url, type) {
    const modal = document.createElement('div');
    modal.className = 'file-preview-modal';
    modal.innerHTML = `
        <div class="file-preview-modal-content">
            <button class="btn-close-modal" onclick="closeFilePreview()">&times;</button>
            ${type === 'image' ? 
                `<img src="${url}" alt="Preview" class="modal-image">` : 
                type === 'video' ?
                `<video controls autoplay class="modal-video">
                    <source src="${url}">
                </video>` :
                `<div class="modal-document">
                    <i class="fas fa-file"></i>
                    <p>Файл: ${url.split('/').pop()}</p>
                    <a href="${url}" target="_blank" class="btn-download">Скачать</a>
                </div>`}
            <div class="modal-actions">
                <button class="btn-download" onclick="downloadFile('${url}', '${url.split('/').pop()}')">
                    <i class="fas fa-download"></i> Скачать
                </button>
                <button class="btn-copy-link" onclick="copyToClipboard('${url}')">
                    <i class="fas fa-link"></i> Копировать ссылку
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeFilePreview() {
    const modal = document.querySelector('.file-preview-modal');
    if (modal) {
        modal.remove();
    }
}

function downloadFile(url, fileName) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Ссылка скопирована', 'success');
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showNotification('Не удалось скопировать', 'error');
    });
}

// ===== ОБНОВЛЕННЫЕ ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
window.attachFile = attachFile;
window.openFilePreview = openFilePreview;
window.closeFilePreview = closeFilePreview;
window.downloadFile = downloadFile;
window.copyToClipboard = copyToClipboard;
window.removeFilePreview = removeFilePreview;

// Добавляем CSS для новых элементов
function addFileStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .message-file {
            margin: 10px 0;
            border-radius: 10px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            overflow: hidden;
        }
        
        .message-file-header {
            display: flex;
            align-items: center;
            padding: 10px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-color);
        }
        
        .message-file-header i {
            margin-right: 10px;
            color: var(--primary-color);
        }
        
        .message-file-name {
            flex: 1;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .message-file-size {
            margin: 0 10px;
            color: var(--text-secondary);
            font-size: 12px;
        }
        
        .btn-download-file {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 5px;
        }
        
        .btn-download-file:hover {
            color: var(--primary-color);
        }
        
        .message-file-image {
            width: 100%;
            max-height: 300px;
            object-fit: contain;
            cursor: pointer;
        }
        
        .message-file-video video,
        .message-file-audio audio {
            width: 100%;
            max-height: 300px;
        }
        
        .message-file-document {
            display: flex;
            align-items: center;
            padding: 15px;
            color: var(--text-primary);
            text-decoration: none;
        }
        
        .message-file-document i {
            font-size: 24px;
            margin-right: 10px;
            color: var(--primary-color);
        }
        
        .message-file-document:hover {
            background: var(--bg-hover);
        }
        
        .file-preview-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .file-preview-modal-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
        }
        
        .btn-close-modal {
            position: absolute;
            top: -40px;
            right: 0;
            background: none;
            border: none;
            color: white;
            font-size: 30px;
            cursor: pointer;
        }
        
        .modal-image,
        .modal-video {
            max-width: 100%;
            max-height: 80vh;
            border-radius: 10px;
        }
        
        .modal-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: center;
        }
        
        .btn-download,
        .btn-copy-link {
            padding: 10px 20px;
            border-radius: 5px;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .btn-download {
            background: var(--primary-color);
            color: white;
        }
        
        .btn-copy-link {
            background: var(--bg-secondary);
            color: var(--text-primary);
        }
        
        .file-preview-item {
            margin: 10px 0;
            border: 1px solid var(--border-color);
            border-radius: 10px;
            overflow: hidden;
        }
        
        .file-preview-header {
            display: flex;
            align-items: center;
            padding: 10px;
            background: var(--bg-tertiary);
        }
        
        .file-preview-content {
            padding: 10px;
        }
        
        .file-preview-footer {
            display: flex;
            justify-content: space-between;
            padding: 10px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
        }
        
        .btn-remove-file {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            margin-left: auto;
        }
        
        .btn-remove-file:hover {
            color: var(--error-color);
        }
    `;
    document.head.appendChild(style);
}

// Инициализация стилей при загрузке
document.addEventListener('DOMContentLoaded', addFileStyles);
