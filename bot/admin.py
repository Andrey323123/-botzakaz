from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder
import core.database as db
from datetime import datetime, timedelta

admin_router = Router()

def is_admin(message: Message) -> bool:
    ADMIN_ID = int(os.getenv("ADMIN_ID"))
    return message.from_user.id == ADMIN_ID

@admin_router.message(Command("admin"))
async def admin_panel(message: Message):
    if not is_admin(message):
        await message.answer("У вас нет прав администратора")
        return
    
    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="📊 Статистика", callback_data="admin_stats")
    keyboard.button(text="👥 Пользователи", callback_data="admin_users")
    keyboard.button(text="⚙️ Настройки", callback_data="admin_settings")
    keyboard.adjust(1)
    
    await message.answer("Панель администратора:", reply_markup=keyboard.as_markup())

@admin_router.callback_query(F.data == "admin_stats")
async def admin_stats(callback: CallbackQuery):
    if not is_admin(callback.message):
        await callback.answer("Нет прав", show_alert=True)
        return
    
    users = await db.get_users()
    messages = await db.get_messages(limit=1000)
    
    text = f"""
📊 Статистика чата:

👥 Пользователей: {len(users)}
💬 Сообщений: {len(messages)}
🚫 Забанено: {sum(1 for u in users if u.is_banned)}
🔇 В муте: {sum(1 for u in users if u.is_muted)}

📅 Последние 24 часа: {len([m for m in messages if m.timestamp > datetime.utcnow() - timedelta(days=1)])} сообщ.
    """
    
    await callback.message.edit_text(text)

@admin_router.callback_query(F.data == "admin_users")
async def admin_users(callback: CallbackQuery):
    if not is_admin(callback.message):
        await callback.answer("Нет прав", show_alert=True)
        return
    
    users = await db.get_users()
    
    keyboard = InlineKeyboardBuilder()
    for user in users[:10]:  # Показываем первые 10 пользователей
        status = ""
        if user.is_banned:
            status = "🚫"
        elif user.is_muted:
            status = "🔇"
        
        keyboard.button(
            text=f"{status} {user.first_name} (@{user.username})",
            callback_data=f"user_{user.user_id}"
        )
    keyboard.button(text="◀️ Назад", callback_data="admin_back")
    keyboard.adjust(1)
    
    await callback.message.edit_text(f"👥 Пользователей: {len(users)}", reply_markup=keyboard.as_markup())

@admin_router.callback_query(F.data.startswith("user_"))
async def user_actions(callback: CallbackQuery):
    if not is_admin(callback.message):
        await callback.answer("Нет прав", show_alert=True)
        return
    
    user_id = int(callback.data.split("_")[1])
    
    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="🚫 Забанить", callback_data=f"ban_{user_id}")
    keyboard.button(text="🔇 Замутить (1 час)", callback_data=f"mute_{user_id}_60")
    keyboard.button(text="🔇 Замутить (1 день)", callback_data=f"mute_{user_id}_1440")
    keyboard.button(text="✅ Разбанить", callback_data=f"unban_{user_id}")
    keyboard.button(text="🔊 Размутить", callback_data=f"unmute_{user_id}")
    keyboard.button(text="◀️ Назад", callback_data="admin_users")
    keyboard.adjust(2)
    
    await callback.message.edit_text("Выберите действие:", reply_markup=keyboard.as_markup())

@admin_router.callback_query(F.data.startswith("ban_"))
async def ban_user_action(callback: CallbackQuery):
    user_id = int(callback.data.split("_")[1])
    await db.ban_user(user_id)
    await callback.answer("Пользователь забанен", show_alert=True)
    await callback.message.delete()

@admin_router.callback_query(F.data.startswith("unban_"))
async def unban_user_action(callback: CallbackQuery):
    user_id = int(callback.data.split("_")[1])
    await db.unban_user(user_id)
    await callback.answer("Пользователь разбанен", show_alert=True)
    await callback.message.delete()

@admin_router.callback_query(F.data.startswith("mute_"))
async def mute_user_action(callback: CallbackQuery):
    _, user_id, minutes = callback.data.split("_")
    await db.mute_user(int(user_id), int(minutes))
    await callback.answer(f"Пользователь замучен на {minutes} минут", show_alert=True)
    await callback.message.delete()

@admin_router.callback_query(F.data.startswith("unmute_"))
async def unmute_user_action(callback: CallbackQuery):
    user_id = int(callback.data.split("_")[1])
    await db.unmute_user(user_id)
    await callback.answer("Пользователь размучен", show_alert=True)
    await callback.message.delete()

@admin_router.callback_query(F.data == "admin_back")
async def admin_back(callback: CallbackQuery):
    await admin_panel(callback.message)

def register_admin_handlers(dp, bot):
    dp.include_router(admin_router)