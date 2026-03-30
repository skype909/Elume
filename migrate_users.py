import sqlite3

from db import SessionLocal

from models import UserModel



sqlite_conn = sqlite3.connect("classroom.db")

sqlite_cursor = sqlite_conn.cursor()



db = SessionLocal()



sqlite_cursor.execute("SELECT * FROM users")

rows = sqlite_cursor.fetchall()

columns = [col[0] for col in sqlite_cursor.description]



count = 0



for row in rows:

    data = dict(zip(columns, row))



    existing = db.query(UserModel).filter_by(email=data["email"]).first()

    if existing:

        continue



    user = UserModel(**data)

    db.add(user)

    count += 1



db.commit()



print("Migrated", count, "users")
