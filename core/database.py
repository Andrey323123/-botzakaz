from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select
from sqlalchemy import text
from core.models import User, Message, GroupSettings, Base
from datetime import datetime, timedelta
import os
from sqlalchemy import create_engine

# Используем aiosqlite для асинхронного SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///botzakaz.db")
engine = create_async_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Синхронный движок для создания таблиц
SYNC_DATABASE_URL = DATABASE_URL.replace("+aiosqlite", "")
sync_engine = create_engine(SYNC_DATABASE_URL)

async def get_session():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    """Инициализация базы данных - создание таблиц"""
    # Создаем таблицы синхронно
    Base.metadata.create_all(sync_engine)
    
    # Создаем начальные настройки если их нет
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GroupSettings))
        settings = result.scalar_one_or_none()
        if not settings:
            settings = GroupSettings()
            session.add(settings)
            await session.commit()
    
    return True

async def get_or_create_user(user_data: dict):
    """Получить или создать пользователя"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User).where(User.user_id == user_data['id'])
            )
            user = result.scalar_one_or_none()
            
            if not user:
                user = User(
                    user_id=user_data['id'],
                    username=user_data.get('username'),
                    first_name=user_data.get('first_name'),
                    last_name=user_data.get('last_name'),
                    photo_url=user_data.get('photo_url')
                )
                session.add(user)
                await session.commit()
                await session.refresh(user)
            return user
        except Exception as e:
            await session.rollback()
            raise e

async def add_message(user_id: int, message_type: str, content: str = None, file_id: str = None, file_url: str = None):
    """Добавить сообщение"""
    async with AsyncSessionLocal() as session:
        try:
            message = Message(
                user_id=user_id,
                message_type=message_type,
                content=content,
                file_id=file_id,
                file_url=file_url,
                timestamp=datetime.utcnow()
            )
            session.add(message)
            await session.commit()
            await session.refresh(message)
            return message
        except Exception as e:
            await session.rollback()
            raise e

async def get_messages(limit: int = 50, offset: int = 0):
    """Получить сообщения"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Message)
            .order_by(Message.timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
        messages = result.scalars().all()
        return list(reversed(messages))  # Новые сообщения в конце

async def get_users():
    """Получить всех пользователей"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).order_by(User.created_at.desc())
        )
        return result.scalars().all()

async def get_user_by_id(user_id: int):
    """Получить пользователя по ID"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.user_id == user_id)
        )
        return result.scalar_one_or_none()

async def ban_user(user_id: int):
    """Забанить пользователя"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_banned = True
                await session.commit()
                return True
            return False
        except Exception as e:
            await session.rollback()
            raise e

async def unban_user(user_id: int):
    """Разбанить пользователя"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_banned = False
                await session.commit()
                return True
            return False
        except Exception as e:
            await session.rollback()
            raise e

async def mute_user(user_id: int, minutes: int = 60):
    """Замутить пользователя"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_muted = True
                user.mute_until = datetime.utcnow() + timedelta(minutes=minutes)
                await session.commit()
                return True
            return False
        except Exception as e:
            await session.rollback()
            raise e

async def unmute_user(user_id: int):
    """Размутить пользователя"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_muted = False
                user.mute_until = None
                await session.commit()
                return True
            return False
        except Exception as e:
            await session.rollback()
            raise e

async def get_group_settings():
    """Получить настройки группы"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GroupSettings).order_by(GroupSettings.id.desc()).limit(1)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            settings = GroupSettings()
            session.add(settings)
            await session.commit()
            await session.refresh(settings)
        return settings

async def update_group_settings(**kwargs):
    """Обновить настройки группы"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(GroupSettings).order_by(GroupSettings.id.desc()).limit(1)
            )
            settings = result.scalar_one_or_none()
            if not settings:
                settings = GroupSettings()
            
            for key, value in kwargs.items():
                if hasattr(settings, key):
                    setattr(settings, key, value)
            
            session.add(settings)
            await session.commit()
            await session.refresh(settings)
            return settings
        except Exception as e:
            await session.rollback()
            raise e

async def get_message_count(user_id: int = None):
    """Получить количество сообщений"""
    async with AsyncSessionLocal() as session:
        if user_id:
            result = await session.execute(
                select(Message).where(Message.user_id == user_id)
            )
        else:
            result = await session.execute(select(Message))
        
        messages = result.scalars().all()
        return len(messages)

async def get_active_users(hours: int = 24):
    """Получить активных пользователей за последние N часов"""
    async with AsyncSessionLocal() as session:
        time_threshold = datetime.utcnow() - timedelta(hours=hours)
        result = await session.execute(
            select(User).join(Message).where(Message.timestamp >= time_threshold).distinct()
        )
        return result.scalars().all()
