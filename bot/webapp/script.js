// Telegram Mini App - Complete Full Featured Chat
// ИСПРАВЛЕННАЯ ВЕРСИЯ: только темная тема, все кнопки работают

// ===== GLOBAL VARIABLES =====
let tg = null;
let currentUserId = null;
let currentUser = null;
let currentChannel = 'main';
let currentMessageId = null;
let isAdmin = false;
let isMainAdmin = false;
let usersCache = {};
let channelsCache = {};
let rolesCache = {};
let pinnedMessages = {};
let attachedFiles = [];
let voiceRecorder = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingStartTime = null;
let replyMessageId = null;
let forwardMessageIds = [];
let s3Status = 'Не проверено';
let lastUpdateTime = 0;
let isSyncing = false;
let syncInterval = null;
let observer = null;
let imagePreviews = {};
let unreadCount = 0;
let lastReadMessageId = null;
let currentSection = 'main';
let sections = {};
let pinnedMessagesList = [];
let mutedUsers = new Set();
let bannedUsers = new Set();
let selectedMessages = new Set();
let activeVoicePlayers = {};

// Data structure
let appData = {
    users: {},
    channels: {
        main: {
            id: 'main',
            name: 'Основной чат',
            type: 'public',
            messages: [],
            pinned: [],
            members: []
        }
    },
    roles: {
        main_admin: {
            id: 'main_admin',
            name: 'Главный админ',
            color: '#ff9500',
            permissions: ['all']
        },
        admin: {
            id: 'admin',
            name: 'Администратор',
            color: '#ff3b30',
            permissions: ['manage_users', 'manage_messages', 'pin_messages', 'delete_messages']
        },
        moderator: {
            id: 'moderator',
            name: 'Модератор',
            color: '#5856d6',
            permissions: ['delete_messages', 'warn_users']
        },
        user: {
            id: 'user',
            name: 'Пользователь',
            color: '#34c759',
            permissions: ['send_messages', 'send_files', 'react_messages']
        }
    }
};

// API Configuration
const API_CONFIG = {
    baseUrl: window.location.origin,
    endpoints: {
        checkS3: '/api/s3/check',
        uploadFile: '/api/s3/proxy-upload',
        uploadVoice: '/api/s3/upload-voice',
        uploadVideo: '/api/s3/upload-video',
        saveMessage: '/api/s3/save-message',
        saveMessageAtomic: '/api/s3/save-message-atomic',
        getMessages: '/api/s3/get-messages',
        getUsers: '/api/s3/get-users',
        updateUser: '/api/s3/update-user',
        createChannel: '/api/s3/create-channel',
        updateChannel: '/api/s3/update-channel',
        createRole: '/api/s3/create-role',
        updateRole: '/api/s3/update-role',
        health: '/health'
    },
    maxFileSize: 50 * 1024 * 1024,
    maxVideoSize: 100 * 1024 * 1024,
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
        video: ['video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime'],
        audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/webm'],
        document: ['application/pdf', 'text/plain', 'application/msword', 
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    }
};

// Emoji categories for picker
const EMOJI_CATEGORIES = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'],
    people: ['👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '👨‍🦱', '👩‍🦰', '👨‍🦰', '👱‍♀️', '👱‍♂️', '👩‍🦳', '👨‍🦳', '👩‍🦲', '👨‍🦲', '🧔', '👵', '🧓', '👴', '👲', '👳‍♀️', '👳‍♂️', '🧕', '👮‍♀️', '👮‍♂️', '👷‍♀️', '👷‍♂️'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟'],
    objects: ['💡', '🔦', '🏮', '🪔', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📓', '📒', '📃', '📜', '📄', '📰', '🗞', '📑', '🔖', '🏷', '💰', '🪙', '💴', '💵', '💶', '💷', '💸', '🪙', '💳'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️'],
    flags: ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇫', '🇦🇽', '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇼', '🇦🇼', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿']
};

// Available reactions (Telegram-like)
const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

// ===== INITIALIZATION =====
async function initApp() {
    console.log('🚀 Инициализация Telegram Mini App...');
    
    try {
        updateLoadingText('Подключение к Telegram...');
        
        // Initialize Telegram WebApp
        initTelegram();
        
        updateLoadingText('Настройка интерфейса...');
        
        // Initialize theme - ВСЕГДА ТЕМНАЯ
        applyTheme('dark');
        
        // Initialize UI
        initUI();
        
        updateLoadingText('Проверка подключения...');
        
        // Check S3 connection
        const s3Connected = await checkS3Connection();
        
        if (!s3Connected) {
            showNotification('Используется локальный режим', 'warning');
        }
        
        updateLoadingText('Загрузка данных...');
        
        // Load all data
        await loadAllData();
        
        // Update user info
        updateUserInfo();
        
        // Show admin section if admin
        if (isAdmin || isMainAdmin) {
            const adminSection = document.getElementById('admin-section');
            if (adminSection) adminSection.style.display = 'block';
        }
        
        // Load channels
        await loadChannels();
        
        // Load sections
        await loadSectionsFromS3();
        
        // Load messages for current channel
        await loadMessages();
        
        // Initialize lazy loading
        initLazyLoading();
        
        // Start auto-sync
        startAutoSync();
        
        // Update online count
        updateOnlineCount();
        
        // Update online count periodically
        setInterval(updateOnlineCount, 30000);
        
        // Hide loading screen
        hideLoadingScreen();
        
        console.log('✅ Приложение инициализировано');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        updateLoadingText(`Ошибка: ${error.message}`);
        
        setTimeout(hideLoadingScreen, 3000);
    }
}

// ===== TELEGRAM INTEGRATION =====
function initTelegram() {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            
            // Expand WebApp to full screen
            tg.expand();
            
            // Enable closing confirmation
            tg.enableClosingConfirmation();
            
            // Set dark theme colors
            tg.setBackgroundColor('#1c1c1e');
            tg.setHeaderColor('#1c1c1e');
            
            // Get user data
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                currentUser = tg.initDataUnsafe.user;
                currentUserId = currentUser.id.toString();
                
                // Get photo_url from Telegram if available
                if (currentUser.photo_url) {
                    currentUser.photo_url = currentUser.photo_url;
                } else {
                    currentUser.photo_url = null;
                }
                
                // Set main admin
                if (currentUserId === '8089114323') {
                    isMainAdmin = true;
                    isAdmin = true;
                    currentUser.role = 'main_admin';
                    console.log('👑 Главный админ установлен');
                }
                
                // Load user role from S3 or set default
                loadUserRole();
                
                console.log('👤 Telegram пользователь:', currentUser);
                
                // Initialize WebApp events
                tg.onEvent('viewportChanged', handleViewportChange);
                tg.onEvent('themeChanged', handleThemeChange);
                tg.onEvent('mainButtonClicked', handleMainButtonClick);
                
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
        username: 'guest_' + Math.floor(Math.random() * 1000),
        language_code: 'ru'
    };
    currentUserId = currentUser.id.toString();
    
    // For demo - make first user admin
    if (currentUser.id === 100000) {
        isAdmin = true;
        isMainAdmin = true;
    }
}

function handleViewportChange(event) {
    console.log('Viewport changed:', event);
    adjustViewport();
}

function handleThemeChange() {
    console.log('Theme changed');
    // Always dark theme
    applyTheme('dark');
}

function handleMainButtonClick() {
    console.log('Main button clicked');
}

function adjustViewport() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// ===== THEME MANAGEMENT =====
function initTheme() {
    // ВСЕГДА ТЕМНАЯ ТЕМА
    applyTheme('dark');
}

function applyTheme(theme) {
    // Принудительно темная тема
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    
    // Update Telegram WebApp theme
    if (tg) {
        tg.setHeaderColor('#1c1c1e');
        tg.setBackgroundColor('#1c1c1e');
    }
}

// ===== UI INITIALIZATION =====
function initUI() {
    // Menu button
    const btnMenu = document.getElementById('btn-menu');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const overlay = document.getElementById('overlay');
    
    if (btnMenu) btnMenu.addEventListener('click', toggleSidebar);
    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', closeAllMenus);
    
    // Search functionality
    const btnSearch = document.getElementById('btn-search');
    const btnCloseSearch = document.getElementById('btn-close-search');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const searchInput = document.getElementById('search-input');
    
    if (btnSearch) btnSearch.addEventListener('click', toggleSearch);
    if (btnCloseSearch) btnCloseSearch.addEventListener('click', toggleSearch);
    if (btnClearSearch) btnClearSearch.addEventListener('click', clearSearch);
    if (searchInput) {
        searchInput.addEventListener('input', debounce(searchMessages, 300));
    }
    
    // More button
    const btnMore = document.getElementById('btn-more');
    if (btnMore) btnMore.addEventListener('click', showMoreMenu);
    
    // Unread badge button
    const btnUnread = document.getElementById('btn-unread');
    if (btnUnread) btnUnread.addEventListener('click', scrollToUnread);
    
    // Message input
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('btn-send');
    
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
    
    // Attach button
    const btnAttach = document.getElementById('btn-attach');
    if (btnAttach) {
        btnAttach.addEventListener('click', toggleAttachMenu);
    }
    
    // Voice recording
    const btnVoice = document.getElementById('btn-voice');
    if (btnVoice) {
        btnVoice.addEventListener('click', startVoiceRecording);
        btnVoice.addEventListener('touchstart', startVoiceRecording);
        btnVoice.addEventListener('touchend', stopVoiceRecording);
        btnVoice.addEventListener('touchcancel', cancelVoiceRecording);
    }
    
    // Emoji picker
    const btnEmoji = document.getElementById('btn-emoji');
    if (btnEmoji) {
        btnEmoji.addEventListener('click', toggleEmojiPicker);
        initEmojiPicker();
    }
    
    // Cancel reply
    const btnCancelReply = document.getElementById('btn-cancel-reply');
    if (btnCancelReply) btnCancelReply.addEventListener('click', cancelReply);
    
    // Voice recording actions
    const btnCancelRecording = document.getElementById('btn-cancel-recording');
    const btnSendVoice = document.getElementById('btn-send-voice');
    
    if (btnCancelRecording) btnCancelRecording.addEventListener('click', cancelVoiceRecording);
    if (btnSendVoice) btnSendVoice.addEventListener('click', sendVoiceMessage);
    
    // Create channel
    const btnAddChannel = document.getElementById('btn-add-channel');
    const btnCreateChannel = document.getElementById('btn-create-channel');
    
    if (btnAddChannel) btnAddChannel.addEventListener('click', showCreateChannelModal);
    if (btnCreateChannel) btnCreateChannel.addEventListener('click', createChannel);
    
    // Add role button
    const btnAddRole = document.getElementById('btn-add-role');
    if (btnAddRole) {
        btnAddRole.addEventListener('click', () => {
            const roleName = prompt('Название роли:');
            if (!roleName) return;
            
            const roleId = roleName.toLowerCase().replace(/\s+/g, '_');
            const role = {
                id: roleId,
                name: roleName,
                permissions: ['send_messages', 'send_files', 'react_messages'],
                color: '#3390ec'
            };
            
            appData.roles[roleId] = role;
            saveRoleToS3(role);
            loadRoles();
            showNotification('Роль добавлена', 'success');
        });
    }
    
    // Admin functionality
    const adminItems = document.querySelectorAll('.admin-item');
    adminItems.forEach(item => {
        item.addEventListener('click', function() {
            const action = this.dataset.action;
            handleAdminAction(action);
        });
    });
    
    // User actions modal handlers
    const btnSaveUserActions = document.getElementById('btn-save-user-actions');
    const btnMuteUser = document.getElementById('btn-mute-user');
    const btnUnmuteUser = document.getElementById('btn-unmute-user');
    const btnBanUser = document.getElementById('btn-ban-user');
    const btnUnbanUser = document.getElementById('btn-unban-user');
    
    if (btnSaveUserActions) {
        btnSaveUserActions.addEventListener('click', saveUserActions);
    }
    if (btnMuteUser) {
        btnMuteUser.addEventListener('click', () => {
            if (currentEditingUserId) muteUser(currentEditingUserId);
        });
    }
    if (btnUnmuteUser) {
        btnUnmuteUser.addEventListener('click', () => {
            if (currentEditingUserId) unmuteUser(currentEditingUserId);
        });
    }
    if (btnBanUser) {
        btnBanUser.addEventListener('click', () => {
            if (currentEditingUserId) banUser(currentEditingUserId);
        });
    }
    if (btnUnbanUser) {
        btnUnbanUser.addEventListener('click', () => {
            if (currentEditingUserId) unbanUser(currentEditingUserId);
        });
    }
    
    // Mirror constructor button
    const btnCreateMirror = document.getElementById('btn-create-mirror');
    if (btnCreateMirror) {
        btnCreateMirror.addEventListener('click', createMirror);
    }
    
    // Mirror constructor modal button
    const mirrorConstructorBtn = document.getElementById('mirror-constructor-btn');
    if (mirrorConstructorBtn) {
        mirrorConstructorBtn.addEventListener('click', showMirrorConstructor);
    }
    
    // GIF search button
    const btnSearchGif = document.getElementById('btn-search-gif');
    const gifSearchInput = document.getElementById('gif-search-input');
    if (btnSearchGif && gifSearchInput) {
        btnSearchGif.addEventListener('click', () => {
            loadGifs(gifSearchInput.value);
        });
        gifSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadGifs(gifSearchInput.value);
            }
        });
    }
    
    // Кнопка скролла вниз
    const btnScrollDown = document.getElementById('btn-scroll-down');
    if (btnScrollDown) {
        btnScrollDown.addEventListener('click', scrollToBottom);
        initScrollButton();
    }
    
    // Инициализация контекстного меню
    document.addEventListener('contextmenu', function(e) {
        const messageElement = e.target.closest('.message');
        if (messageElement) {
            e.preventDefault();
            const messageId = messageElement.dataset.messageId;
            if (messageId) {
                showMessageActionsMenu(messageId, e.clientX, e.clientY);
            }
        }
    });
    
    // Settings toggles - УБРАНЫ (оставляем только кнопку зеркала)
    const themeSwitch = document.getElementById('theme-switch');
    const notificationsSwitch = document.getElementById('notifications-switch');
    const soundsSwitch = document.getElementById('sounds-switch');
    
    if (themeSwitch) {
        themeSwitch.checked = true; // Всегда темная
        themeSwitch.disabled = true; // Делаем неактивной
    }
    
    if (notificationsSwitch) {
        notificationsSwitch.addEventListener('change', toggleNotifications);
        // Load saved setting
        const savedNotifications = localStorage.getItem('notificationsEnabled') !== 'false';
        notificationsSwitch.checked = savedNotifications;
    }
    
    if (soundsSwitch) {
        soundsSwitch.addEventListener('change', toggleSounds);
        // Load saved setting
        const savedSounds = localStorage.getItem('soundsEnabled') !== 'false';
        soundsSwitch.checked = savedSounds;
    }
    
    // Close modals
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.dataset.modal;
            closeModal(modalId);
        });
    });
    
    // Modal secondary buttons
    document.querySelectorAll('.btn-modal-secondary').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.dataset.modal;
            closeModal(modalId);
        });
    });
    
    // Image preview
    const btnClosePreview = document.getElementById('btn-close-preview');
    const btnCloseVideo = document.getElementById('btn-close-video');
    
    if (btnClosePreview) btnClosePreview.addEventListener('click', closeImagePreview);
    if (btnCloseVideo) btnCloseVideo.addEventListener('click', closeVideoPlayer);
    
    // Image actions
    const btnDownloadImage = document.getElementById('btn-download-image');
    const btnShareImage = document.getElementById('btn-share-image');
    
    if (btnDownloadImage) btnDownloadImage.addEventListener('click', downloadImage);
    if (btnShareImage) btnShareImage.addEventListener('click', shareImage);
    
    // Initialize admin section visibility
    updateAdminVisibility();
    
    // Close menus on outside click
    document.addEventListener('click', closeAllMenus);
    
    // Handle window resize
    window.addEventListener('resize', adjustViewport);
    window.addEventListener('orientationchange', adjustViewport);
    
    // Initialize message actions
    initMessageActions();
    
    // Добавляем глобальные обработчики клавиш
    initKeyboardShortcuts();
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // ESC - закрыть все меню
        if (e.key === 'Escape') {
            closeAllMenus();
        }
        
        // Ctrl+F - поиск
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
        
        // Ctrl+Enter - отправить сообщение
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
        
        // Ctrl+K - создать канал
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            showCreateChannelModal();
        }
    });
}

function toggleNotifications() {
    const switchEl = document.getElementById('notifications-switch');
    if (!switchEl) return;
    
    const enabled = switchEl.checked;
    localStorage.setItem('notificationsEnabled', enabled.toString());
    
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    showNotification(enabled ? 'Уведомления включены' : 'Уведомления выключены', 'info');
}

function toggleSounds() {
    const switchEl = document.getElementById('sounds-switch');
    if (!switchEl) return;
    
    const enabled = switchEl.checked;
    localStorage.setItem('soundsEnabled', enabled.toString());
    
    if (enabled) {
        playSound('notification');
    }
    
    showNotification(enabled ? 'Звуки включены' : 'Звуки выключены', 'info');
}

// ===== MIRROR CONSTRUCTOR =====
function showMirrorConstructor() {
    showModal('mirror-constructor-modal');
}

async function createMirror() {
    const name = document.getElementById('mirror-name')?.value.trim();
    const token = document.getElementById('mirror-token')?.value.trim();
    const domain = document.getElementById('mirror-domain')?.value.trim() || window.location.origin;
    const isPublic = document.getElementById('mirror-public')?.checked || false;
    
    if (!name || !token) {
        showNotification('Введите название и токен бота', 'error');
        return;
    }
    
    // Простая валидация токена
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        showNotification('Неверный формат токена. Пример: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', 'error');
        return;
    }
    
    try {
        showUploadProgress(true, 'Создание зеркала...');
        
        const response = await fetch('/api/mirrors/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                token: token,
                domain: domain,
                public: isPublic,
                created_by: currentUserId
            })
        });
        
        showUploadProgress(false);
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                showNotification('✅ Зеркало создано!', 'success');
                
                // Закрыть модальное окно
                closeModal('mirror-constructor-modal');
                
                // Очистить форму
                document.getElementById('mirror-name').value = '';
                document.getElementById('mirror-token').value = '';
                document.getElementById('mirror-domain').value = '';
                document.getElementById('mirror-public').checked = false;
                
                // Показать URL зеркала
                if (data.mirror_url) {
                    setTimeout(() => {
                        showNotification(`🌐 Зеркало доступно по адресу: ${data.mirror_url}`, 'info');
                    }, 1000);
                }
            } else {
                showNotification(data.message || 'Ошибка создания зеркала', 'error');
            }
        } else {
            const errorText = await response.text();
            showNotification(`Ошибка сервера: ${response.status}`, 'error');
            console.error('Ошибка создания зеркала:', errorText);
        }
    } catch (error) {
        showUploadProgress(false);
        console.error('❌ Ошибка создания зеркала:', error);
        showNotification('❌ Не удалось создать зеркало', 'error');
    }
}

// ===== SIDEBAR FUNCTIONS =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
    
    // Close other menus
    closeAllMenus();
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

// ===== SEARCH FUNCTIONS =====
function toggleSearch() {
    const searchBar = document.getElementById('search-bar');
    const header = document.querySelector('.header');
    
    if (searchBar.style.display === 'none' || !searchBar.style.display) {
        searchBar.style.display = 'flex';
        header.style.display = 'none';
        document.getElementById('search-input').focus();
    } else {
        searchBar.style.display = 'none';
        header.style.display = 'flex';
        clearSearch();
    }
}

function clearSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
        searchMessages();
    }
}

function searchMessages() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    if (query === '') {
        loadMessages();
        return;
    }
    
    const messages = appData.channels[currentChannel]?.messages || [];
    const filteredMessages = messages.filter(msg => 
        msg.content?.toLowerCase().includes(query) ||
        msg.user?.first_name?.toLowerCase().includes(query) ||
        msg.user?.username?.toLowerCase().includes(query)
    );
    
    displaySearchResults(filteredMessages, query);
}

function displaySearchResults(messages, query) {
    const container = document.getElementById('messages-wrapper');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-chat-icon">
                    <i class="fas fa-search"></i>
                </div>
                <div class="empty-chat-title">Ничего не найдено</div>
                <div class="empty-chat-subtitle">По запросу "${query}" сообщений нет</div>
            </div>
        `;
        return;
    }
    
    messages.forEach(msg => {
        const element = createMessageElement(msg);
        container.appendChild(element);
    });
}

// ===== MESSAGE ACTIONS =====
function initMessageActions() {
    // Click on message for actions
    document.addEventListener('click', function(e) {
        const messageElement = e.target.closest('.message');
        if (messageElement) {
            const messageId = messageElement.dataset.messageId;
            
            if (e.target.closest('.message-reactions')) {
                return;
            }
            
            if (e.target.closest('.message-media img')) {
                const img = e.target.closest('.message-media img');
                if (img) {
                    const fullImageUrl = img.dataset.fullSrc || img.src;
                    showImagePreview(fullImageUrl);
                }
                return;
            }
            
            if (e.target.closest('.video-play-button')) {
                const videoThumbnail = e.target.closest('.video-thumbnail');
                if (videoThumbnail) {
                    const videoUrl = videoThumbnail.dataset.videoUrl;
                    if (videoUrl) {
                        showVideoPlayer(videoUrl);
                    }
                }
                return;
            }
            
            if (e.target.closest('.voice-play-btn')) {
                e.stopPropagation();
                const voiceMessage = e.target.closest('.voice-message');
                if (voiceMessage) {
                    const audioUrl = voiceMessage.dataset.audioUrl;
                    if (audioUrl) {
                        playVoiceMessage(audioUrl, voiceMessage);
                    }
                }
                return;
            }
            
            // Long press for actions menu (simulated with right click on desktop)
            if (e.type === 'contextmenu' || (e.type === 'click' && e.ctrlKey)) {
                e.preventDefault();
                showMessageActionsMenu(messageId, e.clientX, e.clientY);
            }
        }
    });
}

function showMessageActionsMenu(messageId, x, y) {
    currentMessageId = messageId;
    const menu = document.getElementById('message-actions-menu');
    if (!menu) return;
    
    // Position menu
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 200;
    const menuHeight = 300;
    
    let posX = x - menuWidth / 2;
    let posY = y - menuHeight - 10;
    
    // Adjust if menu goes off screen
    if (posX < 10) posX = 10;
    if (posX + menuWidth > viewportWidth - 10) posX = viewportWidth - menuWidth - 10;
    if (posY < 10) posY = y + 10;
    
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    menu.style.display = 'flex';
    
    // Update menu items based on permissions
    updateMessageActionsMenu(messageId);
    
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeMessageActionsMenu);
    }, 10);
}

function updateMessageActionsMenu(messageId) {
    const message = findMessageById(messageId);
    if (!message) return;
    
    const canEdit = canEditMessage(message);
    const canDelete = canDeleteMessage(message);
    const canPin = (isAdmin || isMainAdmin) && !message.pinned;
    const canUnpin = (isAdmin || isMainAdmin) && message.pinned;
    const canForward = true;
    
    const menuItems = document.querySelectorAll('.action-item');
    menuItems.forEach(item => {
        const action = item.dataset.action;
        
        switch(action) {
            case 'edit':
                item.style.display = canEdit ? 'flex' : 'none';
                break;
            case 'delete':
                item.style.display = canDelete ? 'flex' : 'none';
                break;
            case 'pin':
                item.style.display = canPin ? 'flex' : 'none';
                break;
            case 'unpin':
                item.style.display = canUnpin ? 'flex' : 'none';
                break;
            case 'forward':
                item.style.display = canForward ? 'flex' : 'none';
                break;
        }
        
        // Add click handler
        item.onclick = function(e) {
            e.stopPropagation();
            handleMessageAction(action, messageId);
            closeMessageActionsMenu();
        };
    });
}

function closeMessageActionsMenu() {
    const menu = document.getElementById('message-actions-menu');
    if (menu) menu.style.display = 'none';
    document.removeEventListener('click', closeMessageActionsMenu);
}

function handleMessageAction(action, messageId) {
    const msgId = messageId || currentMessageId;
    const message = findMessageById(msgId);
    if (!message) return;
    
    switch(action) {
        case 'reply':
            setReplyMessage(msgId);
            break;
        case 'edit':
            editMessagePrompt(msgId);
            break;
        case 'forward':
            showForwardMenu(msgId);
            break;
        case 'pin':
            pinMessage(msgId);
            break;
        case 'unpin':
            unpinMessage(msgId);
            break;
        case 'copy':
            copyMessageText(msgId);
            break;
        case 'select':
            selectMessage(msgId);
            break;
        case 'delete':
            deleteMessageConfirm(msgId);
            break;
    }
}

function setReplyMessage(messageId) {
    const message = findMessageById(messageId);
    if (!message) return;
    
    replyMessageId = messageId;
    
    const replyPreview = document.getElementById('reply-preview');
    const replySender = document.getElementById('reply-sender');
    const replyText = document.getElementById('reply-text');
    
    if (replyPreview && replySender && replyText) {
        const user = usersCache[message.user_id] || message.user || {};
        const senderName = user.first_name || 'Пользователь';
        
        replySender.textContent = senderName;
        replyText.textContent = message.content || 'Вложение';
        replyPreview.style.display = 'flex';
        
        // Scroll input into view
        document.getElementById('message-input').focus();
    }
}

function cancelReply() {
    replyMessageId = null;
    const replyPreview = document.getElementById('reply-preview');
    if (replyPreview) {
        replyPreview.style.display = 'none';
    }
}

function editMessagePrompt(messageId) {
    const message = findMessageById(messageId);
    if (!message) return;
    
    const newText = prompt('Редактировать сообщение:', message.content || '');
    if (newText !== null && newText !== message.content) {
        editMessage(messageId, newText);
    }
}

function showForwardMenu(messageId) {
    forwardMessageIds = [messageId];
    const forwardMenu = document.getElementById('forward-menu');
    const channelsList = document.getElementById('channels-list');
    
    if (forwardMenu && channelsList) {
        // Load channels for forwarding
        channelsList.innerHTML = '';
        
        Object.values(appData.channels).forEach(channel => {
            if (channel.id !== currentChannel) {
                const channelElement = document.createElement('div');
                channelElement.className = 'channel-forward-item';
                channelElement.innerHTML = `
                    <div class="channel-forward-icon">
                        <i class="fas fa-hashtag"></i>
                    </div>
                    <div class="channel-forward-info">
                        <div class="channel-forward-name">${channel.name}</div>
                        <div class="channel-forward-members">${channel.members?.length || 0} участников</div>
                    </div>
                `;
                
                channelElement.addEventListener('click', () => {
                    forwardMessage(messageId, channel.id);
                    closeForwardMenu();
                });
                
                channelsList.appendChild(channelElement);
            }
        });
        
        forwardMenu.style.display = 'flex';
        
        // Close button
        const btnCloseForward = document.getElementById('btn-close-forward');
        if (btnCloseForward) {
            btnCloseForward.onclick = closeForwardMenu;
        }
    }
}

function closeForwardMenu() {
    const forwardMenu = document.getElementById('forward-menu');
    if (forwardMenu) {
        forwardMenu.style.display = 'none';
    }
    forwardMessageIds = [];
}

function copyMessageText(messageId) {
    const message = findMessageById(messageId);
    if (!message) return;
    
    const text = message.content || '';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Скопировано в буфер', 'success');
        });
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Скопировано в буфер', 'success');
    }
}

function deleteMessageConfirm(messageId) {
    if (confirm('Вы уверены, что хотите удалить это сообщение?')) {
        deleteMessage(messageId);
    }
}

function selectMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
        messageElement.classList.remove('selected');
    } else {
        selectedMessages.add(messageId);
        messageElement.classList.add('selected');
        
        // Автовоспроизведение голосового сообщения при выборе
        const voiceMessage = messageElement.querySelector('.voice-message');
        if (voiceMessage && voiceMessage.dataset.audioUrl) {
            playVoiceMessage(voiceMessage.dataset.audioUrl, voiceMessage);
        }
    }
    
    updateSelectionUI();
}

function updateSelectionUI() {
    const selectionBar = document.getElementById('selection-bar');
    if (!selectionBar) {
        createSelectionBar();
    } else {
        selectionBar.style.display = selectedMessages.size > 0 ? 'flex' : 'none';
        
        const countElement = selectionBar.querySelector('.selected-count');
        if (countElement) {
            countElement.textContent = selectedMessages.size;
        }
    }
}

function createSelectionBar() {
    const selectionBar = document.createElement('div');
    selectionBar.id = 'selection-bar';
    selectionBar.className = 'selection-bar';
    selectionBar.innerHTML = `
        <div class="selection-info">
            <span class="selected-count">${selectedMessages.size}</span> выбрано
        </div>
        <div class="selection-actions">
            <button class="btn-selection-action" onclick="forwardSelectedMessages()">
                <i class="fas fa-share"></i>
                Переслать
            </button>
            <button class="btn-selection-action" onclick="deleteSelectedMessages()">
                <i class="fas fa-trash"></i>
                Удалить
            </button>
            <button class="btn-selection-action" onclick="clearSelection()">
                <i class="fas fa-times"></i>
                Отмена
            </button>
        </div>
    `;
    
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
        messagesContainer.appendChild(selectionBar);
        selectionBar.style.display = 'flex';
    }
}

function clearSelection() {
    selectedMessages.forEach(msgId => {
        const element = document.querySelector(`[data-message-id="${msgId}"]`);
        if (element) element.classList.remove('selected');
    });
    selectedMessages.clear();
    
    const selectionBar = document.getElementById('selection-bar');
    if (selectionBar) selectionBar.style.display = 'none';
}

function forwardSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    showForwardMenu(Array.from(selectedMessages)[0]);
}

function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    if (confirm(`Удалить ${selectedMessages.size} сообщений?`)) {
        selectedMessages.forEach(msgId => {
            deleteMessage(msgId);
        });
        clearSelection();
    }
}

// ===== REACTIONS =====
function addReaction(messageId, emoji) {
    const message = findMessageById(messageId);
    if (!message) return;
    
    if (!message.reactions) message.reactions = {};
    if (!message.reactions[emoji]) message.reactions[emoji] = [];
    
    const userIndex = message.reactions[emoji].indexOf(currentUserId);
    
    if (userIndex > -1) {
        // Remove reaction
        message.reactions[emoji].splice(userIndex, 1);
        if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
        }
    } else {
        // Add reaction
        message.reactions[emoji].push(currentUserId);
    }
    
    // Update in S3
    updateMessageInS3(message);
    
    // Update UI
    updateMessageReactions(message.id);
    
    // Play sound if enabled
    if (localStorage.getItem('soundsEnabled') !== 'false') {
        playSound('reaction');
    }
}

function updateMessageReactions(messageId) {
    const message = findMessageById(messageId);
    if (!message) return;
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    const reactionsContainer = messageElement.querySelector('.message-reactions');
    if (!reactionsContainer) {
        // Create reactions container if it doesn't exist
        const messageContent = messageElement.querySelector('.message-content');
        if (messageContent) {
            const newReactionsContainer = document.createElement('div');
            newReactionsContainer.className = 'message-reactions';
            messageContent.appendChild(newReactionsContainer);
            updateReactionsHTML(newReactionsContainer, message);
        }
    } else {
        updateReactionsHTML(reactionsContainer, message);
    }
}

function updateReactionsHTML(container, message) {
    if (!message.reactions || Object.keys(message.reactions).length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const reactionsHTML = Object.entries(message.reactions)
        .map(([emoji, users]) => {
            const count = users.length;
            const hasReacted = users.includes(currentUserId);
            return `
                <div class="reaction ${hasReacted ? 'user-reacted' : ''}" 
                     data-emoji="${emoji}"
                     onclick="addReaction('${message.id}', '${emoji}')">
                    <span class="reaction-emoji">${emoji}</span>
                    <span class="reaction-count">${count}</span>
                </div>
            `;
        })
        .join('');
    
    container.innerHTML = reactionsHTML;
}

// ===== ОТПРАВКА СООБЩЕНИЙ =====
async function sendMessage() {
    // Check if user is banned or muted
    if (bannedUsers.has(currentUserId)) {
        showNotification('Вы забанены и не можете отправлять сообщения', 'error');
        return;
    }
    
    if (mutedUsers.has(currentUserId)) {
        showNotification('Вы заглушены и не можете отправлять сообщения', 'error');
        return;
    }
    
    // Check permissions
    if (!checkSectionPermission(currentSection)) {
        showNotification('У вас нет прав на отправку сообщений в этом разделе', 'error');
        return;
    }
    
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (text === '' && attachedFiles.length === 0) {
        showNotification('Введите сообщение или прикрепите файл', 'warning');
        return;
    }
    
    const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const message = {
        id: messageId,
        user_id: currentUserId,
        user: currentUser,
        content: text,
        timestamp: Date.now(),
        channel: currentChannel,
        section: currentSection,
        files: [],
        reactions: {},
        reply_to: replyMessageId,
        edited: false,
        deleted: false,
        is_local: true,
        status: 'sending'
    };
    
    // Загружаем файлы
    let uploadedFiles = [];
    
    if (attachedFiles.length > 0) {
        try {
            showUploadProgress(true, 'Загрузка файлов...');
            
            for (let i = 0; i < attachedFiles.length; i++) {
                const fileInfo = attachedFiles[i];
                
                if (fileInfo.isLocal && fileInfo.file) {
                    try {
                        let fileToUpload = fileInfo.file;
                        
                        let uploadEndpoint = API_CONFIG.endpoints.uploadFile;
                        let formData = new FormData();
                        
                        if (fileInfo.type === 'voice') {
                            uploadEndpoint = API_CONFIG.endpoints.uploadVoice;
                            formData.append('duration', fileInfo.duration || 0);
                        } else if (fileInfo.type === 'video') {
                            uploadEndpoint = API_CONFIG.endpoints.uploadVideo;
                        }
                        
                        formData.append('file', fileToUpload);
                        formData.append('user_id', currentUserId);
                        formData.append('type', fileInfo.type);
                        
                        const response = await fetch(uploadEndpoint, {
                            method: 'POST',
                            body: formData
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Ошибка загрузки файла: ${response.status}`);
                        }
                        
                        const uploadResult = await response.json();
                        
                        if (uploadResult.status === 'success') {
                            const uploadedFile = {
                                url: uploadResult.file_url,
                                name: uploadResult.filename || fileInfo.name,
                                type: fileInfo.type,
                                size: uploadResult.size || fileInfo.size,
                                mimeType: fileInfo.mimeType
                            };
                            
                            if (fileInfo.type === 'voice' && uploadResult.duration) {
                                uploadedFile.duration = uploadResult.duration;
                            }
                            
                            uploadedFiles.push(uploadedFile);
                            
                            console.log(`✅ Файл загружен: ${fileInfo.name}`);
                        } else {
                            throw new Error(uploadResult.message || 'Ошибка загрузки файла');
                        }
                        
                    } catch (fileError) {
                        console.error('❌ Ошибка загрузки файла:', fileError);
                    }
                } else if (fileInfo.url) {
                    uploadedFiles.push(fileInfo);
                }
            }
            
            showUploadProgress(false);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки файлов:', error);
            showUploadProgress(false);
            showNotification('Ошибка загрузки файлов', 'error');
            return;
        }
    }
    
    message.files = uploadedFiles;
    message.status = 'sent';
    
    if (!appData.channels[currentChannel]) {
        appData.channels[currentChannel] = {
            id: currentChannel,
            name: currentChannel,
            type: 'public',
            messages: [],
            pinned: []
        };
    }
    
    appData.channels[currentChannel].messages.push(message);
    
    appendMessage(message);
    
    input.value = '';
    input.style.height = 'auto';
    clearAttachments();
    cancelReply();
    
    try {
        const response = await fetch(API_CONFIG.endpoints.saveMessageAtomic || API_CONFIG.endpoints.saveMessage, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.status === 'success') {
                updateMessageStatus(messageId, 'delivered');
                showNotification('Сообщение отправлено', 'success');
            } else {
                throw new Error(result.message || 'Ошибка сохранения');
            }
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
        
    } catch (saveError) {
        console.error('❌ Ошибка сохранения сообщения:', saveError);
        updateMessageStatus(messageId, 'error');
        showNotification('Сообщение сохранено локально', 'warning');
    }
    
    scrollToBottom();
    playSound('send');
    
    console.log('📤 Сообщение отправлено:', message);
}

// ===== СОЗДАНИЕ ЭЛЕМЕНТА СООБЩЕНИЯ =====
function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const user = usersCache[message.user_id] || message.user || {};
    const userName = user.first_name || 'Пользователь';
    const userColor = stringToColor(message.user_id);
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Get user avatar
    const userAvatar = getUserAvatar(user, userColor, userName);
    
    // Check if deleted
    if (message.deleted) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        messageElement.dataset.messageId = message.id;
        messageElement.innerHTML = `
            <div class="message-avatar">
                ${userAvatar}
            </div>
            <div class="message-content">
                <div class="message-bubble deleted">
                    <div class="message-text">
                        <i class="fas fa-trash"></i> Сообщение удалено
                    </div>
                </div>
            </div>
        `;
        return messageElement;
    }
    
    // Build message content
    let contentHTML = '';
    let filesHTML = '';
    let replyHTML = '';
    
    // Reply preview
    if (message.reply_to) {
        const repliedMessage = findMessageById(message.reply_to);
        if (repliedMessage) {
            const repliedUser = usersCache[repliedMessage.user_id] || repliedMessage.user || {};
            const repliedName = repliedUser.first_name || 'Пользователь';
            const repliedText = repliedMessage.content ? 
                (repliedMessage.content.length > 50 ? repliedMessage.content.substring(0, 50) + '...' : repliedMessage.content) : 
                'Вложение';
            
            replyHTML = `
                <div class="message-reply">
                    <div class="reply-line"></div>
                    <div class="reply-content">
                        <div class="reply-sender">${repliedName}</div>
                        <div class="reply-text">${escapeHtml(repliedText)}</div>
                    </div>
                </div>
            `;
        }
    }
    
    // Files
    if (message.files && message.files.length > 0) {
        filesHTML = message.files.map(file => {
            if (file.type === 'photo' || file.type === 'gif' || file.isGif) {
                const previewUrl = file.previewDataUrl || file.dataUrl || file.url;
                const fullUrl = file.url || file.dataUrl;
                
                let displayUrl = previewUrl;
                let fullDisplayUrl = fullUrl;
                
                if (previewUrl && previewUrl.includes('/telegram-chat-files/')) {
                    const filepath = previewUrl.split('/telegram-chat-files/')[1];
                    displayUrl = `/api/s3/download/${filepath}`;
                }
                if (fullUrl && fullUrl.includes('/telegram-chat-files/')) {
                    const filepath = fullUrl.split('/telegram-chat-files/')[1];
                    fullDisplayUrl = `/api/s3/download/${filepath}`;
                }
                
                return `
                    <div class="message-media">
                        <img src="${displayUrl}" 
                             alt="${escapeHtml(file.name || 'Изображение')}" 
                             class="message-image lazy-image ${file.isGif ? 'gif-image' : ''}"
                             ${fullDisplayUrl && fullDisplayUrl !== displayUrl ? `data-full-src="${fullDisplayUrl}"` : ''}
                             loading="lazy"
                             onclick="showImagePreview('${fullDisplayUrl || displayUrl}')">
                        ${file.compressed ? '<div class="compression-badge" title="Изображение сжато"><i class="fas fa-compress-alt"></i></div>' : ''}
                        ${file.isGif ? '<div class="gif-badge" title="GIF"><i class="fas fa-film"></i></div>' : ''}
                    </div>
                `;
            } else if (file.type === 'video') {
                const previewUrl = file.thumbnail || file.previewDataUrl || '';
                const videoUrl = file.url || file.dataUrl || '';
                
                return `
                    <div class="message-media">
                        <div class="video-thumbnail" 
                             style="background-image: url('${previewUrl}')"
                             data-video-url="${videoUrl}">
                            <div class="video-play-button">
                                <i class="fas fa-play"></i>
                            </div>
                            <div class="video-info">
                                <i class="fas fa-video"></i> ${formatDuration(file.duration)}
                                ${file.compressionOptions ? '<i class="fas fa-compress-alt ml-1"></i>' : ''}
                            </div>
                        </div>
                    </div>
                `;
            } else if (file.type === 'voice') {
                let audioUrl = file.url || '';
                if (!audioUrl && file.blob) {
                    audioUrl = URL.createObjectURL(file.blob);
                }
                
                return `
                    <div class="voice-message" data-audio-url="${audioUrl}" data-message-id="${message.id}" data-duration="${file.duration || 0}">
                        <button class="voice-play-btn">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-waveform-container">
                            <div class="voice-waveform">
                                <div class="voice-progress" style="width: 0%"></div>
                            </div>
                            <div class="voice-current-time">0:00</div>
                        </div>
                        <div class="voice-duration">${formatDuration(file.duration || 0)}</div>
                        ${file.url ? `
                            <button class="voice-download-btn" onclick="downloadVoiceMessage(event, '${file.url}')" title="Скачать">
                                <i class="fas fa-download"></i>
                            </button>
                        ` : file.blob ? `
                            <button class="voice-download-btn" onclick="downloadVoiceBlob(event, '${file.id || message.id}')" title="Скачать">
                                <i class="fas fa-download"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            } else {
                return `
                    <a href="${file.url || '#'}" class="message-file" 
                       data-file-url="${file.url || ''}" 
                       data-file-name="${escapeHtml(file.name || 'Файл')}"
                       ${file.url ? 'target="_blank"' : ''}>
                        <div class="file-icon">
                            <i class="fas fa-file"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(file.name || 'Файл')}</div>
                            <div class="file-size">${formatFileSize(file.size)}</div>
                        </div>
                        ${file.url ? '<div class="download-btn"><i class="fas fa-download"></i></div>' : ''}
                    </a>
                `;
            }
        }).join('');
    }
    
    // Text content
    if (message.content) {
        let text = escapeHtml(message.content);
        text = text.replace(/\n/g, '<br>');
        text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
        
        contentHTML = `<div class="message-text">${text}</div>`;
    }
    
    // Reactions
    let reactionsHTML = '';
    if (message.reactions && Object.keys(message.reactions).length > 0) {
        const reactions = Object.entries(message.reactions)
            .map(([emoji, users]) => {
                const count = users.length;
                const hasReacted = users.includes(currentUserId);
                return `
                    <div class="reaction ${hasReacted ? 'user-reacted' : ''}" 
                         data-emoji="${emoji}"
                         onclick="addReaction('${message.id}', '${emoji}')">
                        <span class="reaction-emoji">${emoji}</span>
                        <span class="reaction-count">${count}</span>
                    </div>
                `;
            })
            .join('');
        
        reactionsHTML = `<div class="message-reactions">${reactions}</div>`;
    }
    
    // Status
    let statusHTML = '';
    if (isOutgoing) {
        let statusIcon = 'fa-check';
        if (message.is_local) {
            statusIcon = 'fa-clock';
        } else if (message.status === 'sending') {
            statusIcon = 'fa-clock';
        } else if (message.status === 'sent') {
            statusIcon = 'fa-check';
        } else if (message.status === 'delivered') {
            statusIcon = 'fa-check-double';
        } else if (message.status === 'read') {
            statusIcon = 'fa-check-double text-primary';
        } else if (message.status === 'error') {
            statusIcon = 'fa-exclamation-circle text-error';
        }
        
        statusHTML = `
            <div class="message-status">
                <div class="message-time">${time}</div>
                <i class="fas ${statusIcon}"></i>
            </div>
        `;
    }
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    messageElement.dataset.messageId = message.id;
    
    messageElement.innerHTML = `
        ${!isOutgoing ? `
            <div class="message-avatar">
                ${getUserAvatar(user, userColor, userName)}
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
            ${contentHTML}
            ${reactionsHTML}
            ${statusHTML}
            
            ${message.edited ? '<div class="message-edited">(ред.)</div>' : ''}
        </div>
    `;
    
    // Add lazy loading for images
    const images = messageElement.querySelectorAll('.lazy-image');
    images.forEach(img => {
        if (img.dataset.fullSrc) {
            observeImage(img);
        }
    });
    
    return messageElement;
}

function appendMessage(message) {
    const container = document.getElementById('messages-wrapper');
    if (!container) return;
    
    const emptyChat = document.getElementById('empty-chat');
    if (emptyChat) emptyChat.style.display = 'none';
    
    const messageElement = createMessageElement(message);
    container.appendChild(messageElement);
    
    scrollToBottomIfNeeded();
}

// ===== ГОЛОСОВЫЕ СООБЩЕНИЯ =====
function playVoiceMessage(url, element) {
    const messageId = element.dataset.messageId;
    
    if (activeVoicePlayers[messageId]) {
        const audio = activeVoicePlayers[messageId].audio;
        const playButton = element.querySelector('.voice-play-btn i');
        const progressBar = element.querySelector('.voice-progress');
        const currentTimeEl = element.querySelector('.voice-current-time');
    
        if (audio.paused) {
            audio.play();
            playButton.className = 'fas fa-pause';
        } else {
            audio.pause();
            playButton.className = 'fas fa-play';
        }
        return;
    }
    
    if (!url || url === '') {
        console.error('❌ URL голосового сообщения пустой');
        showNotification('Ошибка: URL голосового сообщения не найден', 'error');
        return;
    }
    
    const audio = new Audio();
    
    if (!url.startsWith('blob:')) {
        audio.crossOrigin = 'anonymous';
    }
    
    audio.preload = 'auto';
    
    const playButton = element.querySelector('.voice-play-btn i');
    const progressBar = element.querySelector('.voice-progress');
    const currentTimeEl = element.querySelector('.voice-current-time');
    const duration = parseFloat(element.dataset.duration) || 0;
    
    audio.addEventListener('error', (e) => {
        console.error('❌ Ошибка загрузки аудио:', e, url);
        const error = audio.error;
        let errorMsg = 'Ошибка воспроизведения';
        
        if (error) {
            switch(error.code) {
                case error.MEDIA_ERR_ABORTED:
                    errorMsg = 'Загрузка прервана';
                    break;
                case error.MEDIA_ERR_NETWORK:
                    errorMsg = 'Ошибка сети при загрузке';
                    break;
                case error.MEDIA_ERR_DECODE:
                    errorMsg = 'Ошибка декодирования аудио';
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMsg = 'Формат аудио не поддерживается';
                    break;
            }
        }
        
        showNotification(errorMsg, 'error');
        if (playButton) playButton.className = 'fas fa-play';
    });
    
    let audioUrl = url;
    
    if (audioUrl.includes('/telegram-chat-files/')) {
        const filepath = audioUrl.split('/telegram-chat-files/')[1];
        audioUrl = `/api/s3/audio/${filepath}`;
        audio.crossOrigin = null;
    } else if (audioUrl.includes('telegram-chat-files')) {
        const filepath = audioUrl.split('telegram-chat-files/')[1];
        audioUrl = `/api/s3/audio/${filepath}`;
        audio.crossOrigin = null;
    } else if (audioUrl.startsWith('blob:')) {
        audio.crossOrigin = null;
    } else if (audioUrl.startsWith('/api/')) {
        audio.crossOrigin = null;
    } else if (!audioUrl.startsWith('http')) {
        audioUrl = audioUrl.startsWith('/') ? window.location.origin + audioUrl : window.location.origin + '/' + audioUrl;
    }
    
    audio.src = audioUrl;
    
    Object.values(activeVoicePlayers).forEach(player => {
        if (player.audio && !player.audio.paused) {
            player.audio.pause();
            const oldButton = player.element.querySelector('.voice-play-btn i');
            if (oldButton) oldButton.className = 'fas fa-play';
            const oldProgress = player.element.querySelector('.voice-progress');
            if (oldProgress) oldProgress.style.width = '0%';
            const oldTime = player.element.querySelector('.voice-current-time');
            if (oldTime) oldTime.textContent = '0:00';
        }
    });
    
    activeVoicePlayers[messageId] = { audio, element };
    
    audio.addEventListener('timeupdate', () => {
        const progress = audio.duration && !isNaN(audio.duration) ? (audio.currentTime / audio.duration) * 100 : 0;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = formatDuration(audio.currentTime);
        }
    });
    
    audio.addEventListener('ended', () => {
        if (playButton) playButton.className = 'fas fa-play';
        if (progressBar) {
            progressBar.style.width = '0%';
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = '0:00';
        }
        delete activeVoicePlayers[messageId];
    });
    
    audio.addEventListener('pause', () => {
        if (playButton) playButton.className = 'fas fa-play';
    });
    
    audio.addEventListener('play', () => {
        if (playButton) playButton.className = 'fas fa-pause';
    });
    
    audio.play().catch(err => {
        console.error('❌ Ошибка воспроизведения:', err, url);
        if (playButton) playButton.className = 'fas fa-play';
        
        if (err.name === 'NotAllowedError') {
            showNotification('Разрешите воспроизведение аудио в браузере', 'warning');
        } else if (err.name === 'NotSupportedError') {
            showNotification('Формат аудио не поддерживается', 'error');
        } else {
            showNotification('Ошибка воспроизведения аудио', 'error');
        }
    });
}

function downloadVoiceMessage(event, url) {
    event.stopPropagation();
    if (url) {
        let filepath = '';
        if (url.includes('/telegram-chat-files/')) {
            filepath = url.split('/telegram-chat-files/')[1];
        } else if (url.includes('telegram-chat-files')) {
            filepath = url.split('telegram-chat-files/')[1];
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = `voice_${Date.now()}.ogg`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }
        
        const downloadUrl = `/api/s3/download/${filepath}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `voice_${Date.now()}.ogg`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ===== КАНАЛЫ =====
function switchChannel(channelId) {
    // ИСПРАВЛЕНИЕ БАГА: Всегда можно вернуться в основной
    if (channelId === 'main') {
        currentChannel = 'main';
    } else if (appData.channels[channelId]) {
        currentChannel = channelId;
    } else {
        console.warn(`Канал ${channelId} не найден, переключаемся в основной`);
        currentChannel = 'main';
    }
    
    // Обновляем заголовок
    updateChannelUI();
    
    // Загружаем сообщения
    loadMessages();
    
    // Обновляем активное состояние
    updateChannelActiveState();
    
    // Закрываем сайдбар на мобильных
    if (window.innerWidth < 768) {
        closeSidebar();
    }
    
    // Прокручиваем вниз
    scrollToBottom();
}

function updateChannelUI() {
    const channel = appData.channels[currentChannel];
    const chatTitle = document.getElementById('chat-title');
    
    if (chatTitle) {
        if (currentChannel === 'main') {
            chatTitle.textContent = 'Основной чат';
        } else if (channel) {
            chatTitle.textContent = channel.name;
        } else {
            chatTitle.textContent = 'Неизвестный канал';
        }
    }
    
    updateOnlineCount();
}

function updateChannelActiveState() {
    const channelItems = document.querySelectorAll('.channel-item');
    channelItems.forEach(item => {
        const itemChannel = item.dataset.channel;
        if (itemChannel === currentChannel) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Всегда показываем основной канал активным если он выбран
    const mainChannel = document.querySelector('[data-channel="main"]');
    if (mainChannel && currentChannel === 'main') {
        mainChannel.classList.add('active');
    }
}

function showCreateChannelModal() {
    showModal('create-channel-modal');
}

async function createChannel() {
    const nameInput = document.getElementById('channel-name');
    const descInput = document.getElementById('channel-description');
    const typeSelect = document.getElementById('channel-type');
    
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const type = typeSelect.value;
    
    if (!name) {
        showNotification('Введите название канала', 'error');
        return;
    }
    
    const channelId = 'channel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const channel = {
        id: channelId,
        name: name,
        description: description,
        type: type,
        created_by: currentUserId,
        created_at: Date.now(),
        members: [currentUserId],
        messages: [],
        pinned: []
    };
    
    appData.channels[channelId] = channel;
    
    addChannelToSidebar(channel);
    
    await saveChannelToS3(channel);
    
    closeModal('create-channel-modal');
    
    nameInput.value = '';
    descInput.value = '';
    typeSelect.value = 'public';
    
    showNotification('Канал создан', 'success');
    
    switchChannel(channelId);
}

function addChannelToSidebar(channel) {
    const channelsList = document.getElementById('channels-sidebar-list');
    if (!channelsList) return;
    
    if (document.querySelector(`[data-channel="${channel.id}"]`)) {
        return;
    }
    
    const channelElement = document.createElement('div');
    channelElement.className = 'channel-item';
    channelElement.dataset.channel = channel.id;
    channelElement.innerHTML = `
        <div class="channel-icon">
            <i class="fas fa-hashtag"></i>
        </div>
        <div class="channel-name">${escapeHtml(channel.name)}</div>
        ${(isMainAdmin && channel.id !== 'main') ? `
            <button class="btn-delete-channel" onclick="deleteChannel('${channel.id}')" title="Удалить канал">
                <i class="fas fa-times"></i>
            </button>
        ` : ''}
        <div class="unread-badge" style="display: none;">0</div>
    `;
    
    channelElement.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-delete-channel')) {
            switchChannel(channel.id);
            closeSidebar();
        }
    });
    
    channelsList.appendChild(channelElement);
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function findMessageById(messageId) {
    const channel = appData.channels[currentChannel];
    if (!channel) return null;
    
    return channel.messages.find(msg => msg.id === messageId);
}

function canEditMessage(message) {
    const isOwnMessage = message.user_id === currentUserId;
    return isOwnMessage || isAdmin || isMainAdmin;
}

function canDeleteMessage(message) {
    const isOwnMessage = message.user_id === currentUserId;
    return isOwnMessage || isAdmin || isMainAdmin;
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function scrollToBottomIfNeeded() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const scrollPosition = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const distanceFromBottom = scrollHeight - scrollPosition - clientHeight;
    
    if (distanceFromBottom < 100) {
        scrollToBottom();
    }
}

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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getUserAvatar(user, userColor, userName) {
    if (user && user.photo_url) {
        return `<img src="${user.photo_url}" alt="${userName}" class="avatar-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="avatar-initial" style="background-color: ${userColor}; display: none; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 50%; color: white; font-weight: 600; font-size: 14px;">${userName.charAt(0).toUpperCase()}</div>`;
    }
    return `<div class="avatar-initial" style="background-color: ${userColor}; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 50%; color: white; font-weight: 600; font-size: 14px;">${userName.charAt(0).toUpperCase()}</div>`;
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colors = [
        '#3390ec', '#34c759', '#ff9500', '#5856d6', 
        '#ff3b30', '#5ac8fa', '#af52de', '#ffcc00'
    ];
    return colors[Math.abs(hash) % colors.length];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function updateLoadingText(text) {
    const element = document.getElementById('loading-subtext');
    if (element) element.textContent = text;
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (app) {
        app.style.display = 'flex';
        setTimeout(() => {
            app.classList.add('active');
        }, 50);
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

function playSound(type) {
    const soundsEnabled = localStorage.getItem('soundsEnabled') !== 'false';
    if (!soundsEnabled) return;
    
    // Простой звук через AudioContext
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        let frequency = 440;
        let duration = 0.1;
        
        switch(type) {
            case 'send':
                frequency = 523.25;
                break;
            case 'notification':
                frequency = 659.25;
                duration = 0.2;
                break;
            case 'reaction':
                frequency = 349.23;
                duration = 0.15;
                break;
        }
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.log('Audio play failed:', e);
    }
}

// ===== ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ =====
window.addReaction = addReaction;
window.showMirrorConstructor = showMirrorConstructor;
window.createMirror = createMirror;
window.selectMessage = selectMessage;
window.clearSelection = clearSelection;
window.downloadVoiceMessage = downloadVoiceMessage;
window.scrollToBottom = scrollToBottom;
window.showImagePreview = showImagePreview;
window.handleMessageAction = handleMessageAction;
window.addQuickReaction = function(emoji) {
    const menu = document.getElementById('quick-reactions-menu');
    if (!menu) return;
    
    const messageId = menu.dataset.messageId;
    if (messageId) {
        addReaction(messageId, emoji);
    }
    
    menu.style.display = 'none';
};

// ===== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ =====
document.addEventListener('DOMContentLoaded', function() {
    adjustViewport();
    
    window.addEventListener('resize', adjustViewport);
    window.addEventListener('orientationchange', adjustViewport);
    
    setTimeout(() => {
        if (typeof initApp === 'function') {
            initApp();
        }
    }, 500);
});

if (document.readyState === 'complete') {
    setTimeout(() => {
        if (typeof initApp === 'function') {
            initApp();
        }
    }, 100);
}
