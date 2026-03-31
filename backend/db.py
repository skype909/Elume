import os

from dotenv import load_dotenv

from pathlib import Path

from sqlalchemy import create_engine

from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

DB_PATH = BASE_DIR / "classroom.db"



DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:

    DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"



connect_args = {}

if DATABASE_URL.startswith("sqlite"):

    connect_args = {"check_same_thread": False}



engine = create_engine(

    DATABASE_URL,

    connect_args=connect_args,

)



SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
