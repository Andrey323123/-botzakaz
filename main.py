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

@flask_app.route('/api/messages', methods=['GET'])
def get_messages():
    """Получить сообщения через API"""
    try:
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        # Используем синхронную функцию напрямую
        messages = db.get_messages(limit, offset)
        
        messages_data = []
        for message in messages:
            messages_data.append({
                'id': message.id,
                'user_id': message.user_id,
                'message_type': message.message_type,
                'content': message.content,
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
        
        # Сохраняем сообщение (синхронно)
        message = db.add_message(
            user_id=data['user_id'],
            message_type=data['message_type'],
            content=data.get('content'),
            file_id=data.get('file_id'),
            file_url=data.get('file_url')
        )
        
        return jsonify({'status': 'success', 'message_id': message.id})
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

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    """Обработчик команды /start"""
    try:
        # ОТЛАДКА: логируем получение команды
        logger.info(f"📩 Получена команда /start от пользователя: {message.from_user.id} (@{message.from_user.username})")
        
        # Регистрируем пользователя (СИНХРОННО - без await)
        user_data = {
            'id': message.from_user.id,
            'username': message.from_user.username,
            'first_name': message.from_user.first_name,
            'last_name': message.from_user.last_name
        }
        user = db.get_or_create_user(user_data)  # БЕЗ AWAIT!
        logger.info(f"👤 Пользователь зарегистрирован в БД: ID={user.id}")
        
        # Используем фиксированный домен Railway
        domain = "https://botzakaz-production-ba19.up.railway.app"
        
        # Создаем URL для веб-приложения
        webapp_url = f"{domain}/index.html?user_id={message.from_user.id}&first_name={message.from_user.first_name}"
        if message.from_user.username:
            webapp_url += f"&username={message.from_user.username}"
        
        logger.info(f"🌐 Создан URL веб-приложения: {webapp_url}")
        
        # Создаем клавиатуру
        keyboard = InlineKeyboardMarkup(row_width=1)
        keyboard.add(
            InlineKeyboardButton(
                "📱 Открыть чат", 
                web_app=WebAppInfo(url=webapp_url)
            )
        )
        
        welcome_text = f"""
👋 Привет, {message.from_user.first_name}!

Добро пожаловать в групповой чат Telegram!

📱 **Нажмите кнопку ниже, чтобы открыть веб-приложение:**
"""
        
        # ОТЛАДКА: логируем отправку ответа
        logger.info(f"📤 Отправляю ответ пользователю {message.from_user.id}")
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
    webapp_url = f"{domain}/index.html?user_id={message.from_user.id}"
    
    keyboard = InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        InlineKeyboardButton(
            "💬 Открыть чат", 
            web_app=WebAppInfo(url=webapp_url)
        )
    )
    await message.answer("Нажмите кнопку, чтобы открыть чат:", reply_markup=keyboard)
    logger.info(f"✅ Ответ на /chat отправлен пользователю {message.from_user.id}")

@dp.message_handler(commands=['help'])
async def cmd_help(message: types.Message):
    """Помощь"""
    logger.info(f"📩 Получена команда /help от пользователя: {message.from_user.id}")
    help_text = """
🤖 **Команды бота:**

/start - Начать работу с ботом
/chat - Открыть чат
/help - Показать эту справку

📱 **Мини-приложение чата:**
• Групповой чат в стиле Telegram
• Отправка текста, фото, голосовых сообщений
• Упоминания пользователей
• Профили пользователей
"""
    await message.answer(help_text, parse_mode='Markdown')
    logger.info(f"✅ Ответ на /help отправлен пользователю {message.from_user.id}")

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    # ОТЛАДКА: проверяем подключение к Telegram API
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
    
    # Инициализация базы данных (СИНХРОННО - без await)
    try:
        # Создаем таблицы если их нет
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        logger.info("✅ Таблицы базы данных созданы")
        
        # Инициализируем БД (БЕЗ AWAIT!)
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
    # Если запускается напрямую, запускаем и Flask и бота
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
