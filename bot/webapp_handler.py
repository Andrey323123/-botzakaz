from aiohttp import web
import json
import core.database as db
from datetime import datetime

async def get_messages(request):
    """Получить сообщения"""
    limit = int(request.query.get('limit', 50))
    offset = int(request.query.get('offset', 0))
    
    messages = await db.get_messages(limit, offset)
    
    # Преобразуем сообщения в словари
    messages_data = []
    for message in messages:
        user = await db.get_or_create_user({
            'id': message.user_id,
            'username': None,
            'first_name': None,
            'last_name': None
        })
        
        messages_data.append({
            'id': message.id,
            'user_id': message.user_id,
            'user': {
                'id': user.id,
                'user_id': user.user_id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'photo_url': user.photo_url
            },
            'message_type': message.message_type,
            'content': message.content,
            'file_id': message.file_id,
            'file_url': message.file_url,
            'timestamp': message.timestamp.isoformat() if message.timestamp else None
        })
    
    return web.json_response({
        'status': 'success',
        'messages': messages_data
    })

async def send_message(request):
    """Отправить сообщение"""
    try:
        data = await request.json()
    except:
        return web.json_response({
            'status': 'error',
            'message': 'Invalid JSON'
        }, status=400)
    
    required_fields = ['user_id', 'message_type']
    for field in required_fields:
        if field not in data:
            return web.json_response({
                'status': 'error',
                'message': f'Missing field: {field}'
            }, status=400)
    
    # Проверяем, не забанен ли пользователь
    user = await db.get_or_create_user({
        'id': data['user_id'],
        'username': None,
        'first_name': None,
        'last_name': None
    })
    
    if user.is_banned:
        return web.json_response({
            'status': 'error',
            'message': 'User is banned'
        }, status=403)
    
    if user.is_muted and user.mute_until and user.mute_until > datetime.utcnow():
        return web.json_response({
            'status': 'error',
            'message': 'User is muted'
        }, status=403)
    
    # Сохраняем сообщение
    message = await db.add_message(
        user_id=data['user_id'],
        message_type=data['message_type'],
        content=data.get('content'),
        file_id=data.get('file_id'),
        file_url=data.get('file_url')
    )
    
    return web.json_response({
        'status': 'success',
        'message_id': message.id
    })

async def get_users(request):
    """Получить список пользователей"""
    users = await db.get_users()
    
    users_data = []
    for user in users:
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
            'created_at': user.created_at.isoformat() if user.created_at else None
        })
    
    return web.json_response({
        'status': 'success',
        'users': users_data
    })

async def get_user(request):
    """Получить информацию о пользователе"""
    user_id = request.match_info.get('user_id')
    if not user_id:
        return web.json_response({
            'status': 'error',
            'message': 'User ID is required'
        }, status=400)
    
    user = await db.get_or_create_user({
        'id': int(user_id),
        'username': None,
        'first_name': None,
        'last_name': None
    })
    
    # Получаем количество сообщений пользователя
    messages = await db.get_messages(limit=1000)
    user_messages = [m for m in messages if m.user_id == int(user_id)]
    
    return web.json_response({
        'status': 'success',
        'user': {
            'id': user.id,
            'user_id': user.user_id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'photo_url': user.photo_url,
            'is_banned': user.is_banned,
            'is_muted': user.is_muted,
            'joined_at': user.created_at.isoformat() if user.created_at else None,
            'message_count': len(user_messages)
        }
    })

async def register_user(request):
    """Зарегистрировать пользователя"""
    try:
        data = await request.json()
    except:
        return web.json_response({
            'status': 'error',
            'message': 'Invalid JSON'
        }, status=400)
    
    required_fields = ['user_id']
    for field in required_fields:
        if field not in data:
            return web.json_response({
                'status': 'error',
                'message': f'Missing field: {field}'
            }, status=400)
    
    user = await db.get_or_create_user({
        'id': data['user_id'],
        'username': data.get('username'),
        'first_name': data.get('first_name'),
        'last_name': data.get('last_name'),
        'photo_url': data.get('photo_url')
    })
    
    return web.json_response({
        'status': 'success',
        'user_id': user.user_id
    })

async def get_online_users(request):
    """Получить онлайн пользователей (симуляция)"""
    messages = await db.get_messages(limit=100)
    recent_users = set()
    five_minutes_ago = datetime.utcnow().timestamp() - 300
    
    for message in messages:
        if message.timestamp and message.timestamp.timestamp() > five_minutes_ago:
            recent_users.add(message.user_id)
    
    return web.json_response({
        'status': 'success',
        'online_users': list(recent_users)
    })

async def clear_messages(request):
    """Очистить сообщения (только для админа)"""
    # В реальном приложении здесь должна быть проверка прав
    # Пока просто симуляция
    return web.json_response({
        'status': 'success',
        'message': 'Messages cleared (simulated)'
    })

async def mute_user(request):
    """Замутить пользователя"""
    user_id = request.match_info.get('user_id')
    if not user_id:
        return web.json_response({
            'status': 'error',
            'message': 'User ID is required'
        }, status=400)
    
    try:
        success = await db.mute_user(int(user_id), 60)  # 60 минут
        if success:
            return web.json_response({'status': 'success'})
        else:
            return web.json_response({
                'status': 'error',
                'message': 'User not found'
            }, status=404)
    except Exception as e:
        return web.json_response({
            'status': 'error',
            'message': str(e)
        }, status=500)

async def ban_user(request):
    """Забанить пользователя"""
    user_id = request.match_info.get('user_id')
    if not user_id:
        return web.json_response({
            'status': 'error',
            'message': 'User ID is required'
        }, status=400)
    
    try:
        success = await db.ban_user(int(user_id))
        if success:
            return web.json_response({'status': 'success'})
        else:
            return web.json_response({
                'status': 'error',
                'message': 'User not found'
            }, status=404)
    except Exception as e:
        return web.json_response({
            'status': 'error',
            'message': str(e)
        }, status=500)

def setup_routes(app):
    """Настройка маршрутов"""
    app.router.add_get('/api/messages', get_messages)
    app.router.add_post('/api/messages/send', send_message)
    app.router.add_get('/api/users', get_users)
    app.router.add_get('/api/user/{user_id}', get_user)
    app.router.add_post('/api/user/register', register_user)
    app.router.add_get('/api/users/online', get_online_users)
    app.router.add_post('/api/messages/clear', clear_messages)
    app.router.add_post('/api/user/{user_id}/mute', mute_user)
    app.router.add_post('/api/user/{user_id}/ban', ban_user)

async def start_api():
    """Запуск API сервера"""
    app = web.Application()
    setup_routes(app)
    
    # Добавляем статические файлы
    app.router.add_static('/static/', path='bot/webapp/', name='static')
    
    # Главная страница
    async def index(request):
        return web.FileResponse('bot/webapp/index.html')
    
    app.router.add_get('/', index)
    app.router.add_get('/index.html', index)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 8080)
    await site.start()
    
    print("🌐 API сервер запущен на http://localhost:8080")
    print("📱 WebApp доступен по адресу: http://localhost:8080")
    
    return runner

if __name__ == "__main__":
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_api())
    try:
        loop.run_forever()
    except KeyboardInterrupt:
        pass