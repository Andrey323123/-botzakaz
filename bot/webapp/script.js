// telegram-chat-extended.js - ПОЛНЫЙ КОД

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ =====
let tg = null;
let currentUserId = null;
let currentUser = null;
let lastMessageId = 0;
let chatId = 'main_chat';
let messageInterval = null;
let sections = {
    main: { id: 'main', name: 'Основной чат', write: 'all', unread: 0, color: '#3390ec' },
    news: { id: 'news', name: 'Новости', write: 'all', unread: 0, color: '#34c759' },
    rules: { id: 'rules', name: 'Правила', write: 'admins', unread: 0, locked: true, color: '#ff9500' },
    announcements: { id: 'announcements', name: 'Объявления', write: 'admins', unread: 0, color: '#ff3b30' }
};
let currentSection = 'main';
let userRoles = {};
let unreadMessages = 0;
let pendingInvites = [];
let isAdmin = false;
let isMainAdmin = false;
let usersCache = {};
let onlineStatus = {};
let typingUsers = {};
let selectedMessages = [];
let isSelecting = false;
let editingMessageId = null;
let replyingToMessageId = null;
let forwardFromMessageId = null;

// Эмодзи для реакций и пикера
const commonReactions = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '🙏'];
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭'],
    nature: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊', '🥄', '🍴', '🍽️', '🥣', '🥡', '🥢']
};

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
function initApp() {
    try {
        console.log('🚀 Инициализация приложения...');
        
        // Инициализация Telegram WebApp
        tg = window.Telegram.WebApp;
        if (!tg) {
            throw new Error('Telegram WebApp SDK не загружен');
        }

        // Настройка WebApp
        tg.expand();
        tg.enableClosingConfirmation();
        tg.setHeaderColor('#3390ec');
        tg.setBackgroundColor('#ffffff');
        tg.setBottomBarColor('#3390ec');

        // Получение данных пользователя
        currentUser = tg.initDataUnsafe?.user;
        if (!currentUser || !currentUser.id) {
            console.warn('Не удалось получить данные пользователя, используем демо-данные');
            currentUser = createDemoUser();
        }
        
        currentUserId = currentUser.id.toString();
        console.log('👤 Пользователь:', currentUser);

        // Загрузка данных из localStorage
        loadDataFromStorage();
        
        // Проверка роли пользователя
        checkUserRole();
        
        // Инициализация UI
        initializeUI();
        updateUserInfo();
        updateUserPermissions();
        
        // Загрузка сообщений текущего раздела
        displayCurrentSectionMessages();
        
        // Настройка обработчиков событий
        setupEventListeners();
        setupGlobalEventListeners();
        
        // Запуск опроса обновлений
        startPolling();
        
        // Обновление онлайн статуса
        updateOnlineStatus();
        
        // Симуляция других пользователей для демо
        simulateOtherUsers();
        
        console.log('✅ Приложение инициализировано успешно');
        tg.showAlert('Добро пожаловать в Botfs23 Chat!');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации приложения:', error);
        showNotification('Ошибка инициализации приложения: ' + error.message, 'error');
    }
}

// ===== ЗАГРУЗКА ДАННЫХ ИЗ LOCALSTORAGE =====
function loadDataFromStorage() {
    try {
        console.log('📂 Загрузка данных из localStorage...');
        
        // Загрузка сообщений по разделам
        Object.keys(sections).forEach(sectionId => {
            const savedMessages = localStorage.getItem(`telegram_chat_messages_${sectionId}`);
            if (savedMessages) {
                try {
                    const sectionMessages = JSON.parse(savedMessages);
                    if (sectionMessages.length > 0) {
                        // Сохраняем в глобальную структуру
                        if (!window.chatData) window.chatData = {};
                        window.chatData[sectionId] = sectionMessages;
                        
                        // Находим максимальный ID
                        const maxId = Math.max(...sectionMessages.map(m => m.id));
                        if (maxId > lastMessageId) lastMessageId = maxId;
                        
                        // Считаем непрочитанные
                        const userLastRead = localStorage.getItem(`last_read_${sectionId}_${currentUserId}`) || 0;
                        sections[sectionId].unread = sectionMessages.filter(m => 
                            m.id > userLastRead && 
                            m.user_id !== currentUserId && 
                            m.user_id !== 'system'
                        ).length;
                    }
                } catch (e) {
                    console.error(`Ошибка загрузки сообщений для раздела ${sectionId}:`, e);
                }
            }
        });

        // Загрузка ролей пользователей
        const savedRoles = localStorage.getItem('telegram_chat_roles');
        if (savedRoles) {
            try {
                userRoles = JSON.parse(savedRoles);
            } catch (e) {
                console.error('Ошибка загрузки ролей:', e);
                userRoles = {};
            }
        }

        // Загрузка приглашений
        const savedInvites = localStorage.getItem('telegram_chat_invites');
        if (savedInvites) {
            try {
                pendingInvites = JSON.parse(savedInvites);
            } catch (e) {
                console.error('Ошибка загрузки приглашений:', e);
                pendingInvites = [];
            }
        }

        // Загрузка пользователей
        const savedUsers = localStorage.getItem('telegram_chat_users');
        if (savedUsers) {
            try {
                usersCache = JSON.parse(savedUsers);
            } catch (e) {
                console.error('Ошибка загрузки пользователей:', e);
                usersCache = {};
            }
        }

        // Загрузка онлайн статуса
        const savedOnlineStatus = localStorage.getItem('telegram_chat_online');
        if (savedOnlineStatus) {
            try {
                onlineStatus = JSON.parse(savedOnlineStatus);
            } catch (e) {
                console.error('Ошибка загрузки онлайн статуса:', e);
                onlineStatus = {};
            }
        }

        updateUnreadBadges();
        console.log('✅ Данные загружены успешно');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
    }
}

function saveMessagesToStorage(sectionId = currentSection) {
    try {
        if (window.chatData && window.chatData[sectionId]) {
            localStorage.setItem(`telegram_chat_messages_${sectionId}`, 
                JSON.stringify(window.chatData[sectionId]));
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения сообщений:', error);
    }
}

function saveRoles() {
    try {
        localStorage.setItem('telegram_chat_roles', JSON.stringify(userRoles));
    } catch (error) {
        console.error('❌ Ошибка сохранения ролей:', error);
    }
}

function saveInvites() {
    try {
        localStorage.setItem('telegram_chat_invites', JSON.stringify(pendingInvites));
    } catch (error) {
        console.error('❌ Ошибка сохранения приглашений:', error);
    }
}

function saveUsers() {
    try {
        localStorage.setItem('telegram_chat_users', JSON.stringify(usersCache));
    } catch (error) {
        console.error('❌ Ошибка сохранения пользователей:', error);
    }
}

function saveOnlineStatus() {
    try {
        localStorage.setItem('telegram_chat_online', JSON.stringify(onlineStatus));
    } catch (error) {
        console.error('❌ Ошибка сохранения онлайн статуса:', error);
    }
}

// ===== ПРОВЕРКА РОЛИ ПОЛЬЗОВАТЕЛЯ =====
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
        
    } catch (error) {
        console.error('❌ Ошибка проверки роли:', error);
        userRoles[currentUserId] = 'user';
        isAdmin = false;
        isMainAdmin = false;
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ UI =====
function initializeUI() {
    try {
        console.log('🎨 Инициализация UI...');
        
        updateChatTitle();
        updateSectionsList();
        updateUnreadBadges();
        updateOnlineUsers();
        updateUserPermissions();
        updateMenuActive(0);
        
        // Показываем/скрываем кнопки админки
        const adminMenuItem = document.getElementById('admin-menu-item');
        const btnAdmin = document.getElementById('btn-admin');
        const btnMentionAll = document.getElementById('btn-mention-all');
        
        if (adminMenuItem) {
            adminMenuItem.style.display = isAdmin ? 'flex' : 'none';
        }
        if (btnAdmin) {
            btnAdmin.style.display = isAdmin ? 'flex' : 'none';
        }
        if (btnMentionAll) {
            btnMentionAll.style.display = isAdmin ? 'flex' : 'none';
        }
        
        // Инициализация эмодзи пикера
        showEmojiCategory('smileys');
        
        console.log('✅ UI инициализирован успешно');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации UI:', error);
    }
}

function updateChatTitle() {
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle && sections[currentSection]) {
        chatTitle.textContent = sections[currentSection].name;
    }
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
    try {
        // Общий счетчик непрочитанных
        const totalUnread = Object.values(sections).reduce((sum, section) => sum + section.unread, 0);
        const unreadBadge = document.getElementById('unread-badge');
        
        if (unreadBadge) {
            unreadBadge.textContent = totalUnread > 0 ? totalUnread : '';
            unreadBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
        }
        
        // Бейджи для меню
        const chatBadge = document.getElementById('chat-badge');
        const usersBadge = document.getElementById('users-badge');
        
        if (chatBadge) {
            chatBadge.textContent = totalUnread > 0 ? totalUnread : '';
            chatBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
        }
        
        if (usersBadge) {
            const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
            usersBadge.textContent = onlineCount > 0 ? onlineCount : '';
            usersBadge.style.display = onlineCount > 0 ? 'inline-block' : 'none';
        }
        
    } catch (error) {
        console.error('❌ Ошибка обновления бейджей:', error);
    }
}

function updateUserPermissions() {
    try {
        const section = sections[currentSection];
        if (!section) return;
        
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
        
    } catch (error) {
        console.error('❌ Ошибка обновления прав:', error);
    }
}

function updateOnlineUsers() {
    try {
        const onlineCount = Object.values(usersCache).filter(u => u.is_online).length;
        const onlineCountElement = document.getElementById('online-count');
        const sidebarOnlineCount = document.getElementById('sidebar-online-count');
        
        if (onlineCountElement) {
            onlineCountElement.textContent = onlineCount;
        }
        if (sidebarOnlineCount) {
            sidebarOnlineCount.textContent = onlineCount;
        }
        
    } catch (error) {
        console.error('❌ Ошибка обновления онлайн пользователей:', error);
    }
}

function updateActiveSection() {
    try {
        document.querySelectorAll('.section-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.section-item[onclick*="${currentSection}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
        
    } catch (error) {
        console.error('❌ Ошибка обновления активного раздела:', error);
    }
}

function updateMenuActive(activeIndex) {
    try {
        document.querySelectorAll('.menu-item').forEach((item, index) => {
            item.classList.toggle('active', index === activeIndex);
        });
    } catch (error) {
        console.error('❌ Ошибка обновления активного меню:', error);
    }
}

// ===== НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====
function setupEventListeners() {
    try {
        console.log('🎯 Настройка обработчиков событий...');
        
        // Отправка сообщения по Enter
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            messageInput.addEventListener('input', function() {
                updateTypingStatus();
            });
        }

        // Поиск по Enter
        const searchInput = document.getElementById('users-search-input');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    searchUsers(this.value);
                }
            });
        }

        // Обработка нажатия на кнопку "Назад" в Telegram
        if (tg && tg.BackButton) {
            tg.BackButton.onClick(() => {
                handleBackButton();
            });
        }
        
        console.log('✅ Обработчики событий настроены');
        
    } catch (error) {
        console.error('❌ Ошибка настройки обработчиков событий:', error);
    }
}

function setupGlobalEventListeners() {
    try {
        document.addEventListener('click', function(e) {
            // Закрытие всплывающих окон при клике вне их области
            const reactionsPopup = document.getElementById('reactions-popup');
            if (reactionsPopup && reactionsPopup.style.display === 'block' && 
                !e.target.closest('.reactions-popup') && !e.target.closest('.btn-reaction')) {
                reactionsPopup.style.display = 'none';
            }
            
            const forwardPopup = document.getElementById('forward-popup');
            if (forwardPopup && forwardPopup.style.display === 'block' && 
                !e.target.closest('.forward-popup') && !e.target.closest('.btn-forward')) {
                forwardPopup.style.display = 'none';
            }
            
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
            
            const contextMenu = document.getElementById('message-context-menu');
            if (contextMenu && contextMenu.style.display === 'block' && 
                !e.target.closest('.message-context-menu') && !e.target.closest('.btn-more')) {
                contextMenu.style.display = 'none';
            }
        });
        
        // Обработка изменения размера окна
        window.addEventListener('resize', function() {
            scrollToBottom();
        });
        
        // Обработка скролла для загрузки старых сообщений
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.addEventListener('scroll', function() {
                if (this.scrollTop === 0) {
                    loadMoreMessages();
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка настройки глобальных обработчиков:', error);
    }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С РАЗДЕЛАМИ =====
function switchSection(sectionId) {
    try {
        if (!sections[sectionId]) return;
        
        console.log(`🔄 Переключение на раздел: ${sectionId}`);

        // Сохраняем время последнего прочтения для текущего раздела
        if (window.chatData && window.chatData[currentSection]) {
            const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
            if (lastMessage) {
                localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
            }
        }

        // Сбрасываем непрочитанные для текущего раздела
        sections[currentSection].unread = 0;

        // Переключаемся на новый раздел
        currentSection = sectionId;

        // Обновляем активный элемент в UI
        updateActiveSection();

        // Показываем сообщения раздела
        displayCurrentSectionMessages();

        // Обновляем заголовок
        updateChatTitle();

        // Проверяем права на запись
        updateUserPermissions();

        // Обновляем бейджи
        updateUnreadBadges();
        
        console.log(`✅ Переключено на раздел: ${sectionId}`);
        
    } catch (error) {
        console.error('❌ Ошибка переключения раздела:', error);
    }
}

function showSection(sectionId) {
    try {
        // Проверяем доступ к разделу
        const section = sections[sectionId];
        if (!section) return;

        // Если раздел заблокирован и пользователь не админ
        if (section.locked && !isAdmin) {
            showNotification('Этот раздел заблокирован для вас', 'error');
            return;
        }
        
        switchSection(sectionId);
        
    } catch (error) {
        console.error('❌ Ошибка показа раздела:', error);
    }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С СООБЩЕНИЯМИ =====
function displayCurrentSectionMessages() {
    try {
        const container = document.getElementById('messages-container');
        if (!container) return;
        
        container.innerHTML = '';

        if (!window.chatData || !window.chatData[currentSection] || window.chatData[currentSection].length === 0) {
            // Создаем приветственное сообщение
            const welcomeMessage = {
                id: 1,
                user_id: 'system',
                user: { first_name: 'Система', user_id: 'system' },
                message_type: 'text',
                content: `👋 Добро пожаловать в раздел "${sections[currentSection].name}"!`,
                timestamp: Date.now(),
                read: true,
                section: currentSection
            };
            
            if (!window.chatData) window.chatData = {};
            if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
            
            window.chatData[currentSection].push(welcomeMessage);
            saveMessagesToStorage(currentSection);
        }

        const messages = window.chatData[currentSection] || [];
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="empty-chat">
                    <i class="fas fa-comments"></i>
                    <p>Раздел пуст</p>
                    <small>Будьте первым, кто напишет сообщение!</small>
                </div>`;
            return;
        }

        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            container.appendChild(messageElement);
        });
        
        scrollToBottom();
        
    } catch (error) {
        console.error('❌ Ошибка отображения сообщений:', error);
    }
}

function createMessageElement(message) {
    try {
        const isOutgoing = message.user_id == currentUserId;
        const isSystem = message.user_id === 'system';
        const messageDiv = document.createElement('div');
        
        if (isSystem) {
            messageDiv.className = 'message system';
        } else {
            messageDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        }
        
        messageDiv.dataset.messageId = message.id;

        // Проверяем, прочитано ли сообщение
        if (!isOutgoing && !isSystem) {
            const lastRead = localStorage.getItem(`last_read_${currentSection}_${currentUserId}`) || 0;
            if (message.id > lastRead) {
                messageDiv.classList.add('unread');
            }
        }

        // Форматируем время
        const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const user = message.user || { 
            first_name: 'User', 
            user_id: message.user_id,
            username: 'user'
        };
        
        const userName = user.first_name || 'User';
        const userRole = user.role || userRoles[user.user_id] || 'user';

        let contentHTML = '';
        switch (message.message_type) {
            case 'photo':
                contentHTML = `
                    <div class="message-media">
                        <img src="${message.photo_url || 'https://via.placeholder.com/200x150?text=Photo'}" 
                             alt="Фото" 
                             style="max-width: 100%; height: auto; border-radius: 10px;"
                             onclick="viewImage('${message.photo_url}')">
                    </div>`;
                break;
                
            case 'document':
                contentHTML = `
                    <div class="message-document">
                        <i class="fas fa-file"></i>
                        <div class="document-info">
                            <div class="document-name">${message.file_name || 'Документ'}</div>
                            <div class="document-size">${message.file_size || '1.2 MB'}</div>
                        </div>
                        <button class="download-btn" onclick="downloadFile('${message.file_url}', '${message.file_name}')">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>`;
                break;
                
            case 'sticker':
                contentHTML = `
                    <div class="message-sticker">
                        <div class="sticker-emoji">${message.emoji || '😊'}</div>
                    </div>`;
                break;
                
            case 'voice':
                contentHTML = `
                    <div class="message-voice">
                        <i class="fas fa-microphone"></i>
                        <div class="voice-duration">${message.duration || '0:15'}</div>
                        <div class="voice-wave"></div>
                    </div>`;
                break;
                
            default:
                let text = message.content || '';
                text = escapeHtml(text);
                text = text.replace(/\n/g, '<br>');
                
                // Обработка упоминаний
                text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
                
                // Обработка ссылок
                text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
                
                contentHTML = `<div class="message-text">${text}</div>`;
        }

        // Добавляем реакции если есть
        let reactionsHTML = '';
        if (message.reactions && Object.keys(message.reactions).length > 0) {
            reactionsHTML = `<div class="message-reactions">`;
            Object.entries(message.reactions).forEach(([emoji, users]) => {
                const userReacted = users.includes(currentUserId);
                reactionsHTML += `
                    <div class="reaction ${userReacted ? 'user-reacted' : ''}" 
                         onclick="toggleReaction('${message.id}', '${emoji}')">
                        ${emoji} <span class="reaction-count">${users.length}</span>
                    </div>`;
            });
            reactionsHTML += `</div>`;
        }

        // Кнопки действий (только для своих сообщений или админов)
        let actionsHTML = '';
        if (!isSystem) {
            const canEditDelete = isOutgoing || isAdmin;
            actionsHTML = `
                <div class="message-actions">
                    <button class="btn-reaction" onclick="showReactionPopup('${message.id}')">
                        <i class="far fa-smile"></i>
                    </button>
                    <button class="btn-reply" onclick="replyToMessage('${message.id}')">
                        <i class="fas fa-reply"></i>
                    </button>
                    <button class="btn-forward" onclick="forwardMessage('${message.id}')">
                        <i class="fas fa-share"></i>
                    </button>
                    ${canEditDelete ? `
                        <button class="btn-more" onclick="showMessageMenu('${message.id}')">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    ` : ''}
                </div>`;
        }

        if (isSystem) {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-system">
                        <i class="fas fa-info-circle"></i>
                        ${contentHTML}
                        <div class="message-time">${time}</div>
                    </div>
                </div>`;
        } else {
            messageDiv.innerHTML = `
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
                                ${userRole !== 'user' ? `
                                    <span class="message-sender-role ${userRole}">
                                        ${getRoleText(userRole)}
                                    </span>
                                ` : ''}
                            </div>
                            <div class="message-time">${time}</div>
                        </div>
                    ` : ''}
                    ${contentHTML}
                    ${reactionsHTML}
                    ${isOutgoing ? `
                        <div class="message-status">
                            <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                            <div class="message-time">${time}</div>
                        </div>
                    ` : ''}
                    ${actionsHTML}
                </div>`;
        }

        return messageDiv;
        
    } catch (error) {
        console.error('❌ Ошибка создания элемента сообщения:', error);
        return document.createElement('div');
    }
}

// ===== ОТПРАВКА СООБЩЕНИЙ =====
async function sendMessage() {
    try {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        
        if (!text) {
            input.focus();
            return;
        }

        // Проверяем права на запись в текущий раздел
        const section = sections[currentSection];
        const userRole = userRoles[currentUserId] || 'user';
        const canWrite = section.write === 'all' ||
                        (section.write === 'moderators' && ['main_admin', 'admin', 'moderator'].includes(userRole)) ||
                        (section.write === 'admins' && ['main_admin', 'admin'].includes(userRole));
        
        if (!canWrite) {
            showNotification('У вас нет прав для отправки сообщений в этом разделе', 'error');
            return;
        }

        showSendingIndicator();
        
        const newMessage = {
            id: lastMessageId + 1,
            user_id: currentUserId,
            user: {
                ...currentUser,
                role: userRole
            },
            message_type: 'text',
            content: text,
            timestamp: Date.now(),
            read: false,
            reactions: {},
            section: currentSection,
            edited: false,
            forwarded_from: null,
            forwarded_by: null
        };

        // Обработка ответа на сообщение
        if (replyingToMessageId) {
            newMessage.reply_to = replyingToMessageId;
            const repliedMessage = window.chatData[currentSection].find(m => m.id == replyingToMessageId);
            if (repliedMessage) {
                newMessage.reply_preview = {
                    message_id: repliedMessage.id,
                    user_id: repliedMessage.user_id,
                    user_name: repliedMessage.user?.first_name || 'User',
                    content: repliedMessage.content?.substring(0, 100) || '[сообщение]'
                };
            }
            clearReplyPreview();
        }

        // Добавляем сообщение
        if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
        window.chatData[currentSection].push(newMessage);
        lastMessageId = newMessage.id;

        // Сохраняем
        saveMessagesToStorage(currentSection);

        // Отображаем
        const messageElement = createMessageElement(newMessage);
        const messagesContainer = document.getElementById('messages-container');
        
        // Удаляем пустое состояние если есть
        const emptyChat = messagesContainer.querySelector('.empty-chat');
        if (emptyChat) {
            emptyChat.remove();
        }
        
        messagesContainer.appendChild(messageElement);

        // Очищаем поле ввода
        input.value = '';
        autoResize(input);
        hideSendingIndicator();

        // Прокручиваем вниз
        scrollToBottom();
        input.focus();

        // Обновляем статистику
        updateUserInfo();
        
        // Сбрасываем статус набора
        clearTypingStatus();
        
        // Симулируем ответы других пользователей
        simulateReplies(newMessage);
        
        console.log("✅ Сообщение отправлено:", newMessage);
        showNotification('Сообщение отправлено', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        hideSendingIndicator();
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// ===== РЕДАКТИРОВАНИЕ СООБЩЕНИЙ =====
function editMessage(messageId) {
    try {
        if (!window.chatData || !window.chatData[currentSection]) return;
        
        const message = window.chatData[currentSection].find(m => m.id == messageId);
        if (!message) return;
        
        const isOwnMessage = message.user_id == currentUserId;
        if (!isOwnMessage && !isAdmin) {
            showNotification('Вы можете редактировать только свои сообщения', 'error');
            return;
        }

        const input = document.getElementById('message-input');
        input.value = message.content || '';
        input.focus();
        
        editingMessageId = messageId;
        
        // Показываем кнопку отмены редактирования
        showEditMode();
        
    } catch (error) {
        console.error('❌ Ошибка редактирования сообщения:', error);
    }
}

function saveEditedMessage() {
    try {
        if (!editingMessageId) return;
        
        const input = document.getElementById('message-input');
        const newText = input.value.trim();
        
        if (!newText) {
            cancelEdit();
            return;
        }

        const messageIndex = window.chatData[currentSection].findIndex(m => m.id == editingMessageId);
        if (messageIndex === -1) return;

        window.chatData[currentSection][messageIndex].content = newText;
        window.chatData[currentSection][messageIndex].edited = true;
        window.chatData[currentSection][messageIndex].edited_at = Date.now();
        
        saveMessagesToStorage(currentSection);
        
        // Обновляем отображение
        const messageElement = document.querySelector(`[data-message-id="${editingMessageId}"]`);
        if (messageElement) {
            const newElement = createMessageElement(window.chatData[currentSection][messageIndex]);
            messageElement.replaceWith(newElement);
        }
        
        cancelEdit();
        showNotification('Сообщение отредактировано', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка сохранения редактирования:', error);
    }
}

function cancelEdit() {
    editingMessageId = null;
    const input = document.getElementById('message-input');
    input.value = '';
    hideEditMode();
}

function showEditMode() {
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.innerHTML = '<i class="fas fa-check"></i>';
        sendButton.onclick = saveEditedMessage;
        
        // Добавляем кнопку отмены
        const inputArea = document.querySelector('.message-input-area');
        let cancelButton = document.getElementById('cancel-edit-btn');
        
        if (!cancelButton) {
            cancelButton = document.createElement('button');
            cancelButton.id = 'cancel-edit-btn';
            cancelButton.className = 'btn-admin-action danger';
            cancelButton.innerHTML = '<i class="fas fa-times"></i>';
            cancelButton.onclick = cancelEdit;
            inputArea.appendChild(cancelButton);
        }
    }
}

function hideEditMode() {
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendButton.onclick = sendMessage;
    }
    
    const cancelButton = document.getElementById('cancel-edit-btn');
    if (cancelButton) {
        cancelButton.remove();
    }
}

// ===== УДАЛЕНИЕ СООБЩЕНИЙ =====
function deleteMessage(messageId) {
    try {
        if (!confirm('Удалить это сообщение?')) return;
        
        if (window.chatData && window.chatData[currentSection]) {
            const index = window.chatData[currentSection].findIndex(m => m.id == messageId);
            if (index > -1) {
                window.chatData[currentSection].splice(index, 1);
                saveMessagesToStorage(currentSection);
                
                // Удаляем из DOM
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                }
                
                // Если чат пуст, показываем пустое состояние
                if (window.chatData[currentSection].length === 0) {
                    displayCurrentSectionMessages();
                }
                
                showNotification('Сообщение удалено', 'success');
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка удаления сообщения:', error);
    }
}

// ===== ОТВЕТ НА СООБЩЕНИЯ =====
function replyToMessage(messageId) {
    try {
        if (!window.chatData || !window.chatData[currentSection]) return;
        
        const message = window.chatData[currentSection].find(m => m.id == messageId);
        if (!message) return;

        const userName = message.user?.first_name || 'Пользователь';
        const text = message.content ? 
            message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '') : 
            '[медиа-сообщение]';
        
        replyingToMessageId = messageId;
        
        // Показываем превью ответа
        const previewContainer = document.getElementById('reply-preview-container');
        previewContainer.innerHTML = `
            <div class="reply-preview">
                <div class="reply-header">
                    <div class="reply-sender">Ответ ${userName}:</div>
                    <button class="btn-close-reply" onclick="clearReplyPreview()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="reply-content">${escapeHtml(text)}</div>
            </div>`;
        previewContainer.style.display = 'block';
        
        // Фокусируемся на поле ввода
        const input = document.getElementById('message-input');
        input.focus();
        
    } catch (error) {
        console.error('❌ Ошибка ответа на сообщение:', error);
    }
}

function clearReplyPreview() {
    replyingToMessageId = null;
    const previewContainer = document.getElementById('reply-preview-container');
    previewContainer.innerHTML = '';
    previewContainer.style.display = 'none';
}

// ===== ПЕРЕСЫЛКА СООБЩЕНИЙ =====
function forwardMessage(messageId) {
    try {
        if (!window.chatData || !window.chatData[currentSection]) return;
        
        const message = window.chatData[currentSection].find(m => m.id == messageId);
        if (!message) return;

        forwardFromMessageId = messageId;
        
        // Показываем попап с выбором раздела
        const popup = document.getElementById('forward-popup');
        const options = document.getElementById('forward-options');
        if (!popup || !options) return;
        
        options.innerHTML = '';

        // Добавляем опции для всех разделов
        Object.values(sections).forEach(section => {
            const option = document.createElement('div');
            option.className = 'forward-option';
            option.innerHTML = `<i class="fas fa-folder"></i> ${section.name}`;
            option.onclick = () => {
                forwardToSection(message, section.id);
                popup.style.display = 'none';
            };
            options.appendChild(option);
        });

        // Показываем попап
        popup.style.display = 'block';
        
    } catch (error) {
        console.error('❌ Ошибка пересылки сообщения:', error);
    }
}

function forwardToSection(message, sectionId) {
    try {
        const forwardedMessage = {
            ...message,
            id: lastMessageId + 1,
            forwarded_from: currentSection,
            forwarded_by: currentUserId,
            timestamp: Date.now(),
            read: false,
            section: sectionId,
            reactions: {},
            forwarded: true
        };
        
        if (!window.chatData[sectionId]) window.chatData[sectionId] = [];
        window.chatData[sectionId].push(forwardedMessage);
        lastMessageId = forwardedMessage.id;
        
        saveMessagesToStorage(sectionId);

        // Увеличиваем счетчик непрочитанных
        sections[sectionId].unread++;
        updateUnreadBadges();
        
        showNotification(`Сообщение переслано в "${sections[sectionId].name}"`, 'success');
        
    } catch (error) {
        console.error('❌ Ошибка пересылки в раздел:', error);
    }
}

function closeForwardPopup() {
    document.getElementById('forward-popup').style.display = 'none';
}

// ===== РЕАКЦИИ НА СООБЩЕНИЯ =====
function toggleReaction(messageId, emoji) {
    try {
        if (!messageId || !window.chatData[currentSection]) return;
        
        const message = window.chatData[currentSection].find(m => m.id == messageId);
        if (!message) return;

        if (!message.reactions) message.reactions = {};
        if (!message.reactions[emoji]) message.reactions[emoji] = [];
        
        const userIndex = message.reactions[emoji].indexOf(currentUserId);
        
        if (userIndex > -1) {
            // Удаляем реакцию
            message.reactions[emoji].splice(userIndex, 1);
            if (message.reactions[emoji].length === 0) {
                delete message.reactions[emoji];
            }
        } else {
            // Добавляем реакцию
            message.reactions[emoji].push(currentUserId);
        }
        
        saveMessagesToStorage(currentSection);

        // Обновляем отображение сообщения
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const newElement = createMessageElement(message);
            messageElement.replaceWith(newElement);
        }
        
    } catch (error) {
        console.error('❌ Ошибка переключения реакции:', error);
    }
}

function showReactionPopup(messageId) {
    try {
        const popup = document.getElementById('reactions-popup');
        if (!popup) return;

        // Позиционируем попап
        const button = event.target.closest('.btn-reaction') || event.target;
        const rect = button.getBoundingClientRect();
        
        popup.style.left = (rect.left - 100) + 'px';
        popup.style.top = (rect.top - 60) + 'px';
        popup.style.display = 'block';
        popup.dataset.messageId = messageId;
        
    } catch (error) {
        console.error('❌ Ошибка показа попапа реакций:', error);
    }
}

// ===== РАБОТА С ФАЙЛАМИ =====
function attachFile(type) {
    try {
        switch(type) {
            case 'photo':
                // В реальном приложении здесь был бы выбор файла
                simulateFileUpload('photo', 'photo.jpg', '2.1 MB');
                break;
                
            case 'document':
                simulateFileUpload('document', 'document.pdf', '1.5 MB');
                break;
                
            case 'sticker':
                showStickerPicker();
                break;
                
            case 'voice':
                showNotification('Голосовые сообщения в разработке', 'info');
                break;
                
            default:
                showNotification('Эта функция в разработке', 'info');
        }
        
    } catch (error) {
        console.error('❌ Ошибка прикрепления файла:', error);
    }
}

function simulateFileUpload(type, fileName, fileSize) {
    try {
        const progressBar = document.getElementById('progress-bar-fill');
        const uploadProgress = document.getElementById('upload-progress');
        const filePreview = document.getElementById('file-preview');
        const previewName = document.getElementById('file-preview-name');
        const previewSize = document.getElementById('file-preview-size');
        
        // Показываем прогресс
        uploadProgress.classList.add('active');
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            progressBar.style.width = progress + '%';
            
            if (progress >= 100) {
                clearInterval(interval);
                
                // Скрываем прогресс и показываем превью
                setTimeout(() => {
                    uploadProgress.classList.remove('active');
                    
                    previewName.textContent = fileName;
                    previewSize.textContent = fileSize;
                    filePreview.classList.add('active');
                    
                    // Сохраняем информацию о файле для отправки
                    window.currentFile = {
                        type: type,
                        name: fileName,
                        size: fileSize,
                        url: type === 'photo' ? 'https://via.placeholder.com/400x300?text=Uploaded+Photo' : null
                    };
                }, 500);
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Ошибка симуляции загрузки:', error);
    }
}

function sendFile() {
    try {
        if (!window.currentFile) return;
        
        const file = window.currentFile;
        const newMessage = {
            id: lastMessageId + 1,
            user_id: currentUserId,
            user: {
                ...currentUser,
                role: userRoles[currentUserId] || 'user'
            },
            message_type: file.type,
            timestamp: Date.now(),
            read: false,
            reactions: {},
            section: currentSection,
            edited: false
        };
        
        if (file.type === 'photo') {
            newMessage.photo_url = file.url;
            newMessage.content = 'Фото';
        } else if (file.type === 'document') {
            newMessage.file_name = file.name;
            newMessage.file_size = file.size;
            newMessage.file_url = 'https://example.com/file.pdf';
            newMessage.content = 'Документ';
        }
        
        // Добавляем сообщение
        if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
        window.chatData[currentSection].push(newMessage);
        lastMessageId = newMessage.id;
        
        saveMessagesToStorage(currentSection);
        
        // Отображаем
        const messageElement = createMessageElement(newMessage);
        const messagesContainer = document.getElementById('messages-container');
        
        const emptyChat = messagesContainer.querySelector('.empty-chat');
        if (emptyChat) {
            emptyChat.remove();
        }
        
        messagesContainer.appendChild(messageElement);
        scrollToBottom();
        
        // Скрываем превью
        hideFilePreview();
        
        // Очищаем текущий файл
        delete window.currentFile;
        
        showNotification('Файл отправлен', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка отправки файла:', error);
    }
}

function cancelFile() {
    hideFilePreview();
    delete window.currentFile;
}

function hideFilePreview() {
    document.getElementById('file-preview').classList.remove('active');
}

function downloadFile(url, fileName) {
    try {
        showNotification('Скачивание файла...', 'info');
        // В реальном приложении здесь была бы загрузка файла
        setTimeout(() => {
            showNotification('Файл скачан', 'success');
        }, 1500);
    } catch (error) {
        console.error('❌ Ошибка скачивания файла:', error);
    }
}

function viewImage(url) {
    try {
        tg.showPopup({
            title: 'Просмотр фото',
            message: 'Фото открывается в полном размере...',
            buttons: [{ type: 'close', text: 'Закрыть' }]
        });
        // В реальном приложении здесь был бы просмотр фото
    } catch (error) {
        console.error('❌ Ошибка просмотра фото:', error);
    }
}

// ===== СТИКЕРЫ =====
function showStickerPicker() {
    try {
        const stickers = ['😊', '😂', '🤣', '❤️', '🔥', '👍', '👏', '🎉', '🙏', '🤔', '😍', '🥰', '😎', '🤩', '🥳', '😇', '🤗'];
        
        tg.showPopup({
            title: 'Выберите стикер',
            message: stickers.join(' '),
            buttons: stickers.map((sticker, index) => ({
                id: `sticker_${index}`,
                type: 'default',
                text: sticker
            })).concat([{ type: 'cancel', text: 'Отмена' }])
        }, (buttonId) => {
            if (buttonId && buttonId.startsWith('sticker_')) {
                const index = parseInt(buttonId.split('_')[1]);
                sendSticker(stickers[index]);
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка показа пикера стикеров:', error);
    }
}

function sendSticker(emoji) {
    try {
        const newMessage = {
            id: lastMessageId + 1,
            user_id: currentUserId,
            user: {
                ...currentUser,
                role: userRoles[currentUserId] || 'user'
            },
            message_type: 'sticker',
            emoji: emoji,
            timestamp: Date.now(),
            read: false,
            section: currentSection,
            reactions: {}
        };

        if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
        window.chatData[currentSection].push(newMessage);
        lastMessageId = newMessage.id;

        saveMessagesToStorage(currentSection);

        const messageElement = createMessageElement(newMessage);
        document.getElementById('messages-container').appendChild(messageElement);
        scrollToBottom();
        
        console.log("✅ Стикер отправлен:", newMessage);
        
    } catch (error) {
        console.error('❌ Ошибка отправки стикера:', error);
    }
}

// ===== ЭМОДЗИ ПИКЕР =====
function showEmojiCategory(category) {
    try {
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
        
    } catch (error) {
        console.error('❌ Ошибка показа категории эмодзи:', error);
    }
}

function insertEmoji(emoji) {
    try {
        const input = document.getElementById('message-input');
        input.value += emoji;
        autoResize(input);
        input.focus();
    } catch (error) {
        console.error('❌ Ошибка вставки эмодзи:', error);
    }
}

function toggleEmojiPicker() {
    try {
        const picker = document.getElementById('emoji-picker');
        picker.classList.toggle('active');
        
        if (picker.classList.contains('active') && document.getElementById('emoji-grid').innerHTML === '') {
            showEmojiCategory('smileys');
        }
    } catch (error) {
        console.error('❌ Ошибка переключения пикера эмодзи:', error);
    }
}

// ===== АДМИН ПАНЕЛЬ =====
function loadAdminUsersList() {
    try {
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
        
    } catch (error) {
        console.error('❌ Ошибка загрузки списка пользователей админки:', error);
    }
}

function changeUserRole(userId, newRole) {
    try {
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
        
    } catch (error) {
        console.error('❌ Ошибка изменения роли:', error);
    }
}

function kickUser(userId) {
    try {
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
            
            // Удаляем онлайн статус
            delete onlineStatus[userId];
            
            saveRoles();
            saveUsers();
            saveOnlineStatus();
            
            // Обновляем UI
            loadAdminUsersList();
            updateOnlineUsers();
            
            showNotification('Пользователь исключен', 'success');
        }
        
    } catch (error) {
        console.error('❌ Ошибка исключения пользователя:', error);
    }
}

function loadInvitesList() {
    try {
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
        
    } catch (error) {
        console.error('❌ Ошибка загрузки списка приглашений:', error);
    }
}

function createInvite() {
    try {
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

        tg.showPopup({
            title: 'Приглашение создано',
            message: `Код приглашения: ${inviteCode}\nСкопируйте и отправьте его новым участникам.`,
            buttons: [
                { id: 'copy', type: 'default', text: 'Копировать код' },
                { id: 'share', type: 'default', text: 'Поделиться' },
                { type: 'cancel', text: 'Закрыть' }
            ]
        }, (action) => {
            if (action === 'copy') {
                navigator.clipboard.writeText(inviteCode);
                showNotification('Код скопирован', 'success');
            } else if (action === 'share') {
                shareInvite(inviteCode);
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка создания приглашения:', error);
    }
}

function deleteInvite(index) {
    try {
        if (confirm('Удалить это приглашение?')) {
            pendingInvites.splice(index, 1);
            saveInvites();
            loadInvitesList();
            showNotification('Приглашение удалено', 'success');
        }
    } catch (error) {
        console.error('❌ Ошибка удаления приглашения:', error);
    }
}

function copyInviteLink(code) {
    try {
        navigator.clipboard.writeText(code).then(() => {
            showNotification('Код скопирован', 'success');
        }).catch(err => {
            console.error('Ошибка при копировании: ', err);
            showNotification('Не удалось скопировать', 'error');
        });
    } catch (error) {
        console.error('❌ Ошибка копирования приглашения:', error);
    }
}

function shareInvite(code) {
    try {
        const text = `Присоединяйтесь к нашему чату! Код приглашения: ${code}`;
        
        if (tg && tg.platform !== 'unknown') {
            tg.shareText(text);
        } else {
            navigator.clipboard.writeText(text);
            showNotification('Текст приглашения скопирован', 'success');
        }
    } catch (error) {
        console.error('❌ Ошибка публикации приглашения:', error);
    }
}

function updateSectionPermission(sectionId, type, value) {
    try {
        if (!isAdmin) {
            showNotification('Только админы могут изменять права доступа', 'error');
            return;
        }
        
        sections[sectionId][type] = value;
        showNotification('Права доступа обновлены', 'success');
        
        // Если текущий раздел, обновляем права
        if (sectionId === currentSection) {
            updateUserPermissions();
        }
        
    } catch (error) {
        console.error('❌ Ошибка обновления прав раздела:', error);
    }
}

function clearChatHistory() {
    try {
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
    } catch (error) {
        console.error('❌ Ошибка очистки истории:', error);
    }
}

function exportChatData() {
    try {
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
        
    } catch (error) {
        console.error('❌ Ошибка экспорта данных:', error);
    }
}

function createBackup() {
    try {
        if (!isAdmin) {
            showNotification('Только админы могут создавать резервные копии', 'error');
            return;
        }
        
        const backupData = {
            messages: window.chatData,
            roles: userRoles,
            invites: pendingInvites,
            users: usersCache,
            onlineStatus: onlineStatus,
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
        
    } catch (error) {
        console.error('❌ Ошибка создания резервной копии:', error);
    }
}

// ===== СПИСОК ПОЛЬЗОВАТЕЛЕЙ =====
function loadUsers() {
    try {
        // Начинаем с текущего пользователя
        usersCache = {
            [currentUserId]: {
                ...currentUser,
                is_online: true,
                message_count: 0,
                role: userRoles[currentUserId] || 'user',
                last_seen: Date.now()
            }
        };

        // Подсчитываем сообщения пользователя
        Object.keys(sections).forEach(sectionId => {
            if (window.chatData && window.chatData[sectionId]) {
                usersCache[currentUserId].message_count += window.chatData[sectionId]
                    .filter(m => m.user_id === currentUserId).length;
            }
        });

        // Добавляем демо-пользователей
        addDemoUsers();

        const container = document.getElementById('users-list');
        if (!container) return;

        const allUsers = Object.values(usersCache);
        const onlineUsers = allUsers.filter(u => u.is_online);
        const offlineUsers = allUsers.filter(u => !u.is_online);

        container.innerHTML = '';

        // Добавляем онлайн пользователей
        if (onlineUsers.length > 0) {
            const header = document.createElement('div');
            header.className = 'users-header';
            header.innerHTML = `<i class="fas fa-circle online-dot"></i> Участники онлайн (${onlineUsers.length})`;
            container.appendChild(header);
            
            onlineUsers.forEach(user => {
                const userElement = createUserElement(user);
                container.appendChild(userElement);
            });
        }

        // Добавляем оффлайн пользователей
        if (offlineUsers.length > 0) {
            const header = document.createElement('div');
            header.className = 'users-header';
            header.innerHTML = `<i class="fas fa-moon"></i> Оффлайн (${offlineUsers.length})`;
            container.appendChild(header);
            
            offlineUsers.forEach(user => {
                const userElement = createUserElement(user);
                container.appendChild(userElement);
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
    }
}

function createUserElement(user) {
    try {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.onclick = () => showUserProfile(user.user_id);

        const userName = (user.first_name || '') + (user.last_name ? ' ' + user.last_name : '');
        const userRole = user.role || 'user';
        const roleText = getRoleText(userRole);
        
        const status = user.is_online ? 
            '<span class="user-item-status online">онлайн</span>' : 
            `<span class="user-item-status">сообщений: ${user.message_count || 0}</span>`;

        userElement.innerHTML = `
            <div class="user-item-avatar" style="background-color: ${stringToColor(user.user_id)}">
                ${user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div class="user-item-info">
                <div class="user-item-name">
                    ${userName}
                    ${userRole !== 'user' ? `
                        <span class="user-role-badge ${userRole}">${roleText}</span>
                    ` : ''}
                </div>
                <div class="user-item-status">${status}</div>
            </div>
            ${user.is_online ? '<i class="fas fa-circle online-dot"></i>' : ''}
        `;
        
        return userElement;
        
    } catch (error) {
        console.error('❌ Ошибка создания элемента пользователя:', error);
        return document.createElement('div');
    }
}

function searchUsers(query) {
    try {
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

        container.innerHTML = '';

        if (filteredUsers.length === 0) {
            container.innerHTML = `
                <div class="empty-chat">
                    <i class="fas fa-search"></i>
                    <p>Пользователи не найдены</p>
                    <small>Попробуйте другой запрос</small>
                </div>`;
            return;
        }

        const onlineUsers = filteredUsers.filter(u => u.is_online);
        const offlineUsers = filteredUsers.filter(u => !u.is_online);

        // Добавляем онлайн пользователей
        if (onlineUsers.length > 0) {
            const header = document.createElement('div');
            header.className = 'users-header';
            header.innerHTML = `<i class="fas fa-circle online-dot"></i> Найдено онлайн (${onlineUsers.length})`;
            container.appendChild(header);
            
            onlineUsers.forEach(user => {
                const userElement = createUserElement(user);
                container.appendChild(userElement);
            });
        }

        // Добавляем оффлайн пользователей
        if (offlineUsers.length > 0) {
            const header = document.createElement('div');
            header.className = 'users-header';
            header.innerHTML = `<i class="fas fa-moon"></i> Найдено оффлайн (${offlineUsers.length})`;
            container.appendChild(header);
            
            offlineUsers.forEach(user => {
                const userElement = createUserElement(user);
                container.appendChild(userElement);
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка поиска пользователей:', error);
    }
}

function showUserProfile(userId) {
    try {
        const user = usersCache[userId];
        if (!user) return;
        
        const userRole = user.role || 'user';
        const roleText = getRoleText(userRole);
        const lastSeen = user.last_seen ? new Date(user.last_seen).toLocaleString('ru-RU') : 'неизвестно';
        const joinDate = user.join_date ? new Date(user.join_date).toLocaleDateString('ru-RU') : 'недавно';

        tg.showPopup({
            title: `Профиль: ${user.first_name || 'Пользователь'}`,
            message: `
👤 Имя: ${user.first_name || ''} ${user.last_name || ''}
📛 Username: ${user.username || 'нет'}
🎭 Роль: ${roleText}
🆔 ID: ${user.user_id}
📊 Сообщений: ${user.message_count || 0}
📅 В чате с: ${joinDate}
👀 Последний раз: ${lastSeen}
${user.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}
            `.trim(),
            buttons: [
                { id: 'mention', type: 'default', text: 'Упомянуть' },
                isAdmin ? { id: 'role', type: 'default', text: 'Изменить роль' } : null,
                { type: 'cancel', text: 'Закрыть' }
            ].filter(Boolean)
        }, (buttonId) => {
            if (buttonId === 'mention') {
                const input = document.getElementById('message-input');
                input.value += `@${user.username || user.first_name} `;
                input.focus();
            }
            if (buttonId === 'role' && isAdmin) {
                changeUserRole(userId);
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка показа профиля:', error);
    }
}

// ===== ОБНОВЛЕНИЕ ИНФОРМАЦИИ О ПОЛЬЗОВАТЕЛЕ =====
function updateUserInfo() {
    try {
        if (!currentUser) return;
        
        const userName = (currentUser.first_name || '') + (currentUser.last_name ? ' ' + currentUser.last_name : '');
        const username = currentUser.username ? '@' + currentUser.username : 'без username';
        const userRole = userRoles[currentUserId] || 'user';
        const roleText = getRoleText(userRole);

        // Обновляем везде где нужно
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
        
    } catch (error) {
        console.error('❌ Ошибка обновления информации о пользователе:', error);
    }
}

// ===== ОБРАБОТКА КНОПКИ "НАЗАД" =====
function handleBackButton() {
    try {
        const adminView = document.getElementById('admin-view');
        const usersView = document.getElementById('users-view');
        const settingsView = document.getElementById('settings-view');
        const profileView = document.getElementById('profile-view');
        const sidebar = document.getElementById('sidebar');
        
        if (adminView && adminView.style.display === 'flex') {
            showChat();
        } else if (usersView && usersView.style.display === 'flex') {
            showChat();
        } else if (settingsView && settingsView.style.display === 'flex') {
            showChat();
        } else if (profileView && profileView.style.display === 'flex') {
            showChat();
        } else if (sidebar.classList.contains('active')) {
            toggleSidebar();
        } else if (document.getElementById('emoji-picker').classList.contains('active')) {
            toggleEmojiPicker();
        } else if (document.getElementById('attach-menu').classList.contains('active')) {
            toggleAttachMenu();
        } else {
            tg.showConfirm("Выйти из приложения?", (confirmed) => {
                if (confirmed) {
                    tg.close();
                }
            });
        }
    } catch (error) {
        console.error('❌ Ошибка обработки кнопки назад:', error);
    }
}

// ===== ОПРОС ОБНОВЛЕНИЙ И ОНЛАЙН СТАТУС =====
function startPolling() {
    try {
        // Обновляем онлайн статус каждые 30 секунд
        setInterval(() => {
            updateOnlineStatus();
            checkForNewMessages();
            updateTypingStatus();
        }, 30000);
        
        // Обновляем время последней активности каждую минуту
        setInterval(() => {
            updateLastSeen();
        }, 60000);
        
        console.log('✅ Опрос обновлений запущен');
        
    } catch (error) {
        console.error('❌ Ошибка запуска опроса:', error);
    }
}

function updateOnlineStatus() {
    try {
        // Обновляем статус текущего пользователя
        onlineStatus[currentUserId] = {
            is_online: true,
            last_seen: Date.now()
        };
        
        saveOnlineStatus();
        
        // Обновляем в кэше пользователей
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].is_online = true;
            usersCache[currentUserId].last_seen = Date.now();
        }
        
        updateOnlineUsers();
        
    } catch (error) {
        console.error('❌ Ошибка обновления онлайн статуса:', error);
    }
}

function updateLastSeen() {
    try {
        if (usersCache[currentUserId]) {
            usersCache[currentUserId].last_seen = Date.now();
        }
    } catch (error) {
        console.error('❌ Ошибка обновления времени последней активности:', error);
    }
}

function updateTypingStatus() {
    try {
        const input = document.getElementById('message-input');
        if (input && input.value.trim() && usersCache[currentUserId]) {
            usersCache[currentUserId].typing = true;
            usersCache[currentUserId].typing_since = Date.now();
        } else if (usersCache[currentUserId]) {
            delete usersCache[currentUserId].typing;
            delete usersCache[currentUserId].typing_since;
        }
    } catch (error) {
        console.error('❌ Ошибка обновления статуса набора:', error);
    }
}

function clearTypingStatus() {
    try {
        if (usersCache[currentUserId]) {
            delete usersCache[currentUserId].typing;
            delete usersCache[currentUserId].typing_since;
        }
    } catch (error) {
        console.error('❌ Ошибка очистки статуса набора:', error);
    }
}

function checkForNewMessages() {
    try {
        // В реальном приложении здесь была бы проверка новых сообщений с сервера
        // Для демо просто обновляем счетчики
        updateUnreadBadges();
        updateOnlineUsers();
        
        // Проверяем статус набора текста у других пользователей
        checkOtherUsersTyping();
        
    } catch (error) {
        console.error('❌ Ошибка проверки новых сообщений:', error);
    }
}

// ===== УТИЛИТЫ =====
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
    try {
        const container = document.getElementById('messages-container');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    } catch (error) {
        console.error('❌ Ошибка прокрутки вниз:', error);
    }
}

function showSendingIndicator() {
    try {
        const inputArea = document.querySelector('.message-input-area');
        const sendingIndicator = document.createElement('div');
        sendingIndicator.className = 'sending-indicator';
        sendingIndicator.innerHTML = '<div class="sending-dot"></div><div class="sending-dot"></div><div class="sending-dot"></div>';
        inputArea.appendChild(sendingIndicator);
    } catch (error) {
        console.error('❌ Ошибка показа индикатора отправки:', error);
    }
}

function hideSendingIndicator() {
    try {
        const sendingIndicator = document.querySelector('.sending-indicator');
        if (sendingIndicator) sendingIndicator.remove();
    } catch (error) {
        console.error('❌ Ошибка скрытия индикатора отправки:', error);
    }
}

function showNotification(message, type = 'info') {
    try {
        if (tg && tg.showPopup) {
            tg.showPopup({
                title: type === 'error' ? 'Ошибка' : type === 'success' ? 'Успех' : 'Информация',
                message: message,
                buttons: [{ type: 'close', text: 'OK' }]
            });
        } else {
            alert(message);
        }
    } catch (error) {
        console.error('❌ Ошибка показа уведомления:', error);
    }
}

function jumpToUnread() {
    try {
        const unreadMessages = document.querySelectorAll('.message.unread');
        if (unreadMessages.length === 0) {
            showNotification('Нет непрочитанных сообщений', 'info');
            return;
        }
        
        // Прокручиваем к первому непрочитанному
        unreadMessages[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Помечаем как прочитанные
        if (window.chatData && window.chatData[currentSection]) {
            const lastMessage = window.chatData[currentSection][window.chatData[currentSection].length - 1];
            if (lastMessage) {
                localStorage.setItem(`last_read_${currentSection}_${currentUserId}`, lastMessage.id);
            }
        }
        
        // Убираем стиль непрочитанных
        unreadMessages.forEach(msg => msg.classList.remove('unread'));
        
        // Обновляем бейджи
        sections[currentSection].unread = 0;
        updateUnreadBadges();
        
    } catch (error) {
        console.error('❌ Ошибка перехода к непрочитанным:', error);
    }
}

function mentionAll() {
    try {
        // Фильтруем только онлайн пользователей
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
        
    } catch (error) {
        console.error('❌ Ошибка упоминания всех:', error);
    }
}

function loadMoreMessages() {
    try {
        // В реальном приложении здесь была бы загрузка старых сообщений
        showNotification('Загрузка старых сообщений...', 'info');
    } catch (error) {
        console.error('❌ Ошибка загрузки старых сообщений:', error);
    }
}

// ===== ДЕМО-ДАННЫЕ И СИМУЛЯЦИЯ =====
function createDemoUser() {
    return {
        id: Math.floor(Math.random() * 1000000),
        first_name: 'Telegram',
        last_name: 'User',
        username: 'telegram_user',
        language_code: 'ru',
        is_premium: false
    };
}

function addDemoUsers() {
    const demoUsers = [
        {
            user_id: 'demo_1',
            first_name: 'Анна',
            last_name: 'Иванова',
            username: 'anna_ivanova',
            is_online: true,
            message_count: Math.floor(Math.random() * 50),
            role: 'admin',
            join_date: Date.now() - 7 * 24 * 60 * 60 * 1000,
            last_seen: Date.now()
        },
        {
            user_id: 'demo_2',
            first_name: 'Сергей',
            last_name: 'Петров',
            username: 'sergey_petrov',
            is_online: false,
            message_count: Math.floor(Math.random() * 30),
            role: 'moderator',
            join_date: Date.now() - 14 * 24 * 60 * 60 * 1000,
            last_seen: Date.now() - 2 * 60 * 60 * 1000
        },
        {
            user_id: 'demo_3',
            first_name: 'Мария',
            last_name: 'Сидорова',
            username: 'maria_sidorova',
            is_online: true,
            message_count: Math.floor(Math.random() * 20),
            role: 'user',
            join_date: Date.now() - 3 * 24 * 60 * 60 * 1000,
            last_seen: Date.now()
        },
        {
            user_id: 'demo_4',
            first_name: 'Алексей',
            last_name: 'Кузнецов',
            username: 'alexey_kuznetsov',
            is_online: true,
            message_count: Math.floor(Math.random() * 40),
            role: 'user',
            join_date: Date.now() - 5 * 24 * 60 * 60 * 1000,
            last_seen: Date.now()
        }
    ];
    
    demoUsers.forEach(user => {
        if (!usersCache[user.user_id]) {
            usersCache[user.user_id] = user;
            if (!userRoles[user.user_id]) {
                userRoles[user.user_id] = user.role;
            }
        }
    });
    
    saveUsers();
    saveRoles();
}

function simulateOtherUsers() {
    try {
        // Симулируем онлайн статус демо-пользователей
        setInterval(() => {
            Object.keys(usersCache).forEach(userId => {
                if (userId !== currentUserId && userId.startsWith('demo_')) {
                    // Случайно меняем онлайн статус
                    if (Math.random() > 0.7) {
                        usersCache[userId].is_online = !usersCache[userId].is_online;
                        usersCache[userId].last_seen = Date.now();
                    }
                }
            });
            updateOnlineUsers();
        }, 60000); // Каждую минуту
        
        // Добавляем демо-сообщения если чат пуст
        setTimeout(() => {
            if (!window.chatData || !window.chatData[currentSection] || window.chatData[currentSection].length <= 1) {
                addDemoMessages();
            }
        }, 2000);
        
    } catch (error) {
        console.error('❌ Ошибка симуляции других пользователей:', error);
    }
}

function addDemoMessages() {
    try {
        const demoMessages = [
            {
                user_id: 'demo_1',
                user: usersCache['demo_1'],
                message_type: 'text',
                content: 'Привет всем! Как дела? 👋',
                timestamp: Date.now() - 3600000
            },
            {
                user_id: 'demo_3',
                user: usersCache['demo_3'],
                message_type: 'text',
                content: 'Привет! Всё отлично, спасибо! А у тебя? 😊',
                timestamp: Date.now() - 3500000
            },
            {
                user_id: 'demo_4',
                user: usersCache['demo_4'],
                message_type: 'text',
                content: 'Ребята, кто смотрел новый фильм? 🎬',
                timestamp: Date.now() - 3400000
            },
            {
                user_id: 'demo_2',
                user: usersCache['demo_2'],
                message_type: 'text',
                content: 'Я смотрел! Очень рекомендую 👍',
                timestamp: Date.now() - 3300000
            },
            {
                user_id: 'demo_1',
                user: usersCache['demo_1'],
                message_type: 'text',
                content: 'Кстати, не забудьте про встречу завтра в 15:00! 📅',
                timestamp: Date.now() - 3200000
            }
        ];
        
        demoMessages.forEach((msg, index) => {
            const message = {
                id: lastMessageId + index + 1,
                ...msg,
                read: true,
                reactions: index === 2 ? { '👍': ['demo_1', 'demo_3'] } : {},
                section: currentSection
            };
            
            if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
            window.chatData[currentSection].push(message);
        });
        
        lastMessageId += demoMessages.length;
        saveMessagesToStorage(currentSection);
        displayCurrentSectionMessages();
        
    } catch (error) {
        console.error('❌ Ошибка добавления демо-сообщений:', error);
    }
}

function simulateReplies(userMessage) {
    try {
        // Случайным образом симулируем ответы других пользователей
        if (Math.random() > 0.5) {
            setTimeout(() => {
                const demoUsers = Object.values(usersCache).filter(u => 
                    u.user_id.startsWith('demo_') && u.is_online
                );
                
                if (demoUsers.length > 0) {
                    const randomUser = demoUsers[Math.floor(Math.random() * demoUsers.length)];
                    const replies = [
                        'Интересно! 🤔',
                        'Согласен! 👍',
                        'Хорошая мысль! 💡',
                        'Спасибо за информацию! 🙏',
                        'Отличное предложение! 🚀',
                        'Давайте обсудим это подробнее 📝'
                    ];
                    
                    const randomReply = replies[Math.floor(Math.random() * replies.length)];
                    
                    const replyMessage = {
                        id: lastMessageId + 1,
                        user_id: randomUser.user_id,
                        user: randomUser,
                        message_type: 'text',
                        content: randomReply,
                        timestamp: Date.now(),
                        read: false,
                        reactions: {},
                        section: currentSection
                    };
                    
                    if (!window.chatData[currentSection]) window.chatData[currentSection] = [];
                    window.chatData[currentSection].push(replyMessage);
                    lastMessageId = replyMessage.id;
                    
                    saveMessagesToStorage(currentSection);
                    
                    const messageElement = createMessageElement(replyMessage);
                    document.getElementById('messages-container').appendChild(messageElement);
                    scrollToBottom();
                    
                    // Увеличиваем счетчик непрочитанных
                    sections[currentSection].unread++;
                    updateUnreadBadges();
                }
            }, 2000 + Math.random() * 5000); // Ответ через 2-7 секунд
        }
        
    } catch (error) {
        console.error('❌ Ошибка симуляции ответов:', error);
    }
}

function checkOtherUsersTyping() {
    try {
        // Случайным образом симулируем набор текста другими пользователями
        Object.keys(usersCache).forEach(userId => {
            if (userId.startsWith('demo_') && usersCache[userId].is_online) {
                if (Math.random() > 0.8) {
                    usersCache[userId].typing = true;
                } else {
                    delete usersCache[userId].typing;
                }
            }
        });
    } catch (error) {
        console.error('❌ Ошибка проверки набора текста:', error);
    }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ВЫЗОВА ИЗ HTML =====
window.toggleSidebar = toggleSidebar;
window.showChat = showChat;
window.showUsersList = showUsersList;
window.showAdminPanel = showAdminPanel;
window.switchSection = switchSection;
window.showSection = showSection;
window.jumpToUnread = jumpToUnread;
window.mentionAll = mentionAll;
window.createInvite = createInvite;
window.showReactionPopup = showReactionPopup;
window.addReaction = addReaction;
window.toggleReaction = toggleReaction;
window.replyToMessage = replyToMessage;
window.forwardMessage = forwardMessage;
window.showMessageMenu = showMessageMenu;
window.editMessage = editMessage;
window.deleteMessage = deleteMessage;
window.showUserProfile = showUserProfile;
window.shareInvite = shareInvite;
window.changeUserRole = changeUserRole;
window.kickUser = kickUser;
window.clearChatHistory = clearChatHistory;
window.exportChatData = exportChatData;
window.createBackup = createBackup;
window.clearReplyPreview = clearReplyPreview;
window.toggleEmojiPicker = toggleEmojiPicker;
window.showEmojiCategory = showEmojiCategory;
window.insertEmoji = insertEmoji;
window.searchMessages = searchMessages;
window.clearUserSearch = clearUserSearch;
window.closeForwardPopup = closeForwardPopup;
window.attachFile = attachFile;
window.sendFile = sendFile;
window.cancelFile = cancelFile;
window.downloadFile = downloadFile;
window.viewImage = viewImage;

// Инициализация при загрузке
window.initApp = initApp;

// Экспортируем для использования в консоли разработчика
window.app = {
    tg,
    currentUser,
    currentUserId,
    sections,
    currentSection,
    userRoles,
    isAdmin,
    isMainAdmin,
    usersCache,
    chatData: window.chatData,
    pendingInvites,
    onlineStatus,
    switchSection,
    showSection,
    sendMessage,
    editMessage,
    deleteMessage,
    replyToMessage,
    forwardMessage,
    toggleReaction,
    showUserProfile,
    createInvite,
    changeUserRole,
    kickUser,
    clearChatHistory,
    exportChatData,
    createBackup
};

console.log('📦 Telegram Chat WebApp загружен и готов к работе!');
console.log('ℹ️ Для отладки используйте window.app');
