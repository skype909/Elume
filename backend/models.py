from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship


from db import Base

class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    classes = relationship("ClassModel", back_populates="owner")

# =========================================================
# Teacher Admin (Profile + Timetable) persistent state
# One row per user
# =========================================================
class TeacherAdminStateModel(Base):
    __tablename__ = "teacher_admin_state"

    id = Column(Integer, primary_key=True, index=True)

    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    # store the entire TeacherAdminPage state as JSON text
    state_json = Column(Text, nullable=False)

    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class ClassModel(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)

    owner = relationship("UserModel", back_populates="classes")

    posts = relationship("PostModel", back_populates="cls", cascade="all, delete-orphan")
    students = relationship("StudentModel", back_populates="cls", cascade="all, delete-orphan")


class PostModel(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)

    links = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    cls = relationship("ClassModel", back_populates="posts")

class StudentModel(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    first_name = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    cls = relationship("ClassModel", back_populates="students")

class ClassAssessmentModel(Base):
    __tablename__ = "class_assessments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)

    title = Column(String, nullable=False)
    assessment_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    results = relationship("AssessmentResultModel", back_populates="assessment", cascade="all, delete-orphan")

class AssessmentResultModel(Base):
    __tablename__ = "assessment_results"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("class_assessments.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)

    score_percent = Column(Integer, nullable=True)   # 0-100, null if absent
    absent = Column(Boolean, default=False, nullable=False)

    assessment = relationship("ClassAssessmentModel", back_populates="results")

class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    name = Column(String, nullable=False)

    notes = relationship("Note", back_populates="topic", cascade="all, delete-orphan")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)

    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    topic = relationship("Topic", back_populates="notes")


class TestCategory(Base):
    __tablename__ = "test_categories"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tests = relationship("TestItem", back_populates="category")


class TestItem(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("test_categories.id"), nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    category = relationship("TestCategory", back_populates="tests")


# =========================================================
# Calendar (single canonical source of truth)
# - class_id = NULL => global teacher event
# - class_id = <int> => class-specific event
# =========================================================
class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ IMPORTANT: nullable=True enables global events
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Start datetime (was event_date)
    event_date = Column(DateTime, nullable=False)

    # Optional end time
    end_date = Column(DateTime, nullable=True)

    # All-day flag (useful for holidays / staff days)
    all_day = Column(Boolean, default=False, nullable=False)

    event_type = Column(String, default="general")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)


class SchoolDay(Base):
    __tablename__ = "school_days"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False, unique=True)

# =========================================================
# Created Quiz Sessions
# =========================================================

class SavedQuizModel(Base):
    __tablename__ = "saved_quizzes"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    category = Column(String, nullable=False, default="General")
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    questions = relationship(
        "SavedQuizQuestionModel",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="SavedQuizQuestionModel.position.asc()",
    )


class SavedQuizQuestionModel(Base):
    __tablename__ = "saved_quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("saved_quizzes.id"), nullable=False, index=True)

    prompt = Column(Text, nullable=False)
    choice_a = Column(Text, nullable=False)
    choice_b = Column(Text, nullable=False)
    choice_c = Column(Text, nullable=False)
    choice_d = Column(Text, nullable=False)

    correct_index = Column(Integer, nullable=False, default=0)
    explanation = Column(Text, nullable=True)
    position = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    quiz = relationship("SavedQuizModel", back_populates="questions")

# =========================================================
# Live Quiz Session
# =========================================================
class LiveQuizSessionModel(Base):
    __tablename__ = "livequiz_sessions"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)

    session_code = Column(String, nullable=False, unique=True, index=True)

    title = Column(String, nullable=False)
    anonymous = Column(Boolean, default=True, nullable=False)

    # JSON stored as text
    questions_json = Column(Text, nullable=False)

    # flow control
    state = Column(String, default="lobby", nullable=False)  # lobby | live | ended
    current_index = Column(Integer, default=-1, nullable=False)

    seconds_per_question = Column(Integer, nullable=True)
    shuffle_questions = Column(Boolean, default=False, nullable=False)
    auto_end_when_all_answered = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    question_started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)


class LiveQuizParticipantModel(Base):
    __tablename__ = "livequiz_participants"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("livequiz_sessions.id"), nullable=False)

    # if anonymous mode, we still create an anon_id for the device
    anon_id = Column(String, nullable=False)
    nickname = Column(String, nullable=True)

    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class LiveQuizAnswerModel(Base):
    __tablename__ = "livequiz_answers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("livequiz_sessions.id"), nullable=False)
    participant_id = Column(Integer, ForeignKey("livequiz_participants.id"), nullable=False)

    question_id = Column(String, nullable=False)
    choice = Column(String, nullable=False)  # "A" | "B" | "C" | "D"

    answered_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class StudentAccessLink(Base):
    __tablename__ = "student_access_links"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)

    token = Column(String, unique=True, index=True, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class CollabSessionModel(Base):
    __tablename__ = "collab_sessions"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    session_code = Column(String, unique=True, index=True, nullable=False)

    title = Column(String, nullable=False, default="Collaboration Whiteboard")
    state = Column(String, nullable=False, default="lobby")  # lobby / assigning / live / review / ended

    room_count = Column(Integer, nullable=False, default=4)
    timer_minutes = Column(Integer, nullable=True)

    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    breakout_started_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CollabParticipantModel(Base):
    __tablename__ = "collab_participants"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("collab_sessions.id"), nullable=False, index=True)

    anon_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    room_number = Column(Integer, nullable=True)

    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_online = Column(Boolean, default=True, nullable=False)
