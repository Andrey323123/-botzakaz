import os
import logging
import asyncio
import boto3
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.utils import executor
import core.database as db

# Сначала создаем Flask app для gunicorn
from flask import Flask, jsonify, request, send_from_directory
import uuid
import base64
from datetime import datetime, timedelta
import json
import traceback
import sys
from sqlalchemy import create_engine
from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.utils import secure_filename

flask_app = Flask(__name__)

# Настройка логирования для Flask
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
flask_logger = logging.getLogger('flask_app')

# ===== КОНФИГУРАЦИЯ SELECTEL S3 =====
S3_CONFIG = {
    'endpoint': 's3.ru-3.storage.selcloud.ru',
    'region': 'ru-3',
    'bucket': 'telegram-chat-files',
    'access_key': '25d16365251e45ec9b678de28dafd86b',
    'secret_key': 'cc56887e78d14bdbae867638726a816b'
}

# Инициализация S3 клиента - УПРОЩЕННАЯ версия для Selectel
try:
    s3_client = boto3.client(
        's3',
        endpoint_url=S3_CONFIG['endpoint'],
        aws_access_key_id=S3_CONFIG['access_key'],
        aws_secret_access_key=S3_CONFIG['secret_key'],
        config=boto3.session.Config(
            signature_version='s3',
            s3={'addressing_style': 'path'}
        )
    )
    flask_logger.info("✅ S3 клиент инициализирован")
except Exception as e:
    flask_logger.error(f"❌ Ошибка инициализации S3 клиента: {e}")
    s3_client = None

# Путь к веб-приложению
WEBAPP_DIR = os.path.join(os.path.dirname(__file__), 'bot/webapp')
flask_logger.info(f"📂 Путь к веб-приложению: {WEBAPP_DIR}")

# Импортируем модели для создания таблиц
from core.models import Base

# Разрешенные расширения файлов
ALLOWED_EXTENSIONS = {
    'photos': {'png', 'jpg', 'jpeg', 'gif', 'webp'},
    'documents': {'pdf', 'doc', 'docx', 'txt', 'zip', 'rar'},
    'voice': {'mp3', 'wav', 'ogg', 'm4a'}
}

# Максимальный размер файла (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

def allowed_file(filename, file_type):
    """Проверка расширения файла"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS.get(file_type, set())

def generate_s3_url(filepath):
    """Генерация URL для файла в S3"""
    return f"{S3_CONFIG['endpoint']}/{S3_CONFIG['bucket']}/{filepath}"

def upload_to_s3(file, filepath, content_type='application/octet-stream'):
    """Загрузка файла в Selectel S3"""
    try:
        if not s3_client:
            raise Exception("S3 клиент не инициализирован")
        
        flask_logger.info(f"📤 Загрузка файла в S3: {filepath}")
        
        # Проверяем, что файл в памяти
        if hasattr(file, 'read'):
            file_data = file.read()
        else:
            file_data = file
        
        # Загружаем файл в S3 - УПРОЩЕННЫЙ метод
        s3_client.put_object(
            Bucket=S3_CONFIG['bucket'],
            Key=filepath,
            Body=file_data,
            ContentType=content_type
        )
        
        # Генерируем URL
        file_url = generate_s3_url(filepath)
        
        flask_logger.info(f"✅ Файл загружен в S3: {file_url}")
        return file_url
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки в S3: {e}", exc_info=True)
        raise

def delete_from_s3(filepath):
    """Удаление файла из S3"""
    try:
        if not s3_client:
            return False
            
        s3_client.delete_object(
            Bucket=S3_CONFIG['bucket'],
            Key=filepath
        )
        flask_logger.info(f"🗑️ Файл удален из S3: {filepath}")
        return True
    except Exception as e:
        flask_logger.error(f"❌ Ошибка удаления из S3: {e}")
        return False

def list_s3_files(prefix=''):
    """Получение списка файлов из S3"""
    try:
        if not s3_client:
            return []
            
        response = s3_client.list_objects_v2(
            Bucket=S3_CONFIG['bucket'],
            Prefix=prefix
        )
        
        files = []
        if 'Contents' in response:
            for obj in response['Contents']:
                files.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat(),
                    'url': generate_s3_url(obj['Key'])
                })
        
        return files
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения списка файлов из S3: {e}")
        return []

def test_s3_connection():
    """Тест подключения к S3"""
    try:
        if not s3_client:
            return False, "S3 клиент не инициализирован"
        
        # Простая проверка - попытка получить информацию о бакете
        s3_client.head_bucket(Bucket=S3_CONFIG['bucket'])
        return True, "✅ Подключение к S3 успешно"
        
    except Exception as e:
        return False, f"❌ Ошибка подключения к S3: {str(e)}"

@flask_app.before_request
def log_request_info():
    """Логирование всех входящих запросов"""
    flask_logger.debug(f"📥 Входящий запрос: {request.method} {request.path}")

@flask_app.after_request
def log_response_info(response):
    """Логирование всех исходящих ответов"""
    flask_logger.debug(f"📤 Исходящий ответ: {response.status_code} {response.content_type}")
    return response

@flask_app.route('/')
def index():
    flask_logger.info("📄 Запрос главной страницы")
    return "Telegram Bot with Mini App is running! Use /start in Telegram"

@flask_app.route('/health')
def health():
    flask_logger.debug("🔍 Проверка здоровья приложения")
    
    # Проверяем S3
    s3_connected, s3_message = test_s3_connection()
    
    return jsonify({
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "s3_connected": s3_connected,
        "s3_message": s3_message,
        "services": {
            "flask": "running",
            "s3": "connected" if s3_connected else "disconnected"
        }
    }), 200

@flask_app.route('/init-db')
def init_database():
    """Ручка для инициализации базы данных"""
    try:
        flask_logger.info("🛠️ Инициализация базы данных...")
        
        # Создаем таблицы
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        
        flask_logger.info("✅ Таблицы базы данных созданы")
        
        # Инициализируем начальные данные
        try:
            db.init_db()
            flask_logger.info("✅ Начальные данные созданы")
        except Exception as init_error:
            flask_logger.error(f"⚠️ Ошибка инициализации начальных данных: {init_error}")
        
        # Проверяем S3
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

@flask_app.route('/index.html')
def serve_index():
    flask_logger.info("📄 Запрос index.html")
    return send_from_directory(WEBAPP_DIR, 'index.html')

@flask_app.route('/<path:filename>')
def serve_static(filename):
    file_path = os.path.join(WEBAPP_DIR, filename)
    flask_logger.debug(f"📁 Запрос статического файла: {filename}")
    
    if os.path.exists(file_path):
        flask_logger.debug(f"✅ Файл найден: {file_path}")
        return send_from_directory(WEBAPP_DIR, filename)
    
    flask_logger.warning(f"❌ Файл не найден: {file_path}")
    return "File not found", 404

# ========== API ЭНДПОИНТЫ ДЛЯ ВЕБ-ПРИЛОЖЕНИЯ ==========

@flask_app.route('/api/debug/info', methods=['GET'])
def debug_info():
    """Отладочная информация о состоянии сервера"""
    try:
        # Проверяем S3
        s3_connected, s3_message = test_s3_connection()
        
        info = {
            "server_time": datetime.now().isoformat(),
            "python_version": sys.version,
            "working_directory": os.getcwd(),
            "s3_config": {
                "bucket": S3_CONFIG['bucket'],
                "endpoint": S3_CONFIG['endpoint'],
                "connected": s3_connected,
                "message": s3_message
            },
            "database": {
                "path": "botzakaz.db",
                "exists": os.path.exists("botzakaz.db")
            }
        }
        
        return jsonify({
            "status": "success",
            "debug_info": info
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения debug info: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@flask_app.route('/api/messages', methods=['GET'])
def get_messages():
    """Получить сообщения через API"""
    try:
        flask_logger.info(f"📨 Получение сообщений")
        
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        # Получаем сообщения из БД
        messages = db.get_messages(limit, offset)
        
        messages_data = []
        for message in messages:
            # Получаем информацию о пользователе для каждого сообщения
            user = db.get_user_by_id(message.user_id)
            
            if not user:
                user_data = {
                    'user_id': message.user_id,
                    'first_name': f'User{message.user_id}'
                }
            else:
                user_data = {
                    'user_id': user.user_id,
                    'first_name': user.first_name
                }
            
            # Форматируем время
            timestamp = None
            if message.timestamp:
                local_time = message.timestamp
                timestamp = {
                    'iso': local_time.isoformat(),
                    'display': local_time.strftime('%H:%M'),
                    'date': local_time.strftime('%d.%m.%Y')
                }
            
            message_data = {
                'id': message.id,
                'user': user_data,
                'message_type': message.message_type,
                'content': message.content,
                'file_url': message.file_url,
                'timestamp': timestamp
            }
            
            messages_data.append(message_data)
        
        response = {
            'status': 'success',
            'count': len(messages_data),
            'messages': messages_data
        }
        
        return jsonify(response)
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения сообщений: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': str(e)
        }), 500

@flask_app.route('/api/messages/send', methods=['POST'])
def send_message_api():
    """Отправить сообщение через API"""
    try:
        flask_logger.info("📤 Отправка сообщения через API")
        
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        data = request.json
        
        # Извлекаем данные
        user_id = data.get('user_id')
        content = data.get('content', '')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': 'Invalid user_id format'}), 400
        
        flask_logger.info(f"📨 Новое сообщение от user_id={user_id}")
        
        # Проверяем существование пользователя в БД
        user = db.get_user_by_id(user_id)
        
        if not user:
            user_data = {
                'id': user_id,
                'first_name': f'User{user_id}'
            }
            
            try:
                user = db.get_or_create_user(user_data)
                flask_logger.info(f"✅ Создан новый пользователь: {user.first_name}")
            except Exception as user_error:
                flask_logger.error(f"❌ Ошибка создания пользователя: {user_error}")
                user = None
        
        # Сохраняем сообщение в БД
        try:
            message = db.add_message(
                user_id=user_id,
                message_type='text',
                content=content,
                file_url=None,
                file_id=None
            )
            
            if not message:
                return jsonify({'status': 'error', 'message': 'Failed to save message to database'}), 500
            
            flask_logger.info(f"✅ Сообщение сохранено в БД с ID: {message.id}")
            
        except Exception as db_error:
            flask_logger.error(f"❌ Ошибка сохранения в БД: {db_error}")
            return jsonify({
                'status': 'error', 
                'message': f'Database error: {str(db_error)}'
            }), 500
        
        # Форматируем время ответа
        timestamp = None
        if message.timestamp:
            local_time = message.timestamp
            timestamp = {
                'iso': local_time.isoformat(),
                'display': local_time.strftime('%H:%M'),
                'full': local_time.strftime('%d.%m.%Y %H:%M')
            }
        
        response_data = {
            'status': 'success', 
            'message_id': message.id,
            'user': {
                'id': user.id if user else user_id,
                'first_name': user.first_name if user else f'User{user_id}'
            },
            'content': content,
            'timestamp': timestamp
        }
        
        flask_logger.info(f"✅ Сообщение успешно отправлено. ID: {message.id}")
        return jsonify(response_data)
        
    except Exception as e:
        flask_logger.error(f"❌ Критическая ошибка отправки сообщения: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': f'Internal server error: {str(e)}'
        }), 500

@flask_app.route('/api/upload/file', methods=['POST'])
def upload_file():
    """Загрузка файла в S3"""
    try:
        flask_logger.info("📤 Загрузка файла в S3")
        
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No file provided'}), 400
        
        file = request.files['file']
        user_id = request.form.get('user_id')
        file_type = request.form.get('type', 'document')  # photo, document, voice
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        # Проверяем тип файла
        if not allowed_file(file.filename, file_type):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Проверяем размер файла
        file.seek(0, 2)  # Перемещаемся в конец файла
        file_size = file.tell()
        file.seek(0)  # Возвращаемся в начало
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'status': 'error', 'message': 'File too large'}), 400
        
        # Генерируем уникальное имя файла
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'bin'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"uploads/{file_type}/{user_id}/{unique_filename}"
        
        # Загружаем в S3
        file_url = upload_to_s3(
            file,
            filepath,
            content_type=file.content_type
        )
        
        # Сохраняем сообщение о файле в БД
        message = db.add_message(
            user_id=int(user_id),
            message_type=file_type,
            content=filename,
            file_url=file_url,
            file_id=unique_filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': filename,
            'size': file_size,
            'type': file_type
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки файла: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/users', methods=['GET'])
def get_users_api():
    """Получить список пользователей"""
    try:
        flask_logger.info("👥 Получение списка пользователей")
        
        users = db.get_users()
        
        users_data = []
        for user in users:
            message_count = db.get_message_count(user.user_id)
            
            user_data = {
                'id': user.id,
                'user_id': user.user_id,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'photo_url': user.photo_url,
                'created_at': user.created_at.isoformat() if user.created_at else None,
                'message_count': message_count
            }
            users_data.append(user_data)
        
        response = {
            'status': 'success', 
            'users': users_data,
            'total_users': len(users_data)
        }
        
        return jsonify(response)
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения пользователей: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user_api(user_id):
    """Получить информацию о пользователе"""
    try:
        flask_logger.info(f"👤 Получение информации о пользователе: {user_id}")
        
        user = db.get_user_by_id(user_id)
        
        if not user:
            user = db.get_or_create_user({
                'id': user_id,
                'first_name': f'User{user_id}'
            })
            flask_logger.info(f"👤 Создан новый пользователь: {user.first_name}")
        
        message_count = db.get_message_count(user_id)
        
        user_data = {
            'id': user.id,
            'user_id': user.user_id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'photo_url': user.photo_url,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'message_count': message_count
        }
        
        return jsonify({'status': 'success', 'user': user_data})
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения пользователя: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/stats', methods=['GET'])
def get_stats_api():
    """Получить статистику чата"""
    try:
        flask_logger.info("📊 Получение статистики чата")
        
        users = db.get_users()
        messages = db.get_messages(limit=10000)
        
        # Статистика S3
        s3_stats = {
            'photos': len(list_s3_files('uploads/photos/')),
            'documents': len(list_s3_files('uploads/documents/')),
            'voice': len(list_s3_files('uploads/voice/'))
        }
        
        stats_data = {
            'total_users': len(users),
            'total_messages': len(messages),
            's3_files': s3_stats
        }
        
        return jsonify({'status': 'success', 'stats': stats_data})
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения статистики: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/check', methods=['GET'])
def check_s3():
    """Проверить подключение к S3"""
    try:
        connected, message = test_s3_connection()
        
        if connected:
            # Попробуем получить список файлов
            files = list_s3_files()
            return jsonify({
                'status': 'success',
                'connected': True,
                'message': message,
                'files_count': len(files),
                'bucket': S3_CONFIG['bucket']
            })
        else:
            return jsonify({
                'status': 'error',
                'connected': False,
                'message': message
            })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Ошибка проверки S3: {str(e)}'
        }), 500

@flask_app.route('/api/s3/create-test-file', methods=['POST'])
def create_test_file():
    """Создать тестовый файл в S3"""
    try:
        data = request.json
        filename = data.get('filename', 'test.txt')
        content = data.get('content', 'Test content')
        
        filepath = f"test/{filename}"
        
        # Создаем тестовый файл
        s3_client.put_object(
            Bucket=S3_CONFIG['bucket'],
            Key=filepath,
            Body=content.encode('utf-8'),
            ContentType='text/plain'
        )
        
        file_url = generate_s3_url(filepath)
        
        return jsonify({
            'status': 'success',
            'message': 'Test file created',
            'file_url': file_url,
            'filepath': filepath
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка создания тестового файла: {e}")
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

logger.info(f"🔑 Токен бота получен: {BOT_TOKEN[:10]}...")

bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(bot, storage=storage)

# ========== ДОПОЛНИТЕЛЬНЫЕ КОМАНДЫ БОТА ==========

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    """Обработчик команды /start"""
    try:
        logger.info(f"📩 Получена команда /start от пользователя: {message.from_user.id}")
        
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

@dp.message_handler(commands=['debug'])
async def cmd_debug(message: types.Message):
    """Отладочная информация"""
    try:
        logger.info(f"🐛 Запрос отладки от пользователя: {message.from_user.id}")
        
        # Проверяем S3
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
• Сообщения: `/api/messages`
• Отправка: `/api/messages/send`
• Загрузка файлов: `/api/upload/file`
• Пользователи: `/api/users`
• Статистика: `/api/stats`
"""
        
        await message.answer(debug_info, parse_mode='Markdown')
        logger.info(f"✅ Отладочная информация отправлена пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /debug: {e}")
        await message.answer("❌ Ошибка получения отладочной информации")

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
        
        stats_text = f"""
📊 **Статистика чата:**

👥 **Пользователи:** {len(users)}
💬 **Сообщения:** {len(messages)}
📅 **Сегодня:** {len([m for m in messages if m.timestamp and m.timestamp.date() == datetime.utcnow().date()])}

🌐 **Веб-приложение:**
https://botzakaz-production-ba19.up.railway.app
"""
        
        await message.answer(stats_text, parse_mode='Markdown')
        logger.info(f"✅ Ответ на /stats отправлен пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /stats: {e}", exc_info=True)
        await message.answer("❌ Ошибка получения статистики")

@dp.message_handler(commands=['help'])
async def cmd_help(message: types.Message):
    """Помощь"""
    logger.info(f"📩 Получена команда /help от пользователя: {message.from_user.id}")
    help_text = """
🤖 **Команды бота:**

/start - Начать работу с ботом
/chat - Открыть чат
/stats - Статистика чата
/help - Показать эту справку
/debug - Отладочная информация

📱 **Веб-приложение чата:**
• Групповой чат в реальном времени
• Отправка текста и файлов
• Файлы хранятся в Selectel S3 облаке
• Профили участников

🚀 **Быстрые ссылки:**
• Веб-приложение: https://botzakaz-production-ba19.up.railway.app
"""
    await message.answer(help_text, parse_mode='Markdown')
    logger.info(f"✅ Ответ на /help отправлен пользователю {message.from_user.id}")

# ========== ОБРАБОТЧИКИ КНОПОК ==========

@dp.callback_query_handler(lambda c: c.data == 'stats')
async def process_stats_callback(callback_query: types.CallbackQuery):
    """Обработчик кнопки Статистика"""
    await bot.answer_callback_query(callback_query.id)
    await cmd_stats(callback_query.message)

# ========== ЗАПУСК БОТА ==========

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    try:
        me = await bot.get_me()
        logger.info(f"✅ Подключение к Telegram API успешно!")
        logger.info(f"🤖 Информация о боте: @{me.username} (id: {me.id})")
    except Exception as e:
        logger.error(f"❌ Не удалось подключиться к Telegram API: {e}")
        return
    
    # Инициализация базы данных
    try:
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        logger.info("✅ Таблицы базы данных созданы")
        
        db.init_db()
        logger.info("✅ База данных инициализирована")
        
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}")
    
    # Проверка S3
    s3_connected, s3_message = test_s3_connection()
    if s3_connected:
        logger.info(f"✅ {s3_message}")
        logger.info(f"☁️  Бакет: {S3_CONFIG['bucket']}")
    else:
        logger.warning(f"⚠️ {s3_message}")
    
    logger.info("📱 Используйте команду /start для начала работы")
    logger.info(f"🌐 Веб-приложение: https://botzakaz-production-ba19.up.railway.app")
    logger.info("🎉 Бот готов к работе!")

async def on_shutdown(dp):
    """Действия при завершении работы"""
    logger.info("👋 Завершение работы бота...")

def start_bot():
    """Запуск бота в отдельном процессе"""
    print("\n" + "="*60)
    print("🚀 Telegram Bot with Mini App - S3 VERSION")
    print("="*60)
    
    if not BOT_TOKEN:
        print("\n❌ BOT_TOKEN не найден в переменных окружения!")
        exit(1)
    
    print(f"\n🔑 Токен бота: ✅ Найден")
    print(f"☁️  S3 бакет: {S3_CONFIG['bucket']}")
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
            on_shutdown=on_shutdown
        ))
    except Exception as e:
        logger.error(f"❌ Критическая ошибка при запуске бота: {e}", exc_info=True)
        print(f"\n❌ Бот не запущен: {e}")

# Запускаем бот при импорте (для Railway)
if __name__ == '__main__':
    import threading
    
    print("\n🔄 Инициализация приложения с S3...")
    
    # Запускаем бота в отдельном потоке
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()
    
    # Запускаем Flask app (основной поток для gunicorn)
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
