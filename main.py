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
import uuid
import base64
from datetime import datetime, timedelta
import json
import traceback
import sys

flask_app = Flask(__name__)

# Настройка логирования для Flask
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
flask_logger = logging.getLogger('flask_app')

# Создаем директории для загрузок
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
AVATARS_FOLDER = os.path.join(UPLOAD_FOLDER, 'avatars')
VOICE_FOLDER = os.path.join(UPLOAD_FOLDER, 'voice')
PHOTOS_FOLDER = os.path.join(UPLOAD_FOLDER, 'photos')
DOCUMENTS_FOLDER = os.path.join(UPLOAD_FOLDER, 'documents')

# Создаем директории если их нет
for folder in [UPLOAD_FOLDER, AVATARS_FOLDER, VOICE_FOLDER, PHOTOS_FOLDER, DOCUMENTS_FOLDER]:
    os.makedirs(folder, exist_ok=True)
    flask_logger.info(f"📁 Создана директория: {folder}")

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

def allowed_file(filename, file_type):
    """Проверка расширения файла"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS.get(file_type, set())

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
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()}), 200

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
        
        return jsonify({
            "status": "success", 
            "message": "Database tables created",
            "tables": tables
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка создания таблиц: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e), "traceback": traceback.format_exc()}), 500

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
        info = {
            "server_time": datetime.now().isoformat(),
            "python_version": sys.version,
            "working_directory": os.getcwd(),
            "upload_folders": {
                "photos": os.path.exists(PHOTOS_FOLDER),
                "documents": os.path.exists(DOCUMENTS_FOLDER),
                "voice": os.path.exists(VOICE_FOLDER),
                "avatars": os.path.exists(AVATARS_FOLDER)
            },
            "database": {
                "path": "botzakaz.db",
                "exists": os.path.exists("botzakaz.db")
            },
            "recent_requests": getattr(flask_app, 'recent_requests', []),
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
                flask_logger.warning(f"⚠️ Пользователь с ID {message.user_id} не найден в БД")
            
            user_data = {
                'user_id': user.user_id if user else message.user_id,
                'username': user.username if user else None,
                'first_name': user.first_name if user else 'User',
                'last_name': user.last_name if user else None,
                'photo_url': user.photo_url if user else None
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
            
            flask_logger.debug(f"📝 Сообщение {message.id}: {message.content[:50] if message.content else 'No content'}...")
            messages_data.append(message_data)
        
        response = {
            'status': 'success',
            'count': len(messages_data),
            'messages': messages_data,
            'requested_at': datetime.now().isoformat()
        }
        
        flask_logger.info(f"✅ Отправлено {len(messages_data)} сообщений")
        return jsonify(response)
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения сообщений: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

@flask_app.route('/api/messages/send', methods=['POST'])
def send_message_api():
    """Отправить сообщение через API"""
    try:
        flask_logger.info("📤 Отправка сообщения через API")
        
        if not request.is_json:
            flask_logger.error("❌ Запрос не в JSON формате")
            return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400
        
        data = request.json
        flask_logger.debug(f"📝 Данные запроса: {json.dumps(data, indent=2)}")
        
        # Валидация данных
        required_fields = ['user_id', 'content', 'section']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            flask_logger.error(f"❌ Отсутствуют обязательные поля: {missing_fields}")
            return jsonify({
                'status': 'error', 
                'message': f'Missing required fields: {missing_fields}'
            }), 400
        
        user_id = data['user_id']
        content = data['content']
        section = data.get('section', 'main')
        files = data.get('files', [])
        
        flask_logger.info(f"📨 Новое сообщение от user_id={user_id}: {content[:100]}...")
        flask_logger.debug(f"📁 Прикрепленные файлы: {len(files)} шт.")
        
        # Проверяем, не забанен ли пользователь
        user = db.get_user_by_id(user_id)
        
        if not user:
            flask_logger.warning(f"⚠️ Пользователь {user_id} не найден, создаем...")
            # Создаем пользователя если не существует
            user = db.get_or_create_user({
                'id': user_id,
                'username': data.get('username'),
                'first_name': data.get('first_name', f'User{user_id}'),
                'last_name': data.get('last_name')
            })
            flask_logger.info(f"👤 Создан новый пользователь: {user.first_name} (ID: {user.id})")
        
        if user and user.is_banned:
            flask_logger.warning(f"🚫 Пользователь {user_id} забанен")
            return jsonify({'status': 'error', 'message': 'User is banned'}), 403
        
        if user and user.is_muted and user.mute_until and user.mute_until > datetime.utcnow():
            flask_logger.warning(f"🔇 Пользователь {user_id} в муте до {user.mute_until}")
            return jsonify({'status': 'error', 'message': 'User is muted'}), 403
        
        # Сохраняем сообщение в БД
        flask_logger.debug("💾 Сохраняем сообщение в БД...")
        
        try:
            message = db.add_message(
                user_id=user_id,
                message_type='text',
                content=content,
                file_id=None,
                file_url=None
            )
            flask_logger.info(f"✅ Сообщение сохранено в БД с ID: {message.id}")
            
        except Exception as db_error:
            flask_logger.error(f"❌ Ошибка сохранения в БД: {db_error}", exc_info=True)
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
        
        # Если есть файлы, сохраняем их
        saved_files = []
        if files and isinstance(files, list):
            flask_logger.info(f"💾 Сохраняем {len(files)} файлов...")
            
            for file_data in files:
                try:
                    # Сохраняем информацию о файле в БД
                    file_message = db.add_message(
                        user_id=user_id,
                        message_type='file',
                        content=file_data.get('name', 'Файл'),
                        file_id=file_data.get('id'),
                        file_url=file_data.get('url')
                    )
                    saved_files.append({
                        'id': file_data.get('id'),
                        'name': file_data.get('name'),
                        'url': file_data.get('url'),
                        'message_id': file_message.id
                    })
                    flask_logger.debug(f"📎 Файл сохранен: {file_data.get('name')}")
                    
                except Exception as file_error:
                    flask_logger.error(f"❌ Ошибка сохранения файла: {file_error}")
        
        response_data = {
            'status': 'success', 
            'message_id': message.id,
            'user': {
                'id': user.id,
                'first_name': user.first_name,
                'username': user.username
            },
            'content': content,
            'timestamp': timestamp,
            'files': saved_files,
            'server_time': datetime.now().isoformat()
        }
        
        flask_logger.info(f"✅ Сообщение успешно отправлено. ID: {message.id}")
        return jsonify(response_data)
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка отправки сообщения: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

@flask_app.route('/api/messages/clear', methods=['POST'])
def clear_messages():
    """Очистить все сообщения (для отладки)"""
    try:
        flask_logger.warning("⚠️ Запрос на очистку всех сообщений")
        
        # Здесь нужно добавить функцию очистки сообщений в БД
        # Временно возвращаем заглушку
        return jsonify({
            'status': 'success',
            'message': 'Clear messages function not implemented yet',
            'cleared_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка очистки сообщений: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/upload/photo', methods=['POST'])
def upload_photo():
    """Загрузка фото"""
    try:
        flask_logger.info("📸 Загрузка фото")
        
        if 'photo' not in request.files:
            flask_logger.error("❌ Фото не предоставлено")
            return jsonify({'status': 'error', 'message': 'No photo provided'}), 400
        
        photo = request.files['photo']
        user_id = request.form.get('user_id')
        
        flask_logger.debug(f"📷 Фото: {photo.filename}, user_id: {user_id}")
        
        if not user_id:
            flask_logger.error("❌ User ID не указан")
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if photo.filename == '':
            flask_logger.error("❌ Имя файла пустое")
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(photo.filename, 'photos'):
            flask_logger.error(f"❌ Тип файла не разрешен: {photo.filename}")
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Генерируем уникальное имя файла
        filename = f"{uuid.uuid4()}.{photo.filename.rsplit('.', 1)[1].lower()}"
        filepath = os.path.join(PHOTOS_FOLDER, filename)
        
        flask_logger.debug(f"💾 Сохраняем файл: {filepath}")
        photo.save(filepath)
        
        # Проверяем сохранение
        if not os.path.exists(filepath):
            flask_logger.error(f"❌ Файл не сохранен: {filepath}")
            return jsonify({'status': 'error', 'message': 'File save failed'}), 500
        
        file_size = os.path.getsize(filepath)
        flask_logger.info(f"✅ Файл сохранен: {filename} ({file_size} байт)")
        
        # URL для доступа к файлу
        file_url = f"/uploads/photos/{filename}"
        
        # Сохраняем сообщение о фото
        message = db.add_message(
            user_id=int(user_id),
            message_type='photo',
            content='Фото',
            file_url=file_url,
            file_id=filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': filename,
            'size': file_size,
            'saved_at': datetime.now().isoformat()
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки фото: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/upload/voice', methods=['POST'])
def upload_voice():
    """Загрузка голосового сообщения"""
    try:
        flask_logger.info("🎤 Загрузка голосового сообщения")
        
        if 'voice' not in request.files:
            flask_logger.error("❌ Голосовое сообщение не предоставлено")
            return jsonify({'status': 'error', 'message': 'No voice message provided'}), 400
        
        voice = request.files['voice']
        user_id = request.form.get('user_id')
        duration = request.form.get('duration', 0)
        
        flask_logger.debug(f"🎵 Голосовое: {voice.filename}, user_id: {user_id}, duration: {duration}")
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if voice.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(voice.filename, 'voice'):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Генерируем уникальное имя файла
        filename = f"{uuid.uuid4()}.{voice.filename.rsplit('.', 1)[1].lower()}"
        filepath = os.path.join(VOICE_FOLDER, filename)
        voice.save(filepath)
        
        # Проверяем сохранение
        if not os.path.exists(filepath):
            flask_logger.error(f"❌ Файл не сохранен: {filepath}")
            return jsonify({'status': 'error', 'message': 'File save failed'}), 500
        
        file_size = os.path.getsize(filepath)
        flask_logger.info(f"✅ Голосовое сообщение сохранено: {filename} ({file_size} байт)")
        
        # URL для доступа к файлу
        file_url = f"/uploads/voice/{filename}"
        
        # Сохраняем сообщение о голосовом сообщении
        message = db.add_message(
            user_id=int(user_id),
            message_type='voice',
            content='Голосовое сообщение',
            file_url=file_url,
            file_id=filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': filename,
            'duration': int(duration),
            'size': file_size
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки голосового сообщения: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/upload/document', methods=['POST'])
def upload_document():
    """Загрузка документа"""
    try:
        flask_logger.info("📄 Загрузка документа")
        
        if 'document' not in request.files:
            return jsonify({'status': 'error', 'message': 'No document provided'}), 400
        
        document = request.files['document']
        user_id = request.form.get('user_id')
        description = request.form.get('description', 'Документ')
        
        flask_logger.debug(f"📄 Документ: {document.filename}, user_id: {user_id}")
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if document.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        if not allowed_file(document.filename, 'documents'):
            return jsonify({'status': 'error', 'message': 'File type not allowed'}), 400
        
        # Генерируем уникальное имя файла
        ext = document.filename.rsplit('.', 1)[1].lower()
        filename = f"{uuid.uuid4()}.{ext}"
        filepath = os.path.join(DOCUMENTS_FOLDER, filename)
        document.save(filepath)
        
        # Проверяем сохранение
        if not os.path.exists(filepath):
            flask_logger.error(f"❌ Файл не сохранен: {filepath}")
            return jsonify({'status': 'error', 'message': 'File save failed'}), 500
        
        # Получаем размер файла
        file_size = os.path.getsize(filepath)
        flask_logger.info(f"✅ Документ сохранен: {filename} ({file_size} байт)")
        
        # URL для доступа к файлу
        file_url = f"/uploads/documents/{filename}"
        
        # Сохраняем сообщение о документе
        message = db.add_message(
            user_id=int(user_id),
            message_type='document',
            content=description,
            file_url=file_url,
            file_id=filename
        )
        
        return jsonify({
            'status': 'success',
            'message_id': message.id,
            'file_url': file_url,
            'filename': filename,
            'original_name': document.filename,
            'size': file_size,
            'description': description
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки документа: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/user/avatar', methods=['POST'])
def upload_avatar():
    """Загрузка аватарки пользователя"""
    try:
        flask_logger.info("🖼️ Загрузка аватарки")
        
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
        
        # Генерируем уникальное имя файла
        filename = f"{uuid.uuid4()}.{avatar.filename.rsplit('.', 1)[1].lower()}"
        filepath = os.path.join(AVATARS_FOLDER, filename)
        avatar.save(filepath)
        
        # Проверяем сохранение
        if not os.path.exists(filepath):
            flask_logger.error(f"❌ Аватар не сохранен: {filepath}")
            return jsonify({'status': 'error', 'message': 'File save failed'}), 500
        
        file_size = os.path.getsize(filepath)
        flask_logger.info(f"✅ Аватар сохранен: {filename} ({file_size} байт)")
        
        # URL для доступа к файлу
        avatar_url = f"/uploads/avatars/{filename}"
        
        # Обновляем пользователя в БД
        user = db.get_user_by_id(int(user_id))
        if user:
            # Здесь нужно добавить метод для обновления фото пользователя
            # Пока сохраняем в текущей структуре
            user.photo_url = avatar_url
            flask_logger.info(f"👤 Аватар обновлен для пользователя {user_id}")
        
        return jsonify({
            'status': 'success',
            'avatar_url': avatar_url,
            'filename': filename,
            'size': file_size
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки аватара: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/voice/<filename>')
def get_voice_file(filename):
    """Получить голосовое сообщение"""
    try:
        flask_logger.debug(f"🎵 Запрос голосового файла: {filename}")
        return send_from_directory(VOICE_FOLDER, filename)
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения голосового файла: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 404

@flask_app.route('/api/photo/<filename>')
def get_photo_file(filename):
    """Получить фото"""
    try:
        flask_logger.debug(f"📸 Запрос фото: {filename}")
        return send_from_directory(PHOTOS_FOLDER, filename)
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения фото: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 404

@flask_app.route('/api/document/<filename>')
def get_document_file(filename):
    """Получить документ"""
    try:
        flask_logger.debug(f"📄 Запрос документа: {filename}")
        return send_from_directory(DOCUMENTS_FOLDER, filename)
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения документа: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 404

@flask_app.route('/api/avatar/<filename>')
def get_avatar_file(filename):
    """Получить аватар"""
    try:
        flask_logger.debug(f"🖼️ Запрос аватара: {filename}")
        return send_from_directory(AVATARS_FOLDER, filename)
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения аватара: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 404

# Статические файлы загрузок
@flask_app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Сервис загруженных файлов"""
    flask_logger.debug(f"📁 Запрос загруженного файла: {filename}")
    upload_path = os.path.join(UPLOAD_FOLDER, filename)
    
    if os.path.exists(upload_path):
        flask_logger.debug(f"✅ Файл найден: {upload_path}")
        return send_from_directory(UPLOAD_FOLDER, filename)
    
    flask_logger.warning(f"❌ Файл не найден: {upload_path}")
    return "File not found", 404

@flask_app.route('/api/users', methods=['GET'])
def get_users_api():
    """Получить список пользователей"""
    try:
        flask_logger.info("👥 Получение списка пользователей")
        
        users = db.get_users()
        flask_logger.debug(f"📊 Найдено пользователей: {len(users)}")
        
        users_data = []
        for user in users:
            # Получаем количество сообщений пользователя
            message_count = db.get_message_count(user.user_id)
            
            # Проверяем активность пользователя (был ли онлайн за последние 24 часа)
            active_users = db.get_active_users(24)
            is_online = any(u.user_id == user.user_id for u in active_users)
            
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
        
        flask_logger.info(f"✅ Отправлено данных о {len(users_data)} пользователях")
        return jsonify({'status': 'success', 'users': users_data})
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
            flask_logger.warning(f"⚠️ Пользователь {user_id} не найден в БД")
            # Создаем пользователя если не существует
            user = db.get_or_create_user({
                'id': user_id,
                'username': None,
                'first_name': f'User{user_id}',
                'last_name': None
            })
            flask_logger.info(f"👤 Создан новый пользователь: {user.first_name}")
        
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
        
        flask_logger.debug(f"📊 Данные пользователя: {user_data}")
        return jsonify({'status': 'success', 'user': user_data})
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения пользователя: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/group/settings', methods=['GET'])
def get_group_settings_api():
    """Получить настройки группы"""
    try:
        flask_logger.info("⚙️ Получение настроек группы")
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
        flask_logger.error(f"❌ Ошибка получения настроек: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/stats', methods=['GET'])
def get_stats_api():
    """Получить статистику чата"""
    try:
        flask_logger.info("📊 Получение статистики чата")
        
        # Получаем все данные
        users = db.get_users()
        messages = db.get_messages(limit=10000)
        active_users = db.get_active_users(24)
        
        flask_logger.debug(f"📈 Статистика: пользователей={len(users)}, сообщений={len(messages)}, онлайн={len(active_users)}")
        
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
        
        flask_logger.info(f"✅ Статистика собрана: {stats_data['total_messages']} сообщений от {stats_data['total_users']} пользователей")
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
        flask_logger.debug(f"📝 Данные регистрации: {data}")
        
        if not data or 'id' not in data:
            return jsonify({'status': 'error', 'message': 'Invalid request'}), 400
        
        user = db.get_or_create_user({
            'id': data['id'],
            'username': data.get('username'),
            'first_name': data.get('first_name'),
            'last_name': data.get('last_name'),
            'photo_url': data.get('photo_url')
        })
        
        flask_logger.info(f"✅ Пользователь зарегистрирован: {user.first_name} (ID: {user.id})")
        
        return jsonify({
            'status': 'success',
            'user_id': user.user_id,
            'message': 'User registered successfully'
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка регистрации пользователя: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/messages/search', methods=['GET'])
def search_messages_api():
    """Поиск сообщений"""
    try:
        query = request.args.get('q', '').lower()
        flask_logger.info(f"🔍 Поиск сообщений: '{query}'")
        
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
        
        flask_logger.info(f"✅ Найдено {len(found_messages)} сообщений по запросу '{query}'")
        
        return jsonify({
            'status': 'success',
            'query': query,
            'count': len(found_messages),
            'messages': found_messages
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка поиска сообщений: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ========== ДОПОЛНИТЕЛЬНЫЕ ОТЛАДОЧНЫЕ ЭНДПОИНТЫ ==========

@flask_app.route('/api/debug/database', methods=['GET'])
def debug_database():
    """Отладочная информация о базе данных"""
    try:
        from sqlalchemy import inspect
        
        engine = create_engine("sqlite:///botzakaz.db")
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        table_info = {}
        for table in tables:
            columns = inspector.get_columns(table)
            table_info[table] = [{"name": col['name'], "type": str(col['type'])} for col in columns]
        
        # Проверяем существование файла БД
        db_exists = os.path.exists("botzakaz.db")
        db_size = os.path.getsize("botzakaz.db") if db_exists else 0
        
        return jsonify({
            "status": "success",
            "database": {
                "path": "botzakaz.db",
                "exists": db_exists,
                "size_bytes": db_size,
                "size_mb": db_size / 1024 / 1024 if db_exists else 0,
                "tables": tables,
                "table_details": table_info
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@flask_app.route('/api/debug/test-message', methods=['POST'])
def test_message():
    """Тестовый эндпоинт для проверки отправки сообщений"""
    try:
        data = request.json or {}
        
        # Создаем тестовое сообщение
        test_data = {
            "user_id": data.get("user_id", 123456),
            "content": data.get("content", "Тестовое сообщение от сервера"),
            "section": "main",
            "timestamp": datetime.now().isoformat()
        }
        
        flask_logger.info(f"🧪 Тестовое сообщение: {test_data}")
        
        return jsonify({
            "status": "success",
            "message": "Test message endpoint is working",
            "test_data": test_data,
            "received_data": data,
            "server_time": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@flask_app.route('/api/debug/check-connection', methods=['GET'])
def check_connection():
    """Проверка соединения с фронтендом"""
    return jsonify({
        "status": "success",
        "message": "Connection successful",
        "server_time": datetime.now().isoformat(),
        "endpoints": {
            "get_messages": "/api/messages",
            "send_message": "/api/messages/send",
            "get_users": "/api/users",
            "upload_photo": "/api/upload/photo",
            "upload_document": "/api/upload/document",
            "stats": "/api/stats"
        }
    })

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
    logger.error("📝 Проверьте переменные окружения в Railway Dashboard")
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

📊 **Отладка:**
/debug - Информация о сервере
/status - Проверка соединения
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

**API Endpoints:**
• Сообщения: `/api/messages`
• Отправка: `/api/messages/send`
• Пользователи: `/api/users`
• Статистика: `/api/stats`
• Отладка: `/api/debug/info`

**Проверки:**
• База данных: /api/debug/database
• Соединение: /api/debug/check-connection
• Тест: /api/debug/test-message
"""
        
        await message.answer(debug_info, parse_mode='Markdown')
        logger.info(f"✅ Отладочная информация отправлена пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /debug: {e}")
        await message.answer("❌ Ошибка получения отладочной информации")

@dp.message_handler(commands=['status'])
async def cmd_status(message: types.Message):
    """Проверка статуса сервера"""
    try:
        logger.info(f"🔍 Проверка статуса от пользователя: {message.from_user.id}")
        
        import requests
        
        # Проверяем доступность API
        domain = "https://botzakaz-production-ba19.up.railway.app"
        health_url = f"{domain}/health"
        messages_url = f"{domain}/api/messages"
        
        try:
            health_resp = requests.get(health_url, timeout=5)
            health_status = health_resp.status_code == 200
            
            messages_resp = requests.get(messages_url + "?limit=1", timeout=5)
            messages_status = messages_resp.status_code == 200
            
        except Exception as api_error:
            logger.error(f"❌ Ошибка проверки API: {api_error}")
            health_status = False
            messages_status = False
        
        status_text = f"""
🟢 **Статус сервера:**

**API Endpoints:**
• Главная страница: {'✅ Доступен' if health_status else '❌ Недоступен'}
• Сообщения API: {'✅ Доступен' if messages_status else '❌ Недоступен'}

**Ссылки для проверки:**
• [Проверка здоровья]({health_url})
• [Получить сообщения]({messages_url})
• [Информация о БД]({domain}/api/debug/database)

**Время сервера:** {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}

**Пользователь:** @{message.from_user.username or 'без username'}

ℹ️ *Если какие-то эндпоинты недоступны, проверьте логи сервера.*
"""
        
        await message.answer(status_text, parse_mode='Markdown', disable_web_page_preview=True)
        logger.info(f"✅ Статус отправлен пользователю {message.from_user.id}")
    except Exception as e:
        logger.error(f"❌ Ошибка в /status: {e}")
        await message.answer("❌ Ошибка проверки статуса")

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
/debug - Отладочная информация
/status - Проверка статуса сервера

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
• Отладка: /api/debug/info, /api/debug/database

❓ **Проблемы?**
Если веб-приложение не открывается:
1. Используйте Telegram на телефоне
2. Обновите приложение Telegram
3. Перезапустите бота командой /start
4. Проверьте подключение к интернету
5. Используйте /debug для получения информации
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
        
        # Проверяем существующие таблицы
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        logger.info(f"📊 Таблицы в базе данных: {tables}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}", exc_info=True)
    
    logger.info("📱 Используйте команду /start для начала работы")
    logger.info(f"🌐 Веб-приложение: https://botzakaz-production-ba19.up.railway.app")
    logger.info(f"🔗 Инициализация БД: https://botzakaz-production-ba19.up.railway.app/init-db")
    logger.info(f"🐛 Отладка: https://botzakaz-production-ba19.up.railway.app/api/debug/info")
    logger.info("🎉 Бот готов к работе!")

async def on_shutdown(dp):
    """Действия при завершении работы"""
    logger.info("👋 Завершение работы бота...")

def start_bot():
    """Запуск бота в отдельном процессе"""
    print("\n" + "="*60)
    print("🚀 Telegram Bot with Mini App - DEBUG VERSION")
    print("="*60)
    
    # Проверяем наличие BOT_TOKEN
    if not BOT_TOKEN:
        print("\n❌ BOT_TOKEN не найден в переменных окружения!")
        print("📝 Установите BOT_TOKEN в Railway Dashboard")
        exit(1)
    
    print(f"\n🔑 Токен бота: {'✅ Найден' if BOT_TOKEN else '❌ Не найден'}")
    print(f"📏 Длина токена: {len(BOT_TOKEN)} символов")
    print(f"🌐 Домен: https://botzakaz-production-ba19.up.railway.app")
    print(f"🐛 Уровень логирования: DEBUG")
    print("\n🤖 Запуск бота...")
    print("="*60)
    
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
    
    print("\n🔄 Инициализация приложения...")
    
    # Проверяем директории
    print(f"📁 Проверка директорий:")
    print(f"  • uploads/: {'✅ Существует' if os.path.exists(UPLOAD_FOLDER) else '❌ Отсутствует'}")
    print(f"  • webapp/: {'✅ Существует' if os.path.exists(WEBAPP_DIR) else '❌ Отсутствует'}")
    print(f"  • БД: {'✅ Существует' if os.path.exists('botzakaz.db') else '❌ Отсутствует'}")
    
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
    # Если импортируется gunicorn, запускаем только бота в фоне
    import threading
    
    print("\n🚀 Запуск в режиме gunicorn...")
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()
    
    print("✅ Бот запущен в фоновом режиме")
