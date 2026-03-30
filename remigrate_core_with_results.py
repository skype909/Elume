import sqlite3

from db import SessionLocal

from models import ClassModel, StudentModel, ClassAssessmentModel, AssessmentResultModel



sqlite_conn = sqlite3.connect("classroom.db")

sqlite_conn.row_factory = sqlite3.Row

cur = sqlite_conn.cursor()



db = SessionLocal()



# 1) classes

cur.execute("SELECT * FROM classes ORDER BY id")

for row in cur.fetchall():

    data = dict(row)

    db.add(ClassModel(

        id=data["id"],

        owner_user_id=data.get("owner_user_id"),

        name=data.get("name"),

        subject=data.get("subject"),

        color=data.get("color"),

        preferred_exam_subject=data.get("preferred_exam_subject"),

        class_code=data.get("class_code"),

        class_pin=data.get("class_pin"),

    ))

db.commit()



# 2) students

cur.execute("""

SELECT s.*

FROM students s

JOIN classes c ON c.id = s.class_id

ORDER BY s.id

""")

for row in cur.fetchall():

    data = dict(row)

    db.add(StudentModel(

        id=data["id"],

        class_id=data.get("class_id"),

        first_name=data.get("first_name"),

        notes=data.get("notes"),

        active=data.get("active"),

    ))

db.commit()



# 3) valid class assessments only

cur.execute("""

SELECT ca.*

FROM class_assessments ca

JOIN classes c ON c.id = ca.class_id

ORDER BY ca.id

""")

for row in cur.fetchall():

    data = dict(row)

    db.add(ClassAssessmentModel(

        id=data["id"],

        class_id=data.get("class_id"),

        title=data.get("title"),

        assessment_date=data.get("assessment_date"),

        created_at=data.get("created_at"),

    ))

db.commit()



# 4) valid assessment results only

cur.execute("""

SELECT ar.*

FROM assessment_results ar

JOIN class_assessments ca ON ca.id = ar.assessment_id

JOIN classes c ON c.id = ca.class_id

JOIN students s ON s.id = ar.student_id

ORDER BY ar.id

""")

for row in cur.fetchall():

    data = dict(row)

    db.add(AssessmentResultModel(

        id=data["id"],

        assessment_id=data.get("assessment_id"),

        student_id=data.get("student_id"),

        score_percent=data.get("score_percent"),

        absent=data.get("absent"),

    ))

db.commit()



print("Imported valid core data with results")
