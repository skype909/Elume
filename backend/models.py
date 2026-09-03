from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship


from db import Base


class SchoolModel(Base):
    __tablename__ = "schools"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'suspended', 'inactive')", name="ck_schools_status"),
        CheckConstraint("seat_limit >= 0", name="ck_schools_seat_limit_nonnegative"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    # Nullable for safe migration of existing schools; new provisioning assigns a slug.
    slug = Column(String(63), nullable=True, unique=True, index=True)
    logo_storage_key = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    seat_limit = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    users = relationship("UserModel", back_populates="school")


class SchoolDepartmentModel(Base):
    __tablename__ = "school_departments"
    __table_args__ = (
        UniqueConstraint("id", "school_id", name="uq_school_departments_id_school"),
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class UserModel(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('teacher', 'school_admin', 'platform_admin')", name="ck_users_role"),
        UniqueConstraint("id", "school_id", name="uq_users_id_school"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    school_name = Column(String, nullable=True)
    role = Column(String(32), nullable=False, default="teacher")
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    email_verified = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    subscription_status = Column(String, nullable=False, default="inactive")
    billing_interval = Column(String, nullable=True)  # monthly | annual
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    stripe_checkout_session_id = Column(String, nullable=True)
    subscription_started_at = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    subscription_expires_at = Column(DateTime, nullable=True)
    subscription_30_day_notice_sent_at = Column(DateTime, nullable=True)
    payment_failed_at = Column(DateTime, nullable=True)
    payment_recovery_deadline_at = Column(DateTime, nullable=True)
    payment_failed_notice_sent_at = Column(DateTime, nullable=True)
    payment_failed_final_notice_sent_at = Column(DateTime, nullable=True)
    launch_offer_applied = Column(Boolean, nullable=False, default=False)
    billing_onboarding_required = Column(Boolean, nullable=False, default=False)
    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)
    ai_daily_limit = Column(Integer, nullable=False, default=0)
    ai_prompt_count = Column(Integer, nullable=False, default=0)
    ai_prompt_count_date = Column(DateTime, nullable=True)
    storage_used_bytes = Column(Integer, nullable=False, default=0)
    storage_warning_sent_at = Column(DateTime, nullable=True)

    classes = relationship("ClassModel", back_populates="owner")
    school = relationship("SchoolModel", back_populates="users")


class SchoolDepartmentMembershipModel(Base):
    __tablename__ = "school_department_memberships"
    __table_args__ = (
        UniqueConstraint("department_id", "user_id", name="uq_school_department_memberships_department_user"),
        ForeignKeyConstraint(
            ["department_id", "school_id"], ["school_departments.id", "school_departments.school_id"],
            name="fk_school_department_memberships_department_school", ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "school_id"], ["users.id", "users.school_id"],
            name="fk_school_department_memberships_user_school", ondelete="RESTRICT",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, nullable=False, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DepartmentCollabTemplateShareModel(Base):
    __tablename__ = "department_collab_template_shares"
    __table_args__ = (
        UniqueConstraint("department_id", "template_id", name="uq_department_collab_template_share"),
    )

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("school_departments.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("collab_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    shared_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DepartmentSavedQuizShareModel(Base):
    __tablename__ = "department_saved_quiz_shares"
    __table_args__ = (
        UniqueConstraint("department_id", "saved_quiz_id", name="uq_department_saved_quiz_share"),
    )

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("school_departments.id", ondelete="CASCADE"), nullable=False, index=True)
    saved_quiz_id = Column(Integer, ForeignKey("saved_quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    shared_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AIUsageEventModel(Base):
    __tablename__ = "ai_usage_events"
    __table_args__ = (
        CheckConstraint(
            "feature IN ('quiz', 'calendar', 'three_ideas', 'lesson_plan', 'worksheet', "
            "'report_comment', 'scheme_of_work', 'department_plan', 'cat4_interpretation')",
            name="ck_ai_usage_events_feature",
        ),
        CheckConstraint("input_tokens IS NULL OR input_tokens >= 0", name="ck_ai_usage_events_input_tokens"),
        CheckConstraint("output_tokens IS NULL OR output_tokens >= 0", name="ck_ai_usage_events_output_tokens"),
        CheckConstraint("total_tokens IS NULL OR total_tokens >= 0", name="ck_ai_usage_events_total_tokens"),
        Index("ix_ai_usage_events_user_feature_created", "user_id", "feature", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    feature = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    model = Column(String(128), nullable=False)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)


class PasswordResetTokenModel(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class EmailVerificationTokenModel(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

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


class WhiteboardStateModel(Base):
    __tablename__ = "whiteboard_states"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    state_json = Column(Text, nullable=False)
    preview_image_path = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class ClassModel(Base):
    __tablename__ = "classes"
    __table_args__ = (
        Index("ix_classes_owner_active_dashboard_order", "owner_user_id", "is_archived", "dashboard_order", "id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    stream = Column(String, nullable=True)
    color = Column(String, nullable=True)
    dashboard_order = Column(Integer, nullable=True)
    preferred_exam_subject = Column(String, nullable=True)
    class_code = Column(String, unique=True, index=True, nullable=True)
    class_pin = Column(String, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime, nullable=True)

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


class Cat4BaselineSetModel(Base):
    __tablename__ = "cat4_baseline_sets"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    cohort_key = Column(String, nullable=False, default="default", index=True)
    cohort_name = Column(String, nullable=False, default="Default Cohort")
    title = Column(String, nullable=False)
    test_date = Column(DateTime, nullable=True)
    is_locked = Column(Boolean, nullable=False, default=False)
    locked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SchoolInvitationModel(Base):
    __tablename__ = "school_invitations"
    __table_args__ = (
        CheckConstraint("intended_role IN ('teacher', 'school_admin')", name="ck_school_invitations_intended_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False, index=True)
    normalized_email = Column(String(320), nullable=False, index=True)
    intended_role = Column(String(32), nullable=False, default="teacher")
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SchoolAdminAuditLogModel(Base):
    __tablename__ = "school_admin_audit_log"
    __table_args__ = (
        CheckConstraint(
            "action IN ('invitation_created', 'invitation_resent', 'invitation_revoked', "
            "'invitation_accepted', 'teacher_deactivated', 'teacher_reactivated', "
            "'school_admin_invitation_created', 'school_admin_invitation_accepted')",
            name="ck_school_admin_audit_log_action",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True)
    invitation_id = Column(Integer, ForeignKey("school_invitations.id", ondelete="RESTRICT"), nullable=True, index=True)
    action = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Cat4StudentBaselineModel(Base):
    __tablename__ = "cat4_student_baselines"

    id = Column(Integer, primary_key=True, index=True)
    baseline_set_id = Column(Integer, ForeignKey("cat4_baseline_sets.id"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    raw_name = Column(String, nullable=False)
    matched_name = Column(String, nullable=True)
    verbal_sas = Column(Integer, nullable=True)
    quantitative_sas = Column(Integer, nullable=True)
    non_verbal_sas = Column(Integer, nullable=True)
    spatial_sas = Column(Integer, nullable=True)
    overall_sas = Column(Integer, nullable=True)
    profile_label = Column(String, nullable=True)
    confidence_note = Column(Text, nullable=True)


class Cat4TermResultSetModel(Base):
    __tablename__ = "cat4_term_result_sets"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    cohort_key = Column(String, nullable=False, default="default", index=True)
    cohort_name = Column(String, nullable=False, default="Default Cohort")
    title = Column(String, nullable=False)
    academic_year = Column(String, nullable=True)
    term_key = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Cat4StudentTermResultModel(Base):
    __tablename__ = "cat4_student_term_results"

    id = Column(Integer, primary_key=True, index=True)
    result_set_id = Column(Integer, ForeignKey("cat4_term_result_sets.id"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    raw_name = Column(String, nullable=False)
    matched_name = Column(String, nullable=True)
    average_percent = Column(Integer, nullable=True)
    subject_count = Column(Integer, nullable=True)
    raw_subjects_json = Column(Text, nullable=True)
    verbal_domain_score = Column(Integer, nullable=True)
    quantitative_domain_score = Column(Integer, nullable=True)
    non_verbal_domain_score = Column(Integer, nullable=True)
    spatial_domain_score = Column(Integer, nullable=True)


class Cat4WorkbookVersionModel(Base):
    __tablename__ = "cat4_workbook_versions"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    cohort_key = Column(String, nullable=False, default="default", index=True)
    cohort_name = Column(String, nullable=False, default="Default Cohort")
    version_number = Column(Integer, nullable=False)
    workbook_name = Column(String, nullable=False)
    uploaded_by_email = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    validation_summary_json = Column(Text, nullable=False)
    parsed_payload_json = Column(Text, nullable=False)

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
    whiteboard_state_id = Column(Integer, nullable=True, index=True)
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
    is_starred = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    questions = relationship(
        "SavedQuizQuestionModel",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="SavedQuizQuestionModel.position.asc()",
    )
    class_rel = relationship("ClassModel")


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
    quiz_id = Column(String, nullable=True)

    # JSON stored as text
    questions_json = Column(Text, nullable=False)

    # flow control
    state = Column(String, default="lobby", nullable=False)  # lobby | live | ended
    current_index = Column(Integer, default=-1, nullable=False)

    seconds_per_question = Column(Integer, nullable=True)
    shuffle_questions = Column(Boolean, default=False, nullable=False)
    auto_play = Column(Boolean, default=False, nullable=False)
    auto_end_when_all_answered = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    question_started_at = Column(DateTime, nullable=True)
    question_closed_at = Column(DateTime, nullable=True)
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


class LiveQuizAttemptModel(Base):
    __tablename__ = "livequiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("livequiz_sessions.id"), nullable=False, index=True)
    quiz_id = Column(String, nullable=True)
    participant_id = Column(Integer, ForeignKey("livequiz_participants.id"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)

    participant_identifier = Column(String, nullable=True)
    participant_display_name = Column(String, nullable=False)

    score = Column(Integer, nullable=False, default=0)
    score_percent = Column(Integer, nullable=True)
    total_questions = Column(Integer, nullable=False, default=0)
    completed = Column(Boolean, nullable=False, default=False)
    scored_mode = Column(Boolean, nullable=False, default=True)
    excluded_from_average = Column(Boolean, nullable=False, default=False)

    submitted_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


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
    # Incremented whenever the teacher begins a clean board round.  The live
    # socket history is still process-local, but this persisted identity keeps
    # clients from accepting delayed packets from a previous round.
    board_round = Column(Integer, nullable=False, default=1)
    # Immutable teacher-only source captured at breakout start.  It is never
    # populated from student room histories and is the only source for saved
    # collaboration templates.
    clean_snapshot_json = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CollabTemplateModel(Base):
    __tablename__ = "collab_templates"

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    # The original class is retained as helpful context only.  A teacher may
    # use their private template for another class they own.
    source_class_id = Column(Integer, ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    board_state_json = Column(Text, nullable=False)
    room_count = Column(Integer, nullable=False, default=4)
    timer_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


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
