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
from datetime import datetime

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
        
        # Запускаем асинхронную функцию
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        messages = loop.run_until_complete(db.get_messages(limit, offset))
        
        messages_data = []
        for message in messages:
            # Получаем информацию о пользователе
            user = loop.run_until_complete(db.get_user_by_id(message.user_id))
            user_data = {
                'user_id': user.user_id if user else message.user_id,
                'username': user.username if user else None,
                'first_name': user.first_name if user else 'User',
                'last_name': user.last_name if user else None,
                'photo_url': user.photo_url if user else None
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
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        user = loop.run_until_complete(db.get_user_by_id(data['user_id']))
        
        if user and user.is_banned:
            return jsonify({'status': 'error', 'message': 'User is banned'}), 403
        
        if user and user.is_muted and user.mute_until and user.mute_until > datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'User is muted'}), 403
        
        # Сохраняем сообщение
        message = loop.run_until_complete(db.add_message(
            user_id=data['user_id'],
            message_type=data['message_type'],
            content=data.get('content'),
            file_id=data.get('file_id'),
            file_url=data.get('file_url')
        ))
        
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
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        users = loop.run_until_complete(db.get_users())
        
        users_data = []
        for user in users:
            # Получаем количество сообщений пользователя
            message_count = loop.run_until_complete(db.get_message_count(user.user_id))
            
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
                'is_online': False  # Будем реализовывать позже
            })
        
        return jsonify({'status': 'success', 'users': users_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user_api(user_id):
    """Получить информацию о пользователе"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        user = loop.run_until_complete(db.get_user_by_id(user_id))
        
        if not user:
            # Создаем пользователя если не существует
            user = loop.run_until_complete(db.get_or_create_user({
                'id': user_id,
                'username': None,
                'first_name': f'User{user_id}',
                'last_name': None
            }))
        
        # Получаем статистику
        message_count = loop.run_until_complete(db.get_message_count(user_id))
        active_users = loop.run_until_complete(db.get_active_users(24))
        is_online = user in active_users
        
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
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        settings = loop.run_until_complete(db.get_group_settings())
        
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
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Получаем все данные
        users = loop.run_until_complete(db.get_users())
        messages = loop.run_until_complete(db.get_messages(limit=10000))
        active_users = loop.run_until_complete(db.get_active_users(24))
        
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
            user = loop.run_until_complete(db.get_user_by_id(user_id))
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

# ... остальная часть с обработчиками команд бота остается без изменений ...
# (команды /start, /chat, /help и т.д.)

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    # Инициализация базы данных
    try:
        await db.init_db()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}", exc_info=True)
    
    # Информация о боте
    me = await bot.get_me()
    logger.info(f"✅ Бот @{me.username} успешно запущен!")
    logger.info("📱 Используйте команду /start для начала работы")
    logger.info(f"🌐 Веб-приложение: https://botzakaz-production-ba19.up.railway.app")

def run_bot():
    """Запуск бота"""
    print("\n" + "="*50)
    print("🚀 Telegram Bot with Mini App")
    print("="*50)
    
    print(f"\n🔑 Токен бота: {'✅ Найден' if BOT_TOKEN else '❌ Не найден'}")
    print(f"🌐 Домен: https://botzakaz-production-ba19.up.railway.app")
    print("\n🤖 Запуск бота...")
    print("="*50)
    
    try:
        executor.start_polling(
            dp, 
            skip_updates=True,
            on_startup=on_startup
        )
    except Exception as e:
        logger.error(f"❌ Критическая ошибка при запуске бота: {e}", exc_info=True)

if __name__ == '__main__':
    import threading
    
    # Запускаем бота в отдельном потоке
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    
    # Запускаем Flask app (для gunicorn)
    port = int(os.getenv("PORT", 8080))
    logger.info(f"🌐 Flask app запускается на порту {port}")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
