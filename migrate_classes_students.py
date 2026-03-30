import sqlite3

from db import SessionLocal

from models import ClassModel, StudentModel



sqlite_conn = sqlite3.connect("classroom.db")

sqlite_cursor = sqlite_conn.cursor()



db = SessionLocal()



# migrate classes

sqlite_cursor.execute("SELECT * FROM classes")

class_rows = sqlite_cursor.fetchall()

class_cols = [col[0] for col in sqlite_cursor.description]



class_map = {}

class_count = 0



for row in class_rows:

    data = dict(zip(class_cols, row))



    new_class = ClassModel(

        owner_user_id=data.get("owner_user_id"),

        name=data.get("name"),

        subject=data.get("subject"),

        color=data.get("color"),

        preferred_exam_subject=data.get("preferred_exam_subject"),

        class_code=data.get("class_code"),

        class_pin=data.get("class_pin"),

    )



    db.add(new_class)

    db.flush()



    class_map[data["id"]] = new_class.id

    class_count += 1



# migrate students

sqlite_cursor.execute("SELECT * FROM students")

student_rows = sqlite_cursor.fetchall()

student_cols = [col[0] for col in sqlite_cursor.description]



student_count = 0



for row in student_rows:

    data = dict(zip(student_cols, row))



    new_student = StudentModel(

        class_id=class_map.get(data.get("class_id")),

        first_name=data.get("first_name"),

        notes=data.get("notes"),

        active=data.get("active"),

    )



    db.add(new_student)

    student_count += 1



db.commit()



print(f"Migrated {class_count} classes and {student_count} students")
