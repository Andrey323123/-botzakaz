// Telegram Mini App - Complete Full Featured Chat
// Все features: video, voice messages, reactions, channels, admin roles
// Добавлено: сжатие, ленивая загрузка, превью для фото и видео

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
let observer = null; // Для ленивой загрузки
let imagePreviews = {}; // Кэш превью изображений
let unreadCount = 0; // Количество непрочитанных сообщений
let lastReadMessageId = null; // ID последнего прочитанного сообщения
let currentSection = 'main'; // Текущий раздел/топик
let sections = {}; // Разделы/топики
let pinnedMessagesList = []; // Закрепленные сообщения
let mutedUsers = new Set(); // Заглушенные пользователи
let bannedUsers = new Set(); // Забаненные пользователи

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
        uploadFile: '/api/s3/upload',
        uploadVoice: '/api/s3/upload-voice',
        uploadVideo: '/api/s3/upload-video',
        saveMessage: '/api/s3/save-message',
        getMessages: '/api/s3/get-messages',
        getUsers: '/api/s3/get-users',
        updateUser: '/api/s3/update-user',
        createChannel: '/api/s3/create-channel',
        updateChannel: '/api/s3/update-channel',
        createRole: '/api/s3/create-role',
        updateRole: '/api/s3/update-role',
        health: '/health'
    },
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxVideoSize: 100 * 1024 * 1024, // 100MB
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
    flags: ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇫', '🇦🇽', '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇼', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿']
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
        
        // Initialize theme
        initTheme();
        
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
        setInterval(updateOnlineCount, 30000); // Every 30 seconds
        
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
            
            // Set background color
            tg.setBackgroundColor('#3390ec');
            
            // Set header color
            tg.setHeaderColor('#3390ec');
            
            // Get user data
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                currentUser = tg.initDataUnsafe.user;
                currentUserId = currentUser.id.toString();
                
                // Get photo_url from Telegram if available
                if (currentUser.photo_url) {
                    currentUser.photo_url = currentUser.photo_url;
                } else {
                    // Generate photo_url from Telegram API
                    // Format: https://api.telegram.org/file/bot<token>/photos/<file_path>
                    // For now, use a placeholder that will be replaced with actual photo
                    currentUser.photo_url = null; // Will be fetched if needed
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
    initTheme();
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
    const savedTheme = localStorage.getItem('telegram_chat_theme') || 'auto';
    applyTheme(savedTheme);
    
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        themeSwitch.checked = savedTheme === 'dark';
    }
}

function toggleTheme() {
    const themeSwitch = document.getElementById('theme-switch');
    if (!themeSwitch) return;
    
    const isDark = themeSwitch.checked;
    applyTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('telegram_chat_theme', isDark ? 'dark' : 'light');
}

function applyTheme(theme) {
    const isDark = theme === 'dark' || 
                   (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    }
    
    // Update Telegram WebApp theme
    if (tg) {
        tg.setHeaderColor(isDark ? '#1c1c1e' : '#3390ec');
        tg.setBackgroundColor(isDark ? '#0f0f0f' : '#ffffff');
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
    
    if (btnCancelRecording) {
        btnCancelRecording.addEventListener('click', cancelVoiceRecording);
    }
    if (btnSendVoice) {
        btnSendVoice.addEventListener('click', stopVoiceRecording);
    }
    
    if (btnCancelRecording) btnCancelRecording.addEventListener('click', cancelVoiceRecording);
    if (btnSendVoice) btnSendVoice.addEventListener('click', sendVoiceMessage);
    
    // Create channel
    const btnAddChannel = document.getElementById('btn-add-channel');
    const btnCreateChannel = document.getElementById('btn-create-channel');
    
    if (btnAddChannel) btnAddChannel.addEventListener('click', showCreateChannelModal);
    if (btnCreateChannel) btnCreateChannel.addEventListener('click', createChannel);
    
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
    
    // Settings toggles
    const themeSwitch = document.getElementById('theme-switch');
    const notificationsSwitch = document.getElementById('notifications-switch');
    const soundsSwitch = document.getElementById('sounds-switch');
    
    if (themeSwitch) themeSwitch.addEventListener('change', toggleTheme);
    if (notificationsSwitch) notificationsSwitch.addEventListener('change', toggleNotifications);
    if (soundsSwitch) soundsSwitch.addEventListener('change', toggleSounds);
    
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
}

function updateAdminVisibility() {
    const adminSection = document.getElementById('admin-section');
    if (adminSection) {
        adminSection.style.display = isAdmin ? 'block' : 'none';
    }
}

function toggleNotifications() {
    const switchEl = document.getElementById('notifications-switch');
    const enabled = switchEl.checked;
    showNotification(`Уведомления ${enabled ? 'включены' : 'выключены'}`, 'info');
    localStorage.setItem('notifications_enabled', enabled);
}

function toggleSounds() {
    const switchEl = document.getElementById('sounds-switch');
    const enabled = switchEl.checked;
    showNotification(`Звуки ${enabled ? 'включены' : 'выключены'}`, 'info');
    localStorage.setItem('sounds_enabled', enabled);
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
                // Reaction click handled separately
                return;
            }
            
            if (e.target.closest('.message-media img')) {
                // Image click for preview
                const img = e.target.closest('.message-media img');
                if (img) {
                    const fullImageUrl = img.dataset.fullSrc || img.src;
                    showImagePreview(fullImageUrl);
                }
                return;
            }
            
            if (e.target.closest('.video-play-button')) {
                // Video play button
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
                // Voice message play
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
            
            // Перемотка голосового сообщения
            if (e.target.closest('.voice-waveform') || e.target.closest('.voice-waveform-container')) {
                e.stopPropagation();
                const voiceMessage = e.target.closest('.voice-message');
                if (voiceMessage) {
                    seekVoiceMessage(voiceMessage, e);
                }
                return;
            }
            
            if (e.target.closest('.download-btn')) {
                // Download file
                const fileElement = e.target.closest('.message-file');
                if (fileElement) {
                    const fileUrl = fileElement.dataset.fileUrl;
                    const fileName = fileElement.dataset.fileName;
                    if (fileUrl) {
                        downloadFile(fileUrl, fileName);
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
    
    // Touch events for mobile
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    
    document.addEventListener('touchstart', function(e) {
        const messageElement = e.target.closest('.message');
        if (messageElement) {
            touchStartTime = Date.now();
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });
    
    document.addEventListener('touchend', function(e) {
        const messageElement = e.target.closest('.message');
        if (messageElement && touchStartTime > 0) {
            const touchTime = Date.now() - touchStartTime;
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const distance = Math.sqrt(
                Math.pow(touchEndX - touchStartX, 2) + 
                Math.pow(touchEndY - touchStartY, 2)
            );
            
            // Long press (500ms+) with minimal movement
            if (touchTime > 500 && distance < 10) {
                e.preventDefault();
                const messageId = messageElement.dataset.messageId;
                const rect = messageElement.getBoundingClientRect();
                showMessageActionsMenu(messageId, rect.left + rect.width / 2, rect.top);
            }
            
            touchStartTime = 0;
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

// Выделение сообщения
let selectedMessages = new Set();
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
    // Можно добавить UI для множественного выбора
    if (selectedMessages.size > 0) {
        console.log(`Выбрано сообщений: ${selectedMessages.size}`);
    }
}

function clearSelection() {
    selectedMessages.forEach(msgId => {
        const element = document.querySelector(`[data-message-id="${msgId}"]`);
        if (element) element.classList.remove('selected');
    });
    selectedMessages.clear();
    updateSelectionUI();
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

// ===== REACTIONS =====
function showReactionPicker(messageId, x, y) {
    currentMessageId = messageId;
    const picker = document.getElementById('reaction-picker');
    if (!picker) return;
    
    // Position picker
    const viewportWidth = window.innerWidth;
    const pickerWidth = 360;
    
    let posX = x - pickerWidth / 2;
    if (posX < 10) posX = 10;
    if (posX + pickerWidth > viewportWidth - 10) posX = viewportWidth - pickerWidth - 10;
    
    picker.style.left = `${posX}px`;
    picker.style.top = `${y - 60}px`;
    picker.style.display = 'block';
    
    // Add reaction handlers
    const reactionOptions = picker.querySelectorAll('.reaction-option');
    reactionOptions.forEach(option => {
        option.onclick = function(e) {
            e.stopPropagation();
            const reaction = this.dataset.reaction;
            addReaction(messageId, reaction);
            closeReactionPicker();
        };
    });
    
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeReactionPicker);
    }, 10);
}

function closeReactionPicker() {
    const picker = document.getElementById('reaction-picker');
    if (picker) picker.style.display = 'none';
    document.removeEventListener('click', closeReactionPicker);
}

// ===== COMPRESSION FUNCTIONS =====
async function compressImage(file, quality = 0.7, maxWidth = 1600) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;
                
                // More aggressive compression: reduce size more
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                // For very large images, reduce quality further
                let finalQuality = quality;
                if (file.size > 5 * 1024 * 1024) { // > 5MB
                    finalQuality = 0.6;
                } else if (file.size > 2 * 1024 * 1024) { // > 2MB
                    finalQuality = 0.65;
                }
                
                // Create canvas for compression
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                
                // Improve image quality during resize
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // Apply compression
                ctx.drawImage(img, 0, 0, width, height);
                
                // Get compressed data URL
                const compressedDataUrl = canvas.toDataURL('image/jpeg', finalQuality);
                
                // Convert back to Blob with optimized quality
                canvas.toBlob(function(blob) {
                    resolve({
                        blob: blob,
                        dataUrl: compressedDataUrl,
                        width: width,
                        height: height,
                        size: blob.size,
                        compressed: true,
                        originalSize: file.size
                    });
                }, 'image/jpeg', finalQuality);
            };
            
            img.onerror = reject;
            img.src = e.target.result;
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function compressVideo(file, maxBitrate = 1500000, maxWidth = 1280) {
    return new Promise((resolve, reject) => {
        // Create video element to get metadata
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true; // Mute for processing
        
        video.onloadedmetadata = async function() {
            const originalWidth = video.videoWidth;
            const originalHeight = video.videoHeight;
            const duration = video.duration;
            const originalSize = file.size;
            
            // Calculate new dimensions while maintaining aspect ratio
            let width = originalWidth;
            let height = originalHeight;
            
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            
            // Try to compress video using MediaRecorder API if file is large
            if (originalSize > 10 * 1024 * 1024 && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                try {
                    const compressedBlob = await compressVideoWithMediaRecorder(video, width, height, maxBitrate);
                    if (compressedBlob && compressedBlob.size < originalSize * 0.9) {
                        // Only use compressed version if it's significantly smaller
                        resolve({
                            originalWidth,
                            originalHeight,
                            targetWidth: width,
                            targetHeight: height,
                            duration,
                            compressed: true,
                            compressedBlob: compressedBlob,
                            size: compressedBlob.size,
                            originalSize: originalSize,
                            maxBitrate
                        });
                        return;
                    }
                } catch (error) {
                    console.warn('Видео сжатие через MediaRecorder не удалось:', error);
                }
            }
            
            // Fallback: return metadata without compression
            resolve({
                originalWidth,
                originalHeight,
                targetWidth: width,
                targetHeight: height,
                duration,
                compressed: false,
                size: originalSize,
                maxBitrate
            });
        };
        
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
    });
}

// Helper function to compress video using MediaRecorder
async function compressVideoWithMediaRecorder(videoElement, targetWidth, targetHeight, maxBitrate) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        const stream = canvas.captureStream(30); // 30 fps
        const options = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: maxBitrate
        };
        
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
            }
        }
        
        const mediaRecorder = new MediaRecorder(stream, options);
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: options.mimeType });
            resolve(blob);
        };
        
        mediaRecorder.onerror = reject;
        
        // Draw video frames to canvas
        videoElement.currentTime = 0;
        videoElement.play();
        
        const drawFrame = () => {
            if (videoElement.ended || videoElement.paused) {
                mediaRecorder.stop();
                return;
            }
            
            ctx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
            requestAnimationFrame(drawFrame);
        };
        
        videoElement.onplay = () => {
            mediaRecorder.start();
            drawFrame();
        };
        
        // Stop after duration
        setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
                videoElement.pause();
                mediaRecorder.stop();
            }
        }, videoElement.duration * 1000 + 1000);
    });
}

// ===== LAZY LOADING FUNCTIONS =====
function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    
                    // Load image
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        
                        // Load full quality image after preview
                        if (img.dataset.fullSrc) {
                            setTimeout(() => {
                                const fullImg = new Image();
                                fullImg.onload = function() {
                                    img.src = this.src;
                                };
                                fullImg.src = img.dataset.fullSrc;
                            }, 1000);
                        }
                    }
                    
                    // Load video thumbnail
                    if (img.dataset.poster) {
                        img.src = img.dataset.poster;
                        img.removeAttribute('data-poster');
                    }
                    
                    observer.unobserve(img);
                }
            });
        }, {
            root: null,
            rootMargin: '50px',
            threshold: 0.1
        });
        
        // Start observing images
        setTimeout(() => {
            document.querySelectorAll('img[data-src], img[data-poster]').forEach(img => {
                observer.observe(img);
            });
        }, 100);
    }
}

function observeImage(img) {
    if (observer && (img.dataset.src || img.dataset.poster)) {
        observer.observe(img);
    }
}

// ===== PREVIEW FUNCTIONS =====
async function createImagePreview(file, maxWidth = 400, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const previewDataUrl = canvas.toDataURL('image/jpeg', quality);
                
                resolve({
                    dataUrl: previewDataUrl,
                    width: width,
                    height: height,
                    isPreview: true
                });
            };
            
            img.onerror = reject;
            img.src = e.target.result;
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function createVideoPreview(file, maxWidth = 400) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = function() {
            this.currentTime = Math.min(1, this.duration * 0.1); // Capture at 10% of duration
            
            this.onseeked = function() {
                const canvas = document.createElement('canvas');
                let width = this.videoWidth;
                let height = this.videoHeight;
                
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(this, 0, 0, width, height);
                
                const previewDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                
                resolve({
                    dataUrl: previewDataUrl,
                    width: width,
                    height: height,
                    duration: this.duration,
                    isPreview: true
                });
                
                URL.revokeObjectURL(this.src);
            };
        };
        
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
    });
}

// ===== MESSAGE CREATION AND DISPLAY =====
async function sendMessage() {
    // Check if user is banned
    if (bannedUsers.has(currentUserId)) {
        showNotification('Вы забанены и не можете отправлять сообщения', 'error');
        return;
    }
    
    // Check if user is muted
    if (mutedUsers.has(currentUserId)) {
        showNotification('Вы заглушены и не можете отправлять сообщения', 'error');
        return;
    }
    
    // Check if user is banned
    if (bannedUsers.has(currentUserId)) {
        showNotification('Вы забанены и не можете отправлять сообщения', 'error');
        return;
    }
    
    // Check if user is muted
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
        files: [...attachedFiles],
        reactions: {},
        reply_to: replyMessageId,
        edited: false,
        deleted: false,
        is_local: true
    };
    
    // Upload files if any (with compression)
    if (attachedFiles.length > 0) {
        for (let fileInfo of attachedFiles) {
            if (fileInfo.isLocal && fileInfo.file) {
                try {
                    let fileToUpload = fileInfo.file;
                    
                    // Apply compression for images
                    if (fileInfo.type === 'photo' && fileInfo.compressedBlob) {
                        fileToUpload = fileInfo.compressedBlob;
                        fileInfo.size = fileInfo.compressedBlob.size;
                        console.log(`🖼️ Изображение сжато: ${formatFileSize(fileInfo.originalSize)} → ${formatFileSize(fileInfo.size)}`);
                    }
                    
                    // Apply compression for videos
                    if (fileInfo.type === 'video' && fileInfo.compressedBlob) {
                        fileToUpload = fileInfo.compressedBlob;
                        fileInfo.size = fileInfo.compressedBlob.size;
                        console.log(`🎥 Видео сжато: ${formatFileSize(fileInfo.originalSize)} → ${formatFileSize(fileInfo.size)}`);
                    } else if (fileInfo.type === 'video' && fileInfo.compressionOptions) {
                        console.log(`🎥 Видео будет сжато до: ${fileInfo.compressionOptions.targetWidth}px`);
                    }
                    
                    // Use specific endpoint for voice messages
                    let uploadedFile;
                    if (fileInfo.type === 'voice') {
                        uploadedFile = await uploadVoiceMessage(fileToUpload, fileInfo.duration || 0);
                    } else {
                        uploadedFile = await uploadFile(fileToUpload, fileInfo.type);
                    }
                    if (uploadedFile) {
                        fileInfo.url = uploadedFile.url;
                        fileInfo.s3_key = uploadedFile.s3_key;
                        fileInfo.isLocal = false;
                        fileInfo.uploaded = true;
                        
                        // Update duration for voice messages
                        if (fileInfo.type === 'voice' && uploadedFile.duration) {
                            fileInfo.duration = uploadedFile.duration;
                        }
                        
                        // Store preview in cache
                        if (fileInfo.previewDataUrl) {
                            imagePreviews[uploadedFile.url] = {
                                preview: fileInfo.previewDataUrl,
                                full: uploadedFile.url,
                                timestamp: Date.now()
                            };
                        }
                    }
                } catch (error) {
                    console.error('Ошибка загрузки файла:', error);
                    fileInfo.uploaded = false;
                }
            }
        }
    }
    
    // Add message to local cache immediately
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
    
    // Update UI immediately
    appendMessage(message);
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Clear attachments
    clearAttachments();
    
    // Cancel reply if any
    cancelReply();
    
    // Scroll to bottom
    scrollToBottom();
    
    // Show notification
    showNotification('Сообщение отправлено', 'success');
    
    // Play sound if enabled
    playSound('send');
    
    // Save to S3 in background
    saveMessageToS3(message).then(success => {
        if (success) {
            message.is_local = false;
            updateMessageStatus(messageId, 'sent');
        } else {
            updateMessageStatus(messageId, 'error');
            showNotification('Ошибка сохранения в облако', 'error');
        }
    });
    
    console.log('📤 Сообщение отправлено:', message);
}

function createMessageElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const user = usersCache[message.user_id] || message.user || {};
    const userName = user.first_name || 'Пользователь';
    const userColor = stringToColor(message.user_id);
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    messageElement.dataset.messageId = message.id;
    
    // Get user avatar (photo_url from Telegram or fallback to initial)
    const userAvatar = getUserAvatar(user, userColor, userName);
    
    // Check if deleted
    if (message.deleted) {
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
    
    // Files with lazy loading and previews
    if (message.files && message.files.length > 0) {
        filesHTML = message.files.map(file => {
            if (file.type === 'photo') {
                // Use preview if available
                const previewUrl = file.previewDataUrl || file.dataUrl || file.url;
                const fullUrl = file.url || file.dataUrl;
                
                return `
                    <div class="message-media">
                        <img src="${previewUrl}" 
                             alt="${escapeHtml(file.name || 'Изображение')}" 
                             class="message-image lazy-image"
                             ${fullUrl && fullUrl !== previewUrl ? `data-full-src="${fullUrl}"` : ''}
                             loading="lazy"
                             onclick="showImagePreview('${fullUrl}')">
                        ${file.compressed ? '<div class="compression-badge" title="Изображение сжато"><i class="fas fa-compress-alt"></i></div>' : ''}
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
                // Get audio URL - use blob URL if file not uploaded yet
                let audioUrl = file.url || '';
                if (!audioUrl && file.blob) {
                    audioUrl = URL.createObjectURL(file.blob);
                }
                
                const voiceHtml = `
                    <div class="voice-message" data-audio-url="${audioUrl}" data-message-id="${message.id}" data-duration="${file.duration || 0}" data-file-id="${file.id || ''}">
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
                
                // Инициализируем перемотку после добавления в DOM
                // Используем requestAnimationFrame для гарантии что элемент в DOM
                requestAnimationFrame(() => {
                    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
                    if (messageElement) {
                        const voiceElement = messageElement.querySelector('.voice-message');
                        if (voiceElement && !voiceElement.dataset.seekInitialized) {
                            voiceElement.dataset.seekInitialized = 'true';
                            initVoiceSeek(voiceElement);
                        }
                    }
                });
                
                return voiceHtml;
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
                         onclick="toggleReaction('${message.id}', '${emoji}')">
                        <span class="reaction-emoji">${emoji}</span>
                        <span class="reaction-count">${count}</span>
                    </div>
                `;
            })
            .join('');
        
        reactionsHTML = `<div class="message-reactions">${reactions}</div>`;
    }
    
    // Status (for outgoing messages)
    let statusHTML = '';
    if (isOutgoing) {
        let statusIcon = 'fa-check';
        if (message.is_local) {
            statusIcon = 'fa-clock';
        } else if (message.delivered) {
            statusIcon = 'fa-check-double';
        } else if (message.read) {
            statusIcon = 'fa-check-double text-primary';
        }
        
        statusHTML = `
            <div class="message-status">
                <div class="message-time">${time}</div>
                <i class="fas ${statusIcon}"></i>
            </div>
        `;
    }
    
    // Assemble message
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
    
    // Add reaction click handler
    const reactionArea = messageElement.querySelector('.message-reactions');
    if (reactionArea) {
        reactionArea.addEventListener('click', function(e) {
            e.stopPropagation();
            if (e.target.closest('.reaction')) {
                const reaction = e.target.closest('.reaction').dataset.emoji;
                toggleReaction(message.id, reaction);
            }
        });
    }
    
    // Добавляем кнопку реакций при наведении
    addReactionButtonToMessage(messageElement, message.id);
    
    return messageElement;
}

// Добавление кнопки реакций (показывается при клике на сообщение)
function addReactionButtonToMessage(messageElement, messageId) {
    // Проверяем, не добавлена ли уже кнопка
    if (messageElement.querySelector('.message-reaction-btn')) return;
    
    const reactionBtn = document.createElement('button');
    reactionBtn.className = 'message-reaction-btn';
    reactionBtn.innerHTML = '<i class="far fa-smile"></i>';
    reactionBtn.title = 'Добавить реакцию';
    reactionBtn.style.display = 'none';
    reactionBtn.onclick = (e) => {
        e.stopPropagation();
        showQuickReactionsMenu(messageId, reactionBtn);
    };
    
    messageElement.appendChild(reactionBtn);
    
    // Показываем кнопку при клике на сообщение (не на реакциях или других элементах)
    let clickTimeout = null;
    messageElement.addEventListener('click', function(e) {
        // Игнорируем клики на реакциях, кнопках, ссылках
        if (e.target.closest('.reaction') || 
            e.target.closest('button') || 
            e.target.closest('a') ||
            e.target.closest('.voice-message') ||
            e.target.closest('.message-media')) {
            return;
        }
        
        // Показываем кнопку реакций
        const rect = messageElement.getBoundingClientRect();
        reactionBtn.style.left = `${rect.right + 8}px`;
        reactionBtn.style.top = `${rect.top + rect.height / 2 - 16}px`;
        reactionBtn.style.display = 'flex';
        reactionBtn.style.opacity = '1';
        
        // Скрываем через 3 секунды или при клике вне сообщения
        clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
            reactionBtn.style.opacity = '0';
            setTimeout(() => {
                reactionBtn.style.display = 'none';
            }, 200);
        }, 3000);
    });
    
    // Скрываем при клике вне сообщения
    document.addEventListener('click', function hideReactionBtn(e) {
        if (!messageElement.contains(e.target) && !reactionBtn.contains(e.target)) {
            reactionBtn.style.opacity = '0';
            setTimeout(() => {
                reactionBtn.style.display = 'none';
            }, 200);
        }
    });
}

// Показать меню быстрых реакций
function showQuickReactionsMenu(messageId, button) {
    const menu = document.getElementById('quick-reactions-menu');
    if (!menu) return;
    
    const rect = button.getBoundingClientRect();
    menu.style.left = `${rect.left - 150}px`;
    menu.style.top = `${rect.top - 50}px`;
    menu.style.display = 'flex';
    menu.dataset.messageId = messageId;
    
    // Закрыть при клике вне меню
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !button.contains(e.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    }, 10);
}

// Добавить быструю реакцию
function addQuickReaction(emoji) {
    const menu = document.getElementById('quick-reactions-menu');
    if (!menu) return;
    
    const messageId = menu.dataset.messageId;
    if (messageId) {
        toggleReaction(messageId, emoji);
    }
    
    menu.style.display = 'none';
}

function appendMessage(message) {
    const container = document.getElementById('messages-wrapper');
    if (!container) return;
    
    const emptyChat = document.getElementById('empty-chat');
    if (emptyChat) emptyChat.style.display = 'none';
    
    const messageElement = createMessageElement(message);
    container.appendChild(messageElement);
    
    // Scroll to bottom if user is near bottom
    scrollToBottomIfNeeded();
}

function updateMessageElement(message) {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    if (messageElement) {
        const newElement = createMessageElement(message);
        messageElement.replaceWith(newElement);
    }
}

function updateMessageStatus(messageId, status) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    const statusIcon = messageElement.querySelector('.message-status i');
    if (statusIcon) {
        switch(status) {
            case 'sending':
                statusIcon.className = 'fas fa-clock';
                break;
            case 'sent':
                statusIcon.className = 'fas fa-check';
                break;
            case 'delivered':
                statusIcon.className = 'fas fa-check-double';
                break;
            case 'read':
                statusIcon.className = 'fas fa-check-double text-primary';
                break;
            case 'error':
                statusIcon.className = 'fas fa-exclamation-circle text-error';
                break;
        }
    }
}

// ===== FILE ATTACHMENTS WITH COMPRESSION =====
function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    if (!menu) return;
    
    if (menu.style.display === 'none' || !menu.style.display) {
        menu.style.display = 'flex';
        
        // Add click handlers
        const attachItems = menu.querySelectorAll('.attach-item');
        attachItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const type = this.dataset.type;
                handleAttachment(type);
                menu.style.display = 'none';
            });
        });
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target.id !== 'btn-attach') {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 10);
    } else {
        menu.style.display = 'none';
    }
}

function handleAttachment(type) {
    switch(type) {
        case 'photo':
            attachPhoto();
            break;
        case 'file':
            attachFile();
            break;
        case 'voice':
            startVoiceRecording();
            break;
        case 'poll':
            createPoll();
            break;
        case 'sticker':
            showStickerPicker();
            break;
        case 'gif':
            showGifPicker();
            break;
    }
}

// ===== STICKERS & GIFS =====
async function showStickerPicker() {
    const modal = document.getElementById('sticker-picker-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    // Load stickers from Telegram Bot API
    await loadTelegramStickers();
}

async function loadTelegramStickers() {
    const stickerSets = document.getElementById('sticker-sets');
    if (!stickerSets) return;
    
    stickerSets.innerHTML = '<div class="loading-stickers">Загрузка стикеров...</div>';
    
    try {
        // Try to get stickers via Telegram WebApp API
        if (tg && tg.initDataUnsafe) {
            // Use Telegram Bot API to get sticker sets
            const response = await fetch('/api/telegram/get-sticker-sets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUserId
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.sticker_sets) {
                    displayStickerSets(data.sticker_sets);
                    return;
                }
            }
        }
        
        // Fallback: show popular sticker sets
        displayStickerSets([]);
    } catch (error) {
        console.error('Ошибка загрузки стикеров:', error);
        stickerSets.innerHTML = '<div class="error-message">Не удалось загрузить стикеры</div>';
    }
}

function displayStickerSets(stickerSets) {
    const container = document.getElementById('sticker-sets');
    if (!container) return;
    
    if (stickerSets.length === 0) {
        // Show default sticker sets
        container.innerHTML = `
            <div class="sticker-set">
                <div class="sticker-set-title">Популярные стикеры</div>
                <div class="sticker-grid">
                    <div class="sticker-item" onclick="selectSticker('https://telegram.org/img/t_logo.png')">
                        <img src="https://telegram.org/img/t_logo.png" alt="Telegram">
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = stickerSets.map(set => `
        <div class="sticker-set">
            <div class="sticker-set-title">${set.title || set.name}</div>
            <div class="sticker-grid">
                ${set.stickers.map(sticker => `
                    <div class="sticker-item" onclick="selectSticker('${sticker.file_url || sticker.url}')">
                        <img src="${sticker.thumb_url || sticker.file_url || sticker.url}" alt="Sticker">
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function selectSticker(stickerUrl) {
    // Add sticker as attachment
    const stickerInfo = {
        id: 'sticker_' + Date.now(),
        type: 'sticker',
        url: stickerUrl,
        name: 'Стикер',
        isLocal: false,
        uploaded: true
    };
    
    attachedFiles.push(stickerInfo);
    showFilePreview(stickerInfo);
    
    // Close modal
    const modal = document.getElementById('sticker-picker-modal');
    if (modal) modal.style.display = 'none';
    
    // Enable send button
    document.getElementById('btn-send').disabled = false;
}

async function showGifPicker() {
    const modal = document.getElementById('gif-picker-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    // Load popular GIFs
    await loadGifs();
}

async function loadGifs(query = '') {
    const gifGrid = document.getElementById('gif-grid');
    if (!gifGrid) return;
    
    gifGrid.innerHTML = '<div class="loading-gifs">Загрузка GIF...</div>';
    
    try {
        // Use Giphy API or similar service
        const url = query 
            ? `/api/gifs/search?q=${encodeURIComponent(query)}`
            : '/api/gifs/trending';
        
        const response = await fetch(url);
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.gifs) {
                displayGifs(data.gifs);
                return;
            }
        }
        
        // Fallback: show placeholder GIFs
        displayGifs([]);
    } catch (error) {
        console.error('Ошибка загрузки GIF:', error);
        gifGrid.innerHTML = '<div class="error-message">Не удалось загрузить GIF</div>';
    }
}

function displayGifs(gifs) {
    const container = document.getElementById('gif-grid');
    if (!container) return;
    
    // Default popular GIFs if no results
    const defaultGifs = [
        'https://media.giphy.com/media/3o7aCTPPm4OHfRLSH6/giphy.gif',
        'https://media.giphy.com/media/l0MYC0LajaoPoHABu/giphy.gif',
        'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
        'https://media.giphy.com/media/3o7aD2saal8xXDlR84/giphy.gif',
        'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
        'https://media.giphy.com/media/3o7abldet0lR2kf3Ow/giphy.gif',
        'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif',
        'https://media.giphy.com/media/l0HlNQ03J5JxX6lva/giphy.gif'
    ];
    
    if (gifs.length === 0) {
        container.innerHTML = defaultGifs.map(gifUrl => `
            <div class="gif-item" onclick="selectGif('${gifUrl}')">
                <img src="${gifUrl}" alt="GIF" loading="lazy">
            </div>
        `).join('');
        return;
    }
    
    container.innerHTML = gifs.map(gif => `
        <div class="gif-item" onclick="selectGif('${gif.url || gif.images?.original?.url}')">
            <img src="${gif.thumb_url || gif.images?.preview?.url || gif.url}" alt="GIF" loading="lazy">
        </div>
    `).join('');
}

function selectGif(gifUrl) {
    // Add GIF as attachment
    const gifInfo = {
        id: 'gif_' + Date.now(),
        type: 'gif',
        url: gifUrl,
        name: 'GIF',
        isLocal: false,
        uploaded: true
    };
    
    attachedFiles.push(gifInfo);
    showFilePreview(gifInfo);
    
    // Close modal
    const modal = document.getElementById('gif-picker-modal');
    if (modal) modal.style.display = 'none';
    
    // Enable send button
    document.getElementById('btn-send').disabled = false;
}

// Make functions global
window.selectSticker = selectSticker;
window.selectGif = selectGif;

// ===== MIRROR CONSTRUCTOR =====
function showMirrorConstructor() {
    const modal = document.getElementById('mirror-constructor-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

async function createMirror() {
    const name = document.getElementById('mirror-name')?.value.trim();
    const token = document.getElementById('mirror-token')?.value.trim();
    const domain = document.getElementById('mirror-domain')?.value.trim() || window.location.origin;
    const isPublic = document.getElementById('mirror-public')?.checked || false;
    
    if (!name || !token) {
        showNotification('Заполните все обязательные поля', 'error');
        return;
    }
    
    // Validate token format (basic check)
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        showNotification('Неверный формат токена', 'error');
        return;
    }
    
    try {
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
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                showNotification('Зеркало успешно создано!', 'success');
                
                // Close modal
                const modal = document.getElementById('mirror-constructor-modal');
                if (modal) modal.style.display = 'none';
                
                // Reset form
                document.getElementById('mirror-name').value = '';
                document.getElementById('mirror-token').value = '';
                document.getElementById('mirror-domain').value = '';
                document.getElementById('mirror-public').checked = false;
                
                // Show mirror URL
                if (data.mirror_url) {
                    showNotification(`Зеркало доступно по адресу: ${data.mirror_url}`, 'info');
                }
            } else {
                showNotification(data.message || 'Ошибка создания зеркала', 'error');
            }
        } else {
            showNotification('Ошибка создания зеркала', 'error');
        }
    } catch (error) {
        console.error('Ошибка создания зеркала:', error);
        showNotification('Ошибка создания зеркала', 'error');
    }
}

function attachPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            await processAttachment(file);
        }
    };
    
    input.click();
}

function attachFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            await processAttachment(file);
        }
    };
    
    input.click();
}

async function processAttachment(file) {
    try {
        // Check file size
        let maxSize = API_CONFIG.maxFileSize;
        if (file.type.startsWith('video/')) {
            maxSize = API_CONFIG.maxVideoSize;
        }
        
        if (file.size > maxSize) {
            showNotification(`Файл слишком большой. Максимум: ${formatFileSize(maxSize)}`, 'error');
            return;
        }
        
        // Determine type
        let type = 'file';
        if (file.type.startsWith('image/')) {
            type = 'photo';
        } else if (file.type.startsWith('video/')) {
            type = 'video';
        } else if (file.type.startsWith('audio/')) {
            type = 'audio';
        }
        
        let fileInfo = {
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            file: file,
            name: file.name,
            type: type,
            size: file.size,
            mimeType: file.type,
            isLocal: true,
            uploaded: false
        };
        
        // Apply compression and create previews
        if (type === 'photo') {
            // Show compression in progress
            showUploadProgress(true, 'Сжатие изображения...');
            
            // Compress image (uses default: quality 0.7, maxWidth 1600)
            const compressed = await compressImage(file);
            fileInfo.compressedBlob = compressed.blob;
            fileInfo.compressed = true;
            fileInfo.originalSize = compressed.originalSize;
            fileInfo.size = compressed.size;
            
            // Create preview
            const preview = await createImagePreview(file, 400, 0.6);
            fileInfo.previewDataUrl = preview.dataUrl;
            fileInfo.dataUrl = compressed.dataUrl;
            
            // Hide progress
            showUploadProgress(false);
            
            console.log(`🖼️ Изображение сжато: ${formatFileSize(fileInfo.originalSize)} → ${formatFileSize(fileInfo.size)} (${Math.round((1 - fileInfo.size / fileInfo.originalSize) * 100)}% меньше)`);
            
        } else if (type === 'video') {
            // Show compression in progress
            showUploadProgress(true, 'Обработка видео...');
            
            // Get video metadata and compress if possible
            const compressionOptions = await compressVideo(file);
            fileInfo.compressionOptions = compressionOptions;
            fileInfo.duration = compressionOptions.duration;
            
            // Use compressed blob if available
            if (compressionOptions.compressed && compressionOptions.compressedBlob) {
                fileInfo.compressedBlob = compressionOptions.compressedBlob;
                fileInfo.compressed = true;
                fileInfo.originalSize = compressionOptions.originalSize;
                fileInfo.size = compressionOptions.size;
                console.log(`🎥 Видео сжато: ${formatFileSize(fileInfo.originalSize)} → ${formatFileSize(fileInfo.size)} (${Math.round((1 - fileInfo.size / fileInfo.originalSize) * 100)}% меньше)`);
            }
            
            // Create video preview
            const preview = await createVideoPreview(file, 400);
            fileInfo.previewDataUrl = preview.dataUrl;
            fileInfo.thumbnail = preview.dataUrl;
            fileInfo.duration = preview.duration;
            
            // Create data URL for preview
            fileInfo.dataUrl = URL.createObjectURL(file);
            
            // Hide progress
            showUploadProgress(false);
            
            if (compressionOptions.compressed) {
                console.log(`🎥 Видео сжато до: ${compressionOptions.targetWidth}x${compressionOptions.targetHeight}`);
            } else {
                console.log(`🎥 Видео будет сжато до: ${compressionOptions.targetWidth}x${compressionOptions.targetHeight} (требуется серверная обработка)`);
            }
            
        } else {
            // For other files, just create data URL
            fileInfo.dataUrl = await fileToDataURL(file);
        }
        
        // Add to attachments
        attachedFiles.push(fileInfo);
        
        // Show preview
        showFilePreview(fileInfo);
        
        // Enable send button
        document.getElementById('btn-send').disabled = false;
        
        showNotification('Файл прикреплен', 'success');
        
    } catch (error) {
        console.error('Ошибка обработки файла:', error);
        showNotification('Ошибка прикрепления файла', 'error');
        showUploadProgress(false);
    }
}

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showFilePreview(fileInfo) {
    const container = document.getElementById('file-preview-container');
    if (!container) {
        // Create container if it doesn't exist
        const previewDiv = document.createElement('div');
        previewDiv.className = 'file-preview';
        previewDiv.id = 'file-preview';
        previewDiv.innerHTML = `
            <div id="file-preview-container"></div>
            <div class="file-preview-actions">
                <button class="btn-admin-action danger" id="btn-cancel-files">Отмена</button>
                <button class="btn-admin-action primary" id="btn-send-files">Отправить</button>
            </div>
        `;
        
        const inputArea = document.querySelector('.input-area');
        if (inputArea) {
            inputArea.insertBefore(previewDiv, inputArea.firstChild);
        }
        
        // Add event listeners
        const btnCancelFiles = document.getElementById('btn-cancel-files');
        const btnSendFiles = document.getElementById('btn-send-files');
        
        if (btnCancelFiles) btnCancelFiles.addEventListener('click', clearAttachments);
        if (btnSendFiles) btnSendFiles.addEventListener('click', sendMessage);
    }
    
    const previewContainer = document.getElementById('file-preview-container');
    if (!previewContainer) return;
    
    const preview = document.createElement('div');
    preview.className = 'file-preview-item';
    preview.dataset.fileId = fileInfo.id;
    
    let previewContent = '';
    let compressionBadge = '';
    
    if (fileInfo.type === 'photo') {
        if (fileInfo.compressed) {
            compressionBadge = `<div class="compression-badge-preview" title="Изображение будет сжато"><i class="fas fa-compress-alt"></i> ${Math.round((1 - fileInfo.size / fileInfo.originalSize) * 100)}%</div>`;
        }
        previewContent = `
            <img src="${fileInfo.previewDataUrl || fileInfo.dataUrl}" 
                 alt="${escapeHtml(fileInfo.name)}" 
                 class="file-preview-image"
                 loading="lazy">
            ${compressionBadge}
        `;
    } else if (fileInfo.type === 'video') {
        if (fileInfo.compressionOptions) {
            compressionBadge = `<div class="compression-badge-preview" title="Видео будет сжато"><i class="fas fa-compress-alt"></i> ${fileInfo.compressionOptions.targetWidth}px</div>`;
        }
        previewContent = `
            <div class="file-preview-video">
                <video src="${fileInfo.dataUrl}" 
                       controls 
                       poster="${fileInfo.previewDataUrl || ''}"
                       preload="metadata"></video>
                ${compressionBadge}
            </div>
        `;
    } else {
        previewContent = `
            <div class="file-preview-document">
                <i class="fas fa-file"></i>
                <span>${escapeHtml(fileInfo.name)}</span>
            </div>
        `;
    }
    
    const sizeInfo = fileInfo.compressed ? 
        `<span class="file-size-compressed">${formatFileSize(fileInfo.originalSize)} → ${formatFileSize(fileInfo.size)}</span>` :
        `<span class="file-size">${formatFileSize(fileInfo.size)}</span>`;
    
    preview.innerHTML = `
        <div class="file-preview-header">
            <i class="fas fa-${fileInfo.type === 'photo' ? 'image' : 'file'}"></i>
            <span class="file-name">${escapeHtml(fileInfo.name)}</span>
            <button class="btn-remove-file" onclick="removeAttachment('${fileInfo.id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="file-preview-content">
            ${previewContent}
        </div>
        <div class="file-preview-footer">
            ${sizeInfo}
        </div>
    `;
    
    previewContainer.appendChild(preview);
    
    // Show preview container
    document.getElementById('file-preview').style.display = 'block';
}

function removeAttachment(fileId) {
    const fileInfo = attachedFiles.find(file => file.id === fileId);
    if (fileInfo) {
        // Clean up object URLs
        if (fileInfo.dataUrl && fileInfo.dataUrl.startsWith('blob:')) {
            URL.revokeObjectURL(fileInfo.dataUrl);
        }
    }
    
    attachedFiles = attachedFiles.filter(file => file.id !== fileId);
    
    // Remove preview
    const preview = document.querySelector(`[data-file-id="${fileId}"]`);
    if (preview) preview.remove();
    
    // Hide preview container if no files
    if (attachedFiles.length === 0) {
        const previewContainer = document.getElementById('file-preview');
        if (previewContainer) previewContainer.style.display = 'none';
    }
}

function clearAttachments() {
    attachedFiles.forEach(file => {
        if (file.dataUrl && file.dataUrl.startsWith('blob:')) {
            URL.revokeObjectURL(file.dataUrl);
        }
    });
    
    attachedFiles = [];
    
    const previewContainer = document.getElementById('file-preview');
    if (previewContainer) {
        previewContainer.style.display = 'none';
        const container = document.getElementById('file-preview-container');
        if (container) container.innerHTML = '';
    }
    
    document.getElementById('btn-send').disabled = 
        document.getElementById('message-input').value.trim() === '';
}

// ===== VOICE RECORDING =====
async function startVoiceRecording() {
    try {
        // Check if in Telegram WebApp - use Telegram's voice recording
        if (tg && tg.openVoiceRecording) {
            try {
                tg.openVoiceRecording();
                return;
            } catch (error) {
                console.log('Telegram voice recording not available, using fallback');
            }
        }
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showNotification('Запись голоса не поддерживается в вашем браузере', 'error');
            return;
        }
        
        // Stop any ongoing recording
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            return;
        }
        
        // Request microphone permission with better compatibility
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            } 
        });
        
        // Try different MIME types for better compatibility
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/ogg;codecs=opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = ''; // Use default
                }
            }
        }
        
        // Initialize MediaRecorder
        const options = mimeType ? { mimeType: mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
        mediaRecorder = new MediaRecorder(stream, options);
        
        audioChunks = [];
        
        // Handle data available
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        // Handle recording stop
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
            
            // Calculate duration
            const duration = recordingStartTime ? Math.round((Date.now() - recordingStartTime) / 1000) : 0;
            
            // Create voice message
            const voiceInfo = {
                id: 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                blob: audioBlob,
                file: audioBlob, // Add file property for upload
                name: 'Голосовое сообщение',
                type: 'voice',
                size: audioBlob.size,
                mimeType: mimeType || 'audio/webm',
                duration: duration,
                isLocal: true,
                uploaded: false
            };
            
            // Add to attachments
            attachedFiles.push(voiceInfo);
            
            // Show preview
            showFilePreview(voiceInfo);
            
            // Enable send button
            document.getElementById('btn-send').disabled = false;
            
            // Stop tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Hide recorder UI
            hideVoiceRecorder();
            
            // Reset timer
            clearInterval(recordingTimer);
            recordingTimer = null;
            
            showNotification('Голосовое сообщение записано', 'success');
        };
        
        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms
        recordingStartTime = Date.now();
        
        // Show recorder UI
        showVoiceRecorder();
        
        // Start timer
        startRecordingTimer();
        
        // Auto-stop after 1 minute
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 60000);
        
    } catch (error) {
        console.error('Ошибка записи голоса:', error);
        showNotification('Ошибка доступа к микрофону', 'error');
    }
}

function showVoiceRecorder() {
    const voiceRecorder = document.getElementById('voice-recorder');
    const inputArea = document.getElementById('input-area');
    
    if (voiceRecorder && inputArea) {
        voiceRecorder.style.display = 'block';
        inputArea.style.paddingBottom = '200px';
    }
}

function hideVoiceRecorder() {
    const voiceRecorder = document.getElementById('voice-recorder');
    const inputArea = document.getElementById('input-area');
    
    if (voiceRecorder && inputArea) {
        voiceRecorder.style.display = 'none';
        inputArea.style.paddingBottom = '';
    }
}

function startRecordingTimer() {
    const timerElement = document.getElementById('recording-timer');
    if (!timerElement) return;
    
    recordingTimer = setInterval(() => {
        if (!recordingStartTime) return;
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder = null;
        audioChunks = [];
        
        // Hide recorder
        hideVoiceRecorder();
        
        // Reset timer
        clearInterval(recordingTimer);
        recordingTimer = null;
        
        showNotification('Запись отменена', 'info');
    }
}

async function sendVoiceMessage() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

// Глобальный объект для хранения активных аудио плееров
let activeVoicePlayers = {};

function playVoiceMessage(url, element) {
    const messageId = element.dataset.messageId;
    
    // Если уже есть активный плеер для этого сообщения, используем его
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
    
    // Проверяем URL
    if (!url || url === '') {
        console.error('❌ URL голосового сообщения пустой');
        showNotification('Ошибка: URL голосового сообщения не найден', 'error');
        return;
    }
    
    // Создаем новый аудио плеер
    const audio = new Audio();
    
    // Устанавливаем crossOrigin только для внешних URL (не blob)
    if (!url.startsWith('blob:')) {
        audio.crossOrigin = 'anonymous';
    }
    
    audio.preload = 'auto';
    
    const playButton = element.querySelector('.voice-play-btn i');
    const progressBar = element.querySelector('.voice-progress');
    const currentTimeEl = element.querySelector('.voice-current-time');
    const duration = parseFloat(element.dataset.duration) || 0;
    
    // Обработка ошибок загрузки
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
    
    // Обработка загрузки метаданных
    audio.addEventListener('loadedmetadata', () => {
        console.log('✅ Метаданные аудио загружены:', audio.duration);
    });
    
    // Обработка начала загрузки
    audio.addEventListener('loadstart', () => {
        console.log('🔄 Начало загрузки аудио:', url);
        if (playButton) playButton.className = 'fas fa-spinner fa-spin';
    });
    
    // Обработка готовности к воспроизведению
    audio.addEventListener('canplay', () => {
        console.log('✅ Аудио готово к воспроизведению');
        if (playButton) playButton.className = 'fas fa-pause';
    });
    
    // Устанавливаем URL после настройки обработчиков
    // Проверяем и исправляем URL если нужно
    let audioUrl = url;
    
    // Если URL из S3, проверяем доступность
    if (audioUrl.includes('s3.ru-3.storage.selcloud.ru')) {
        // URL из S3 - используем как есть, но без crossOrigin для прямого доступа
        audio.crossOrigin = null;
        console.log('🎵 Воспроизведение из S3:', audioUrl);
    } else if (!audioUrl.startsWith('http')) {
        // Если относительный URL, делаем абсолютным
        audioUrl = audioUrl.startsWith('/') ? window.location.origin + audioUrl : window.location.origin + '/' + audioUrl;
        console.log('🎵 Воспроизведение локального файла:', audioUrl);
    } else {
        console.log('🎵 Воспроизведение внешнего URL:', audioUrl);
    }
    
    // Пробуем загрузить
    audio.src = audioUrl;
    
    // Дополнительная проверка доступности файла
    fetch(audioUrl, { method: 'HEAD' })
        .then(response => {
            if (!response.ok) {
                console.error('❌ Файл недоступен:', response.status, audioUrl);
                showNotification('Файл недоступен для воспроизведения', 'error');
                if (playButton) playButton.className = 'fas fa-play';
            } else {
                console.log('✅ Файл доступен, Content-Type:', response.headers.get('Content-Type'));
            }
        })
        .catch(err => {
            console.error('❌ Ошибка проверки файла:', err);
            // Не показываем ошибку, так как может быть CORS блокировка HEAD запроса
        });
    
    // Останавливаем все другие плееры
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
    
    // Сохраняем плеер
    activeVoicePlayers[messageId] = { audio, element };
    
    // Обновление прогресса
    audio.addEventListener('timeupdate', () => {
        const progress = audio.duration && !isNaN(audio.duration) ? (audio.currentTime / audio.duration) * 100 : 0;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = formatDuration(audio.currentTime);
        }
    });
    
    // Обработка окончания
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
    
    // Обработка паузы
    audio.addEventListener('pause', () => {
        if (playButton) playButton.className = 'fas fa-play';
    });
    
    // Обработка начала воспроизведения
    audio.addEventListener('play', () => {
        if (playButton) playButton.className = 'fas fa-pause';
    });
    
    // Воспроизведение
    audio.play().catch(err => {
        console.error('❌ Ошибка воспроизведения:', err, url);
        if (playButton) playButton.className = 'fas fa-play';
        
        // Пробуем альтернативный способ
        if (err.name === 'NotAllowedError') {
            showNotification('Разрешите воспроизведение аудио в браузере', 'warning');
        } else if (err.name === 'NotSupportedError') {
            showNotification('Формат аудио не поддерживается', 'error');
        } else {
            showNotification('Ошибка воспроизведения аудио', 'error');
        }
    });
}

// Перемотка голосового сообщения
function seekVoiceMessage(element, event) {
    const messageId = element.dataset.messageId;
    const player = activeVoicePlayers[messageId];
    
    // Если плеер не запущен, запускаем его сначала
    if (!player || !player.audio) {
        const audioUrl = element.dataset.audioUrl;
        if (audioUrl) {
            playVoiceMessage(audioUrl, element);
            // Ждем немного и повторяем попытку перемотки
            setTimeout(() => {
                seekVoiceMessage(element, event);
            }, 100);
        }
        return;
    }
    
    const waveform = element.querySelector('.voice-waveform');
    if (!waveform) return;
    
    const rect = waveform.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    
    if (player.audio.duration && !isNaN(player.audio.duration)) {
        player.audio.currentTime = (percentage / 100) * player.audio.duration;
    }
}

// Инициализация перемотки для голосовых сообщений
function initVoiceSeek(element) {
    const waveform = element.querySelector('.voice-waveform');
    if (!waveform) return;
    
    waveform.style.cursor = 'pointer';
    
    waveform.addEventListener('click', function(e) {
        e.stopPropagation();
        seekVoiceMessage(element, e);
    });
    
    // Поддержка перетаскивания для перемотки
    let isDragging = false;
    
    waveform.addEventListener('mousedown', function(e) {
        isDragging = true;
        seekVoiceMessage(element, e);
    });
    
    waveform.addEventListener('mousemove', function(e) {
        if (isDragging) {
            seekVoiceMessage(element, e);
        }
    });
    
    waveform.addEventListener('mouseup', function() {
        isDragging = false;
    });
    
    waveform.addEventListener('mouseleave', function() {
        isDragging = false;
    });
    
    // Touch события для мобильных
    waveform.addEventListener('touchstart', function(e) {
        e.stopPropagation();
        isDragging = true;
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX };
        seekVoiceMessage(element, fakeEvent);
    });
    
    waveform.addEventListener('touchmove', function(e) {
        if (isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            const fakeEvent = { clientX: touch.clientX };
            seekVoiceMessage(element, fakeEvent);
        }
    });
    
    waveform.addEventListener('touchend', function() {
        isDragging = false;
    });
}

// Скачивание голосового сообщения
function downloadVoiceMessage(event, url) {
    event.stopPropagation();
    if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `voice_${Date.now()}.ogg`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function downloadVoiceBlob(event, fileId) {
    event.stopPropagation();
    const fileInfo = attachedFiles.find(f => f.id === fileId);
    if (!fileInfo) {
        // Try to find in messages
        const messages = appData.channels[currentChannel]?.messages || [];
        for (const msg of messages) {
            if (msg.files) {
                const file = msg.files.find(f => f.id === fileId);
                if (file && file.blob) {
                    const url = URL.createObjectURL(file.blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'voice_message.webm';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    return;
                }
            }
        }
        return;
    }
    
    if (fileInfo.blob) {
        const url = URL.createObjectURL(fileInfo.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'voice_message.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

window.downloadVoiceMessage = downloadVoiceMessage;
window.downloadVoiceBlob = downloadVoiceBlob;

// Автовоспроизведение при выборе сообщения
function autoPlayVoiceOnSelect(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    const voiceMessage = messageElement.querySelector('.voice-message');
    if (voiceMessage && voiceMessage.dataset.audioUrl) {
        playVoiceMessage(voiceMessage.dataset.audioUrl, voiceMessage);
    }
}

// ===== EMOJI PICKER =====
function initEmojiPicker() {
    const emojiGrid = document.getElementById('emoji-grid');
    const categories = document.querySelectorAll('.emoji-category');
    
    if (!emojiGrid || categories.length === 0) return;
    
    // Load default category
    loadEmojis('smileys');
    
    // Category switcher
    categories.forEach(category => {
        category.addEventListener('click', function() {
            categories.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const categoryName = this.dataset.category;
            loadEmojis(categoryName);
        });
    });
}

function loadEmojis(category) {
    const emojiGrid = document.getElementById('emoji-grid');
    if (!emojiGrid) return;
    
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

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    if (!picker) return;
    
    if (picker.style.display === 'none' || !picker.style.display) {
        picker.style.display = 'flex';
        
        // Position picker above input
        const inputArea = document.querySelector('.input-area');
        if (inputArea) {
            const rect = inputArea.getBoundingClientRect();
            picker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        }
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closePicker(e) {
                if (!picker.contains(e.target) && e.target.id !== 'btn-emoji') {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closePicker);
                }
            });
        }, 10);
    } else {
        picker.style.display = 'none';
    }
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    if (input) {
        const cursorPos = input.selectionStart;
        const textBefore = input.value.substring(0, cursorPos);
        const textAfter = input.value.substring(cursorPos);
        
        input.value = textBefore + emoji + textAfter;
        input.selectionStart = input.selectionEnd = cursorPos + emoji.length;
        
        // Trigger input event for auto-resize
        input.dispatchEvent(new Event('input'));
        input.focus();
        
        // Close picker
        const picker = document.getElementById('emoji-picker');
        if (picker) picker.style.display = 'none';
    }
}

// ===== CHANNEL MANAGEMENT =====
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
    
    // Add to local cache
    appData.channels[channelId] = channel;
    
    // Update UI
    addChannelToSidebar(channel);
    
    // Save to S3
    await saveChannelToS3(channel);
    
    // Close modal
    closeModal('create-channel-modal');
    
    // Clear form
    nameInput.value = '';
    descInput.value = '';
    typeSelect.value = 'public';
    
    showNotification('Канал создан', 'success');
    
    // Switch to new channel
    switchChannel(channelId);
}

function addChannelToSidebar(channel) {
    const channelsList = document.getElementById('channels-sidebar-list');
    if (!channelsList) return;
    
    const channelElement = document.createElement('div');
    channelElement.className = 'channel-item';
    channelElement.dataset.channel = channel.id;
    channelElement.innerHTML = `
        <div class="channel-icon">
            <i class="fas fa-hashtag"></i>
        </div>
        <div class="channel-name">${escapeHtml(channel.name)}</div>
        <div class="unread-badge" style="display: none;">0</div>
    `;
    
    channelElement.addEventListener('click', () => {
        switchChannel(channel.id);
        closeSidebar();
    });
    
    channelsList.appendChild(channelElement);
}

function switchChannel(channelId) {
    if (!appData.channels[channelId]) return;
    
    // Update current channel
    currentChannel = channelId;
    
    // Update UI
    updateChannelUI();
    
    // Load messages
    loadMessages();
    
    // Update active state in sidebar
    updateChannelActiveState();
}

function updateChannelUI() {
    const channel = appData.channels[currentChannel];
    if (!channel) return;
    
    // Update header
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) {
        chatTitle.textContent = channel.name;
    }
    
    // Update online count
    updateOnlineCount();
}

function updateChannelActiveState() {
    const channelItems = document.querySelectorAll('.channel-item');
    channelItems.forEach(item => {
        if (item.dataset.channel === currentChannel) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// ===== ADMIN FUNCTIONS =====
function handleAdminAction(action) {
    switch(action) {
        case 'users':
            showUserManagement();
            break;
        case 'roles':
            showRoleManagement();
            break;
        case 'settings':
            showAdminSettings();
            break;
        case 'stats':
            showStatistics();
            break;
    }
    
    closeSidebar();
}

// ===== USER MANAGEMENT =====
function showUserManagement() {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут просматривать список участников', 'error');
        return;
    }
    
    const modal = document.getElementById('users-list-modal');
    if (modal) {
        modal.style.display = 'flex';
        loadUsersList();
    }
}

function loadUsersList() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    // Get all users from cache
    const users = Object.values(usersCache);
    
    if (users.length === 0) {
        usersList.innerHTML = '<div class="empty-state">Нет участников</div>';
        return;
    }
    
    // Sort users: admins first, then by name
    users.sort((a, b) => {
        const roleOrder = { 'main_admin': 0, 'admin': 1, 'moderator': 2, 'user': 3 };
        const roleA = roleOrder[a.role] || 3;
        const roleB = roleOrder[b.role] || 3;
        if (roleA !== roleB) return roleA - roleB;
        return (a.first_name || '').localeCompare(b.first_name || '');
    });
    
    users.forEach(user => {
        const userItem = createUserListItem(user);
        usersList.appendChild(userItem);
    });
    
    // Add search functionality
    const searchInput = document.getElementById('users-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterUsersList(e.target.value);
        });
    }
}

function createUserListItem(user) {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = user.id;
    
    const userColor = stringToColor(user.id);
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Пользователь';
    const userRole = user.role || 'user';
    const roleInfo = appData.roles[userRole] || appData.roles.user;
    
    const isMuted = mutedUsers.has(user.id.toString());
    const isBanned = bannedUsers.has(user.id.toString());
    
    userItem.innerHTML = `
        <div class="user-item-avatar">
            ${getUserAvatar(user, userColor, userName)}
        </div>
        <div class="user-item-info">
            <div class="user-item-name">${escapeHtml(userName)}</div>
            <div class="user-item-meta">
                <span class="user-role-badge" style="background-color: ${roleInfo.color}">
                    ${roleInfo.name}
                </span>
                ${isMuted ? '<span class="user-status-badge muted"><i class="fas fa-volume-mute"></i> Заглушен</span>' : ''}
                ${isBanned ? '<span class="user-status-badge banned"><i class="fas fa-ban"></i> Забанен</span>' : ''}
            </div>
        </div>
        <button class="btn-user-action" onclick="showUserActions('${user.id}')">
            <i class="fas fa-ellipsis-v"></i>
        </button>
    `;
    
    return userItem;
}

function filterUsersList(query) {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    const userItems = usersList.querySelectorAll('.user-item');
    const lowerQuery = query.toLowerCase();
    
    userItems.forEach(item => {
        const userName = item.querySelector('.user-item-name')?.textContent.toLowerCase() || '';
        if (userName.includes(lowerQuery)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

let currentEditingUserId = null;

function showUserActions(userId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут управлять пользователями', 'error');
        return;
    }
    
    currentEditingUserId = userId;
    const user = usersCache[userId];
    if (!user) return;
    
    const modal = document.getElementById('user-actions-modal');
    const preview = document.getElementById('user-info-preview');
    const roleSelect = document.getElementById('user-role-select');
    const muteBtn = document.getElementById('btn-mute-user');
    const unmuteBtn = document.getElementById('btn-unmute-user');
    const banBtn = document.getElementById('btn-ban-user');
    const unbanBtn = document.getElementById('btn-unban-user');
    
    if (!modal) return;
    
    // Update preview
    const userColor = stringToColor(user.id);
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Пользователь';
    
    if (preview) {
        preview.innerHTML = `
            <div class="user-preview-avatar">
                ${getUserAvatar(user, userColor, userName)}
            </div>
            <div class="user-preview-name">${escapeHtml(userName)}</div>
            <div class="user-preview-username">@${user.username || 'без имени'}</div>
        `;
    }
    
    // Set current role
    if (roleSelect) {
        roleSelect.value = user.role || 'user';
    }
    
    // Update mute/ban buttons
    const isMuted = mutedUsers.has(userId.toString());
    const isBanned = bannedUsers.has(userId.toString());
    
    if (muteBtn) muteBtn.style.display = isMuted ? 'none' : 'block';
    if (unmuteBtn) unmuteBtn.style.display = isMuted ? 'block' : 'none';
    if (banBtn) banBtn.style.display = isBanned ? 'none' : 'block';
    if (unbanBtn) unbanBtn.style.display = isBanned ? 'block' : 'none';
    
    modal.style.display = 'flex';
}

async function saveUserActions() {
    if (!currentEditingUserId) return;
    
    const roleSelect = document.getElementById('user-role-select');
    const newRole = roleSelect?.value || 'user';
    
    // Update role
    await updateUserRole(currentEditingUserId, newRole);
    
    // Close modal
    const modal = document.getElementById('user-actions-modal');
    if (modal) modal.style.display = 'none';
    
    // Reload users list
    loadUsersList();
    
    showNotification('Изменения сохранены', 'success');
}

async function updateUserRole(userId, role) {
    if (!isMainAdmin && role === 'main_admin') {
        showNotification('Только главный админ может назначать главных админов', 'error');
        return;
    }
    
    const user = usersCache[userId];
    if (!user) return;
    
    user.role = role;
    
    // Update in S3
    try {
        const response = await fetch(API_CONFIG.endpoints.updateUser, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                role: role
            })
        });
        
        if (response.ok) {
            console.log(`✅ Роль пользователя ${userId} обновлена на ${role}`);
        }
    } catch (error) {
        console.error('❌ Ошибка обновления роли:', error);
    }
}

function muteUser(userId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут заглушать пользователей', 'error');
        return;
    }
    
    mutedUsers.add(userId.toString());
    showNotification('Пользователь заглушен', 'success');
    saveUserActions();
}

function unmuteUser(userId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут разглушать пользователей', 'error');
        return;
    }
    
    mutedUsers.delete(userId.toString());
    showNotification('Пользователь разглушен', 'success');
    saveUserActions();
}

function banUser(userId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут банить пользователей', 'error');
        return;
    }
    
    if (userId === currentUserId) {
        showNotification('Нельзя забанить самого себя', 'error');
        return;
    }
    
    bannedUsers.add(userId.toString());
    showNotification('Пользователь забанен', 'success');
    saveUserActions();
}

function unbanUser(userId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут разбанивать пользователей', 'error');
        return;
    }
    
    bannedUsers.delete(userId.toString());
    showNotification('Пользователь разбанен', 'success');
    saveUserActions();
}

// Make functions global for onclick handlers
window.showUserActions = showUserActions;
window.muteUser = muteUser;
window.unmuteUser = unmuteUser;
window.banUser = banUser;
window.unbanUser = unbanUser;

function showRoleManagement() {
    showModal('manage-roles-modal');
    loadRoles();
}

function showAdminSettings() {
    // Implementation for admin settings
    showNotification('Настройки администратора', 'info');
}

function showStatistics() {
    // Implementation for statistics
    showNotification('Статистика', 'info');
}

function loadRoles() {
    const rolesList = document.getElementById('roles-list');
    if (!rolesList) return;
    
    rolesList.innerHTML = '';
    
    Object.values(appData.roles).forEach(role => {
        const roleElement = document.createElement('div');
        roleElement.className = 'role-item';
        roleElement.innerHTML = `
            <div class="role-info">
                <div class="role-color" style="background-color: ${role.color}"></div>
                <div class="role-name">${role.name}</div>
            </div>
            <div class="role-actions">
                <button class="btn-edit-role" data-role="${role.id}">
                    <i class="fas fa-edit"></i>
                </button>
                ${role.id !== 'user' ? `
                    <button class="btn-delete-role" data-role="${role.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        `;
        
        rolesList.appendChild(roleElement);
    });
    
    // Add event listeners
    document.querySelectorAll('.btn-edit-role').forEach(btn => {
        btn.addEventListener('click', function() {
            const roleId = this.dataset.role;
            editRole(roleId);
        });
    });
    
    document.querySelectorAll('.btn-delete-role').forEach(btn => {
        btn.addEventListener('click', function() {
            const roleId = this.dataset.role;
            deleteRole(roleId);
        });
    });
}

function editRole(roleId) {
    const role = appData.roles[roleId];
    if (!role) return;
    
    const newName = prompt('Введите новое название роли:', role.name);
    if (newName && newName !== role.name) {
        role.name = newName;
        saveRoleToS3(role);
        loadRoles();
        showNotification('Роль обновлена', 'success');
    }
}

function deleteRole(roleId) {
    if (roleId === 'user' || roleId === 'main_admin') {
        showNotification('Эту роль нельзя удалить', 'error');
        return;
    }
    
    if (confirm(`Удалить роль "${appData.roles[roleId]?.name}"?`)) {
        delete appData.roles[roleId];
        saveRolesToS3();
        loadRoles();
        showNotification('Роль удалена', 'success');
    }
}

// ===== MODAL FUNCTIONS =====
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById('overlay');
    
    if (modal && overlay) {
        modal.classList.add('active');
        overlay.classList.add('active');
        
        // Close on overlay click
        overlay.addEventListener('click', function closeModalOnOverlay() {
            modal.classList.remove('active');
            overlay.classList.remove('active');
            overlay.removeEventListener('click', closeModalOnOverlay);
        });
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById('overlay');
    
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

// ===== MEDIA PREVIEW =====
function showImagePreview(imageUrl) {
    const modal = document.getElementById('image-preview-modal');
    const image = document.getElementById('preview-image');
    
    if (modal && image) {
        // Show loading
        image.src = '';
        image.classList.add('loading');
        
        // Load image
        const img = new Image();
        img.onload = function() {
            image.src = imageUrl;
            image.classList.remove('loading');
            
            // Show compression info if available
            const compressionInfo = document.getElementById('compression-info');
            if (compressionInfo) {
                const cachedPreview = imagePreviews[imageUrl];
                if (cachedPreview) {
                    compressionInfo.innerHTML = `<i class="fas fa-compress-alt"></i> Используется превью`;
                } else {
                    compressionInfo.innerHTML = '';
                }
            }
        };
        
        img.onerror = function() {
            image.classList.remove('loading');
            image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f0f0f0"/><text x="200" y="150" text-anchor="middle" fill="#999">Ошибка загрузки</text></svg>';
        };
        
        img.src = imageUrl;
        
        modal.classList.add('active');
        
        // Close on background click
        modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.closest('.btn-close-preview')) {
                modal.classList.remove('active');
            }
        });
    }
}

function closeImagePreview() {
    const modal = document.getElementById('image-preview-modal');
    if (modal) modal.classList.remove('active');
}

function showVideoPlayer(videoUrl) {
    const modal = document.getElementById('video-player-modal');
    const video = document.getElementById('preview-video');
    
    if (modal && video) {
        video.src = videoUrl;
        modal.classList.add('active');
        
        // Close on background click
        modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.closest('.btn-close-preview')) {
                video.pause();
                modal.classList.remove('active');
            }
        });
    }
}

function closeVideoPlayer() {
    const modal = document.getElementById('video-player-modal');
    const video = document.getElementById('preview-video');
    
    if (modal) modal.classList.remove('active');
    if (video) video.pause();
}

function downloadImage() {
    const image = document.getElementById('preview-image');
    if (!image || !image.src) return;
    
    const link = document.createElement('a');
    link.href = image.src;
    link.download = `image_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Изображение скачивается', 'info');
}

function shareImage() {
    const image = document.getElementById('preview-image');
    if (!image || !image.src) return;
    
    if (navigator.share) {
        navigator.share({
            title: 'Изображение из чата',
            text: 'Посмотрите это изображение',
            url: image.src
        }).catch(error => {
            console.log('Ошибка при sharing:', error);
        });
    } else {
        // Fallback: copy to clipboard or show share dialog
        copyToClipboard(image.src);
        showNotification('Ссылка на изображение скопирована', 'success');
    }
}

// ===== DATA MANAGEMENT =====
async function loadAllData() {
    try {
        // Load users
        await loadUsers();
        
        // Load channels
        await loadChannels();
        
        // Load roles
        await loadRolesFromS3();
        
        console.log('✅ Все данные загружены');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

// Load user role from S3
async function loadUserRole() {
    try {
        // Check if main admin first (ID: 8089114323)
        if (currentUserId === '8089114323') {
            isMainAdmin = true;
            isAdmin = true;
            currentUser.role = 'main_admin';
            console.log('👑 Главный админ установлен');
            
            // Show admin section
            const adminSection = document.getElementById('admin-section');
            if (adminSection) adminSection.style.display = 'block';
            
            return;
        }
        
        const response = await fetch(`${API_CONFIG.endpoints.getUsers}?user_id=${currentUserId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.user) {
                const userRole = data.user.role || 'user';
                currentUser.role = userRole;
                
                // Set admin flags
                isAdmin = userRole === 'admin' || userRole === 'main_admin' || userRole === 'moderator';
                isMainAdmin = userRole === 'main_admin';
                
                // Show admin section if admin
                if (isAdmin || isMainAdmin) {
                    const adminSection = document.getElementById('admin-section');
                    if (adminSection) adminSection.style.display = 'block';
                }
                
                console.log(`👤 Роль пользователя: ${userRole}`);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки роли:', error);
        // Default role
        currentUser.role = 'user';
        isAdmin = false;
        isMainAdmin = false;
    }
}

async function loadUsers() {
    try {
        const response = await fetch(API_CONFIG.endpoints.getUsers);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                usersCache = data.users || {};
                
                // Update current user with photo_url if available
                if (usersCache[currentUserId] && usersCache[currentUserId].photo_url) {
                    currentUser.photo_url = usersCache[currentUserId].photo_url;
                }
                
                console.log(`👥 Загружено ${Object.keys(usersCache).length} пользователей`);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
        // Use demo users
        usersCache = {
            [currentUserId]: currentUser
        };
    }
}

async function loadChannels() {
    try {
        // Load from S3
        const response = await fetch(`${API_CONFIG.endpoints.getMessages}?type=channels`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.channels) {
                channelsCache = data.channels;
                
                // Merge with appData
                Object.assign(appData.channels, channelsCache);
                
                // Update sidebar
                updateChannelsSidebar();
                
                console.log(`📺 Загружено ${Object.keys(channelsCache).length} каналов`);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки каналов:', error);
    }
}

async function loadMessages() {
    try {
        const response = await fetch(`${API_CONFIG.endpoints.getMessages}?channel=${currentChannel}&since=${lastUpdateTime}`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const messages = data.messages || [];
                
                // Update messages
                if (appData.channels[currentChannel]) {
                    appData.channels[currentChannel].messages = messages;
                } else {
                    appData.channels[currentChannel] = {
                        id: currentChannel,
                        name: currentChannel,
                        type: 'public',
                        messages: messages,
                        pinned: []
                    };
                }
                
                lastUpdateTime = data.lastUpdate || Date.now();
                
                console.log(`📨 Загружено ${messages.length} сообщений`);
                
                // Update display
                updateMessagesDisplay();
                
                return true;
            }
        }
        return false;
        
    } catch (error) {
        console.error(`❌ Ошибка загрузки сообщений:`, error);
        return false;
    }
}

async function loadRolesFromS3() {
    try {
        const response = await fetch(`${API_CONFIG.endpoints.getUsers}?type=roles`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.roles) {
                Object.assign(appData.roles, data.roles);
                console.log(`👑 Загружено ${Object.keys(data.roles).length} ролей`);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки ролей:', error);
    }
}

function updateMessagesDisplay() {
    const container = document.getElementById('messages-wrapper');
    if (!container) return;
    
    const messages = appData.channels[currentChannel]?.messages || [];
    
    // Clear container
    container.innerHTML = '';
    
    if (messages.length === 0) {
        const emptyChat = document.getElementById('empty-chat');
        if (emptyChat) {
            container.appendChild(emptyChat);
            emptyChat.style.display = 'flex';
        }
        return;
    }
    
    // Hide empty chat message
    const emptyChat = document.getElementById('empty-chat');
    if (emptyChat) emptyChat.style.display = 'none';
    
    // Add all messages with lazy loading
    messages.forEach(msg => {
        const element = createMessageElement(msg);
        container.appendChild(element);
    });
    
    // Initialize lazy loading for new images
    if (observer) {
        setTimeout(() => {
            document.querySelectorAll('img[data-src], img[data-poster], .lazy-image[data-full-src]').forEach(img => {
                observer.observe(img);
            });
        }, 100);
    }
    
    // Update unread count
    updateUnreadCount();
    
    // Scroll to bottom
    scrollToBottom();
}

// ===== UNREAD MESSAGES =====
function updateUnreadCount() {
    if (!lastReadMessageId) {
        // First time - mark all as read
        const messages = appData.channels[currentChannel]?.messages || [];
        if (messages.length > 0) {
            lastReadMessageId = messages[messages.length - 1].id;
            unreadCount = 0;
        }
        return;
    }
    
    const messages = appData.channels[currentChannel]?.messages || [];
    const lastReadIndex = messages.findIndex(m => m.id === lastReadMessageId);
    
    if (lastReadIndex === -1 || lastReadIndex === messages.length - 1) {
        unreadCount = 0;
    } else {
        unreadCount = messages.length - lastReadIndex - 1;
    }
    
    // Update badge
    const badge = document.getElementById('unread-badge');
    const countEl = document.getElementById('unread-count');
    
    if (badge && countEl) {
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            countEl.textContent = unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

function scrollToUnread() {
    if (!lastReadMessageId) {
        scrollToBottom();
        return;
    }
    
    const messageElement = document.querySelector(`[data-message-id="${lastReadMessageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Mark as read
        const messages = appData.channels[currentChannel]?.messages || [];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0) {
            lastReadMessageId = messages[lastIndex].id;
            unreadCount = 0;
            updateUnreadCount();
        }
    } else {
        scrollToBottom();
    }
}

// ===== SECTIONS/TOPICS =====
function checkSectionPermission(sectionId) {
    const section = sections[sectionId] || sections['main'];
    if (!section) return true; // Default section allows writing
    
    // Admins can always write
    if (isAdmin || isMainAdmin) return true;
    
    // Check section permissions
    if (section.readOnly && !isAdmin) {
        return false; // Read-only for non-admins
    }
    
    return true;
}

async function loadSectionsFromS3() {
    try {
        const response = await fetch('/api/s3/get-sections');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.sections) {
                sections = data.sections;
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки разделов:', error);
    }
    
    // Ensure main section exists
    if (!sections['main']) {
        sections['main'] = {
            id: 'main',
            name: 'Основной',
            readOnly: false,
            description: 'Основной раздел для общения'
        };
    }
    
    updateSectionsDisplay();
}

function updateSectionsDisplay() {
    const sectionsList = document.getElementById('sections-list');
    const btnAddSection = document.getElementById('btn-add-section');
    
    if (!sectionsList) return;
    
    // Show add button only for admins
    if (btnAddSection) {
        btnAddSection.style.display = (isAdmin || isMainAdmin) ? 'inline-flex' : 'none';
    }
    
    sectionsList.innerHTML = '';
    
    Object.values(sections).forEach(section => {
        if (section.id === 'main') return; // Skip main, it's in channels
        
        const sectionItem = document.createElement('div');
        sectionItem.className = `section-item ${currentSection === section.id ? 'active' : ''}`;
        sectionItem.dataset.sectionId = section.id;
        
        sectionItem.innerHTML = `
            <div class="section-icon">
                <i class="fas fa-folder${section.readOnly ? '-open' : ''}"></i>
            </div>
            <div class="section-info">
                <div class="section-name">${escapeHtml(section.name)}</div>
                ${section.readOnly ? '<div class="section-badge read-only">Только чтение</div>' : ''}
            </div>
            ${(isAdmin || isMainAdmin) ? `
                <button class="btn-section-action" onclick="editSection('${section.id}')" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
            ` : ''}
        `;
        
        sectionItem.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-section-action')) {
                switchSection(section.id);
            }
        });
        
        sectionsList.appendChild(sectionItem);
    });
}

function switchSection(sectionId) {
    currentSection = sectionId;
    
    // Update active state
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.toggle('active', item.dataset.sectionId === sectionId);
    });
    
    // Load messages for this section
    loadMessages();
    
    // Update header
    const section = sections[sectionId];
    if (section) {
        document.getElementById('chat-title').textContent = section.name;
    }
}

function createSection(name, description = '', readOnly = false) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут создавать разделы', 'error');
        return;
    }
    
    const sectionId = 'section_' + Date.now();
    const section = {
        id: sectionId,
        name: name,
        description: description,
        readOnly: readOnly,
        created_by: currentUserId,
        created_at: Date.now()
    };
    
    sections[sectionId] = section;
    
    // Save to S3
    saveSectionsToS3();
    
    updateSectionsDisplay();
    showNotification('Раздел создан', 'success');
}

function editSection(sectionId) {
    const section = sections[sectionId];
    if (!section) return;
    
    const newName = prompt('Название раздела:', section.name);
    if (!newName) return;
    
    const newDescription = prompt('Описание:', section.description || '');
    const readOnly = confirm('Только чтение для не-админов?');
    
    section.name = newName;
    section.description = newDescription;
    section.readOnly = readOnly;
    
    // Save to S3
    saveSectionsToS3();
    
    updateSectionsDisplay();
    showNotification('Раздел обновлен', 'success');
}

async function saveSectionsToS3() {
    try {
        const response = await fetch('/api/s3/save-sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sections: sections
            })
        });
        
        if (response.ok) {
            console.log('✅ Разделы сохранены в S3');
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения разделов:', error);
    }
}

window.editSection = editSection;

function canEditMessage(message) {
    const isOwnMessage = message.user_id === currentUserId;
    return isOwnMessage || isAdmin || isMainAdmin;
}

function canDeleteMessage(message) {
    const isOwnMessage = message.user_id === currentUserId;
    return isOwnMessage || isAdmin || isMainAdmin;
}

// ===== PINNED MESSAGES =====
async function pinMessage(messageId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут закреплять сообщения', 'error');
        return;
    }
    
    const message = findMessageById(messageId);
    if (!message) return;
    
    message.pinned = true;
    message.pinned_at = Date.now();
    message.pinned_by = currentUserId;
    
    // Add to pinned list
    if (!pinnedMessagesList.find(m => m.id === messageId)) {
        pinnedMessagesList.push(message);
    }
    
    // Save to S3
    await updateMessageInS3(message);
    
    showNotification('Сообщение закреплено', 'success');
    updateMessagesDisplay();
}

async function unpinMessage(messageId) {
    if (!isAdmin && !isMainAdmin) {
        showNotification('Только админы могут откреплять сообщения', 'error');
        return;
    }
    
    const message = findMessageById(messageId);
    if (!message) return;
    
    message.pinned = false;
    message.pinned_at = null;
    message.pinned_by = null;
    
    // Remove from pinned list
    pinnedMessagesList = pinnedMessagesList.filter(m => m.id !== messageId);
    
    // Save to S3
    await updateMessageInS3(message);
    
    showNotification('Сообщение откреплено', 'success');
    updateMessagesDisplay();
}

function updateChannelsSidebar() {
    const channelsList = document.getElementById('channels-sidebar-list');
    if (!channelsList) return;
    
    // Clear existing channels (except main)
    const existingChannels = channelsList.querySelectorAll('.channel-item:not([data-channel="main"])');
    existingChannels.forEach(channel => channel.remove());
    
    // Add channels
    Object.values(appData.channels).forEach(channel => {
        if (channel.id !== 'main') {
            addChannelToSidebar(channel);
        }
    });
    
    // Update active state
    updateChannelActiveState();
}

// ===== S3 INTEGRATION =====
async function checkS3Connection() {
    try {
        const response = await fetch(API_CONFIG.endpoints.checkS3, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            s3Status = data.connected ? '✅ Работает' : '❌ Ошибка';
            updateS3Status(s3Status, data.connected ? 'success' : 'error');
            return data.connected;
        }
        return false;
    } catch (error) {
        s3Status = '❌ Нет подключения';
        updateS3Status(s3Status, 'error');
        return false;
    }
}

async function saveMessageToS3(message) {
    try {
        const response = await fetch(API_CONFIG.endpoints.saveMessage, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.status === 'success';
        }
        return false;
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщения:', error);
        return false;
    }
}

async function updateMessageInS3(message) {
    try {
        const response = await fetch(API_CONFIG.endpoints.saveMessage, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Реакция сохранена в S3:', message.id);
            return true;
        } else {
            console.error('❌ Ошибка сохранения реакции:', response.statusText);
            // Сохраняем локально как резерв
            if (typeof saveMessageLocally === 'function') {
                saveMessageLocally(message);
            }
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения реакции:', error);
        // Сохраняем локально как резерв
        if (typeof saveMessageLocally === 'function') {
            saveMessageLocally(message);
        }
        return false;
    }
}

async function saveChannelToS3(channel) {
    try {
        const response = await fetch(API_CONFIG.endpoints.createChannel, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(channel)
        });
        
        return response.ok;
    } catch (error) {
        console.error('❌ Ошибка сохранения канала:', error);
        return false;
    }
}

async function saveRoleToS3(role) {
    try {
        const response = await fetch(API_CONFIG.endpoints.createRole, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(role)
        });
        
        return response.ok;
    } catch (error) {
        console.error('❌ Ошибка сохранения роли:', error);
        return false;
    }
}

async function saveRolesToS3() {
    try {
        const response = await fetch(API_CONFIG.endpoints.updateRole, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roles: appData.roles })
        });
        
        return response.ok;
    } catch (error) {
        console.error('❌ Ошибка сохранения ролей:', error);
        return false;
    }
}

async function uploadVoiceMessage(file, duration) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', currentUserId);
        formData.append('duration', duration.toString());
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_CONFIG.endpoints.uploadVoice, true);
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.status === 'success') {
                        resolve({
                            url: response.file_url,
                            s3_key: response.filename,
                            duration: response.duration
                        });
                    } else {
                        reject(new Error(response.message || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error('Invalid response'));
                }
            } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
            }
        };
        
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
    });
}

async function uploadFile(file, type) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', currentUserId);
        formData.append('type', type);
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_CONFIG.endpoints.uploadFile, true);
        
        xhr.onload = function() {
            try {
                const response = JSON.parse(xhr.responseText);
                if (xhr.status === 200 && response.status === 'success') {
                    resolve({
                        url: response.file_url,
                        s3_key: response.s3_key,
                        thumbnail: response.thumbnail_url,
                        duration: response.duration
                    });
                } else {
                    reject(new Error(response.message || 'Upload failed'));
                }
            } catch (error) {
                reject(new Error('Invalid response'));
            }
        };
        
        xhr.onerror = function() {
            reject(new Error('Network error'));
        };
        
        xhr.send(formData);
    });
}

// ===== SYNC FUNCTIONS =====
function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(async () => {
        if (isSyncing) return;
        
        isSyncing = true;
        
        try {
            // Update user online status
            await updateUserOnlineStatus();
            
            // Load new messages
            await loadMessages();
            
            // Update online count
            updateOnlineCount();
            
            // Sync users
            await syncUsers();
            
        } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
        } finally {
            isSyncing = false;
        }
    }, 5000); // Sync every 5 seconds
}

async function updateUserOnlineStatus() {
    try {
        await fetch(API_CONFIG.endpoints.updateUser, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                is_online: true,
                last_seen: Date.now()
            })
        });
    } catch (error) {
        console.error('❌ Ошибка обновления статуса:', error);
    }
}

async function syncUsers() {
    try {
        const response = await fetch(API_CONFIG.endpoints.getUsers);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                Object.assign(usersCache, data.users);
                updateOnlineCount();
            }
        }
    } catch (error) {
        console.error('❌ Ошибка синхронизации пользователей:', error);
    }
}

function updateOnlineCount() {
    // Mark current user as online
    if (currentUserId && usersCache[currentUserId]) {
        usersCache[currentUserId].is_online = true;
        usersCache[currentUserId].last_seen = Date.now();
    }
    
    // Count online users (active in last 5 minutes)
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const onlineCount = Object.values(usersCache).filter(u => {
        if (u.is_online) return true;
        if (u.last_seen && (now - u.last_seen) < fiveMinutes) return true;
        return false;
    }).length;
    
    const totalCount = Math.max(Object.keys(usersCache).length, 1);
    
    const onlineElement = document.getElementById('online-count');
    const sidebarOnlineElement = document.getElementById('sidebar-online-count');
    
    if (onlineElement) {
        onlineElement.textContent = Math.max(onlineCount, 1);
    }
    if (sidebarOnlineElement) {
        sidebarOnlineElement.textContent = `${Math.max(onlineCount, 1)}/${totalCount}`;
    }
}

// ===== UTILITY FUNCTIONS =====
function findMessageById(messageId) {
    const channel = appData.channels[currentChannel];
    if (!channel) return null;
    
    return channel.messages.find(msg => msg.id === messageId);
}

function updateUserInfo() {
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const userAvatarText = document.getElementById('user-avatar-text');
    const profileName = document.getElementById('profile-name');
    const profileId = document.getElementById('profile-id');
    const profileRole = document.getElementById('profile-role');
    
    if (userName) userName.textContent = currentUser.first_name || 'Гость';
    if (userAvatarText) userAvatarText.textContent = (currentUser.first_name || 'U').charAt(0).toUpperCase();
    if (userAvatar) userAvatar.style.backgroundColor = stringToColor(currentUserId);
    
    if (profileName) profileName.textContent = currentUser.first_name || 'Гость';
    if (profileId) profileId.textContent = currentUserId;
    if (profileRole) profileRole.textContent = isMainAdmin ? 'Главный админ' : isAdmin ? 'Администратор' : 'Пользователь';
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

// Инициализация кнопки скролла
function initScrollButton() {
    const container = document.getElementById('messages-container');
    const btnScrollDown = document.getElementById('btn-scroll-down');
    
    if (!container || !btnScrollDown) return;
    
    function checkScrollButton() {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        
        // Показываем кнопку, если пользователь прокрутил вверх более чем на 200px
        if (distanceFromBottom > 200) {
            btnScrollDown.style.display = 'flex';
            setTimeout(() => {
                btnScrollDown.style.opacity = '1';
            }, 10);
        } else {
            btnScrollDown.style.opacity = '0';
            setTimeout(() => {
                btnScrollDown.style.display = 'none';
            }, 300);
        }
    }
    
    container.addEventListener('scroll', checkScrollButton);
    checkScrollButton();
}

function scrollToBottomIfNeeded() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const scrollPosition = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const distanceFromBottom = scrollHeight - scrollPosition - clientHeight;
    
    // If user is within 100px of bottom, scroll to bottom
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

// Get user avatar HTML (photo_url from Telegram or fallback)
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

function updateS3Status(text, type = 'info') {
    const statusElement = document.getElementById('s3-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `settings-status ${type}`;
    }
}

function showUploadProgress(show, text = 'Загрузка...') {
    const progress = document.getElementById('upload-progress');
    const uploadText = document.getElementById('upload-text');
    
    if (progress) progress.style.display = show ? 'flex' : 'none';
    if (uploadText && text) uploadText.textContent = text;
}

function updateUploadProgress(percent) {
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
}

function playSound(type) {
    const soundsEnabled = localStorage.getItem('sounds_enabled') !== 'false';
    if (!soundsEnabled) return;
    
    // Simple sound implementation
    const audio = document.getElementById('audio-player');
    if (!audio) return;
    
    // In a real app, you would have different sound files
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio play failed:', e));
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Скопировано в буфер', 'success');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Скопировано в буфер', 'success');
    }
}

function downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'file';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showMoreMenu() {
    // Implementation for more menu
    showNotification('Меню', 'info');
}

function closeAllMenus(e) {
    // Close all open menus except if clicked inside
    const menus = ['attach-menu', 'emoji-picker', 'message-actions-menu', 'forward-menu'];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu && menu.style.display !== 'none') {
            // Check if click was inside the menu or its trigger button
            const triggerId = menuId === 'attach-menu' ? 'btn-attach' : 
                            menuId === 'emoji-picker' ? 'btn-emoji' : null;
            const trigger = triggerId ? document.getElementById(triggerId) : null;
            
            if (e && (
                menu.contains(e.target) || 
                (trigger && trigger.contains(e.target))
            )) {
                return;
            }
            
            menu.style.display = 'none';
        }
    });
}

// ===== REACTION FUNCTIONS =====
function toggleReaction(messageId, emoji) {
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
    updateMessageReactions(message);
    
    // Play sound
    playSound('reaction');
}

function updateMessageReactions(message) {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
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
                     onclick="toggleReaction('${message.id}', '${emoji}')">
                    <span class="reaction-emoji">${emoji}</span>
                    <span class="reaction-count">${count}</span>
                </div>
            `;
        })
        .join('');
    
    container.innerHTML = reactionsHTML;
}

// ===== POLL FUNCTIONS =====
function createPoll() {
    const question = prompt('Введите вопрос для опроса:');
    if (!question) return;
    
    const options = [];
    let option;
    let optionCount = 0;
    
    while (optionCount < 10) {
        option = prompt(`Введите вариант ответа ${optionCount + 1} (оставьте пустым для завершения):`);
        if (!option) break;
        options.push({
            id: `opt_${Date.now()}_${optionCount}`,
            text: option,
            votes: 0,
            voters: []
        });
        optionCount++;
    }
    
    if (options.length < 2) {
        showNotification('Нужно хотя бы 2 варианта ответа', 'error');
        return;
    }
    
    const poll = {
        id: `poll_${Date.now()}`,
        question: question,
        options: options,
        multiple: confirm('Разрешить выбор нескольких вариантов?'),
        total_votes: 0,
        is_closed: false
    };
    
    // Send poll as message
    const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const message = {
        id: messageId,
        user_id: currentUserId,
        user: currentUser,
        content: `📊 ${question}`,
        poll: poll,
        timestamp: Date.now(),
        channel: currentChannel,
        is_local: true
    };
    
    // Add to local cache
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
    
    // Update UI
    appendPollMessage(message);
    
    // Save to S3
    saveMessageToS3(message);
    
    showNotification('Опрос создан', 'success');
}

function appendPollMessage(message) {
    const container = document.getElementById('messages-wrapper');
    if (!container) return;
    
    const emptyChat = document.getElementById('empty-chat');
    if (emptyChat) emptyChat.style.display = 'none';
    
    const messageElement = createPollElement(message);
    container.appendChild(messageElement);
    
    scrollToBottomIfNeeded();
}

function createPollElement(message) {
    const isOutgoing = message.user_id == currentUserId;
    const user = usersCache[message.user_id] || message.user || {};
    const userName = user.first_name || 'Пользователь';
    const userColor = stringToColor(message.user_id);
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const poll = message.poll;
    const totalVotes = poll.total_votes;
    
    const pollHTML = poll.options.map(option => {
        const percentage = totalVotes > 0 ? (option.votes / totalVotes * 100) : 0;
        const hasVoted = option.voters.includes(currentUserId);
        
        return `
            <div class="poll-option ${hasVoted ? 'poll-option-voted' : ''}" 
                 data-poll-id="${poll.id}" 
                 data-option-id="${option.id}"
                 onclick="voteInPoll('${poll.id}', '${option.id}')">
                <div class="poll-option-text">${escapeHtml(option.text)}</div>
                <div class="poll-option-bar">
                    <div class="poll-option-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="poll-option-stats">
                    <span class="poll-percentage">${percentage.toFixed(1)}%</span>
                    <span class="poll-votes">(${option.votes})</span>
                </div>
            </div>
        `;
    }).join('');
    
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
            
            <div class="message-poll">
                <div class="poll-question">📊 ${escapeHtml(poll.question)}</div>
                ${pollHTML}
                <div class="poll-footer">
                    <span class="poll-total-votes">Всего голосов: ${totalVotes}</span>
                    ${isAdmin ? `
                        <button class="poll-close-btn" onclick="closePoll('${poll.id}')">
                            Закрыть опрос
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${isOutgoing ? `
                <div class="message-status">
                    <div class="message-time">${time}</div>
                    <i class="fas fa-check"></i>
                </div>
            ` : ''}
        </div>
    `;
    
    return messageElement;
}

function voteInPoll(pollId, optionId) {
    // Find message with this poll
    const channel = appData.channels[currentChannel];
    if (!channel) return;
    
    const message = channel.messages.find(msg => msg.poll && msg.poll.id === pollId);
    if (!message || !message.poll) return;
    
    const poll = message.poll;
    
    // Check if poll is closed
    if (poll.is_closed) {
        showNotification('Опрос закрыт', 'error');
        return;
    }
    
    // Check if user already voted for this option
    const option = poll.options.find(opt => opt.id === optionId);
    if (!option) return;
    
    const hasVoted = option.voters.includes(currentUserId);
    
    if (poll.multiple) {
        // Multiple choice
        if (hasVoted) {
            // Remove vote
            const index = option.voters.indexOf(currentUserId);
            option.voters.splice(index, 1);
            option.votes--;
            poll.total_votes--;
        } else {
            // Add vote
            option.voters.push(currentUserId);
            option.votes++;
            poll.total_votes++;
        }
    } else {
        // Single choice - remove from all other options first
        poll.options.forEach(opt => {
            const index = opt.voters.indexOf(currentUserId);
            if (index > -1) {
                opt.voters.splice(index, 1);
                opt.votes--;
                poll.total_votes--;
            }
        });
        
        // Add to selected option
        if (!hasVoted) {
            option.voters.push(currentUserId);
            option.votes++;
            poll.total_votes++;
        }
    }
    
    // Update in S3
    updateMessageInS3(message);
    
    // Update UI
    updatePollDisplay(message);
    
    showNotification('Голос учтен', 'success');
}

function closePoll(pollId) {
    if (!isAdmin) {
        showNotification('Только администраторы могут закрывать опросы', 'error');
        return;
    }
    
    const channel = appData.channels[currentChannel];
    if (!channel) return;
    
    const message = channel.messages.find(msg => msg.poll && msg.poll.id === pollId);
    if (!message || !message.poll) return;
    
    message.poll.is_closed = true;
    
    // Update in S3
    updateMessageInS3(message);
    
    // Update UI
    updatePollDisplay(message);
    
    showNotification('Опрос закрыт', 'success');
}

function updatePollDisplay(message) {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    if (messageElement) {
        const newElement = createPollElement(message);
        messageElement.replaceWith(newElement);
    }
}

// ===== GLOBAL EXPORTS =====
window.copyToClipboard = copyToClipboard;
window.downloadFile = downloadFile;
window.removeAttachment = removeAttachment;
window.clearAttachments = clearAttachments;
window.toggleReaction = toggleReaction;
window.voteInPoll = voteInPoll;
window.closePoll = closePoll;
window.showImagePreview = showImagePreview;
window.handleMessageAction = handleMessageAction;
window.addQuickReaction = addQuickReaction;
window.downloadVoiceMessage = downloadVoiceMessage;
window.scrollToBottom = scrollToBottom;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    // Set viewport height
    adjustViewport();
    
    // Start app
    // Инициализация приложения, голосового плеера, реакций, кнопки скролла и меню сообщений
    setTimeout(() => {
        if (typeof initApp === 'function') {
            initApp();
        }

        // 🎧 Плеер голосовых сообщений
        document.querySelectorAll('.voice-message').forEach(vm => {
            let audio = vm.querySelector('audio');
            let playBtn = vm.querySelector('.voice-play');
            let progress = vm.querySelector('.voice-progress');
            let downloadBtn = vm.querySelector('.voice-download');

            // Кнопка Play/Pause
            if (playBtn && audio) {
                playBtn.addEventListener('click', e => {
                    if (audio.paused) {
                        audio.play();
                    } else {
                        audio.pause();
                    }
                });
                audio.addEventListener('play', () => {
                    playBtn.classList.add('playing');
                });
                audio.addEventListener('pause', () => {
                    playBtn.classList.remove('playing');
                });
            }

            // Прогресс-бар с перемоткой
            if (progress && audio) {
                audio.addEventListener('timeupdate', () => {
                    progress.value = audio.currentTime / audio.duration || 0;
                });
                progress.addEventListener('input', () => {
                    audio.currentTime = progress.value * audio.duration;
                });
            }

            // Скачивание голосовых
            if (downloadBtn && audio) {
                downloadBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    const src = audio.src;
                    const a = document.createElement('a');
                    a.href = src;
                    a.download = src.split('/').pop();
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
            }

            // Автовоспроизведение при выборе (если надо)
            vm.addEventListener('focus', () => {
                if(audio) audio.play();
            });
        });

        // 📋 Контекстное меню для сообщений
        document.querySelectorAll('.message').forEach(msgEl => {
            // Показывать меню при правом клике или долгом касании
            ['contextmenu', 'touchstart'].forEach(evtName => {
                let timer;
                msgEl.addEventListener(evtName, e => {
                    e.preventDefault();
                    if (evtName === 'touchstart') {
                        timer = setTimeout(() => showMessageContextMenu(e, msgEl), 400);
                        msgEl.addEventListener('touchend', () => clearTimeout(timer), {once: true});
                    } else {
                        showMessageContextMenu(e, msgEl);
                    }
                });
            });
        });

        function showMessageContextMenu(e, msgEl) {
            // Проверка прав
            const canEdit = isAdmin || msgEl.dataset.userId === appData.user.id;
            let menu = document.createElement('div');
            menu.className = 'custom-context-menu';
            const actions = [
                {name: "Ответить", handler: () => replyToMessage(msgEl)},
                {name: "Переслать", handler: () => forwardMessage(msgEl)},
                {name: "Копировать", handler: () => copyMessageText(msgEl)}
            ];
            if (canEdit) {
                actions.push(
                    {name: "Закрепить", handler: () => pinMessage(msgEl)},
                    {name: "Выделить", handler: () => highlightMessage(msgEl)},
                    {name: "Удалить", handler: () => deleteMessage(msgEl)}
                );
            }
            actions.forEach(a => {
                let item = document.createElement('div');
                item.className = 'context-menu-item';
                item.textContent = a.name;
                item.addEventListener('click', e => {
                    a.handler();
                    document.body.removeChild(menu);
                });
                menu.appendChild(item);
            });
            menu.style.top = `${(e.touches?.[0]?.clientY || e.clientY) + 2}px`;
            menu.style.left = `${(e.touches?.[0]?.clientX || e.clientX) + 2}px`;
            document.body.appendChild(menu);
            function hide() {
                if (document.body.contains(menu)) document.body.removeChild(menu);
            }
            setTimeout(() => {
                document.addEventListener('click', hide, {once:true});
                document.addEventListener('touchstart', hide, {once:true});
            }, 0);
        }

        // 😊 Реакции
        document.querySelectorAll('.message').forEach(msgEl => {
            // Показывать смайлик при наведении
            let reactBtn = msgEl.querySelector('.react-btn');
            if (!reactBtn) {
                reactBtn = document.createElement('div');
                reactBtn.className = 'react-btn';
                reactBtn.title = 'Добавить реакцию';
                reactBtn.innerHTML = '😊';
                msgEl.appendChild(reactBtn);
            }
            msgEl.addEventListener('mouseenter', () => reactBtn.style.display = 'block');
            msgEl.addEventListener('mouseleave', () => reactBtn.style.display = 'none');

            // Быстрый выбор из 8 эмодзи
            let emojiPicker = msgEl.querySelector('.msg-emoji-picker');
            if (!emojiPicker) {
                emojiPicker = document.createElement('div');
                emojiPicker.className = 'msg-emoji-picker';
                '😀😂😍😮😢😡👍🔥'.split('').forEach(e => {
                    const emojiBtn = document.createElement('span');
                    emojiBtn.textContent = e;
                    emojiBtn.className = 'msg-emoji-btn';
                    emojiBtn.addEventListener('click', () => {
                        addReactionToMessage(msgEl, e);
                        emojiPicker.style.display = 'none';
                    });
                    emojiPicker.appendChild(emojiBtn);
                });
                emojiPicker.style.display = 'none';
                msgEl.appendChild(emojiPicker);
            }
            reactBtn.addEventListener('click', () => {
                if (emojiPicker.style.display === 'none') emojiPicker.style.display = 'flex';
                else emojiPicker.style.display = 'none';
            });
        });

        function addReactionToMessage(msgEl, emoji) {
            // Тут должна быть логика для обработки и отображения реакции + выделение своей
            let reacts = msgEl.querySelector('.message-reactions');
            if (!reacts) {
                reacts = document.createElement('div');
                reacts.className = 'message-reactions';
                msgEl.appendChild(reacts);
            }
            let emojiEl = Array.from(reacts.children).find(el => el.textContent.includes(emoji));
            if (!emojiEl) {
                emojiEl = document.createElement('span');
                emojiEl.className = 'reaction';
                emojiEl.textContent = `${emoji} 1`;
                emojiEl.classList.add('mine');
                reacts.appendChild(emojiEl);
            } else {
                // Увеличить счетчик и выделить свою реакцию
                let count = parseInt(emojiEl.textContent.replace(emoji, '').trim()) || 0;
                emojiEl.textContent = `${emoji} ${count+1}`;
                emojiEl.classList.add('mine');
            }
        }

        // ⬇️ Кнопка скролла вниз
        let scrollBtn = document.querySelector('.scroll-down-btn');
        if (!scrollBtn) {
            scrollBtn = document.createElement('button');
            scrollBtn.className = 'scroll-down-btn';
            scrollBtn.title = 'В конец';
            scrollBtn.innerHTML = '⬇️';
            Object.assign(scrollBtn.style, {
                position: 'fixed',
                right: '36px',
                bottom: '90px',
                zIndex: 99,
                display: 'none',
                borderRadius: '50%',
                background: 'var(--scroll-btn-bg, #333)',
                color: 'var(--scroll-btn-color, #fff)',
                boxShadow: '0 2px 8px rgba(0,0,0,.14)',
                transition: 'opacity 0.4s'
            });
            document.body.appendChild(scrollBtn);
        }

        function checkScrollButton() {
            const sc = document.querySelector('.message-list, .chat-history, .messages');
            if (sc && sc.scrollTop < sc.scrollHeight - sc.clientHeight - 300) {
                scrollBtn.style.display = 'block';
                scrollBtn.style.opacity = '1';
            } else {
                scrollBtn.style.opacity = '0';
                setTimeout(() => scrollBtn.style.display = 'none', 400);
            }
        }
        const msgList = document.querySelector('.message-list, .chat-history, .messages');
        if (msgList) {
            msgList.addEventListener('scroll', checkScrollButton);
            checkScrollButton();
        }
        scrollBtn.addEventListener('click', () => {
            const sc = document.querySelector('.message-list, .chat-history, .messages');
            if (sc) {
                sc.scrollTo({top: sc.scrollHeight, behavior: 'smooth'});
            }
        });

        // Тёмная тема для кнопки (в зависимости от фона документа)
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            scrollBtn.style.background = '#222';
            scrollBtn.style.color = '#fff';
        }
    }, 100);
});

if (document.readyState === 'complete') {
    setTimeout(() => {
        if (typeof initApp === 'function') {
            initApp();
        }
    }, 100);
}
