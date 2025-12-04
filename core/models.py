from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger, unique=True, nullable=False)
    username = Column(String(100))
    first_name = Column(String(100))
    last_name = Column(String(100))
    photo_url = Column(String(500))
    is_banned = Column(Boolean, default=False)
    is_muted = Column(Boolean, default=False)
    mute_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    messages = relationship("Message", back_populates="user")

class Message(Base):
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'))
    message_type = Column(String(20))  # text, photo, voice, document
    content = Column(Text)
    file_id = Column(String(500))
    file_url = Column(String(500))
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="messages")

class GroupSettings(Base):
    __tablename__ = 'group_settings'
    
    id = Column(Integer, primary_key=True)
    group_name = Column(String(100), default="Telegram Chat")
    welcome_message = Column(Text, default="Добро пожаловать в чат!")
    max_file_size = Column(Integer, default=20971520)  # 20MB
    allow_photos = Column(Boolean, default=True)
    allow_voices = Column(Boolean, default=True)
    allow_documents = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
