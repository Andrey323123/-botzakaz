from aiogram import Dispatcher, Bot
from aiogram.types import WebAppInfo, Message
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder

def setup_webapp(dp: Dispatcher, bot: Bot):
    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        keyboard = InlineKeyboardBuilder()
        keyboard.button(
            text="📱 Открыть мини-приложение",
            web_app=WebAppInfo(url=f"https://ваш_домен/index.html?user_id={message.from_user.id}")
        )
        
        await message.answer(
            "Добро пожаловать в Telegram Chat!\n\n"
            "Нажмите кнопку ниже, чтобы открыть мини-приложение:",
            reply_markup=keyboard.as_markup()
        )
    
    @dp.message(Command("chat"))
    async def cmd_chat(message: Message):
        keyboard = InlineKeyboardBuilder()
        keyboard.button(
            text="💬 Открыть чат",
            web_app=WebAppInfo(url=f"https://ваш_домен/index.html?user_id={message.from_user.id}")
        )
        
        await message.answer(
            "Нажмите кнопку, чтобы открыть чат:",
            reply_markup=keyboard.as_markup()
        )