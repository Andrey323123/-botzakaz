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
import json
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
        messages = asyncio.run(db.get_messages(limit, offset))
        
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
        message = asyncio.run(db.add_message(
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
        users = asyncio.run(db.get_users())
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
        webapp_url = f"{domain}/index.html?user_id={message.from_user.id}"
        
        # Создаем клавиатуру
        keyboard = InlineKeyboardMarkup(row_width=1)
        keyboard.add(
            InlineKeyboardButton(
                "📱 Открыть чат", 
                web_app=WebAppInfo(url=webapp_url)
            )
        )
        
        await message.answer(
            f"👋 Привет, {message.from_user.first_name}!\n"
            f"Добро пожаловать в групповой чат!\n\n"
            f"Нажмите кнопку ниже, чтобы открыть веб-приложение:",
            reply_markup=keyboard
        )
        
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
/start - Начать работу
/chat - Открыть чат
/help - Помощь

📱 **Мини-приложение:**
• Групповой чат
• Отправка сообщений
• Упоминания пользователей
• Профили
    """
    await message.answer(help_text, parse_mode='Markdown')

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    # Инициализация БД
    try:
        await db.init_db()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка БД: {e}")
    
    # Запускаем Flask в отдельном потоке
    flask_thread = Thread(target=run_flask, daemon=True)
    flask_thread.start()
    logger.info(f"🌐 API сервер запущен на порту {PORT}")

async def on_shutdown(dp):
    """Действия при завершении"""
    logger.info("👋 Завершение работы...")

def main():
    """Основная функция"""
    print("\n" + "="*50)
    print("🚀 Telegram Bot with Mini App")
    print("="*50)
    
    # Запускаем бота
    executor.start_polling(
        dp,
        skip_updates=True,
        on_startup=on_startup,
        on_shutdown=on_shutdown
    )

if __name__ == '__main__':
    main()