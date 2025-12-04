import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from core.models import Base

def init_database():
    """Инициализация базы данных"""
    print("🗄️  Инициализация базы данных...")
    
    try:
        engine = create_engine("sqlite:///botzakaz.db")
        Base.metadata.create_all(engine)
        
        print("✅ База данных успешно создана!")
        print(f"📁 Файл базы данных: {os.path.abspath('botzakaz.db')}")
        
        return True
    except Exception as e:
        print(f"❌ Ошибка создания базы данных: {e}")
        return False

if __name__ == "__main__":
    init_database()