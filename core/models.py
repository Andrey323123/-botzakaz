import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from bot.admin import register_admin_handlers
from bot.webapp import setup_webapp
from core.database import init_db
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)

async def main():
    bot = Bot(
        token=os.getenv("BOT_TOKEN"),
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    dp = Dispatcher()

    # Инициализация базы данных
    await init_db()
    
    # Настройка веб-приложения
    setup_webapp(dp, bot)
    
    # Регистрация административных команд
    register_admin_handlers(dp, bot)
    
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())