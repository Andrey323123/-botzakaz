import os
import logging
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.utils import executor
import core.database as db
from flask import Flask, jsonify, request
from threading import Thread
from datetime import datetime

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Получаем порт из переменных окружения Railway
PORT = int(os.getenv("PORT", 8080))

# Инициализация Flask приложения для API
flask_app = Flask(__name__)

@flask_app.route('/')
def index():
    return "Telegram Bot API is running!"

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
        logger.error(f"API error in get_messages: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/messages/send', methods=['POST'])
def send_message():
    """Отправить сообщение через API"""
    try:
        data = request.json
        if not data or 'user_id' not in data or 'message_type' not in data:
            return jsonify({'status': 'error', 'message': 'Invalid request'}), 400
        
        # Сохраняем сообщение
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        message = loop.run_until_complete(db.add_message(
            user_id=data['user_id'],
            message_type=data['message_type'],
            content=data.get('content'),
            file_id=data.get('file_id'),
            file_url=data.get('file_url')
        ))
        
        return jsonify({'status': 'success', 'message_id': message.id})
    except Exception as e:
        logger.error(f"API error in send_message: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/users', methods=['GET'])
def get_users():
    """Получить список пользователей"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        users = loop.run_until_complete(db.get_users())
        
        users_data = []
        for user in users:
            users_data.append({
                'id': user.id,
                'user_id': user.user_id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'photo_url': user.photo_url
            })
        
        return jsonify({'status': 'success', 'users': users_data})
    except Exception as e:
        logger.error(f"API error in get_users: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Получить информацию о пользователе"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        user = loop.run_until_complete(db.get_or_create_user({
            'id': user_id,
            'username': None,
            'first_name': None,
            'last_name': None
        }))
        
        return jsonify({
            'status': 'success',
            'user': {
                'id': user.id,
                'user_id': user.user_id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'photo_url': user.photo_url
            }
        })
    except Exception as e:
        logger.error(f"API error in get_user: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

def run_flask():
    """Запуск Flask сервера"""
    flask_app.run(host='0.0.0.0', port=PORT, debug=False)

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
        domain = os.getenv("RAILWAY_STATIC_URL", f"http://localhost:{PORT}")
        
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
    domain = os.getenv("RAILWAY_STATIC_URL", f"http://localhost:{PORT}")
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
• Упоминания пользователей (@username)
• Профили пользователей
• Настройки чата
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
        # Можно добавить функционал отправки сообщений через бота
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
    
    # Запуск Flask сервера
    try:
        logger.info(f"🌐 Запуск API сервера на порту {PORT}...")
        flask_thread = Thread(target=run_flask, daemon=True)
        flask_thread.start()
        logger.info("✅ API сервер запущен")
    except Exception as e:
        logger.error(f"❌ Ошибка запуска API сервера: {e}")
    
    # Информация о боте
    me = await bot.get_me()
    logger.info(f"✅ Бот @{me.username} успешно запущен!")
    logger.info("📱 Используйте команду /start для начала работы")

async def on_shutdown(dp):
    """Действия при завершении работы"""
    logger.info("👋 Завершение работы бота...")

def main():
    """Основная функция запуска"""
    print("\n" + "="*50)
    print("🚀 Telegram Bot with Mini App")
    print("="*50)
    
    # Проверяем наличие BOT_TOKEN
    if not BOT_TOKEN:
        print("\n❌ BOT_TOKEN не найден в переменных окружения!")
        print("📝 Установите BOT_TOKEN в Railway Dashboard")
        exit(1)
    
    print(f"\n🔑 Токен бота: {'✅ Найден' if BOT_TOKEN else '❌ Не найден'}")
    print(f"🌐 Порт API: {PORT}")
    print("🤖 Бот запускается...\n")
    
    # Запуск поллинга
    executor.start_polling(
        dp, 
        skip_updates=True,
        on_startup=on_startup,
        on_shutdown=on_shutdown
    )

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Завершено пользователем")
    except Exception as e:
        logger.error(f"Критическая ошибка: {e}")
