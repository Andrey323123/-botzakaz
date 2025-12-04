from sqlalchemy import create_engine
from core.models import Base
import os
from dotenv import load_dotenv

load_dotenv()

def init_database():
    engine = create_engine(os.getenv("DATABASE_URL"))
    Base.metadata.create_all(engine)
    print("Database initialized successfully")