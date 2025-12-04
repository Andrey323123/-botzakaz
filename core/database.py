from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select
from core.models import User, Message, GroupSettings
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL").replace("sqlite://", "sqlite+aiosqlite://")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_session():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: sync_conn.execute("PRAGMA foreign_keys=ON"))

async def get_or_create_user(user_data: dict):
    async with AsyncSessionLocal() as session:
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

async def add_message(user_id: int, message_type: str, content: str = None, file_id: str = None, file_url: str = None):
    async with AsyncSessionLocal() as session:
        message = Message(
            user_id=user_id,
            message_type=message_type,
            content=content,
            file_id=file_id,
            file_url=file_url
        )
        session.add(message)
        await session.commit()
        return message

async def get_messages(limit: int = 50, offset: int = 0):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Message).order_by(Message.timestamp.desc()).limit(limit).offset(offset)
        )
        messages = result.scalars().all()
        return list(reversed(messages))  # Новые сообщения в конце

async def get_users():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).order_by(User.created_at.desc())
        )
        return result.scalars().all()

async def ban_user(user_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.user_id == user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.is_banned = True
            await session.commit()
            return True
        return False

async def unban_user(user_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.user_id == user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.is_banned = False
            await session.commit()
            return True
        return False

async def mute_user(user_id: int, minutes: int = 60):
    async with AsyncSessionLocal() as session:
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

async def unmute_user(user_id: int):
    async with AsyncSessionLocal() as session:
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

async def get_group_settings():
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