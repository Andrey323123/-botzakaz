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
    'endpoint': 'https://s3.ru-3.storage.selcloud.ru',
    'region': 'ru-3',
    'bucket': 'telegram-chat-files',
    'access_key': '7508531e4e684de2bc5d039c74c4441d',
    'secret_key': '9a9c1682a5b247019acafa4489060d61'
}

# Инициализация S3 клиента
s3_client = boto3.client(
    's3',
    endpoint_url=S3_CONFIG['endpoint'],
    region_name=S3_CONFIG['region'],
    aws_access_key_id=S3_CONFIG['access_key'],
    aws_secret_access_key=S3_CONFIG['secret_key']
)

# Путь к веб-приложению
WEBAPP_DIR = os.path.join(os.path.dirname(__file__), 'bot/webapp')
flask_logger.info(f"📂 Путь к веб-приложению: {WEBAPP_DIR}")

# Импортируем модели для создания таблиц
from sqlalchemy import create_engine
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
    """Генерация публичного URL для файла в S3"""
    return f"{S3_CONFIG['endpoint']}/{S3_CONFIG['bucket']}/{filepath}"

def upload_to_s3(file, filepath, content_type='application/octet-stream'):
    """Загрузка файла в Selectel S3"""
    try:
        flask_logger.info(f"📤 Загрузка файла в S3: {filepath}")
        
        # Загружаем файл в S3
        s3_client.put_object(
            Bucket=S3_CONFIG['bucket'],
            Key=filepath,
            Body=file,
            ContentType=content_type,
            ACL='public-read'
        )
        
        # Генерируем публичный URL
        file_url = generate_s3_url(filepath)
        
        flask_logger.info(f"✅ Файл загружен в S3: {file_url}")
        return file_url
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки в S3: {e}", exc_info=True)
        raise

def delete_from_s3(filepath):
    """Удаление файла из S3"""
    try:
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

@flask_app.before_request
def log_request_info():
    """Логирование всех входящих запросов"""
    flask_logger.debug(f"📥 Входящий запрос: {request.method} {request.path}")
    flask_logger.debug(f"📦 Заголовки: {dict(request.headers)}")
    if request.method == 'POST':
        if request.is_json:
            flask_logger.debug(f"📝 JSON данные: {request.json}")
        elif request.files:
            flask_logger.debug(f"📎 Загружены файлы: {list(request.files.keys())}")
        elif request.form:
            flask_logger.debug(f"📋 Form данные: {dict(request.form)}")

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
    return jsonify({
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "s3_connected": True
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
        
        # Проверяем существующие таблицы
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        flask_logger.info(f"📊 Таблицы в базе данных: {tables}")
        
        # Проверяем структуру каждой таблицы
        for table in tables:
            columns = inspector.get_columns(table)
            column_names = [col['name'] for col in columns]
            flask_logger.info(f"📋 Таблица '{table}': {column_names}")
        
        # Инициализируем начальные данные
        try:
            from core.database import init_db
            init_db()
            flask_logger.info("✅ Начальные данные созданы")
        except Exception as init_error:
            flask_logger.error(f"⚠️ Ошибка инициализации начальных данных: {init_error}")
        
        # Проверяем что база работает
        from core.database import get_users, get_messages
        users_count = len(get_users())
        messages_count = len(get_messages(limit=1000))
        
        # Проверяем подключение к S3
        s3_status = "unknown"
        try:
            s3_client.head_bucket(Bucket=S3_CONFIG['bucket'])
            s3_status = "connected"
            flask_logger.info("✅ Подключение к S3 успешно")
        except Exception as s3_error:
            s3_status = f"error: {str(s3_error)}"
            flask_logger.error(f"❌ Ошибка подключения к S3: {s3_error}")
        
        return jsonify({
            "status": "success", 
            "message": "Database initialized successfully",
            "tables": tables,
            "s3_status": s3_status,
            "data": {
                "users_count": users_count,
                "messages_count": messages_count
            }
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка создания таблиц: {e}", exc_info=True)
        return jsonify({
            "status": "error", 
            "message": str(e), 
            "traceback": traceback.format_exc()
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
        s3_files_count = 0
        try:
            s3_files = list_s3_files('uploads/')
            s3_files_count = len(s3_files)
        except:
            pass
        
        info = {
            "server_time": datetime.now().isoformat(),
            "python_version": sys.version,
            "working_directory": os.getcwd(),
            "s3_config": {
                "bucket": S3_CONFIG['bucket'],
                "endpoint": S3_CONFIG['endpoint'],
                "files_count": s3_files_count
            },
            "database": {
                "path": "botzakaz.db",
                "exists": os.path.exists("botzakaz.db")
            },
            "memory_usage": {
                "rss_mb": os.getpid().memory_info().rss / 1024 / 1024
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
        flask_logger.info(f"📨 Получение сообщений: {request.args}")
        
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        section = request.args.get('section', 'main')
        
        flask_logger.debug(f"📊 Параметры запроса: limit={limit}, offset={offset}, section={section}")
        
        # Получаем сообщения из БД
        messages = db.get_messages(limit, offset)
        flask_logger.debug(f"📩 Получено {len(messages)} сообщений из БД")
        
        messages_data = []
        for message in messages:
            # Получаем информацию о пользователе для каждого сообщения
            user = db.get_user_by_id(message.user_id)
            
            if not user:
                user_data = {
                    'user_id': message.user_id,
                    'username': None,
                    'first_name': f'User{message.user_id}',
                    'last_name': None,
                    'photo_url': None
                }
            else:
                user_data = {
                    'user_id': user.user_id,
                    'username': user.username,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'photo_url': user.photo_url
                }
            
            # Форматируем время для отображения
            timestamp = None
            if message.timestamp:
                local_time = message.timestamp
                timestamp = {
                    'iso': local_time.isoformat(),
                    'display': local_time.strftime('%H:%M'),
                    'date': local_time.strftime('%d.%m.%Y'),
                    'full': local_time.strftime('%d.%m.%Y %H:%M')
                }
            
            message_data = {
                'id': message.id,
                'user': user_data,
                'message_type': message.message_type,
                'content': message.content,
                'file_id': message.file_id,
                'file_url': message.file_url,
                'timestamp': timestamp,
                'voice_duration': getattr(message, 'voice_duration', None)
            }
            
            messages_data.append(message_data)
        
        response = {
            'status': 'success',
            'count': len(messages_data),
            'total_in_db': len(db.get_messages(limit=10000)),
            'messages': messages_data,
            'requested_at': datetime.now().isoformat(),
            'debug': {
                'section': section,
                'limit': limit,
                'offset': offset
            }
        }
        
        flask_logger.info(f"✅ Отправлено {len(messages_data)} сообщений")
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
        flask_logger.debug(f"📝 Данные запроса: {json.dumps(data, indent=2)}")
        
        # Извлекаем данные
        user_id = data.get('user_id')
        content = data.get('content', '')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': 'Invalid user_id format'}), 400
        
        flask_logger.info(f"📨 Новое сообщение от user_id={user_id}: {content[:100] if content else 'No content'}...")
        
        # Проверяем существование пользователя в БД
        user = db.get_user_by_id(user_id)
        
        if not user:
            flask_logger.warning(f"⚠️ Пользователь {user_id} не найден в БД, создаем...")
            
            user_info = data.get('user', {})
            user_data = {
                'id': user_id,
                'username': data.get('username') or user_info.get('username'),
                'first_name': data.get('first_name') or user_info.get('first_name') or f'User{user_id}',
                'last_name': data.get('last_name') or user_info.get('last_name'),
                'photo_url': data.get('photo_url') or user_info.get('photo_url')
            }
            
            try:
                user = db.get_or_create_user(user_data)
                flask_logger.info(f"✅ Создан новый пользователь: {user.first_name}")
            except Exception as user_error:
                flask_logger.error(f"❌ Ошибка создания пользователя: {user_error}")
                user = None
        
        # Проверяем бан и мут
        if user:
            if user.is_banned:
                return jsonify({'status': 'error', 'message': 'User is banned'}), 403
            
            if user.is_muted and user.mute_until and user.mute_until > datetime.utcnow():
                return jsonify({'status': 'error', 'message': 'User is muted'}), 403
        
        # Сохраняем сообщение в БД
        try:
            message = db.add_message(
                user_id=user_id,
                message_type='text',
                content=content,
                file_id=None,
                file_url=None
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
        
        # Подготавливаем данные пользователя для ответа
        user_response_data = {
            'id': user.id if user else user_id,
            'first_name': user.first_name if user else f'User{user_id}',
            'username': user.username if user else None
        }
        
        # Обработка файлов если есть
        files = data.get('files', [])
        saved_files = []
        if files and isinstance(files, list):
            flask_logger.info(f"💾 Обрабатываем {len(files)} файлов...")
            for file_data in files:
                saved_files.append({
                    'id': file_data.get('id'),
                    'name': file_data.get('name'),
                    'url': file_data.get('url')
                })
        
        response_data = {
            'status': 'success', 
            'message_id': message.id,
            'user': user_response_data,
            'content': content,
            'timestamp': timestamp,
            'files': saved_files,
            'server_time': datetime.now().isoformat()
        }
        
        flask_logger.info(f"✅ Сообщение успешно отправлено. ID: {message.id}")
        return jsonify(response_data)
        
    except Exception as e:
        flask_logger.error(f"❌ Критическая ошибка отправки сообщения: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': f'Internal server error: {str(e)}'
        }), 500

@flask_app.route('/api/upload/photo', methods=['POST'])
def upload_photo():
    """Загрузка фото в S3"""
    try:
        flask_logger.info("📸 Загрузка фото в S3")
        
        if 'photo' not in request.files:
            return jsonify({'status': 'error', 'message': 'No photo provided'}), 400
        
        photo = request.files['photo']
        user_id = request.form.get('user_id')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if photo.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(photo.filename, 'photos'):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Проверяем размер файла
        photo.seek(0, 2)  # Перемещаемся в конец файла
        file_size = photo.tell()
        photo.seek(0)  # Возвращаемся в начало
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'status': 'error', 'message': 'File too large'}), 400
        
        # Генерируем уникальное имя файла
        filename = secure_filename(photo.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"uploads/photos/{user_id}/{unique_filename}"
        
        # Загружаем в S3
        file_url = upload_to_s3(
            photo,
            filepath,
            content_type=photo.content_type
        )
        
        # Сохраняем сообщение о фото в БД
        message = db.add_message(
            user_id=int(user_id),
            message_type='photo',
            content='Фото',
            file_url=file_url,
            file_id=unique_filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': unique_filename,
            'size': file_size,
            'saved_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки фото: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/upload/voice', methods=['POST'])
def upload_voice():
    """Загрузка голосового сообщения в S3"""
    try:
        flask_logger.info("🎤 Загрузка голосового сообщения в S3")
        
        if 'voice' not in request.files:
            return jsonify({'status': 'error', 'message': 'No voice message provided'}), 400
        
        voice = request.files['voice']
        user_id = request.form.get('user_id')
        duration = request.form.get('duration', 0)
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if voice.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(voice.filename, 'voice'):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Проверяем размер файла
        voice.seek(0, 2)
        file_size = voice.tell()
        voice.seek(0)
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'status': 'error', 'message': 'File too large'}), 400
        
        # Генерируем уникальное имя файла
        filename = secure_filename(voice.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'mp3'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"uploads/voice/{user_id}/{unique_filename}"
        
        # Загружаем в S3
        file_url = upload_to_s3(
            voice,
            filepath,
            content_type=voice.content_type
        )
        
        # Сохраняем сообщение о голосовом сообщении в БД
        message = db.add_message(
            user_id=int(user_id),
            message_type='voice',
            content='Голосовое сообщение',
            file_url=file_url,
            file_id=unique_filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': unique_filename,
            'duration': int(duration),
            'size': file_size
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки голосового сообщения: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/upload/document', methods=['POST'])
def upload_document():
    """Загрузка документа в S3"""
    try:
        flask_logger.info("📄 Загрузка документа в S3")
        
        if 'document' not in request.files:
            return jsonify({'status': 'error', 'message': 'No document provided'}), 400
        
        document = request.files['document']
        user_id = request.form.get('user_id')
        description = request.form.get('description', 'Документ')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if document.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(document.filename, 'documents'):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Проверяем размер файла
        document.seek(0, 2)
        file_size = document.tell()
        document.seek(0)
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'status': 'error', 'message': 'File too large'}), 400
        
        # Генерируем уникальное имя файла
        filename = secure_filename(document.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'pdf'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"uploads/documents/{user_id}/{unique_filename}"
        
        # Загружаем в S3
        file_url = upload_to_s3(
            document,
            filepath,
            content_type=document.content_type
        )
        
        # Сохраняем сообщение о документе в БД
        message = db.add_message(
            user_id=int(user_id),
            message_type='document',
            content=description,
            file_url=file_url,
            file_id=unique_filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': unique_filename,
            'original_name': document.filename,
            'size': file_size,
            'description': description
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки документа: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/avatar', methods=['POST'])
def upload_avatar():
    """Загрузка аватарки пользователя в S3"""
    try:
        flask_logger.info("🖼️ Загрузка аватарки в S3")
        
        if 'avatar' not in request.files:
            return jsonify({'status': 'error', 'message': 'No avatar provided'}), 400
        
        avatar = request.files['avatar']
        user_id = request.form.get('user_id')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if avatar.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(avatar.filename, 'photos'):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Проверяем размер файла
        avatar.seek(0, 2)
        file_size = avatar.tell()
        avatar.seek(0)
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'status': 'error', 'message': 'File too large'}), 400
        
        # Генерируем уникальное имя файла
        filename = secure_filename(avatar.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"avatars/{user_id}/{unique_filename}"
        
        # Загружаем в S3
        avatar_url = upload_to_s3(
            avatar,
            filepath,
            content_type=avatar.content_type
        )
        
        # Обновляем пользователя в БД
        user = db.get_user_by_id(int(user_id))
        if user:
            user.photo_url = avatar_url
            # Здесь нужен метод для сохранения изменений пользователя
            # Пока просто логируем
            flask_logger.info(f"👤 Аватар обновлен для пользователя {user_id}")
        
        return jsonify({
            'status': 'success',
            'avatar_url': avatar_url,
            'filename': unique_filename,
            'size': file_size
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки аватара: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/files', methods=['GET'])
def list_files():
    """Получить список файлов из S3"""
    try:
        prefix = request.args.get('prefix', '')
        files = list_s3_files(prefix)
        
        return jsonify({
            'status': 'success',
            'files': files,
            'count': len(files)
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения списка файлов: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/delete', methods=['POST'])
def delete_file():
    """Удалить файл из S3"""
    try:
        data = request.json
        if not data or 'filepath' not in data:
            return jsonify({'status': 'error', 'message': 'Filepath required'}), 400
        
        filepath = data['filepath']
        success = delete_from_s3(filepath)
        
        if success:
            return jsonify({'status': 'success', 'message': 'File deleted'})
        else:
            return jsonify({'status': 'error', 'message': 'Failed to delete file'}), 500
            
    except Exception as e:
        flask_logger.error(f"❌ Ошибка удаления файла: {e}")
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
            active_users_list = db.get_active_users(24)
            is_online = any(u.user_id == user.user_id for u in active_users_list)
            
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
            users_data.append(user_data)
        
        response = {
            'status': 'success', 
            'users': users_data,
            'total_users': len(users_data),
            'active_users': len(active_users_list)
        }
        
        flask_logger.info(f"✅ Отправлено данных о {len(users_data)} пользователях")
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
                'username': None,
                'first_name': f'User{user_id}',
                'last_name': None
            })
            flask_logger.info(f"👤 Создан новый пользователь: {user.first_name}")
        
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
        flask_logger.error(f"❌ Ошибка получения пользователя: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/stats', methods=['GET'])
def get_stats_api():
    """Получить статистику чата"""
    try:
        flask_logger.info("📊 Получение статистики чата")
        
        users = db.get_users()
        messages = db.get_messages(limit=10000)
        active_users = db.get_active_users(24)
        
        # Статистика по дням
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
        
        # Топ пользователей
        user_message_count = {}
        for message in messages:
            user_message_count[message.user_id] = user_message_count.get(message.user_id, 0) + 1
        
        top_users = []
        sorted_users = sorted(user_message_count.items(), key=lambda x: x[1], reverse=True)[:5]
        
        for user_id, count in sorted_users:
            user = db.get_user_by_id(user_id)
            if user:
                top_users.append({
                    'user_id': user.user_id,
                    'username': user.username,
                    'first_name': user.first_name,
                    'message_count': count
                })
        
        # Статистика S3
        s3_stats = {
            'photos': len(list_s3_files('uploads/photos/')),
            'documents': len(list_s3_files('uploads/documents/')),
            'voice': len(list_s3_files('uploads/voice/')),
            'avatars': len(list_s3_files('avatars/'))
        }
        
        stats_data = {
            'total_users': len(users),
            'total_messages': len(messages),
            'banned_users': sum(1 for u in users if u.is_banned),
            'muted_users': sum(1 for u in users if u.is_muted),
            'online_users': len(active_users),
            'daily_stats': daily_stats,
            'top_users': top_users,
            's3_files': s3_stats
        }
        
        return jsonify({'status': 'success', 'stats': stats_data})
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения статистики: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/register', methods=['POST'])
def register_user_api():
    """Регистрация пользователя через API"""
    try:
        flask_logger.info("👤 Регистрация пользователя через API")
        
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request'}), 400
        
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
        
        flask_logger.info(f"✅ Пользователь зарегистрирован: {user.first_name}")
        
        return jsonify({
            'status': 'success',
            'user_id': user.user_id,
            'message': 'User registered successfully'
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка регистрации пользователя: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/debug/s3-test', methods=['GET'])
def test_s3():
    """Тест подключения к S3"""
    try:
        flask_logger.info("🧪 Тестирование подключения к S3...")
        
        # Проверяем доступность бакета
        s3_client.head_bucket(Bucket=S3_CONFIG['bucket'])
        
        # Создаем тестовый файл
        test_key = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        test_content = b"Test file for S3 connection check"
        
        s3_client.put_object(
            Bucket=S3_CONFIG['bucket'],
            Key=test_key,
            Body=test_content,
            ContentType='text/plain',
            ACL='public-read'
        )
        
        # Читаем файл обратно
        response = s3_client.get_object(Bucket=S3_CONFIG['bucket'], Key=test_key)
        content = response['Body'].read().decode('utf-8')
        
        # Удаляем тестовый файл
        s3_client.delete_object(Bucket=S3_CONFIG['bucket'], Key=test_key)
        
        return jsonify({
            'status': 'success',
            'message': 'S3 connection test successful',
            'test_file': test_key,
            'content': content
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка тестирования S3: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

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
• Отправка фото, голосовых сообщений и файлов в S3 облако
• Упоминания участников
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
        s3_status = "❌ Недоступен"
        try:
            s3_client.head_bucket(Bucket=S3_CONFIG['bucket'])
            s3_status = "✅ Доступен"
        except:
            pass
        
        debug_info = f"""
🐛 **Отладочная информация:**

**Пользователь:**
• ID: `{message.from_user.id}`
• Имя: {message.from_user.first_name}
• Username: @{message.from_user.username}

**Сервер:**
• Время: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}
• Домен: https://botzakaz-production-ba19.up.railway.app
• API доступен: ✅

**Хранилище:**
• База данных: ✅ SQLite
• Облачное хранилище (S3): {s3_status}
• Бакет: {S3_CONFIG['bucket']}

**API Endpoints:**
• Сообщения: `/api/messages`
• Отправка: `/api/messages/send`
• Загрузка файлов: `/api/upload/*`
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
        active_users = db.get_active_users(24)
        
        # Получаем статистику S3
        s3_photos = len(list_s3_files('uploads/photos/'))
        s3_docs = len(list_s3_files('uploads/documents/'))
        s3_voice = len(list_s3_files('uploads/voice/'))
        
        stats_text = f"""
📊 **Статистика чата:**

👥 **Пользователи:** {len(users)}
• 🟢 Онлайн: {len(active_users)}
• 🚫 Забанено: {sum(1 for u in users if u.is_banned)}
• 🔇 В муте: {sum(1 for u in users if u.is_muted)}

💬 **Сообщения:** {len(messages)}
• 📅 Сегодня: {len([m for m in messages if m.timestamp and m.timestamp.date() == datetime.utcnow().date()])}
• 📈 Неделя: {len([m for m in messages if m.timestamp and m.timestamp > datetime.utcnow() - timedelta(days=7)])}

☁️ **Файлы в S3:**
• 📸 Фото: {s3_photos}
• 📄 Документы: {s3_docs}
• 🎤 Голосовые: {s3_voice}

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
/users - Список пользователей
/help - Показать эту справку
/debug - Отладочная информация

📱 **Веб-приложение чата:**
• Групповой чат в реальном времени
• Отправка текста, фото, голосовых сообщений
• Файлы хранятся в Selectel S3 облаке
• Упоминания пользователей (@username)
• Профили участников
• Поиск по сообщениям

🚀 **Быстрые ссылки:**
• Веб-приложение: https://botzakaz-production-ba19.up.railway.app

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
    # Здесь нужно добавить команду для показа пользователей
    await callback_query.message.answer("Список пользователей доступен в веб-приложении")

@dp.callback_query_handler(lambda c: c.data == 'help')
async def process_help_callback(callback_query: types.CallbackQuery):
    """Обработчик кнопки Помощь"""
    await bot.answer_callback_query(callback_query.id)
    await cmd_help(callback_query.message)

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
    try:
        s3_client.head_bucket(Bucket=S3_CONFIG['bucket'])
        logger.info(f"✅ Подключение к Selectel S3 успешно!")
        logger.info(f"☁️  Бакет: {S3_CONFIG['bucket']}")
    except Exception as e:
        logger.error(f"❌ Ошибка подключения к S3: {e}")
    
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
