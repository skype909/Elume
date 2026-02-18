from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Always store the DB beside this file (backend/db.py)
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classroom.db"

# Windows-safe SQLite URL
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
