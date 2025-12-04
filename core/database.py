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
                logger.info(f"✅ Создан новый пользователь: ID={user.id}, user_id={user.user_id}, username={user.username}")
            else:
                # Обновляем данные существующего пользователя
                updated = False
                if user.username != user_data.get('username') and user_data.get('username'):
                    user.username = user_data.get('username')
                    updated = True
                if user.first_name != user_data.get('first_name') and user_data.get('first_name'):
                    user.first_name = user_data.get('first_name')
                    updated = True
                if user.last_name != user_data.get('last_name') and user_data.get('last_name'):
                    user.last_name = user_data.get('last_name')
                    updated = True
                if user_data.get('photo_url') and user.photo_url != user_data.get('photo_url'):
                    user.photo_url = user_data.get('photo_url')
                    updated = True
                
                if updated:
                    session.commit()
                    session.refresh(user)
                    logger.info(f"✅ Обновлен существующий пользователь: ID={user.id}, user_id={user.user_id}")
                else:
                    logger.info(f"✅ Найден существующий пользователь: ID={user.id}, user_id={user.user_id}")
            
            return user
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при работе с пользователем: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при работе с пользователем: {e}", exc_info=True)
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
            logger.info(f"✅ Сообщение добавлено: ID={message.id}, user_id={user_id}, type={message_type}, content={content[:50] if content else 'None'}...")
            return message
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при добавлении сообщения: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при добавлении сообщения: {e}", exc_info=True)
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
            logger.debug(f"📨 Получено {len(messages)} сообщений из БД")
            return list(reversed(messages))  # Новые сообщения в конце
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении сообщений: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении сообщений: {e}", exc_info=True)
        return []

def get_users():
    """Получить всех пользователей"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(User).order_by(User.created_at.desc())
            )
            users = result.scalars().all()
            logger.debug(f"👥 Получено {len(users)} пользователей из БД")
            return users
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении пользователей: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении пользователей: {e}", exc_info=True)
        return []

def get_user_by_id(user_id: int):
    """Получить пользователя по ID"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                logger.debug(f"👤 Найден пользователь: ID={user.id}, user_id={user.user_id}, username={user.username}")
            else:
                logger.debug(f"👤 Пользователь с user_id={user_id} не найден")
            return user
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при поиске пользователя: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при поиске пользователя: {e}", exc_info=True)
        return None

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
            logger.error(f"❌ Ошибка SQLAlchemy при бане пользователя: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при бане пользователя: {e}", exc_info=True)
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
            logger.error(f"❌ Ошибка SQLAlchemy при разбане пользователя: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при разбане пользователя: {e}", exc_info=True)
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
            logger.error(f"❌ Ошибка SQLAlchemy при муте пользователя: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при муте пользователя: {e}", exc_info=True)
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
            logger.error(f"❌ Ошибка SQLAlchemy при размуте пользователя: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при размуте пользователя: {e}", exc_info=True)
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
        logger.error(f"❌ Ошибка SQLAlchemy при получении настроек: {e}", exc_info=True)
        raise e
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении настроек: {e}", exc_info=True)
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
            logger.error(f"❌ Ошибка SQLAlchemy при обновлении настроек: {e}", exc_info=True)
            raise e
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при обновлении настроек: {e}", exc_info=True)
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
            logger.debug(f"📊 Получено количество сообщений: {count} для user_id={user_id if user_id else 'all'}")
            return count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при подсчете сообщений: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при подсчете сообщений: {e}", exc_info=True)
        return 0

def get_active_users(hours: int = 24):
    """Получить активных пользователей за последние N часов"""
    try:
        with SessionLocal() as session:
            time_threshold = datetime.utcnow() - timedelta(hours=hours)
            result = session.execute(
                select(User).join(Message).where(Message.timestamp >= time_threshold).distinct()
            )
            users = result.scalars().all()
            logger.debug(f"👥 Получено активных пользователей: {len(users)} за последние {hours} часов")
            return users
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении активных пользователей: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении активных пользователей: {e}", exc_info=True)
        return []

# ===== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ОТЛАДКИ И УЛУЧШЕНИЯ =====

def clear_all_messages():
    """Очистить все сообщения (для тестирования)"""
    try:
        with SessionLocal() as session:
            result = session.execute(text("DELETE FROM messages"))
            session.commit()
            deleted_count = result.rowcount
            logger.info(f"🧹 Удалено {deleted_count} сообщений")
            return deleted_count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при очистке сообщений: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при очистке сообщений: {e}", exc_info=True)
        return 0

def clear_all_users():
    """Очистить всех пользователей (для тестирования)"""
    try:
        with SessionLocal() as session:
            # Сначала удаляем сообщения пользователей
            session.execute(text("DELETE FROM messages"))
            # Затем удаляем пользователей
            result = session.execute(text("DELETE FROM users"))
            session.commit()
            deleted_count = result.rowcount
            logger.info(f"🧹 Удалено {deleted_count} пользователей")
            return deleted_count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при очистке пользователей: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при очистке пользователей: {e}", exc_info=True)
        return 0

def get_total_messages_count():
    """Получить общее количество сообщений"""
    try:
        with SessionLocal() as session:
            result = session.execute(text("SELECT COUNT(*) FROM messages"))
            count = result.scalar_one()
            logger.debug(f"📊 Общее количество сообщений: {count}")
            return count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при подсчете сообщений: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при подсчете сообщений: {e}", exc_info=True)
        return 0

def get_total_users_count():
    """Получить общее количество пользователей"""
    try:
        with SessionLocal() as session:
            result = session.execute(text("SELECT COUNT(*) FROM users"))
            count = result.scalar_one()
            logger.debug(f"👥 Общее количество пользователей: {count}")
            return count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при подсчете пользователей: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при подсчете пользователей: {e}", exc_info=True)
        return 0

def get_recent_messages(hours: int = 24):
    """Получить сообщения за последние N часов"""
    try:
        with SessionLocal() as session:
            time_threshold = datetime.utcnow() - timedelta(hours=hours)
            result = session.execute(
                select(Message)
                .where(Message.timestamp >= time_threshold)
                .order_by(Message.timestamp.desc())
            )
            messages = result.scalars().all()
            logger.debug(f"📨 Получено {len(messages)} сообщений за последние {hours} часов")
            return messages
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении сообщений: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении сообщений: {e}", exc_info=True)
        return []

def update_user_last_seen(user_id: int):
    """Обновить время последней активности пользователя"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.last_seen = datetime.utcnow()
                session.commit()
                logger.debug(f"⏰ Обновлено время активности для user_id={user_id}")
                return True
            return False
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при обновлении активности: {e}", exc_info=True)
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при обновлении активности: {e}", exc_info=True)
            return False

def get_message_by_id(message_id: int):
    """Получить сообщение по ID"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(Message).where(Message.id == message_id)
            )
            message = result.scalar_one_or_none()
            if message:
                logger.debug(f"📝 Найдено сообщение: ID={message.id}, user_id={message.user_id}")
            return message
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при поиске сообщения: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при поиске сообщения: {e}", exc_info=True)
        return None

def delete_message(message_id: int):
    """Удалить сообщение по ID"""
    with SessionLocal() as session:
        try:
            result = session.execute(
                select(Message).where(Message.id == message_id)
            )
            message = result.scalar_one_or_none()
            if message:
                session.delete(message)
                session.commit()
                logger.info(f"🗑️ Удалено сообщение: ID={message_id}")
                return True
            logger.warning(f"⚠️ Сообщение для удаления не найдено: ID={message_id}")
            return False
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"❌ Ошибка SQLAlchemy при удалении сообщения: {e}", exc_info=True)
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Неизвестная ошибка при удалении сообщения: {e}", exc_info=True)
            return False

def get_user_stats(user_id: int):
    """Получить статистику пользователя"""
    try:
        with SessionLocal() as session:
            # Получаем пользователя
            user_result = session.execute(
                select(User).where(User.user_id == user_id)
            )
            user = user_result.scalar_one_or_none()
            
            if not user:
                return None
            
            # Считаем сообщения по типам
            text_count_result = session.execute(
                select(Message)
                .where(Message.user_id == user_id, Message.message_type == 'text')
            )
            text_count = len(text_count_result.scalars().all())
            
            photo_count_result = session.execute(
                select(Message)
                .where(Message.user_id == user_id, Message.message_type == 'photo')
            )
            photo_count = len(photo_count_result.scalars().all())
            
            voice_count_result = session.execute(
                select(Message)
                .where(Message.user_id == user_id, Message.message_type == 'voice')
            )
            voice_count = len(voice_count_result.scalars().all())
            
            document_count_result = session.execute(
                select(Message)
                .where(Message.user_id == user_id, Message.message_type == 'document')
            )
            document_count = len(document_count_result.scalars().all())
            
            # Первое и последнее сообщение
            first_message_result = session.execute(
                select(Message)
                .where(Message.user_id == user_id)
                .order_by(Message.timestamp.asc())
                .limit(1)
            )
            first_message = first_message_result.scalar_one_or_none()
            
            last_message_result = session.execute(
                select(Message)
                .where(Message.user_id == user_id)
                .order_by(Message.timestamp.desc())
                .limit(1)
            )
            last_message = last_message_result.scalar_one_or_none()
            
            stats = {
                'user': user,
                'total_messages': text_count + photo_count + voice_count + document_count,
                'text_messages': text_count,
                'photo_messages': photo_count,
                'voice_messages': voice_count,
                'document_messages': document_count,
                'first_message_date': first_message.timestamp if first_message else None,
                'last_message_date': last_message.timestamp if last_message else None,
                'is_online': user.last_seen and (datetime.utcnow() - user.last_seen).total_seconds() < 300 if user.last_seen else False
            }
            
            logger.debug(f"📊 Статистика пользователя {user_id}: {stats['total_messages']} сообщений")
            return stats
            
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении статистики: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении статистики: {e}", exc_info=True)
        return None

def search_messages(query: str, limit: int = 50):
    """Поиск сообщений по тексту"""
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(Message)
                .where(Message.content.ilike(f'%{query}%'))
                .order_by(Message.timestamp.desc())
                .limit(limit)
            )
            messages = result.scalars().all()
            logger.info(f"🔍 Найдено {len(messages)} сообщений по запросу '{query}'")
            return messages
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при поиске сообщений: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при поиске сообщений: {e}", exc_info=True)
        return []

def get_database_stats():
    """Получить общую статистику базы данных"""
    try:
        with SessionLocal() as session:
            # Размер базы данных
            db_size = 0
            if os.path.exists("botzakaz.db"):
                db_size = os.path.getsize("botzakaz.db")
            
            # Статистика по таблицам
            tables = ['users', 'messages', 'group_settings']
            table_stats = {}
            
            for table in tables:
                count_result = session.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = count_result.scalar_one()
                table_stats[table] = count
            
            stats = {
                'database_size_bytes': db_size,
                'database_size_mb': db_size / 1024 / 1024,
                'table_stats': table_stats,
                'last_updated': datetime.utcnow().isoformat()
            }
            
            logger.info(f"📊 Статистика БД: {table_stats}, размер: {db_size / 1024 / 1024:.2f} MB")
            return stats
            
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при получении статистики БД: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при получении статистики БД: {e}", exc_info=True)
        return None

def test_database_connection():
    """Тест подключения к базе данных"""
    try:
        with SessionLocal() as session:
            # Простой запрос для проверки соединения
            result = session.execute(text("SELECT 1"))
            test_result = result.scalar_one()
            
            if test_result == 1:
                logger.info("✅ Подключение к базе данных успешно")
                return True
            else:
                logger.error("❌ Неожиданный результат теста БД")
                return False
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка подключения к БД: {e}", exc_info=True)
        return False
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при тесте БД: {e}", exc_info=True)
        return False

def backup_database():
    """Создать резервную копию базы данных"""
    try:
        import shutil
        import time
        
        if not os.path.exists("botzakaz.db"):
            logger.error("❌ Файл базы данных не найден")
            return False
        
        timestamp = int(time.time())
        backup_filename = f"botzakaz_backup_{timestamp}.db"
        shutil.copy2("botzakaz.db", backup_filename)
        
        logger.info(f"✅ Резервная копия создана: {backup_filename}")
        return backup_filename
    except Exception as e:
        logger.error(f"❌ Ошибка создания резервной копии: {e}", exc_info=True)
        return False

def restore_database(backup_filename: str):
    """Восстановить базу данных из резервной копии"""
    try:
        if not os.path.exists(backup_filename):
            logger.error(f"❌ Файл резервной копии не найден: {backup_filename}")
            return False
        
        # Создаем резервную копию текущей БД
        import shutil
        import time
        current_backup = f"botzakaz_pre_restore_{int(time.time())}.db"
        if os.path.exists("botzakaz.db"):
            shutil.copy2("botzakaz.db", current_backup)
        
        # Восстанавливаем из резервной копии
        shutil.copy2(backup_filename, "botzakaz.db")
        
        logger.info(f"✅ База данных восстановлена из: {backup_filename}")
        logger.info(f"📁 Текущая БД сохранена как: {current_backup}")
        return True
    except Exception as e:
        logger.error(f"❌ Ошибка восстановления БД: {e}", exc_info=True)
        return False

def cleanup_old_messages(days: int = 30):
    """Очистить старые сообщения (старше N дней)"""
    try:
        with SessionLocal() as session:
            time_threshold = datetime.utcnow() - timedelta(days=days)
            result = session.execute(
                text("DELETE FROM messages WHERE timestamp < :threshold")
                .bindparams(threshold=time_threshold)
            )
            deleted_count = result.rowcount
            session.commit()
            
            logger.info(f"🧹 Удалено {deleted_count} сообщений старше {days} дней")
            return deleted_count
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при очистке сообщений: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при очистке сообщений: {e}", exc_info=True)
        return 0

def cleanup_inactive_users(days: int = 90):
    """Очистить неактивных пользователей (без сообщений старше N дней)"""
    try:
        with SessionLocal() as session:
            time_threshold = datetime.utcnow() - timedelta(days=days)
            
            # Находим пользователей без сообщений
            inactive_users = session.execute(
                text("""
                    SELECT u.id FROM users u 
                    LEFT JOIN messages m ON u.user_id = m.user_id 
                    WHERE m.id IS NULL 
                    OR (m.timestamp < :threshold AND u.user_id NOT IN (
                        SELECT DISTINCT user_id FROM messages WHERE timestamp >= :threshold
                    ))
                """).bindparams(threshold=time_threshold)
            )
            
            user_ids = [row[0] for row in inactive_users]
            
            if user_ids:
                # Удаляем пользователей
                result = session.execute(
                    text("DELETE FROM users WHERE id IN :user_ids")
                    .bindparams(user_ids=tuple(user_ids))
                )
                deleted_count = result.rowcount
                session.commit()
                logger.info(f"🧹 Удалено {deleted_count} неактивных пользователей")
                return deleted_count
            
            logger.info("⚠️ Неактивных пользователей для очистки не найдено")
            return 0
    except SQLAlchemyError as e:
        logger.error(f"❌ Ошибка SQLAlchemy при очистке пользователей: {e}", exc_info=True)
        return 0
    except Exception as e:
        logger.error(f"❌ Неизвестная ошибка при очистке пользователей: {e}", exc_info=True)
        return 0

# Экспорт всех функций для использования
__all__ = [
    'get_db',
    'init_db',
    'get_or_create_user',
    'add_message',
    'get_messages',
    'get_users',
    'get_user_by_id',
    'ban_user',
    'unban_user',
    'mute_user',
    'unmute_user',
    'get_group_settings',
    'update_group_settings',
    'get_message_count',
    'get_active_users',
    'clear_all_messages',
    'clear_all_users',
    'get_total_messages_count',
    'get_total_users_count',
    'get_recent_messages',
    'update_user_last_seen',
    'get_message_by_id',
    'delete_message',
    'get_user_stats',
    'search_messages',
    'get_database_stats',
    'test_database_connection',
    'backup_database',
    'restore_database',
    'cleanup_old_messages',
    'cleanup_inactive_users'
]
