import os
import logging
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.utils import executor
import core.database as db

# Сначала создаем Flask app для gunicorn
from flask import Flask, jsonify, request, send_from_directory
flask_app = Flask(__name__)

# Путь к веб-приложению
WEBAPP_DIR = os.path.join(os.path.dirname(__file__), 'bot/webapp')

# Импортируем модели для создания таблиц
from sqlalchemy import create_engine
from core.models import Base
from datetime import datetime, timedelta
import json

@flask_app.route('/')
def index():
    return "Telegram Bot with Mini App is running! Use /start in Telegram"

@flask_app.route('/health')
def health():
    return jsonify({"status": "healthy"}), 200

@flask_app.route('/init-db')
def init_database():
    """Ручка для инициализации базы данных"""
    try:
        # Создаем таблицы
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        return jsonify({"status": "success", "message": "Database tables created"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@flask_app.route('/index.html')
def serve_index():
    return send_from_directory(WEBAPP_DIR, 'index.html')

@flask_app.route('/<path:filename>')
def serve_static(filename):
    if os.path.exists(os.path.join(WEBAPP_DIR, filename)):
        return send_from_directory(WEBAPP_DIR, filename)
    return "File not found", 404

# ========== API ЭНДПОИНТЫ ДЛЯ ВЕБ-ПРИЛОЖЕНИЯ ==========

@flask_app.route('/api/messages', methods=['GET'])
def get_messages():
    """Получить сообщения через API"""
    try:
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        messages = db.get_messages(limit, offset)
        
        messages_data = []
        for message in messages:
            # Получаем информацию о пользователе для каждого сообщения
            user = db.get_user_by_id(message.user_id)
            user_data = {
                'user_id': user.user_id if user else message.user_id,
                'username': user.username if user else None,
                'first_name': user.first_name if user else 'User',
                'last_name': user.last_name if user else None
            }
            
            messages_data.append({
                'id': message.id,
                'user': user_data,
                'message_type': message.message_type,
                'content': message.content,
                'file_id': message.file_id,
                'file_url': message.file_url,
                'timestamp': message.timestamp.isoformat() if message.timestamp else None
            })
        
        return jsonify({
            'status': 'success',
            'messages': messages_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/messages/send', methods=['POST'])
def send_message_api():
    """Отправить сообщение через API"""
    try:
        data = request.json
        if not data or 'user_id' not in data or 'message_type' not in data:
            return jsonify({'status': 'error', 'message': 'Invalid request'}), 400
        
        # Проверяем, не забанен ли пользователь
        user = db.get_user_by_id(data['user_id'])
        
        if user and user.is_banned:
            return jsonify({'status': 'error', 'message': 'User is banned'}), 403
        
        if user and user.is_muted and user.mute_until and user.mute_until > datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'User is muted'}), 403
        
        # Сохраняем сообщение
        message = db.add_message(
            user_id=data['user_id'],
            message_type=data['message_type'],
            content=data.get('content'),
            file_id=data.get('file_id'),
            file_url=data.get('file_url')
        )
        
        return jsonify({
            'status': 'success', 
            'message_id': message.id,
            'timestamp': message.timestamp.isoformat() if message.timestamp else None
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/users', methods=['GET'])
def get_users_api():
    """Получить список пользователей"""
    try:
        users = db.get_users()
        
        users_data = []
        for user in users:
            # Получаем количество сообщений пользователя
            message_count = db.get_message_count(user.user_id)
            
            # Проверяем активность пользователя (был ли онлайн за последние 24 часа)
            active_users = db.get_active_users(24)
            is_online = any(u.user_id == user.user_id for u in active_users)
            
            users_data.append({
                'id': user.id,
                'user_id': user.user_id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'photo_url': user.photo_url,
                'is_banned': user.is_banned,
                'is_muted': user.is_muted,
                'mute_until': user.mute_until.isoformat() if user.mute_until else None,
                'created_at': user.created_at.isoformat() if user.created_at else None,
                'message_count': message_count,
                'is_online': is_online
            })
        
        return jsonify({'status': 'success', 'users': users_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user_api(user_id):
    """Получить информацию о пользователе"""
    try:
        user = db.get_user_by_id(user_id)
        
        if not user:
            # Создаем пользователя если не существует
            user = db.get_or_create_user({
                'id': user_id,
                'username': None,
                'first_name': f'User{user_id}',
                'last_name': None
            })
        
        # Получаем статистику
        message_count = db.get_message_count(user_id)
        active_users = db.get_active_users(24)
        is_online = any(u.user_id == user_id for u in active_users)
        
        user_data = {
            'id': user.id,
            'user_id': user.user_id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'photo_url': user.photo_url,
            'is_banned': user.is_banned,
            'is_muted': user.is_muted,
            'mute_until': user.mute_until.isoformat() if user.mute_until else None,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'message_count': message_count,
            'is_online': is_online
        }
        
        return jsonify({'status': 'success', 'user': user_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/group/settings', methods=['GET'])
def get_group_settings_api():
    """Получить настройки группы"""
    try:
        settings = db.get_group_settings()
        
        settings_data = {
            'id': settings.id,
            'group_name': settings.group_name,
            'welcome_message': settings.welcome_message,
            'max_file_size': settings.max_file_size,
            'allow_photos': settings.allow_photos,
            'allow_voices': settings.allow_voices,
            'allow_documents': settings.allow_documents,
            'created_at': settings.created_at.isoformat() if settings.created_at else None
        }
        
        return jsonify({'status': 'success', 'settings': settings_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/stats', methods=['GET'])
def get_stats_api():
    """Получить статистику чата"""
    try:
        # Получаем все данные
        users = db.get_users()
        messages = db.get_messages(limit=10000)
        active_users = db.get_active_users(24)
        
        # Статистика по дням (последние 7 дней)
        daily_stats = {}
        for i in range(7):
            date = datetime.utcnow().date() - timedelta(days=i)
            daily_stats[date.isoformat()] = 0
        
        for message in messages:
            if message.timestamp:
                date = message.timestamp.date()
                date_str = date.isoformat()
                if date_str in daily_stats:
                    daily_stats[date_str] += 1
        
        stats_data = {
            'total_users': len(users),
            'total_messages': len(messages),
            'banned_users': sum(1 for u in users if u.is_banned),
            'muted_users': sum(1 for u in users if u.is_muted),
            'online_users': len(active_users),
            'daily_stats': daily_stats,
            'top_users': []
        }
        
        # Топ пользователей по сообщениям
        user_message_count = {}
        for message in messages:
            user_message_count[message.user_id] = user_message_count.get(message.user_id, 0) + 1
        
        sorted_users = sorted(user_message_count.items(), key=lambda x: x[1], reverse=True)[:5]
        
        for user_id, count in sorted_users:
            user = db.get_user_by_id(user_id)
            if user:
                stats_data['top_users'].append({
                    'user_id': user.user_id,
                    'username': user.username,
                    'first_name': user.first_name,
                    'message_count': count
                })
        
        return jsonify({'status': 'success', 'stats': stats_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/register', methods=['POST'])
def register_user_api():
    """Регистрация пользователя через API"""
    try:
        data = request.json
        if not data or 'id' not in data:
            return jsonify({'status': 'error', 'message': 'Invalid request'}), 400
        
        user = db.get_or_create_user({
            'id': data['id'],
            'username': data.get('username'),
            'first_name': data.get('first_name'),
            'last_name': data.get('last_name'),
            'photo_url': data.get('photo_url')
        })
        
        return jsonify({
            'status': 'success',
            'user_id': user.user_id,
            'message': 'User registered successfully'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/messages/search', methods=['GET'])
def search_messages_api():
    """Поиск сообщений"""
    try:
        query = request.args.get('q', '').lower()
        if not query:
            return jsonify({'status': 'error', 'message': 'Search query required'}), 400
        
        messages = db.get_messages(limit=1000)  # Получаем больше сообщений для поиска
        found_messages = []
        
        for message in messages:
            if query in (message.content or '').lower():
                user = db.get_user_by_id(message.user_id)
                found_messages.append({
                    'id': message.id,
                    'user_id': message.user_id,
                    'username': user.username if user else None,
                    'first_name': user.first_name if user else 'User',
                    'content': message.content,
                    'timestamp': message.timestamp.isoformat() if message.timestamp else None
                })
        
        return jsonify({
            'status': 'success',
            'query': query,
            'count': len(found_messages),
            'messages': found_messages
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Экспортируем app для gunicorn
app = flask_app

# Настройка логирования для aiogram
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Инициализация Telegram бота
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    logger.error("❌ BOT_TOKEN не найден!")
    exit(1)

# ОТЛАДКА: логируем информацию о токене (без полного показа)
logger.info(f"🔑 Токен бота получен, первые 10 символов: {BOT_TOKEN[:10]}...")
logger.info(f"📏 Длина токена: {len(BOT_TOKEN)} символов")

bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(bot, storage=storage)

# ========== ДОПОЛНИТЕЛЬНЫЕ КОМАНДЫ БОТА ==========

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    """Обработчик команды /start"""
    try:
        logger.info(f"📩 Получена команда /start от пользователя: {message.from_user.id} (@{message.from_user.username})")
        
        # Регистрируем пользователя
        user_data = {
            'id': message.from_user.id,
            'username': message.from_user.username,
            'first_name': message.from_user.first_name,
            'last_name': message.from_user.last_name
        }
        user = db.get_or_create_user(user_data)
        logger.info(f"👤 Пользователь зарегистрирован в БД: ID={user.id}")
        
        # URL для веб-приложения
        domain = "https://botzakaz-production-ba19.up.railway.app"
        webapp_url = f"{domain}/index.html?user_id={message.from_user.id}&first_name={message.from_user.first_name}"
        if message.from_user.username:
            webapp_url += f"&username={message.from_user.username}"
        
        logger.info(f"🌐 Создан URL веб-приложения: {webapp_url}")
        
        # Создаем клавиатуру с дополнительными кнопками
        keyboard = InlineKeyboardMarkup(row_width=2)
        keyboard.add(
            InlineKeyboardButton(
                "📱 Открыть чат", 
                web_app=WebAppInfo(url=webapp_url)
            ),
            InlineKeyboardButton(
                "📊 Статистика",
                callback_data="stats"
            )
        )
        keyboard.add(
            InlineKeyboardButton(
                "👥 Участники",
                callback_data="users"
            ),
            InlineKeyboardButton(
                "❓ Помощь",
                callback_data="help"
            )
        )
        
        welcome_text = f"""
👋 Привет, {message.from_user.first_name}!

Добро пожаловать в групповой чат Telegram!

📱 **Нажмите кнопку ниже, чтобы открыть веб-приложение:**

✨ **Возможности:**
• Групповой чат в реальном времени
• Отправка фото, голосовых сообщений и файлов
• Упоминания участников
• Профили пользователей
• Статистика активности
• Администрирование чата

🚀 **Быстрый доступ:**
/start - Это меню
/chat - Быстрый доступ к чату
/stats - Статистика чата
/users - Список участников
/help - Помощь по командам
"""
        
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode='Markdown')
        logger.info(f"✅ Ответ отправлен пользователю {message.from_user.id}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /start: {e}", exc_info=True)
        await message.answer("❌ Произошла ошибка. Попробуйте позже.")

@dp.message_handler(commands=['chat'])
async def cmd_chat(message: types.Message):
    """Открыть чат"""
    logger.info(f"📩 Получена команда /chat от пользователя: {message.from_user.id}")
    domain = "https://botzakaz-production-ba19.up.railway.app"
    webapp_url = f"{domain}/index.html?user_id={message.from_user.id}&first_name={message.from_user.first_name}"
    
    keyboard = InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        InlineKeyboardButton(
            "💬 Открыть чат", 
            web_app=WebAppInfo(url=webapp_url)
        )
    )
    await message.answer("Нажмите кнопку, чтобы открыть чат:", reply_markup=keyboard)
    logger.info(f"✅ Ответ на /chat отправлен пользователю {message.from_user.id}")

@dp.message_handler(commands=['stats'])
async def cmd_stats(message: types.Message):
    """Показать статистику"""
    logger.info(f"📩 Получена команда /stats от пользователя: {message.from_user.id}")
    try:
        users = db.get_users()
        messages = db.get_messages(limit=1000)
        active_users = db.get_active_users(24)
        
        stats_text = f"""
📊 **Статистика чата:**

👥 **Пользователи:** {len(users)}
• 🟢 Онлайн: {len(active_users)}
• 🚫 Забанено: {sum(1 for u in users if u.is_banned)}
• 🔇 В муте: {sum(1 for u in users if u.is_muted)}

💬 **Сообщения:** {len(messages)}
• 📅 Сегодня: {len([m for m in messages if m.timestamp and m.timestamp.date() == datetime.utcnow().date()])}
• 📈 Неделя: {len([m for m in messages if m.timestamp and m.timestamp > datetime.utcnow() - timedelta(days=7)])}

🏆 **Топ отправителей:**
"""
        
        # Топ пользователей
        user_message_count = {}
        for msg in messages:
            user_message_count[msg.user_id] = user_message_count.get(msg.user_id, 0) + 1
        
        sorted_users = sorted(user_message_count.items(), key=lambda x: x[1], reverse=True)[:5]
        
        for i, (user_id, count) in enumerate(sorted_users, 1):
            user = db.get_user_by_id(user_id)
            username = f"@{user.username}" if user and user.username else f"User{user_id}"
            stats_text += f"{i}. {username}: {count} сообщ.\n"
        
        stats_text += f"\n🌐 **Веб-приложение:**\nhttps://botzakaz-production-ba19.up.railway.app"
        
        await message.answer(stats_text, parse_mode='Markdown')
        logger.info(f"✅ Ответ на /stats отправлен пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /stats: {e}", exc_info=True)
        await message.answer("❌ Ошибка получения статистики")

@dp.message_handler(commands=['users'])
async def cmd_users(message: types.Message):
    """Показать список пользователей"""
    logger.info(f"📩 Получена команда /users от пользователя: {message.from_user.id}")
    try:
        users = db.get_users()
        active_users = db.get_active_users(24)
        
        users_text = f"""
👥 **Участники чата:** {len(users)}

🟢 **Сейчас онлайн:** {len(active_users)}
"""
        
        # Показываем первых 10 пользователей
        for i, user in enumerate(users[:10], 1):
            status = "🟢" if any(u.user_id == user.user_id for u in active_users) else "⚪"
            if user.is_banned:
                status = "🚫"
            elif user.is_muted:
                status = "🔇"
            
            username = f"@{user.username}" if user.username else f"User{user.user_id}"
            users_text += f"\n{i}. {status} {username} - {user.first_name or ''}"
        
        if len(users) > 10:
            users_text += f"\n\n... и ещё {len(users) - 10} участников"
        
        users_text += f"\n\n📱 **Полный список в веб-приложении:**\nhttps://botzakaz-production-ba19.up.railway.app"
        
        await message.answer(users_text, parse_mode='Markdown')
        logger.info(f"✅ Ответ на /users отправлен пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /users: {e}", exc_info=True)
        await message.answer("❌ Ошибка получения списка пользователей")

@dp.message_handler(commands=['help'])
async def cmd_help(message: types.Message):
    """Помощь"""
    logger.info(f"📩 Получена команда /help от пользователя: {message.from_user.id}")
    help_text = """
🤖 **Команды бота:**

/start - Начать работу с ботом
/chat - Открыть чат
/stats - Статистика чата
/users - Список пользователей
/help - Показать эту справку

📱 **Веб-приложение чата:**
• Групповой чат в реальном времени
• Отправка текста, фото, голосовых сообщений
• Упоминания пользователей (@username)
• Профили участников
• Поиск по сообщениям
• Настройки уведомлений

🚀 **Быстрые ссылки:**
• Веб-приложение: https://botzakaz-production-ba19.up.railway.app
• API документация: /api/messages, /api/users, /api/stats

❓ **Проблемы?**
Если веб-приложение не открывается:
1. Используйте Telegram на телефоне
2. Обновите приложение Telegram
3. Перезапустите бота командой /start
4. Проверьте подключение к интернету
"""
    await message.answer(help_text, parse_mode='Markdown')
    logger.info(f"✅ Ответ на /help отправлен пользователю {message.from_user.id}")

# ========== ОБРАБОТЧИКИ КНОПОК ==========

@dp.callback_query_handler(lambda c: c.data == 'stats')
async def process_stats_callback(callback_query: types.CallbackQuery):
    """Обработчик кнопки Статистика"""
    await bot.answer_callback_query(callback_query.id)
    await cmd_stats(callback_query.message)

@dp.callback_query_handler(lambda c: c.data == 'users')
async def process_users_callback(callback_query: types.CallbackQuery):
    """Обработчик кнопки Участники"""
    await bot.answer_callback_query(callback_query.id)
    await cmd_users(callback_query.message)

@dp.callback_query_handler(lambda c: c.data == 'help')
async def process_help_callback(callback_query: types.CallbackQuery):
    """Обработчик кнопки Помощь"""
    await bot.answer_callback_query(callback_query.id)
    await cmd_help(callback_query.message)

# ========== ЗАПУСК БОТА ==========

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    # Проверяем подключение к Telegram API
    try:
        logger.info("🔍 Проверяю подключение к Telegram API...")
        me = await bot.get_me()
        logger.info(f"✅ Подключение к Telegram API успешно!")
        logger.info(f"🤖 Информация о боте: @{me.username} (id: {me.id}, имя: {me.first_name})")
    except Exception as e:
        logger.error(f"❌ Не удалось подключиться к Telegram API: {e}", exc_info=True)
        logger.error("⚠️  Возможные причины:")
        logger.error("  1. Неправильный токен бота")
        logger.error("  2. Проблемы с интернет-соединением")
        logger.error("  3. Бот заблокирован или удален")
        return
    
    # Инициализация базы данных
    try:
        # Создаем таблицы если их нет
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        logger.info("✅ Таблицы базы данных созданы")
        
        # Инициализируем БД
        db.init_db()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}", exc_info=True)
    
    logger.info("📱 Используйте команду /start для начала работы")
    logger.info(f"🌐 Веб-приложение: https://botzakaz-production-ba19.up.railway.app")
    logger.info(f"🔗 Инициализация БД: https://botzakaz-production-ba19.up.railway.app/init-db")
    logger.info("🎉 Бот готов к работе!")

async def on_shutdown(dp):
    """Действия при завершении работы"""
    logger.info("👋 Завершение работы бота...")

def start_bot():
    """Запуск бота в отдельном процессе"""
    print("\n" + "="*50)
    print("🚀 Telegram Bot with Mini App")
    print("="*50)
    
    # Проверяем наличие BOT_TOKEN
    if not BOT_TOKEN:
        print("\n❌ BOT_TOKEN не найден в переменных окружения!")
        print("📝 Установите BOT_TOKEN в Railway Dashboard")
        exit(1)
    
    print(f"\n🔑 Токен бота: {'✅ Найден' if BOT_TOKEN else '❌ Не найден'}")
    print(f"📏 Длина токена: {len(BOT_TOKEN)} символов")
    print(f"🌐 Домен: https://botzakaz-production-ba19.up.railway.app")
    print("\n🤖 Запуск бота...")
    print("="*50)
    
    try:
        # Запуск поллинга в отдельном потоке событий
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(executor.start_polling(
            dp, 
            skip_updates=True,
            on_startup=on_startup,
            on_shutdown=on_shutdown
        ))
    except Exception as e:
        logger.error(f"❌ Критическая ошибка при запуске бота: {e}", exc_info=True)
        print(f"\n❌ Бот не запущен: {e}")

# Запускаем бот при импорте (для Railway)
if __name__ == '__main__':
    import threading
    
    # Запускаем бота в отдельном потоке
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()
    
    # Запускаем Flask app (основной поток для gunicorn)
    port = int(os.getenv("PORT", 8080))
    logger.info(f"🌐 Flask app запускается на порту {port}")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
else:
    # Если импортируется gunicorn, запускаем только бота в фоне
    import threading
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()
