import os
import logging
import asyncio
import boto3
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.utils import executor
import core.database as db
from botocore.client import Config
from flask import Flask, jsonify, request, send_from_directory
import uuid
from datetime import datetime
import json
from werkzeug.utils import secure_filename
from sqlalchemy import create_engine

flask_app = Flask(__name__)

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
flask_logger = logging.getLogger('flask_app')

# ===== КОНФИГУРАЦИЯ SELECTEL S3 =====
S3_ENDPOINT = "https://s3.ru-3.storage.selcloud.ru"
S3_BUCKET = "telegram-chat-files"
S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY', '25d16365251e45ec9b678de28dafd86b')
S3_SECRET_KEY = os.getenv('S3_SECRET_KEY', 'cc56887e78d14bdbae867638726a816b')

# Инициализация клиента S3
s3_client = None
try:
    s3_client = boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
    )
    flask_logger.info("✅ S3 клиент инициализирован")
except Exception as e:
    flask_logger.error(f"❌ Ошибка инициализации S3 клиента: {e}")
    s3_client = None

# Путь к веб-приложению
WEBAPP_DIR = 'bot/webapp'
flask_logger.info(f"📂 Путь к веб-приложению: {WEBAPP_DIR}")

# Импортируем модели для создания таблиц
from core.models import Base

# ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ S3 =====
def generate_s3_url(filepath):
    """Генерация URL для файла в S3"""
    return f"{S3_ENDPOINT}/{S3_BUCKET}/{filepath}"

def upload_to_s3(file_data, filepath, content_type='application/octet-stream'):
    """Загрузка файла в S3"""
    try:
        if not s3_client:
            raise Exception("S3 клиент не инициализирован")
        
        flask_logger.info(f"📤 Загрузка файла в S3: {filepath}")
        
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=filepath,
            Body=file_data,
            ContentType=content_type
        )
        
        file_url = generate_s3_url(filepath)
        flask_logger.info(f"✅ Файл загружен в S3: {file_url}")
        return file_url
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки в S3: {e}", exc_info=True)
        raise

def test_s3_connection():
    """Тест подключения к S3"""
    try:
        if not s3_client:
            return False, "S3 клиент не инициализирован"
        
        s3_client.head_bucket(Bucket=S3_BUCKET)
        return True, "✅ Подключение к S3 успешно"
        
    except Exception as e:
        return False, f"❌ Ошибка подключения к S3: {str(e)}"

# ===== FLASK ROUTES =====
@flask_app.after_request
def add_cors_headers(response):
    """Добавляем CORS заголовки вручную"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@flask_app.route('/')
def index():
    return "Telegram Bot with Mini App is running! Use /start in Telegram"

@flask_app.route('/health')
def health():
    s3_connected, s3_message = test_s3_connection()
    
    return jsonify({
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "s3_connected": s3_connected,
        "s3_message": s3_message
    }), 200

@flask_app.route('/init-db')
def init_database():
    try:
        flask_logger.info("🛠️ Инициализация базы данных...")
        
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        flask_logger.info("✅ Таблицы базы данных созданы")
        
        try:
            db.init_db()
            flask_logger.info("✅ Начальные данные созданы")
        except Exception as init_error:
            flask_logger.error(f"⚠️ Ошибка инициализации начальных данных: {init_error}")
        
        s3_connected, s3_message = test_s3_connection()
        
        return jsonify({
            "status": "success", 
            "message": "Database initialized successfully",
            "s3_connection": {
                "connected": s3_connected,
                "message": s3_message
            }
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка создания таблиц: {e}", exc_info=True)
        return jsonify({
            "status": "error", 
            "message": str(e)
        }), 500

# ===== API ДЛЯ ФРОНТЕНДА =====
@flask_app.route('/api/s3/proxy-upload', methods=['POST'])
def proxy_upload_to_s3():
    """Прокси загрузка файла в S3 через бэкенд"""
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No file provided'}), 400
        
        file = request.files['file']
        user_id = request.form.get('user_id')
        file_type = request.form.get('type', 'document')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        # Читаем файл
        file_data = file.read()
        
        # Генерируем уникальное имя файла
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'bin'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"uploads/{file_type}/{user_id}/{unique_filename}"
        
        # Загружаем в S3 через бэкенд
        file_url = upload_to_s3(
            file_data,
            filepath,
            content_type=file.content_type
        )
        
        return jsonify({
            'status': 'success',
            'file_url': file_url,
            'filename': filename,
            'unique_filename': unique_filename,
            'size': len(file_data),
            'type': file_type
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка прокси загрузки файла: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/save-message', methods=['POST'])
def save_message_to_s3():
    """Сохранить сообщение в S3 через бэкенд"""
    try:
        data = request.json
        
        if not data:
            return jsonify({'status': 'error', 'message': 'No data provided'}), 400
        
        user_id = data.get('user_id')
        content = data.get('content', '')
        section = data.get('section', 'main')
        files = data.get('files', [])
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        # Создаем объект сообщения
        message_id = str(uuid.uuid4())
        message = {
            'id': message_id,
            'user_id': str(user_id),
            'content': content,
            'timestamp': datetime.now().isoformat(),
            'section': section,
            'files': files
        }
        
        # Определяем путь в S3
        s3_path = f"data/messages_{section}.json"
        
        try:
            # Пытаемся загрузить существующие сообщения
            existing_data = {}
            try:
                obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_path)
                existing_data = json.loads(obj['Body'].read().decode('utf-8'))
            except:
                existing_data = {'messages': []}
            
            # Добавляем новое сообщение
            if 'messages' not in existing_data:
                existing_data['messages'] = []
            
            existing_data['messages'].append(message)
            
            # Сохраняем обратно в S3
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=s3_path,
                Body=json.dumps(existing_data, indent=2).encode('utf-8'),
                ContentType='application/json'
            )
            
            return jsonify({
                'status': 'success',
                'message_id': message_id,
                's3_path': s3_path,
                'message': 'Сообщение сохранено в S3'
            })
            
        except Exception as s3_error:
            flask_logger.error(f"❌ Ошибка сохранения в S3: {s3_error}")
            return jsonify({
                'status': 'error', 
                'message': f'S3 save error: {str(s3_error)}'
            }), 500
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка сохранения сообщения: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/check', methods=['GET'])
def check_s3():
    """Проверить подключение к S3"""
    try:
        connected, message = test_s3_connection()
        
        return jsonify({
            'status': 'success',
            'connected': connected,
            'message': message,
            'bucket': S3_BUCKET
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Ошибка проверки S3: {str(e)}'
        }), 500

# ===== ОБСЛУЖИВАНИЕ СТАТИЧЕСКИХ ФАЙЛОВ =====
@flask_app.route('/index.html')
def serve_index():
    return send_from_directory(WEBAPP_DIR, 'index.html')

@flask_app.route('/<path:filename>')
def serve_static(filename):
    file_path = os.path.join(WEBAPP_DIR, filename)
    
    if os.path.exists(file_path):
        return send_from_directory(WEBAPP_DIR, filename)
    
    return "File not found", 404

# Экспортируем app для gunicorn
app = flask_app

# ===== TELEGRAM BOT =====
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    logger.error("❌ BOT_TOKEN не найден!")
    exit(1)

logger.info(f"🔑 Токен бота получен: {BOT_TOKEN[:10]}...")

bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(bot, storage=storage)

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    try:
        logger.info(f"📩 Получена команда /start от пользователя: {message.from_user.id}")
        
        user_data = {
            'id': message.from_user.id,
            'username': message.from_user.username,
            'first_name': message.from_user.first_name,
            'last_name': message.from_user.last_name
        }
        user = db.get_or_create_user(user_data)
        logger.info(f"👤 Пользователь зарегистрирован в БД: ID={user.id}")
        
        domain = "https://botzakaz-production-ba19.up.railway.app"
        webapp_url = f"{domain}/index.html?user_id={message.from_user.id}&first_name={message.from_user.first_name}"
        if message.from_user.username:
            webapp_url += f"&username={message.from_user.username}"
        
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
        
        welcome_text = f"""
👋 Привет, {message.from_user.first_name}!

Добро пожаловать в групповой чат Telegram!

📱 **Нажмите кнопку ниже, чтобы открыть веб-приложение:**

✨ **Возможности:**
• Групповой чат в реальном времени
• Отправка фото и файлов в S3 облако
• Профили пользователей
• Статистика активности

🌐 **Используется Selectel S3 для хранения файлов**
"""
        
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode='Markdown')
        logger.info(f"✅ Ответ отправлен пользователю {message.from_user.id}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /start: {e}", exc_info=True)
        await message.answer("❌ Произошла ошибка. Попробуйте позже.")

@dp.message_handler(commands=['chat'])
async def cmd_chat(message: types.Message):
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

@dp.message_handler(commands=['debug'])
async def cmd_debug(message: types.Message):
    try:
        logger.info(f"🐛 Запрос отладки от пользователя: {message.from_user.id}")
        
        s3_connected, s3_message = test_s3_connection()
        
        debug_info = f"""
🐛 **Отладочная информация:**

**Пользователь:**
• ID: `{message.from_user.id}`
• Имя: {message.from_user.first_name}

**Сервер:**
• Время: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}
• Домен: https://botzakaz-production-ba19.up.railway.app

**Хранилище:**
• База данных: ✅ SQLite
• Облачное хранилище (S3): {s3_message}

**API Endpoints:**
• Проверка S3: `/api/s3/check`
• Загрузка файлов: `/api/s3/proxy-upload`
• Сохранение сообщений: `/api/s3/save-message`
"""
        
        await message.answer(debug_info, parse_mode='Markdown')
        logger.info(f"✅ Отладочная информация отправлена пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /debug: {e}")
        await message.answer("❌ Ошибка получения отладочной информации")

# ===== ЗАПУСК БОТА =====
async def on_startup(dp):
    logger.info("🤖 Бот запускается...")
    
    try:
        me = await bot.get_me()
        logger.info(f"✅ Подключение к Telegram API успешно!")
        logger.info(f"🤖 Информация о боте: @{me.username} (id: {me.id})")
    except Exception as e:
        logger.error(f"❌ Не удалось подключиться к Telegram API: {e}")
        return
    
    try:
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        logger.info("✅ Таблицы базы данных созданы")
        
        db.init_db()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}")
    
    s3_connected, s3_message = test_s3_connection()
    if s3_connected:
        logger.info(f"✅ {s3_message}")
        logger.info(f"☁️  Бакет: {S3_BUCKET}")
    else:
        logger.warning(f"⚠️ {s3_message}")
    
    logger.info("📱 Используйте команду /start для начала работы")
    logger.info(f"🌐 Веб-приложение: https://botzakaz-production-ba19.up.railway.app")
    logger.info("🎉 Бот готов к работе!")

def start_bot():
    print("\n" + "="*60)
    print("🚀 Telegram Bot with Mini App - S3 VERSION")
    print("="*60)
    
    if not BOT_TOKEN:
        print("\n❌ BOT_TOKEN не найден в переменных окружения!")
        exit(1)
    
    print(f"\n🔑 Токен бота: ✅ Найден")
    print(f"☁️  S3 бакет: {S3_BUCKET}")
    print(f"🌐 Домен: https://botzakaz-production-ba19.up.railway.app")
    print("\n🤖 Запуск бота...")
    print("="*60)
    
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(executor.start_polling(
            dp, 
            skip_updates=True,
            on_startup=on_startup,
            on_shutdown=lambda dp: logger.info("👋 Завершение работы бота...")
        ))
    except Exception as e:
        logger.error(f"❌ Критическая ошибка при запуске бота: {e}", exc_info=True)
        print(f"\n❌ Бот не запущен: {e}")

# Запускаем бот при импорте (для Railway)
if __name__ == '__main__':
    import threading
    
    print("\n🔄 Инициализация приложения с S3...")
    
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()
    
    port = int(os.getenv("PORT", 8080))
    print(f"\n🌐 Flask app запускается на порту {port}")
    print(f"📝 Логи доступны в Railway Dashboard")
    print("="*60)
    
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
else:
    import threading
    
    print("\n🚀 Запуск в режиме gunicorn с S3...")
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()
    
    print("✅ Бот запущен в фоновом режиме")
