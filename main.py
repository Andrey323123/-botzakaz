import os
import logging
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.utils import executor
import core.database as db

# Сначала создаем Flask app для gunicorn
from flask import Flask, jsonify, request
flask_app = Flask(__name__)

@flask_app.route('/')
def index():
    return "Telegram Bot with Mini App is running!"

@flask_app.route('/health')
def health():
    return jsonify({"status": "healthy"}), 200

@flask_app.route('/api/messages', methods=['GET'])
def get_messages():
    """Получить сообщения через API"""
    try:
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        # Запускаем асинхронную функцию
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        messages = loop.run_until_complete(db.get_messages(limit, offset))
        
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

bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(bot, storage=storage)

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    """Обработчик команды /start"""
    try:
        # Регистрируем пользователя
        user_data = {
            'id': message.from_user.id,
            'username': message.from_user.username,
            'first_name': message.from_user.first_name,
            'last_name': message.from_user.last_name
        }
        user = await db.get_or_create_user(user_data)
        
        # Получаем домен из переменных окружения Railway
        domain = os.getenv("RAILWAY_STATIC_URL", f"http://localhost:{os.getenv('PORT', 8080)}")
        
        # Создаем URL для веб-приложения
        webapp_url = f"{domain}/index.html?user_id={message.from_user.id}&first_name={message.from_user.first_name}"
        if message.from_user.username:
            webapp_url += f"&username={message.from_user.username}"
        
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
        
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode='Markdown')
        logger.info(f"Пользователь {message.from_user.id} начал работу с ботом")
        
    except Exception as e:
        logger.error(f"Error in /start: {e}")
        await message.answer("❌ Произошла ошибка. Попробуйте позже.")

@dp.message_handler(commands=['chat'])
async def cmd_chat(message: types.Message):
    """Открыть чат"""
    domain = os.getenv("RAILWAY_STATIC_URL", f"http://localhost:{os.getenv('PORT', 8080)}")
    webapp_url = f"{domain}/index.html?user_id={message.from_user.id}"
    
    keyboard = InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        InlineKeyboardButton(
            "💬 Открыть чат", 
            web_app=WebAppInfo(url=webapp_url)
        )
    )
    await message.answer("Нажмите кнопку, чтобы открыть чат:", reply_markup=keyboard)

@dp.message_handler(commands=['help'])
async def cmd_help(message: types.Message):
    """Помощь"""
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

@dp.message_handler(commands=['stats'])
async def cmd_stats(message: types.Message):
    """Статистика чата"""
    try:
        users = await db.get_users()
        messages = await db.get_messages(limit=1000)
        
        stats_text = f"""
📊 **Статистика чата:**

👥 Пользователей: {len(users)}
💬 Сообщений: {len(messages)}
"""
        await message.answer(stats_text, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in /stats: {e}")
        await message.answer("❌ Не удалось получить статистику.")

@dp.message_handler(content_types=types.ContentType.TEXT)
async def handle_text(message: types.Message):
    """Обработка текстовых сообщений"""
    if message.text.startswith('/'):
        # Если команда не распознана
        await message.answer("🤔 Неизвестная команда. Используйте /help для списка команд.")
    else:
        await message.answer("💡 Для общения в чате используйте мини-приложение через команду /chat")

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    # Инициализация базы данных
    try:
        await db.init_db()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}")
    
    # Информация о боте
    me = await bot.get_me()
    logger.info(f"✅ Бот @{me.username} успешно запущен!")
    logger.info("📱 Используйте команду /start для начала работы")
    logger.info(f"🌐 Веб-приложение доступно по адресу: {os.getenv('RAILWAY_STATIC_URL', 'http://localhost:8080')}")

async def on_shutdown(dp):
    """Действия при завершении работы"""
    logger.info("👋 Завершение работы бота...")

def run_bot():
    """Запуск бота"""
    print("\n" + "="*50)
    print("🚀 Telegram Bot with Mini App")
    print("="*50)
    
    # Проверяем наличие BOT_TOKEN
    if not BOT_TOKEN:
        print("\n❌ BOT_TOKEN не найден в переменных окружения!")
        print("📝 Установите BOT_TOKEN в Railway Dashboard")
        exit(1)
    
    print(f"\n🔑 Токен бота: {'✅ Найден' if BOT_TOKEN else '❌ Не найден'}")
    print(f"🌐 Порт: {os.getenv('PORT', 8080)}")
    print("🤖 Запуск бота...\n")
    
    # Запуск поллинга
    executor.start_polling(
        dp, 
        skip_updates=True,
        on_startup=on_startup,
        on_shutdown=on_shutdown
    )

# Если файл запускается напрямую (не через gunicorn)
if __name__ == '__main__':
    import threading
    
    # Запускаем бота в отдельном потоке
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    
    # Запускаем Flask app (для gunicorn)
    port = int(os.getenv("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
