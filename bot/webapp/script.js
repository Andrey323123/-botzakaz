// Telegram Chat App - Botfs23
// Полная версия с исправленным S3 Selectel

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
    accessKeyId: '7508531e4e684de2bc5d039c74c4441d', // Ваш Access Key
    secretAccessKey: '9a9c1682a5b247019acafa4489060d61', // Ваш Secret Key
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        video: ['video/mp4', 'video/mov', 'video/avi', 'video/webm'],
        audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a'],
        document: ['application/pdf', 'text/plain', 
                   'application/msword',
                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                   'application/vnd.ms-excel',
                   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    }
};

// Разделы чата
const sections = {
    main: { name: 'Основной чат', write: 'all', color: '#3390ec' },
    news: { name: 'Новости', write: 'all', color: '#34c759' },
    rules: { name: 'Правила', write: 'admins', color: '#ff9500', locked: true },
    announcements: { name: 'Объявления', write: 'admins', color: '#ff3b30' }
};

// Эмодзи
const EMOJI_CATEGORIES = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺'],
    food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🥬', '🥒', '🌶', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍', '🛺', '✈️', '🚀', '🚁', '⛵️', '🚤', '🛥', '🚂', '🚊', '🚉', '🚇', '🚆', '🚄', '🚅'],
    objects: ['💡', '🔦', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🎥', '📸', '📹', '🎞', '📽', '💿', '📀', '📼', '📷', '🔍', '📡', '💎', '⌚️', '⏰', '📯', '📻', '🎙', '🎚', '🎛', '🧭'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️']
};

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    // Инициализация Telegram WebApp
    initTelegram();
    
    // Настройка темы
    initTheme();
    
    // Инициализация UI
    initUI();
    
    // Загрузка данных
    loadData();
    
    // Инициализация S3
    await initS3();
    
    // Обновление интерфейса
    updateUserInfo();
    loadMessages();
    loadUsers();
    
    console.log('✅ Приложение инициализировано');
}

// ===== S3 SELECTEL ИНИЦИАЛИЗАЦИЯ =====
async function initS3() {
    try {
        // Ждем загрузку AWS SDK
        if (typeof AWS === 'undefined') {
            console.log('⏳ Загружаю AWS SDK...');
            await loadAWSSDK();
        }
        
        // Конфигурация для Selectel
        const s3Config = {
            endpoint: S3_CONFIG.endpoint,
            region: S3_CONFIG.region,
            credentials: {
                accessKeyId: S3_CONFIG.accessKeyId,
                secretAccessKey: S3_CONFIG.secretAccessKey
            },
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
            sslEnabled: true,
            apiVersion: '2006-03-01',
            // Важно для Selectel
            maxRetries: 3,
            httpOptions: {
                timeout: 30000,
                connectTimeout: 5000
            }
        };
        
        console.log('🔧 Настраиваю S3 клиент для Selectel...', {
            endpoint: S3_CONFIG.endpoint,
            region: S3_CONFIG.region,
            bucket: S3_CONFIG.bucket
        });
        
        // Создаем клиент
        S3Client = new AWS.S3(s3Config);
        
        // Проверяем подключение
        await testS3Connection();
        
        console.log('✅ S3 клиент готов к работе');
        updateS3Status('Подключено ✓', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка инициализации S3:', error);
        updateS3Status('Ошибка подключения', 'error');
        return false;
    }
}

async function loadAWSSDK() {
    return new Promise((resolve, reject) => {
        if (typeof AWS !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.1494.0.min.js';
        script.onload = () => {
            console.log('✅ AWS SDK загружен');
            resolve();
        };
        script.onerror = (error) => {
            console.error('❌ Ошибка загрузки AWS SDK:', error);
            reject(error);
        };
        document.head.appendChild(script);
    });
}

async function testS3Connection() {
    try {
        console.log('🔍 Проверяю подключение к S3...');
        
        // Пробуем простой запрос - список бакетов
        const data = await S3Client.listBuckets().promise();
        console.log('📦 Доступные бакеты:', data.Buckets);
        
        // Проверяем существует ли наш бакет
        const bucketExists = data.Buckets.some(bucket => bucket.Name === S3_CONFIG.bucket);
        
        if (!bucketExists) {
            console.warn(`⚠️ Бакет "${S3_CONFIG.bucket}" не найден, создаю...`);
            try {
                await S3Client.createBucket({
                    Bucket: S3_CONFIG.bucket,
                    ACL: 'public-read'
                }).promise();
                console.log(`✅ Бакет "${S3_CONFIG.bucket}" создан`);
            } catch (createError) {
                console.error(`❌ Не удалось создать бакет:`, createError);
                throw new Error(`Бакет не найден и не может быть создан: ${createError.message}`);
            }
        } else {
            console.log(`✅ Бакет "${S3_CONFIG.bucket}" найден`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка подключения к S3:', error);
        throw error;
    }
}

function updateS3Status(text, type = 'info') {
    // Для демо просто логируем
    console.log(`S3 статус [${type}]: ${text}`);
}

// ===== ЗАГРУЗКА ФАЙЛОВ В S3 =====
async function uploadToS3(file, category) {
    return new Promise((resolve, reject) => {
        if (!S3Client) {
            reject(new Error('S3 клиент не инициализирован'));
            return;
        }
        
        // Проверка размера
        if (file.size > S3_CONFIG.maxFileSize) {
            reject(new Error(`Файл слишком большой. Максимум: ${S3_CONFIG.maxFileSize / 1024 / 1024}MB`));
            return;
        }
        
        // Проверка типа
        const mimeType = file.type;
        const allowedTypes = S3_CONFIG.allowedTypes[category];
        if (!allowedTypes || !allowedTypes.includes(mimeType)) {
            reject(new Error(`Тип файла "${mimeType}" не поддерживается для "${category}"`));
            return;
        }
        
        // Генерация имени файла
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
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
                'upload-date': new Date().toISOString()
            }
        };
        
        console.log(`📤 Загрузка файла: ${file.name} (${formatFileSize(file.size)})`);
        
        // Показываем прогресс
        showUploadProgress(true, `Загрузка ${file.name}...`);
        
        // Загружаем
        S3Client.upload(params)
            .on('httpUploadProgress', (progress) => {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                updateUploadProgress(percent);
            })
            .send((err, data) => {
                showUploadProgress(false);
                
                if (err) {
                    console.error('❌ Ошибка загрузки:', err);
                    reject(new Error(`Ошибка загрузки: ${err.message}`));
                    return;
                }
                
                console.log('✅ Файл загружен:', {
                    url: data.Location,
                    key: fileName,
                    size: file.size
                });
                
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

// ===== TELEGRAM INTEGRATION =====
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
            
            // Применяем тему Telegram
            applyTelegramTheme();
            
        } else {
            console.log('📱 Режим браузера');
            setupDemoUser();
        }
    } catch (error) {
        console.error('❌ Ошибка Telegram:', error);
        setupDemoUser();
    }
}

function applyTelegramTheme() {
    if (!tg) return;
    
    // Используем тему Telegram
    const themeParams = tg.themeParams || {};
    
    // Устанавливаем цвета из Telegram
    if (themeParams.bg_color) {
        document.documentElement.style.setProperty('--tg-background', themeParams.bg_color);
    }
    if (themeParams.text_color) {
        document.documentElement.style.setProperty('--tg-text-primary', themeParams.text_color);
    }
    if (themeParams.hint_color) {
        document.documentElement.style.setProperty('--tg-text-secondary', themeParams.hint_color);
    }
    if (themeParams.button_color) {
        document.documentElement.style.setProperty('--tg-primary', themeParams.button_color);
    }
    
    // Применяем темную/светлую тему
    if (tg.colorScheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    }
}

function setupDemoUser() {
    currentUser = {
        id: Math.floor(Math.random() * 1000000),
        first_name: 'Гость',
        last_name: 'Тестовый',
        username: 'guest_' + Math.random().toString(36).substring(7)
    };
    currentUserId = currentUser.id.toString();
}

// ===== THEME MANAGEMENT =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.checked = savedTheme === 'dark';
        themeToggle.addEventListener('change', toggleTheme);
    }
}

function toggleTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const isDark = themeToggle.checked;
    
    applyTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function applyTheme(theme) {
    // Если в Telegram, используем его тему
    if (tg) {
        applyTelegramTheme();
        return;
    }
    
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    }
}

// ===== UI INITIALIZATION =====
function initUI() {
    // Кнопка меню
    document.getElementById('btn-menu').addEventListener('click', toggleSidebar);
    document.getElementById('btn-close-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('overlay').addEventListener('click', toggleSidebar);
    
    // Навигация по разделам
    document.querySelectorAll('.section-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            if (section) switchSection(section);
        });
    });
    
    // Навигация по меню
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view) switchView(view);
        });
    });
    
    // Кнопки в заголовке
    document.getElementById('btn-users').addEventListener('click', () => switchView('users'));
    document.getElementById('btn-admin').addEventListener('click', () => switchView('admin'));
    document.getElementById('btn-mention-all').addEventListener('click', mentionAllOnline);
    document.getElementById('btn-jump').addEventListener('click', scrollToBottom);
    
    // Поле ввода сообщения
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
    
    // Кнопки для файлов
    document.getElementById('btn-cancel-files').addEventListener('click', clearAttachments);
    document.getElementById('btn-send-files').addEventListener('click', sendMessageWithFiles);
    
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
    
    // Админ панель
    document.getElementById('btn-create-invite').addEventListener('click', createInvite);
    
    // Настройки
    document.getElementById('btn-clear-cache').addEventListener('click', clearCache);
    
    // Закрытие меню при клике вне
    document.addEventListener('click', closeMenus);
    
    // Обработка изменения темы Telegram
    if (tg) {
        tg.onEvent('themeChanged', applyTelegramTheme);
        tg.onEvent('viewportChanged', () => {
            // Адаптация под изменение размера
            setTimeout(scrollToBottom, 100);
        });
    }
}

// ===== УПРАВЛЕНИЕ ФАЙЛАМИ =====
function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('active');
}

async function attachFile(type) {
    toggleAttachMenu();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = getAcceptString(type);
    input.multiple = false;
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            showUploadProgress(true, `Загрузка ${file.name}...`);
            
            // Определяем категорию
            const category = getFileCategory(file.type, type);
            
            // Загружаем в S3
            const fileInfo = await uploadToS3(file, category);
            
            // Добавляем в прикрепленные файлы
            attachedFiles.push(fileInfo);
            
            // Показываем превью
            showFilePreview(fileInfo);
            
            showNotification('Файл загружен и прикреплен', 'success');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки файла:', error);
            showNotification(error.message, 'error');
        } finally {
            showUploadProgress(false);
        }
    };
    
    input.click();
}

function getAcceptString(type) {
    switch(type) {
        case 'photo': return 'image/*';
        case 'video': return 'video/*';
        case 'audio': return 'audio/*';
        case 'document': return '.pdf,.txt,.doc,.docx,.xls,.xlsx';
        default: return '*/*';
    }
}

function getFileCategory(mimeType, requestedType) {
    // Если тип указан явно, используем его
    if (requestedType && S3_CONFIG.allowedTypes[requestedType]) {
        return requestedType;
    }
    
    // Определяем по mimeType
    for (const [category, types] of Object.entries(S3_CONFIG.allowedTypes)) {
        if (types.includes(mimeType)) {
            return category;
        }
    }
    
    // По умолчанию документ
    return 'document';
}

function showFilePreview(fileInfo) {
    const container = document.getElementById('file-preview-container');
    const preview = document.createElement('div');
    preview.className = 'file-preview-item';
    
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
        default:
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
            <span class="file-status">✓ Загружено</span>
        </div>
    `;
    
    container.appendChild(preview);
    
    // Показываем панель превью
    document.getElementById('file-preview').style.display = 'block';
}

function removeFilePreview(button) {
    const preview = button.closest('.file-preview-item');
    const fileName = preview.querySelector('.file-name').textContent;
    
    // Удаляем из массива прикрепленных файлов
    attachedFiles = attachedFiles.filter(file => file.name !== fileName);
    
    preview.remove();
    
    // Скрываем панель если файлов больше нет
    if (document.querySelectorAll('.file-preview-item').length === 0) {
        document.getElementById('file-preview').style.display = 'none';
    }
}

function clearAttachments() {
    attachedFiles = [];
    document.getElementById('file-preview-container').innerHTML = '';
    document.getElementById('file-preview').style.display = 'none';
}

// ===== EMOJI PICKER =====
function initEmojiPicker() {
    const emojiGrid = document.getElementById('emoji-grid');
    const categories = document.querySelectorAll('.emoji-category');
    
    // Загрузка эмодзи по категориям
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
    
    // Переключение категорий
    categories.forEach(category => {
        category.addEventListener('click', () => {
            categories.forEach(c => c.classList.remove('active'));
            category.classList.add('active');
            loadEmojis(category.dataset.category);
        });
    });
    
    // Загружаем первую категорию
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
    
    // Обновляем высоту
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
    
    // Закрываем пикер
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
    const section = sections[sectionId];
    if (!section) return;
    
    // Проверка доступа
    if (section.locked && !isAdmin) {
        showNotification('Этот раздел заблокирован', 'warning');
        return;
    }
    
    // Обновление UI
    currentSection = sectionId;
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    // Обновление заголовка
    document.getElementById('chat-title').textContent = section.name;
    
    // Загрузка сообщений
    loadMessages();
    
    // Закрытие сайдбара
    toggleSidebar();
}

// ===== VIEW MANAGEMENT =====
function switchView(viewId) {
    // Скрыть все виды
    document.querySelectorAll('.chat-container, .users-container, .admin-container, .settings-container, .profile-container')
        .forEach(view => view.classList.remove('active'));
    
    // Показать выбранный вид
    document.getElementById(`${viewId}-view`).classList.add('active');
    
    // Обновить меню
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
    
    // Закрыть сайдбар
    toggleSidebar();
    
    // Загрузить данные для вида
    switch(viewId) {
        case 'users':
            loadUsers();
            break;
        case 'admin':
            loadAdminData();
            break;
        case 'profile':
            updateProfile();
            break;
    }
}

// ===== MESSAGE MANAGEMENT =====
function loadMessages() {
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    container.innerHTML = '';
    
    // Загрузка из localStorage
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
            console.error('Ошибка загрузки сообщений:', e);
        }
    }
    
    // Пустой чат
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
    
    // Создание сообщения
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
    
    // Сохранение
    saveMessage(message);
    
    // Отображение
    const container = document.getElementById('messages-container');
    const emptyChat = document.getElementById('empty-chat');
    
    if (emptyChat.style.display !== 'none') {
        emptyChat.style.display = 'none';
    }
    
    container.appendChild(createMessageElement(message));
    
    // Очистка
    input.value = '';
    input.style.height = 'auto';
    clearAttachments();
    
    // Прокрутка
    scrollToBottom();
    
    // Уведомление
    showNotification('Сообщение отправлено', 'success');
    playSound('send');
}

function sendMessageWithFiles() {
    sendMessage();
}

function saveMessage(message) {
    const key = `messages_${currentSection}`;
    const savedMessages = localStorage.getItem(key);
    let messages = [];
    
    if (savedMessages) {
        try {
            messages = JSON.parse(savedMessages);
        } catch (e) {
            console.error('Ошибка сохранения:', e);
        }
    }
    
    messages.push(message);
    localStorage.setItem(key, JSON.stringify(messages));
    localStorage.setItem('lastMessageId', lastMessageId.toString());
    
    // Обновляем статистику пользователя
    updateUserMessageCount();
}

function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    const user = usersCache[message.user_id] || message.user;
    const userName = user.first_name || 'User';
    const userRole = user.role || 'user';
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let content = escapeHtml(message.content).replace(/\n/g, '<br>');
    content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
    content = content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    
    // Файлы
    let filesHTML = '';
    if (message.files && message.files.length > 0) {
        filesHTML = message.files.map(file => `
            <div class="message-file">
                <div class="message-file-header">
                    <i class="fas fa-${file.type === 'image' ? 'image' : file.type === 'video' ? 'video' : file.type === 'audio' ? 'volume-up' : 'file'}"></i>
                    <span class="message-file-name">${escapeHtml(file.name)}</span>
                    <a href="${file.url}" target="_blank" class="download-btn" title="Скачать">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
                ${file.type === 'image' ? `<img src="${file.url}" alt="${escapeHtml(file.name)}" class="message-file-image" onclick="openImagePreview('${file.url}')">` : 
                  file.type === 'video' ? `<video controls class="message-file-video"><source src="${file.url}" type="${file.mimeType}"></video>` :
                  file.type === 'audio' ? `<audio controls class="message-file-audio"><source src="${file.url}" type="${file.mimeType}"></audio>` :
                  `<div class="message-file-document">
                       <i class="fas fa-file"></i>
                       <span>${escapeHtml(file.name)}</span>
                   </div>`}
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
                        <span class="message-sender-role ${userRole}">${getRoleText(userRole)}</span>
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
    // Загрузка из localStorage
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
    
    // Сортировка: онлайн сначала
    const sortedUsers = Object.values(usersCache).sort((a, b) => {
        if (a.is_online !== b.is_online) return b.is_online - a.is_online;
        return (a.first_name || '').localeCompare(b.first_name || '');
    });
    
    // Фильтрация
    const filteredUsers = sortedUsers.filter(user => {
        if (!filter) return true;
        const searchTerm = filter.toLowerCase();
        return (
            (user.first_name && user.first_name.toLowerCase().includes(searchTerm)) ||
            (user.last_name && user.last_name.toLowerCase().includes(searchTerm)) ||
            (user.username && user.username.toLowerCase().includes(searchTerm))
        );
    });
    
    // Группировка по статусу
    const onlineUsers = filteredUsers.filter(u => u.is_online);
    const offlineUsers = filteredUsers.filter(u => !u.is_online);
    
    // Онлайн пользователи
    if (onlineUsers.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header-title';
        header.innerHTML = `<i class="fas fa-circle online-dot"></i> В сети (${onlineUsers.length})`;
        usersList.appendChild(header);
        
        onlineUsers.forEach(user => {
            usersList.appendChild(createUserListItem(user));
        });
    }
    
    // Офлайн пользователи
    if (offlineUsers.length > 0) {
        const header = document.createElement('div');
        header.className = 'users-header-title';
        header.innerHTML = `<i class="fas fa-clock"></i> Не в сети (${offlineUsers.length})`;
        usersList.appendChild(header);
        
        offlineUsers.forEach(user => {
            usersList.appendChild(createUserListItem(user));
        });
    }
    
    // Нет пользователей
    if (filteredUsers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-chat';
        empty.innerHTML = `
            <i class="fas fa-user-slash"></i>
            <p>Пользователи не найдены</p>
            <small>${filter ? 'Попробуйте другой запрос' : 'Пригласите друзей в чат'}</small>
        `;
        usersList.appendChild(empty);
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

function updateUserMessageCount() {
    if (usersCache[currentUserId]) {
        usersCache[currentUserId].message_count = (usersCache[currentUserId].message_count || 0) + 1;
        saveUsersToStorage();
    }
}

function saveUsersToStorage() {
    localStorage.setItem('users', JSON.stringify(usersCache));
}

// ===== UTILITY FUNCTIONS =====
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
        return date.toLocaleDateString('ru-RU');
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
        '#ff3b30', '#5ac8fa', '#ff2d55', '#ffcc00',
        '#af52de', '#ff9f0a', '#a2845e', '#32d74b'
    ];
    
    return colors[Math.abs(hash) % colors.length];
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
    const mentions = onlineUsers.map(u => `@${u.username || u.first_name}`).join(' ');
    
    const input = document.getElementById('message-input');
    if (mentions) {
        input.value = mentions + ' ' + (input.value || '');
        input.focus();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
        showNotification('Упомянуты все онлайн пользователи', 'info');
    } else {
        showNotification('Нет пользователей онлайн', 'warning');
    }
}

// ===== NOTIFICATIONS & SOUNDS =====
function showNotification(message, type = 'info') {
    // Создаем уведомление
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
    
    // Показываем
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Скрываем через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
    
    // Звук
    if (type !== 'info') {
        playSound(type);
    }
}

function playSound(type) {
    const soundsEnabled = localStorage.getItem('sounds') !== 'false';
    if (!soundsEnabled) return;
    
    try {
        const audio = new Audio();
        const sounds = {
            'send': 'https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3',
            'success': 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3',
            'error': 'https://assets.mixkit.co/sfx/preview/mixkit-warning-alarm-buzzer-895.mp3',
            'warning': 'https://assets.mixkit.co/sfx/preview/mixkit-retro-arcade-game-notification-211.mp3'
        };
        
        if (sounds[type]) {
            audio.src = sounds[type];
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Не удалось воспроизвести звук'));
        }
    } catch (e) {
        console.log('Ошибка воспроизведения звука:', e);
    }
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
            console.error('Ошибка загрузки сообщений:', e);
        }
    }
    
    // Роли
    const savedRoles = localStorage.getItem('userRoles');
    if (savedRoles) {
        try {
            userRoles = JSON.parse(savedRoles);
        } catch (e) {
            console.error('Ошибка загрузки ролей:', e);
            userRoles = {};
        }
    }
    
    // Проверяем роль пользователя
    if (!userRoles[currentUserId]) {
        userRoles[currentUserId] = 'user';
        saveRolesToStorage();
    }
    
    // Проверяем админские права
    const userRole = userRoles[currentUserId];
    isAdmin = ['admin', 'main_admin', 'moderator'].includes(userRole);
    
    // Показываем/скрываем админ панель
    const adminBtn = document.getElementById('btn-admin');
    if (adminBtn) {
        adminBtn.style.display = isAdmin ? 'flex' : 'none';
    }
}

function saveRolesToStorage() {
    localStorage.setItem('userRoles', JSON.stringify(userRoles));
}

function clearCache() {
    if (confirm('Вы уверены, что хотите очистить весь кэш приложения?')) {
        localStorage.clear();
        location.reload();
    }
}

// ===== USER INFO =====
function updateUserInfo() {
    // Сайдбар
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

function updateOnlineCount() {
    const onlineUsers = Object.values(usersCache).filter(u => u.is_online).length;
    
    document.getElementById('online-count').textContent = onlineUsers;
    document.getElementById('sidebar-online-count').textContent = onlineUsers;
}

function updateProfile() {
    const user = usersCache[currentUserId] || currentUser;
    
    document.getElementById('profile-name').textContent = user.first_name || 'Гость';
    document.getElementById('profile-username').textContent = user.username ? '@' + user.username : 'не установлен';
    document.getElementById('profile-id').textContent = user.id;
    document.getElementById('profile-role').textContent = getRoleText(user.role || 'user');
    
    // Аватар
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
        profileAvatar.style.backgroundColor = stringToColor(currentUserId);
        profileAvatar.innerHTML = `<span>${(user.first_name || 'G').charAt(0).toUpperCase()}</span>`;
    }
}

// ===== ADMIN FUNCTIONS =====
function loadAdminData() {
    if (!isAdmin) {
        showNotification('Доступ запрещен', 'error');
        switchView('chat');
        return;
    }
    
    // Загрузка списка пользователей для админа
    updateAdminUsersList();
}

function updateAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.values(usersCache).forEach(user => {
        const div = document.createElement('div');
        div.className = 'admin-user-item';
        
        const userName = user.first_name || 'User';
        const userRole = user.role || 'user';
        
        div.innerHTML = `
            <div class="admin-user-info">
                <div class="admin-user-avatar" style="background-color: ${stringToColor(user.id)}">
                    ${userName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="admin-user-name">
                        ${userName}
                        <span class="user-role-badge ${userRole}">${getRoleText(userRole)}</span>
                    </div>
                    <div class="admin-user-id">ID: ${user.id}</div>
                </div>
            </div>
            <div class="admin-user-actions">
                <select class="role-select" data-user-id="${user.id}" value="${userRole}">
                    <option value="user" ${userRole === 'user' ? 'selected' : ''}>Участник</option>
                    <option value="moderator" ${userRole === 'moderator' ? 'selected' : ''}>Модератор</option>
                    <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Админ</option>
                </select>
            </div>
        `;
        
        container.appendChild(div);
    });
    
    // Назначаем обработчики изменения ролей
    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', function() {
            const userId = this.dataset.userId;
            const newRole = this.value;
            
            if (usersCache[userId]) {
                usersCache[userId].role = newRole;
                userRoles[userId] = newRole;
                saveUsersToStorage();
                saveRolesToStorage();
                showNotification(`Роль пользователя обновлена`, 'success');
            }
        });
    });
}

function createInvite() {
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const invitesList = document.getElementById('invites-list');
    
    const div = document.createElement('div');
    div.className = 'invite-item';
    div.innerHTML = `
        <div>
            <div class="invite-code">${inviteCode}</div>
            <div class="invite-stats">Создано: ${new Date().toLocaleDateString('ru-RU')}</div>
        </div>
        <button class="btn-copy-invite" data-code="${inviteCode}">
            <i class="fas fa-copy"></i> Копировать
        </button>
    `;
    
    invitesList.appendChild(div);
    
    // Обработчик копирования
    div.querySelector('.btn-copy-invite').addEventListener('click', function() {
        const code = this.dataset.code;
        navigator.clipboard.writeText(code).then(() => {
            showNotification('Код приглашения скопирован', 'success');
        });
    });
    
    showNotification('Приглашение создано', 'success');
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

function openImagePreview(url) {
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
        <div class="image-preview-content">
            <button class="btn-close-preview">&times;</button>
            <img src="${url}" alt="Preview">
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.btn-close-preview').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// ===== START APPLICATION =====
// Запускаем при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Экспортируем функции для HTML
window.removeFilePreview = removeFilePreview;
window.openImagePreview = openImagePreview;
