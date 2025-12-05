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
import re
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
        
        # Дополнительные параметры для публичного доступа к медиа файлам
        put_params = {
            'Bucket': S3_BUCKET,
            'Key': filepath,
            'Body': file_data,
            'ContentType': content_type,
            'ACL': 'public-read'  # Публичный доступ для воспроизведения
        }
        
        # Для аудио/видео файлов добавляем Cache-Control
        if content_type.startswith('audio/') or content_type.startswith('video/'):
            put_params['CacheControl'] = 'public, max-age=31536000'
        
        s3_client.put_object(**put_params)
        
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
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Range'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Range, Accept-Ranges, Content-Length'
    # Поддержка Range запросов для аудио/видео
    if request.method == 'GET' and request.path.startswith('/api/s3/'):
        response.headers['Accept-Ranges'] = 'bytes'
    return response

@flask_app.route('/api/s3/<path:filename>', methods=['OPTIONS'])
def handle_options(filename):
    """Обработка preflight запросов"""
    response = flask_app.make_default_options_response()
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Range'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Range, Accept-Ranges, Content-Length'
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
@flask_app.route('/api/s3/upload', methods=['POST', 'OPTIONS'])
def upload_file_to_s3():
    """Загрузка файла в S3"""
    if request.method == 'OPTIONS':
        return '', 200
    
    return proxy_upload_to_s3()

@flask_app.route('/api/s3/upload-voice', methods=['POST', 'OPTIONS'])
def upload_voice_to_s3():
    """Загрузка голосового сообщения в S3"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No file provided'}), 400
        
        file = request.files['file']
        user_id = request.form.get('user_id')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        # Читаем файл
        file_data = file.read()
        
        # Генерируем уникальное имя файла для голосового
        unique_filename = f"{uuid.uuid4()}.ogg"
        filepath = f"uploads/voice/{user_id}/{unique_filename}"
        
        # Определяем Content-Type по расширению файла или MIME типу
        content_type = file.content_type or 'audio/webm'
        if content_type not in ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav']:
            # Определяем по расширению
            if file.filename:
                ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'webm'
                content_type_map = {
                    'webm': 'audio/webm',
                    'ogg': 'audio/ogg',
                    'mp3': 'audio/mpeg',
                    'wav': 'audio/wav',
                    'm4a': 'audio/m4a'
                }
                content_type = content_type_map.get(ext, 'audio/webm')
            else:
                content_type = 'audio/webm'
        
        # Загружаем в S3 с правильным Content-Type для аудио и публичным доступом
        file_url = upload_to_s3(
            file_data,
            filepath,
            content_type=content_type
        )
        
        # Получаем длительность если передана
        duration = request.form.get('duration', 0)
        
        return jsonify({
            'status': 'success',
            'file_url': file_url,
            'filename': unique_filename,
            'size': len(file_data),
            'type': 'voice',
            'duration': int(duration) if duration else 0
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки голосового: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/upload-video', methods=['POST', 'OPTIONS'])
def upload_video_to_s3():
    """Загрузка видео в S3"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No file provided'}), 400
        
        file = request.files['file']
        user_id = request.form.get('user_id')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
        # Читаем файл
        file_data = file.read()
        
        # Генерируем уникальное имя файла
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'mp4'
        unique_filename = f"{uuid.uuid4()}.{ext}"
        filepath = f"uploads/video/{user_id}/{unique_filename}"
        
        # Определяем Content-Type для видео
        video_content_types = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo'
        }
        content_type = video_content_types.get(ext, 'video/mp4')
        
        # Загружаем в S3
        file_url = upload_to_s3(
            file_data,
            filepath,
            content_type=content_type
        )
        
        return jsonify({
            'status': 'success',
            'file_url': file_url,
            'filename': filename,
            'unique_filename': unique_filename,
            'size': len(file_data),
            'type': 'video'
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка загрузки видео: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
            
            # Также обновляем пользователя в users.json
            update_user_in_s3(user_id, data.get('user', {}))
            
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

def update_user_in_s3(user_id, user_data):
    """Обновить информацию о пользователе в S3"""
    try:
        if not user_data:
            return
        
        s3_path = "data/users.json"
        
        # Загружаем существующих пользователей
        existing_users = {}
        try:
            obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_path)
            existing_users = json.loads(obj['Body'].read().decode('utf-8'))
        except:
            existing_users = {'users': {}}
        
        if 'users' not in existing_users:
            existing_users['users'] = {}
        
        # Обновляем пользователя
        user_id_str = str(user_id)
        if user_id_str not in existing_users['users']:
            existing_users['users'][user_id_str] = {}
        
        # Обновляем данные пользователя
        existing_users['users'][user_id_str].update({
            'id': user_id_str,
            'first_name': user_data.get('first_name', ''),
            'last_name': user_data.get('last_name', ''),
            'username': user_data.get('username', ''),
            'is_online': True,
            'last_seen': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        })
        
        # Сохраняем обратно
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_path,
            Body=json.dumps(existing_users, indent=2).encode('utf-8'),
            ContentType='application/json'
        )
        
        flask_logger.info(f"✅ Пользователь {user_id} обновлен в S3")
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка обновления пользователя в S3: {e}")

@flask_app.route('/api/s3/get-messages', methods=['GET'])
def get_messages_from_s3():
    """Получить сообщения из S3"""
    try:
        section = request.args.get('section', 'main')
        s3_path = f"data/messages_{section}.json"
        
        try:
            obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_path)
            data = json.loads(obj['Body'].read().decode('utf-8'))
            return jsonify({
                'status': 'success',
                'messages': data.get('messages', []),
                'section': section,
                'total': len(data.get('messages', []))
            })
        except Exception as e:
            # Если файл не найден, возвращаем пустой список
            return jsonify({
                'status': 'success',
                'messages': [],
                'section': section,
                'total': 0,
                'message': 'Нет сообщений в этом разделе'
            })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения сообщений: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/get-users', methods=['GET'])
def get_users_from_s3():
    """Получить список пользователей из S3"""
    try:
        s3_path = "data/users.json"
        
        try:
            obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_path)
            data = json.loads(obj['Body'].read().decode('utf-8'))
            users = data.get('users', {})
            
            # Фильтруем активных пользователей (были онлайн последние 5 минут)
            active_users = {}
            five_minutes_ago = datetime.now().timestamp() - 300
            
            for user_id, user_data in users.items():
                last_seen_str = user_data.get('last_seen', '')
                if last_seen_str:
                    try:
                        last_seen_dt = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                        last_seen_ts = last_seen_dt.timestamp()
                        user_data['is_online'] = last_seen_ts > five_minutes_ago
                    except:
                        user_data['is_online'] = False
                
                active_users[user_id] = user_data
            
            return jsonify({
                'status': 'success',
                'users': active_users,
                'total': len(active_users)
            })
            
        except Exception as e:
            # Если файл не найден, возвращаем пустой список
            return jsonify({
                'status': 'success',
                'users': {},
                'total': 0,
                'message': 'Нет пользователей'
            })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения пользователей: {e}")
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
        response = send_from_directory(WEBAPP_DIR, filename)
        
        # Добавляем поддержку Range запросов для аудио/видео файлов
        if filename.endswith(('.ogg', '.mp3', '.wav', '.m4a', '.webm', '.mp4', '.mov', '.avi')):
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Cache-Control'] = 'public, max-age=31536000'
        
        return response
    
    return "File not found", 404

# Прокси для аудио файлов из S3 с поддержкой Range запросов
@flask_app.route('/api/s3/audio/<path:filepath>', methods=['GET', 'HEAD', 'OPTIONS'])
def proxy_audio_from_s3(filepath):
    """Прокси для аудио файлов из S3 с поддержкой Range запросов"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        if not s3_client:
            return jsonify({'status': 'error', 'message': 'S3 client not initialized'}), 500
        
        # Получаем Range заголовок для перемотки
        range_header = request.headers.get('Range')
        
        # Получаем объект из S3
        s3_key = f"uploads/voice/{filepath}"
        
        if range_header:
            # Поддержка Range запросов для перемотки
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else None
            
            try:
                range_str = f'bytes={start}-{end}' if end else f'bytes={start}-'
                obj = s3_client.get_object(
                    Bucket=S3_BUCKET,
                    Key=s3_key,
                    Range=range_str
                )
                
                content = obj['Body'].read()
                content_length = obj.get('ContentLength', len(content))
                content_range = obj.get('ContentRange', f'bytes {start}-{start + content_length - 1}/*')
                
                response = flask_app.make_response(content)
                response.headers['Content-Type'] = 'audio/ogg'
                response.headers['Content-Length'] = str(content_length)
                response.headers['Content-Range'] = content_range
                response.headers['Accept-Ranges'] = 'bytes'
                response.status_code = 206  # Partial Content
                
                return response
            except Exception as e:
                flask_logger.error(f"❌ Ошибка Range запроса: {e}")
                # Fallback на полный файл
                pass
        
        # Полный файл
        obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_key)
        content = obj['Body'].read()
        content_length = obj.get('ContentLength', len(content))
        
        response = flask_app.make_response(content)
        response.headers['Content-Type'] = 'audio/ogg'
        response.headers['Content-Length'] = str(content_length)
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Cache-Control'] = 'public, max-age=31536000'
        
        return response
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения аудио из S3: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ===== STICKERS & GIFS ENDPOINTS =====
@flask_app.route('/api/telegram/get-sticker-sets', methods=['POST'])
def get_sticker_sets():
    """Получить наборы стикеров из Telegram"""
    try:
        data = request.json
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        # Try to get sticker sets from Telegram Bot API
        # For now, return empty list (should be implemented with bot.get_sticker_set)
        return jsonify({
            'status': 'success',
            'sticker_sets': []
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения стикеров: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/gifs/trending', methods=['GET'])
def get_trending_gifs():
    """Получить популярные GIF"""
    try:
        # Placeholder - should integrate with Giphy API or similar
        return jsonify({
            'status': 'success',
            'gifs': []
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения GIF: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/gifs/search', methods=['GET'])
def search_gifs():
    """Поиск GIF"""
    try:
        query = request.args.get('q', '')
        
        if not query:
            return jsonify({'status': 'error', 'message': 'Query required'}), 400
        
        # Placeholder - should integrate with Giphy API or similar
        return jsonify({
            'status': 'success',
            'gifs': []
        })
    except Exception as e:
        flask_logger.error(f"❌ Ошибка поиска GIF: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ===== MIRRORS ENDPOINTS =====
@flask_app.route('/api/mirrors/create', methods=['POST'])
def create_mirror():
    """Создать зеркало приложения"""
    try:
        data = request.json
        
        name = data.get('name')
        token = data.get('token')
        domain = data.get('domain', '')
        is_public = data.get('public', False)
        created_by = data.get('created_by')
        
        if not name or not token:
            return jsonify({'status': 'error', 'message': 'Name and token required'}), 400
        
        # Validate token format
        if not re.match(r'^\d+:[A-Za-z0-9_-]+$', token):
            return jsonify({'status': 'error', 'message': 'Invalid token format'}), 400
        
        # Generate mirror ID
        mirror_id = str(uuid.uuid4())
        
        # Save mirror configuration to S3
        mirror_config = {
            'id': mirror_id,
            'name': name,
            'token': token,
            'domain': domain,
            'public': is_public,
            'created_by': created_by,
            'created_at': datetime.now().isoformat(),
            'status': 'active'
        }
        
        s3_path = f"data/mirrors/{mirror_id}.json"
        
        try:
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=s3_path,
                Body=json.dumps(mirror_config, indent=2).encode('utf-8'),
                ContentType='application/json'
            )
            
            mirror_url = f"{domain}/mirror/{mirror_id}" if domain else f"/mirror/{mirror_id}"
            
            flask_logger.info(f"✅ Зеркало создано: {mirror_id}")
            
            return jsonify({
                'status': 'success',
                'mirror_id': mirror_id,
                'mirror_url': mirror_url,
                'message': 'Зеркало успешно создано'
            })
            
        except Exception as s3_error:
            flask_logger.error(f"❌ Ошибка сохранения зеркала в S3: {s3_error}")
            return jsonify({
                'status': 'error',
                'message': f'S3 save error: {str(s3_error)}'
            }), 500
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка создания зеркала: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/mirrors/list', methods=['GET'])
def list_mirrors():
    """Получить список зеркал пользователя"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({'status': 'error', 'message': 'User ID required'}), 400
        
        # List mirrors from S3
        mirrors = []
        try:
            prefix = "data/mirrors/"
            response = s3_client.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
            
            if 'Contents' in response:
                for obj in response['Contents']:
                    if obj['Key'].endswith('.json'):
                        mirror_obj = s3_client.get_object(Bucket=S3_BUCKET, Key=obj['Key'])
                        mirror_data = json.loads(mirror_obj['Body'].read().decode('utf-8'))
                        
                        # Filter by user if not public
                        if mirror_data.get('created_by') == user_id or mirror_data.get('public'):
                            mirrors.append(mirror_data)
        except Exception as s3_error:
            flask_logger.error(f"❌ Ошибка получения зеркал из S3: {s3_error}")
        
        return jsonify({
            'status': 'success',
            'mirrors': mirrors
        })
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения списка зеркал: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ===== SECTIONS ENDPOINTS =====
@flask_app.route('/api/s3/save-sections', methods=['POST'])
def save_sections():
    """Сохранить разделы/топики в S3"""
    try:
        data = request.json
        sections_data = data.get('sections', {})
        
        s3_path = "data/sections.json"
        
        try:
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=s3_path,
                Body=json.dumps(sections_data, indent=2).encode('utf-8'),
                ContentType='application/json'
            )
            
            flask_logger.info(f"✅ Разделы сохранены в S3")
            
            return jsonify({
                'status': 'success',
                'message': 'Разделы сохранены'
            })
            
        except Exception as s3_error:
            flask_logger.error(f"❌ Ошибка сохранения разделов в S3: {s3_error}")
            return jsonify({
                'status': 'error',
                'message': f'S3 save error: {str(s3_error)}'
            }), 500
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка сохранения разделов: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@flask_app.route('/api/s3/get-sections', methods=['GET'])
def get_sections():
    """Получить разделы/топики из S3"""
    try:
        s3_path = "data/sections.json"
        
        try:
            obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_path)
            sections_data = json.loads(obj['Body'].read().decode('utf-8'))
            
            return jsonify({
                'status': 'success',
                'sections': sections_data
            })
        except s3_client.exceptions.NoSuchKey:
            # No sections yet, return empty
            return jsonify({
                'status': 'success',
                'sections': {}
            })
        except Exception as s3_error:
            flask_logger.error(f"❌ Ошибка получения разделов из S3: {s3_error}")
            return jsonify({
                'status': 'error',
                'message': f'S3 get error: {str(s3_error)}'
            }), 500
        
    except Exception as e:
        flask_logger.error(f"❌ Ошибка получения разделов: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
• Получение сообщений: `/api/s3/get-messages`
• Получение пользователей: `/api/s3/get-users`
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
