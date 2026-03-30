import sqlite3

from db import SessionLocal

from models import Topic, Note



sqlite_conn = sqlite3.connect("classroom.db")

sqlite_conn.row_factory = sqlite3.Row

cur = sqlite_conn.cursor()



db = SessionLocal()



# migrate valid topics

cur.execute("""

SELECT t.*

FROM topics t

JOIN classes c ON c.id = t.class_id

ORDER BY t.id

""")

for row in cur.fetchall():

    data = dict(row)

    db.add(Topic(

        id=data["id"],

        class_id=data.get("class_id"),

        name=data.get("name"),

    ))

db.commit()



# migrate valid notes

cur.execute("""

SELECT n.*

FROM notes n

JOIN classes c ON c.id = n.class_id

JOIN topics t ON t.id = n.topic_id

ORDER BY n.id

""")

for row in cur.fetchall():

    data = dict(row)

    db.add(Note(

        id=data["id"],

        class_id=data.get("class_id"),

        topic_id=data.get("topic_id"),

        filename=data.get("filename"),

        stored_path=data.get("stored_path"),

        whiteboard_state_id=data.get("whiteboard_state_id"),

        uploaded_at=data.get("uploaded_at"),

    ))

db.commit()



print("Migrated topics and notes")
