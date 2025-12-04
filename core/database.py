import logging
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.future import select
from sqlalchemy import text, create_engine
from sqlalchemy.exc import SQLAlchemyError
from core.models import User, Message, GroupSettings, Base
from datetime import datetime, timedelta
import os

# Настройка логирования
logger = logging.getLogger(__name__)

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
    try:
        # Создаем таблицы синхронно
        Base.metadata.create_all(engine)
        logger.info("✅ Таблицы базы данных созданы")
        
        # Создаем начальные настройки если их нет
        with SessionLocal() as session:
            result = session.execute(select(GroupSettings))
            settings = result.scalar_one_or_none()
            if not settings:
                settings = GroupSettings()
                session.add(settings)
                session.commit()
                logger.info("✅ Начальные настройки группы созданы")
        
        logger.info("✅ База данных успешно инициализирована")
        return True
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при инициализации БД: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при инициализации БД: {e}")
        raise e

def get_or_create_user(user_data: dict):
    """Получить или создать пользователя"""
    with SessionLocal() as session:
        try:
            # Проверяем существование пользователя
            result = session.execute(
                select(User).where(User.user_id == user_data['id'])
            )
            user = result.scalar_one_or_none()
            
            if not user:
                # Создаем нового пользователя
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
                logger.info(f"✅ Создан новый пользователь: ID={user.id}, username={user.username}")
            else:
                # Обновляем данные существующего пользователя
                if user.username != user_data.get('username') or \
                   user.first_name != user_data.get('first_name') or \
                   user.last_name != user_data.get('last_name'):
                    user.username = user_data.get('username')
                    user.first_name = user_data.get('first_name')
                    user.last_name = user_data.get('last_name')
                    session.commit()
                    session.refresh(user)
                    logger.info(f"✅ Обновлен существующий пользователь: ID={user.id}")
                else:
                    logger.info(f"✅ Найден существующий пользователь: ID={user.id}")
            
            return user
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при работе с пользователем: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при работе с пользователем: {e}")
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
            logger.info(f"✅ Сообщение добавлено: ID={message.id}, тип={message_type}")
            return message
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при добавлении сообщения: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при добавлении сообщения: {e}")
            raise e

def get_messages(limit: int = 50, offset: int = 0):
    """Получить сообщения"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(Message)
                .order_by(Message.timestamp.desc())
                .limit(limit)
                .offset(offset)
            )
            messages = result.scalars().all()
            logger.info(f"✅ Получено {len(messages)} сообщений")
            return list(reversed(messages))  # Новые сообщения в конце
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении сообщений: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении сообщений: {e}")
        raise e

def get_users():
    """Получить всех пользователей"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(User).order_by(User.created_at.desc())
            )
            users = result.scalars().all()
            logger.info(f"✅ Получено {len(users)} пользователей")
            return users
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении пользователей: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении пользователей: {e}")
        raise e

def get_user_by_id(user_id: int):
    """Получить пользователя по ID"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                logger.info(f"✅ Найден пользователь: ID={user.id}")
            else:
                logger.info(f"⚠️ Пользователь не найден: user_id={user_id}")
            return user
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при поиске пользователя: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при поиске пользователя: {e}")
        raise e

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
                logger.info(f"✅ Пользователь забанен: ID={user.id}")
                return True
            logger.warning(f"⚠️ Пользователь для бана не найден: user_id={user_id}")
            return False
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при бане пользователя: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при бане пользователя: {e}")
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
                logger.info(f"✅ Пользователь разбанен: ID={user.id}")
                return True
            logger.warning(f"⚠️ Пользователь для разбана не найден: user_id={user_id}")
            return False
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при разбане пользователя: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при разбане пользователя: {e}")
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
                logger.info(f"✅ Пользователь замучен на {minutes} минут: ID={user.id}")
                return True
            logger.warning(f"⚠️ Пользователь для мута не найден: user_id={user_id}")
            return False
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при муте пользователя: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при муте пользователя: {e}")
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
                logger.info(f"✅ Пользователь размучен: ID={user.id}")
                return True
            logger.warning(f"⚠️ Пользователь для размута не найден: user_id={user_id}")
            return False
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при размуте пользователя: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при размуте пользователя: {e}")
            raise e

def get_group_settings():
    """Получить настройки группы"""
    try:
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
                logger.info("✅ Созданы настройки группы по умолчанию")
            return settings
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении настроек: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении настроек: {e}")
        raise e

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
            logger.info(f"✅ Настройки группы обновлены: {list(kwargs.keys())}")
            return settings
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при обновлении настроек: {e}")
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при обновлении настроек: {e}")
            raise e

def get_message_count(user_id: int = None):
    """Получить количество сообщений"""
    try:
        with SessionLocal() as session:
            if user_id:
                result = session.execute(
                    select(Message).where(Message.user_id == user_id)
                )
            else:
                result = session.execute(select(Message))
            
            messages = result.scalars().all()
            count = len(messages)
            logger.info(f"✅ Получено количество сообщений: {count}")
            return count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при подсчете сообщений: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при подсчете сообщений: {e}")
        raise e

def get_active_users(hours: int = 24):
    """Получить активных пользователей за последние N часов"""
    try:
        with SessionLocal() as session:
            time_threshold = datetime.utcnow() - timedelta(hours=hours)
            result = session.execute(
                select(User).join(Message).where(Message.timestamp >= time_threshold).distinct()
            )
            users = result.scalars().all()
            logger.info(f"✅ Получено активных пользователей: {len(users)} за последние {hours} часов")
            return users
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении активных пользователей: {e}")
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении активных пользователей: {e}")
        raise e
