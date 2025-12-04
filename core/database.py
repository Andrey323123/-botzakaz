from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.future import select
from sqlalchemy import text, create_engine
from core.models import User, Message, GroupSettings, Base
from datetime import datetime, timedelta
import os

# Используем синхронный движок для SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///botzakaz.db")

# Синхронный движок
engine = create_engine(
    DATABASE_URL, 
    echo=False, 
    connect_args={"check_same_thread": False}
)

# Синхронная сессия
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Генератор сессий для зависимостей"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Инициализация базы данных - создание таблиц"""
    # Создаем таблицы синхронно
    Base.metadata.create_all(engine)
    
    # Создаем начальные настройки если их нет
    with SessionLocal() as session:
        result = session.execute(select(GroupSettings))
        settings = result.scalar_one_or_none()
        if not settings:
            settings = GroupSettings()
            session.add(settings)
            session.commit()
    
    return True

def get_or_create_user(user_data: dict):
    """Получить или создать пользователя"""
    with SessionLocal() as session:
        try:
            result = session.execute(
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
                session.commit()
                session.refresh(user)
            return user
        except Exception as e:
            session.rollback()
            raise e

def add_message(user_id: int, message_type: str, content: str = None, file_id: str = None, file_url: str = None):
    """Добавить сообщение"""
    with SessionLocal() as session:
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
            session.commit()
            session.refresh(message)
            return message
        except Exception as e:
            session.rollback()
            raise e

def get_messages(limit: int = 50, offset: int = 0):
    """Получить сообщения"""
    with SessionLocal() as session:
        result = session.execute(
            select(Message)
            .order_by(Message.timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
        messages = result.scalars().all()
        return list(reversed(messages))  # Новые сообщения в конце

def get_users():
    """Получить всех пользователей"""
    with SessionLocal() as session:
        result = session.execute(
            select(User).order_by(User.created_at.desc())
        )
        return result.scalars().all()

def get_user_by_id(user_id: int):
    """Получить пользователя по ID"""
    with SessionLocal() as session:
        result = session.execute(
            select(User).where(User.user_id == user_id)
        )
        return result.scalar_one_or_none()

def ban_user(user_id: int):
    """Забанить пользователя"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_banned = True
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e

def unban_user(user_id: int):
    """Разбанить пользователя"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_banned = False
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e

def mute_user(user_id: int, minutes: int = 60):
    """Замутить пользователя"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_muted = True
                user.mute_until = datetime.utcnow() + timedelta(minutes=minutes)
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e

def unmute_user(user_id: int):
    """Размутить пользователя"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_muted = False
                user.mute_until = None
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e

def get_group_settings():
    """Получить настройки группы"""
    with SessionLocal() as session:
        result = session.execute(
            select(GroupSettings).order_by(GroupSettings.id.desc()).limit(1)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            settings = GroupSettings()
            session.add(settings)
            session.commit()
            session.refresh(settings)
        return settings

def update_group_settings(**kwargs):
    """Обновить настройки группы"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(GroupSettings).order_by(GroupSettings.id.desc()).limit(1)
            )
            settings = result.scalar_one_or_none()
            if not settings:
                settings = GroupSettings()
            
            for key, value in kwargs.items():
                if hasattr(settings, key):
                    setattr(settings, key, value)
            
            session.add(settings)
            session.commit()
            session.refresh(settings)
            return settings
        except Exception as e:
            session.rollback()
            raise e

def get_message_count(user_id: int = None):
    """Получить количество сообщений"""
    with SessionLocal() as session:
        if user_id:
            result = session.execute(
                select(Message).where(Message.user_id == user_id)
            )
        else:
            result = session.execute(select(Message))
        
        messages = result.scalars().all()
        return len(messages)

def get_active_users(hours: int = 24):
    """Получить активных пользователей за последние N часов"""
    with SessionLocal() as session:
        time_threshold = datetime.utcnow() - timedelta(hours=hours)
        result = session.execute(
            select(User).join(Message).where(Message.timestamp >= time_threshold).distinct()
        )
        return result.scalars().all()
