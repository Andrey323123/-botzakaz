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

# ... (все Flask роуты остаются без изменений до строки 237) ...

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

# ========== ОБРАБОТЧИКИ КОМАНД БОТА ==========

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    """Обработчик команды /start"""
    try:
        # Получаем или создаем пользователя
        user = db.get_or_create_user({
            'id': message.from_user.id,
            'username': message.from_user.username,
            'first_name': message.from_user.first_name,
            'last_name': message.from_user.last_name
        })
        
        logger.info(f"👋 Новый пользователь: {message.from_user.username or message.from_user.id}")
        
        # Создаем клавиатуру с кнопкой мини-приложения
        keyboard = InlineKeyboardMarkup(row_width=1)
        web_app_button = InlineKeyboardButton(
            text="📱 Открыть мини-приложение",
            web_app=WebAppInfo(url="https://botzakaz-production-ba19.up.railway.app/index.html")
        )
        help_button = InlineKeyboardButton(
            text="❓ Помощь",
            callback_data="help"
        )
        keyboard.add(web_app_button, help_button)
        
        # Отправляем приветственное сообщение
        welcome_text = (
            f"👋 Привет, {message.from_user.first_name}!\n\n"
            f"Я бот для управления заказами и общения в чате.\n\n"
            f"✨ <b>Возможности:</b>\n"
            f"• 📱 <b>Мини-приложение</b> - удобный интерфейс для работы\n"
            f"• 💬 <b>Групповой чат</b> - общение с другими пользователями\n"
            f"• 📊 <b>Статистика</b> - отслеживание активности\n"
            f"• 👥 <b>Управление пользователями</b> - бан/мут\n\n"
            f"Нажми кнопку ниже, чтобы открыть мини-приложение!"
        )
        
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode="HTML")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /start: {e}")
        await message.answer("❌ Произошла ошибка. Попробуйте позже.")

@dp.message_handler(commands=['chat'])
async def cmd_chat(message: types.Message):
    """Обработчик команды /chat - отправка сообщения в чат"""
    try:
        # Проверяем, есть ли текст после команды
        if not message.get_args():
            await message.answer("✏️ Напишите сообщение после команды /chat\nНапример: /chat Привет всем!")
            return
        
        # Получаем пользователя
        user = db.get_or_create_user({
            'id': message.from_user.id,
            'username': message.from_user.username,
            'first_name': message.from_user.first_name,
            'last_name': message.from_user.last_name
        })
        
        # Проверяем бан/мут
        if user.is_banned:
            await message.answer("🚫 Вы забанены и не можете отправлять сообщения.")
            return
        
        if user.is_muted and user.mute_until and user.mute_until > datetime.utcnow():
            await message.answer(f"🔇 Вы в муте до {user.mute_until.strftime('%H:%M %d.%m.%Y')}")
            return
        
        # Сохраняем сообщение
        db.add_message(
            user_id=message.from_user.id,
            message_type="text",
            content=message.get_args()
        )
        
        await message.answer("✅ Сообщение отправлено в чат!")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /chat: {e}")
        await message.answer("❌ Произошла ошибка при отправке сообщения.")

@dp.message_handler(commands=['help'])
async def cmd_help(message: types.Message):
    """Обработчик команды /help"""
    help_text = (
        "📚 <b>Доступные команды:</b>\n\n"
        "/start - Начать работу с ботом\n"
        "/chat [текст] - Отправить сообщение в чат\n"
        "/help - Показать это сообщение\n"
        "/stats - Статистика чата\n"
        "/users - Список пользователей\n"
        "/online - Кто онлайн\n\n"
        "📱 <b>Мини-приложение:</b>\n"
        "Для полного доступа ко всем функциям используйте мини-приложение - нажмите кнопку в меню /start\n\n"
        "❓ <b>Проблемы?</b>\n"
        "Если мини-приложение не открывается, проверьте:\n"
        "1. Вы используете Telegram на телефоне\n"
        "2. Обновите приложение Telegram\n"
        "3. Попробуйте перезапустить бота командой /start"
    )
    await message.answer(help_text, parse_mode="HTML")

@dp.message_handler(commands=['stats'])
async def cmd_stats(message: types.Message):
    """Обработчик команды /stats - статистика чата"""
    try:
        # Получаем статистику
        users = db.get_users()
        messages = db.get_messages(limit=10000)
        active_users = db.get_active_users(24)
        
        stats_text = (
            f"📊 <b>Статистика чата:</b>\n\n"
            f"👥 <b>Пользователи:</b> {len(users)}\n"
            f"💬 <b>Сообщения:</b> {len(messages)}\n"
            f"🟢 <b>Онлайн (24ч):</b> {len(active_users)}\n"
            f"🚫 <b>Забанено:</b> {sum(1 for u in users if u.is_banned)}\n"
            f"🔇 <b>В муте:</b> {sum(1 for u in users if u.is_muted)}\n\n"
            f"📈 <b>Топ отправителей:</b>\n"
        )
        
        # Топ пользователей
        user_message_count = {}
        for msg in messages:
            user_message_count[msg.user_id] = user_message_count.get(msg.user_id, 0) + 1
        
        sorted_users = sorted(user_message_count.items(), key=lambda x: x[1], reverse=True)[:3]
        
        for i, (user_id, count) in enumerate(sorted_users, 1):
            user = db.get_user_by_id(user_id)
            username = user.username if user else f"User{user_id}"
            stats_text += f"{i}. @{username}: {count} сообщ.\n"
        
        await message.answer(stats_text, parse_mode="HTML")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /stats: {e}")
        await message.answer("❌ Произошла ошибка при получении статистики.")

@dp.message_handler(commands=['users'])
async def cmd_users(message: types.Message):
    """Обработчик команды /users - список пользователей"""
    try:
        users = db.get_users()
        
        if not users:
            await message.answer("👥 Пользователей пока нет.")
            return
        
        users_text = f"👥 <b>Пользователи ({len(users)}):</b>\n\n"
        
        for i, user in enumerate(users[:10], 1):  # Ограничим 10 пользователей
            status = "🟢" if not user.is_banned else "🔴"
            mute_status = "🔇" if user.is_muted else ""
            users_text += f"{i}. {status} {mute_status} @{user.username or 'без имени'} - {user.first_name or ''}\n"
        
        if len(users) > 10:
            users_text += f"\n... и ещё {len(users) - 10} пользователей"
        
        await message.answer(users_text, parse_mode="HTML")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /users: {e}")
        await message.answer("❌ Произошла ошибка при получении списка пользователей.")

@dp.message_handler(commands=['online'])
async def cmd_online(message: types.Message):
    """Обработчик команды /online - кто онлайн"""
    try:
        active_users = db.get_active_users(24)  # Активны за последние 24 часа
        
        if not active_users:
            await message.answer("🕐 За последние 24 часа никто не был активен.")
            return
        
        online_text = f"🟢 <b>Активные пользователи (24ч):</b> {len(active_users)}\n\n"
        
        for i, user in enumerate(active_users[:10], 1):  # Ограничим 10 пользователей
            online_text += f"{i}. @{user.username or 'без имени'} - {user.first_name or ''}\n"
        
        if len(active_users) > 10:
            online_text += f"\n... и ещё {len(active_users) - 10} пользователей"
        
        await message.answer(online_text, parse_mode="HTML")
        
    except Exception as e:
        logger.error(f"❌ Ошибка в /online: {e}")
        await message.answer("❌ Произошла ошибка при получении списка онлайн пользователей.")

@dp.callback_query_handler(lambda c: c.data == 'help')
async def process_callback_help(callback_query: types.CallbackQuery):
    """Обработчик кнопки Помощь"""
    help_text = (
        "❓ <b>Частые вопросы:</b>\n\n"
        "1. <b>Как открыть мини-приложение?</b>\n"
        "Нажмите кнопку '📱 Открыть мини-приложение' в меню /start\n\n"
        "2. <b>Мини-приложение не открывается</b>\n"
        "• Используйте Telegram на телефоне\n"
        "• Обновите приложение Telegram\n"
        "• Перезапустите бота командой /start\n\n"
        "3. <b>Как отправить сообщение в чат?</b>\n"
        "Используйте команду /chat [текст] или мини-приложение\n\n"
        "4. <b>Как увидеть всех пользователей?</b>\n"
        "Команда /users покажет список пользователей"
    )
    
    await bot.answer_callback_query(callback_query.id)
    await bot.send_message(
        callback_query.from_user.id,
        help_text,
        parse_mode="HTML"
    )

@dp.message_handler(content_types=types.ContentTypes.TEXT)
async def handle_text(message: types.Message):
    """Обработчик обычных текстовых сообщений (не команд)"""
    # Игнорируем сообщения, которые не начинаются с /
    if not message.text.startswith('/'):
        # Можно добавить логику для обработки обычных сообщений
        pass

# ========== ЗАВЕРШЕНИЕ ОБРАБОТЧИКОВ ==========

async def on_startup(dp):
    """Действия при запуске"""
    logger.info("🤖 Бот запускается...")
    
    # Инициализация базы данных
    try:
        db.init_db()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации БД: {e}", exc_info=True)
    
    # Устанавливаем команды бота
    commands = [
        types.BotCommand("start", "Запустить бота"),
        types.BotCommand("chat", "Отправить сообщение в чат"),
        types.BotCommand("help", "Помощь по командам"),
        types.BotCommand("stats", "Статистика чата"),
        types.BotCommand("users", "Список пользователей"),
        types.BotCommand("online", "Кто онлайн"),
    ]
    
    await bot.set_my_commands(commands)
    
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
