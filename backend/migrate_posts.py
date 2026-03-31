import sqlite3
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = r"C:\Elume_backend_copy\classroom_backup.db"
POSTGRES_URL = os.getenv("DATABASE_URL")

# Connect
sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_cursor = sqlite_conn.cursor()

pg_engine = create_engine(POSTGRES_URL)

# Load posts from SQLite
sqlite_cursor.execute("""
SELECT id, class_id, author, content, links, created_at
FROM posts
""")
rows = sqlite_cursor.fetchall()

print(f"Found {len(rows)} posts in SQLite")

with pg_engine.begin() as conn:
    # 🔥 Step 1: clear existing posts
    conn.execute(text("DELETE FROM posts"))
    print("Cleared existing PostgreSQL posts")

    # 🔥 Step 2: insert all rows
    for row in rows:
        id_, class_id, author, content, links, created_at = row

        conn.execute(text("""
            INSERT INTO posts (id, class_id, author, content, links, created_at)
            VALUES (:id, :class_id, :author, :content, :links, :created_at)
        """), {
            "id": id_,
            "class_id": class_id,
            "author": author,
            "content": content,
            "links": links,
            "created_at": created_at
        })

    print(f"Inserted {len(rows)} posts into PostgreSQL")

    # 🔥 Step 3: fix ID sequence
    conn.execute(text("""
        SELECT setval('posts_id_seq', (SELECT MAX(id) FROM posts));
    """))

    print("Reset Postgres sequence")

print("Migration complete ✅")