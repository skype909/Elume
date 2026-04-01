import sqlite3
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = r"C:\Elume_backend_copy\classroom_backup.db"
POSTGRES_URL = os.getenv("DATABASE_URL")

# Connect to SQLite
sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_cursor = sqlite_conn.cursor()

# Connect to Postgres
pg_engine = create_engine(POSTGRES_URL)

# Fetch all calendar events from SQLite
sqlite_cursor.execute("""
SELECT id, class_id, title, description,
       event_date, end_date, all_day,
       event_type, created_at, owner_user_id
FROM calendar_events
""")
rows = sqlite_cursor.fetchall()

print(f"Found {len(rows)} calendar events in SQLite")

with pg_engine.begin() as conn:
    # Clear existing data
    conn.execute(text("DELETE FROM calendar_events"))
    print("Cleared existing PostgreSQL calendar events")

    # Insert rows
    for row in rows:
        id_, class_id, title, description, event_date, end_date, all_day, event_type, created_at, owner_user_id = row

        # Convert SQLite int → Postgres boolean
        all_day_bool = bool(all_day)

        conn.execute(text("""
            INSERT INTO calendar_events (
                id, class_id, title, description,
                event_date, end_date, all_day,
                event_type, created_at, owner_user_id
            )
            VALUES (
                :id, :class_id, :title, :description,
                :event_date, :end_date, :all_day,
                :event_type, :created_at, :owner_user_id
            )
        """), {
            "id": id_,
            "class_id": class_id,
            "title": title,
            "description": description,
            "event_date": event_date,
            "end_date": end_date,
            "all_day": all_day_bool,
            "event_type": event_type,
            "created_at": created_at,
            "owner_user_id": owner_user_id
        })

    print(f"Inserted {len(rows)} calendar events into PostgreSQL")

    # Reset sequence
    conn.execute(text("""
        SELECT setval('calendar_events_id_seq', (SELECT MAX(id) FROM calendar_events));
    """))

    print("Reset Postgres sequence")

print("Migration complete ✅")