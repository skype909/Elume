from __future__ import annotations

from datetime import datetime
from sqlalchemy import BigInteger, Boolean, CHAR, CheckConstraint, Column, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
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


class SchoolEmailDomainModel(Base):
    """An explicitly administered, verified school email-domain mapping."""
    __tablename__ = "school_email_domains"
    __table_args__ = (
        UniqueConstraint("domain", name="uq_school_email_domains_domain"),
        CheckConstraint("domain <> '' AND domain = lower(domain) AND domain = trim(domain) AND domain NOT LIKE '%@%'", name="ck_school_email_domains_domain_canonical"),
        CheckConstraint("(revoked_at IS NULL AND revoked_by_user_id IS NULL) OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)", name="ck_school_email_domains_revocation"),
        Index("ix_school_email_domains_school_active", "school_id", "is_active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False, index=True)
    domain = Column(String(253), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime, default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)


class UserAccessGrantModel(Base):
    """Auditable manual/pilot/promotional entitlement; never implicit reviewer access."""
    __tablename__ = "user_access_grants"
    __table_args__ = (
        CheckConstraint("grant_type IN ('pilot', 'reviewer', 'internal', 'complimentary', 'promotional_annual')", name="ck_user_access_grants_type"),
        CheckConstraint("expires_at IS NULL OR expires_at > starts_at", name="ck_user_access_grants_window"),
        CheckConstraint("(revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revocation_reason IS NOT NULL)", name="ck_user_access_grants_revocation"),
        Index("ix_user_access_grants_user_active", "user_id", "starts_at", "expires_at", postgresql_where=text("revoked_at IS NULL")),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    grant_type = Column(String(64), nullable=False)
    reason = Column(Text, nullable=False)
    starts_at = Column(DateTime, default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    expires_at = Column(DateTime, nullable=True)
    granted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    revocation_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


class StripeWebhookEventModel(Base):
    """Migration-013 durable inbox; event_data is an allowlisted projection only."""
    __tablename__ = "stripe_webhook_events"

    _postgres_json_object = CheckConstraint(
        "jsonb_typeof(event_data) = 'object'",
        name="ck_stripe_webhook_events_event_data_object",
    ).ddl_if(dialect="postgresql")
    __table_args__ = (
        UniqueConstraint("stripe_event_id", name="uq_stripe_webhook_events_stripe_event_id"),
        CheckConstraint(
            "stripe_event_id <> '' AND stripe_event_id = btrim(stripe_event_id) AND "
            "event_type <> '' AND event_type = btrim(event_type) AND "
            "(entity_key IS NULL OR (entity_key <> '' AND entity_key = btrim(entity_key))) AND "
            "(stripe_customer_id IS NULL OR (stripe_customer_id <> '' AND stripe_customer_id = btrim(stripe_customer_id))) AND "
            "(stripe_subscription_id IS NULL OR (stripe_subscription_id <> '' AND stripe_subscription_id = btrim(stripe_subscription_id)))",
            name="ck_stripe_webhook_events_identifiers",
        ).ddl_if(dialect="postgresql"),
        CheckConstraint("payload_sha256 ~ '^[0-9a-f]{64}$'", name="ck_stripe_webhook_events_payload_sha256").ddl_if(dialect="postgresql"),
        _postgres_json_object,
        CheckConstraint("processing_state IN ('received', 'processing', 'processed', 'failed', 'ignored')", name="ck_stripe_webhook_events_state"),
        CheckConstraint("attempt_count >= 0", name="ck_stripe_webhook_events_attempt_count"),
        CheckConstraint(
            "((processing_state = 'received' AND claimed_at IS NULL AND processed_at IS NULL AND "
            "next_attempt_at IS NULL AND failure_code IS NULL AND failure_detail IS NULL AND last_failure_at IS NULL) OR "
            "(processing_state = 'processing' AND claimed_at IS NOT NULL AND processed_at IS NULL AND "
            "next_attempt_at IS NULL AND failure_code IS NULL AND failure_detail IS NULL AND last_failure_at IS NULL) OR "
            "(processing_state IN ('processed', 'ignored') AND processed_at IS NOT NULL AND "
            "next_attempt_at IS NULL AND failure_code IS NULL AND failure_detail IS NULL AND last_failure_at IS NULL) OR "
            "(processing_state = 'failed' AND claimed_at IS NULL AND processed_at IS NULL AND "
            "failure_code IS NOT NULL AND failure_code <> '' AND failure_code = trim(failure_code) AND "
            "failure_code ~ '^[a-z0-9_:-]+$' AND "
            "(failure_detail IS NULL OR (failure_detail <> '' AND failure_detail = trim(failure_detail))) AND "
            "last_failure_at IS NOT NULL))",
            name="ck_stripe_webhook_events_state_timestamps",
        ).ddl_if(dialect="postgresql"),
        Index("ix_stripe_webhook_events_queue", "processing_state", "next_attempt_at", "received_at", postgresql_where=text("processing_state IN ('received', 'failed')")),
        Index("ix_stripe_webhook_events_subscription_created", "stripe_subscription_id", text("stripe_created_at DESC")),
        Index("ix_stripe_webhook_events_customer_created", "stripe_customer_id", text("stripe_created_at DESC")),
        Index("ix_stripe_webhook_events_user_received", "resolved_user_id", text("received_at DESC")),
        Index("ix_stripe_webhook_events_entity_created", "entity_key", text("stripe_created_at DESC")),
    )

    id = Column(BigInteger, primary_key=True)
    stripe_event_id = Column(String(255), nullable=False)
    event_type = Column(String(128), nullable=False)
    stripe_created_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    stripe_api_version = Column(String(64), nullable=True)
    livemode = Column(Boolean, nullable=False)
    entity_key = Column(String(255), nullable=True)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    resolved_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    payload_sha256 = Column(CHAR(64), nullable=False)
    event_data = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    processing_state = Column(String(16), nullable=False, server_default=text("'received'"), default="received")
    attempt_count = Column(Integer, nullable=False, server_default=text("0"), default=0)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    next_attempt_at = Column(DateTime(timezone=True), nullable=True)
    failure_code = Column(String(80), nullable=True)
    failure_detail = Column(String(500), nullable=True)
    last_failure_at = Column(DateTime(timezone=True), nullable=True)


class UiTranslationOverrideModel(Base):
    __tablename__ = "ui_translation_overrides"
    __table_args__ = (
        UniqueConstraint("language_code", "translation_key", name="uq_ui_translation_overrides_language_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    language_code = Column(String(16), nullable=False, index=True)
    translation_key = Column(String(160), nullable=False)
    value = Column(Text, nullable=False)
    base_value_at_edit = Column(Text, nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class UiTranslationOverrideRevisionModel(Base):
    __tablename__ = "ui_translation_override_revisions"

    id = Column(Integer, primary_key=True, index=True)
    override_id = Column(Integer, ForeignKey("ui_translation_overrides.id", ondelete="RESTRICT"), nullable=False, index=True)
    language_code = Column(String(16), nullable=False, index=True)
    translation_key = Column(String(160), nullable=False)
    previous_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=False)
    base_value_at_edit = Column(Text, nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


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
    aac_planner_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))

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
            "'school_admin_invitation_created', 'school_admin_invitation_accepted', "
            "'school_domain_linked')",
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


# AAC planning is deliberately private and teacher-led.  Draft/revision JSON keeps
# extracted source facts, AI suggestions and teacher decisions distinct until approval.
class AacProjectModel(Base):
    __tablename__ = "aac_projects"
    __table_args__ = (
        UniqueConstraint("class_id", name="uq_aac_projects_class"),
        CheckConstraint("weekly_minutes BETWEEN 5 AND 600", name="ck_aac_projects_weekly_minutes"),
        CheckConstraint("current_year_stage IN ('fifth_year', 'sixth_year', 'underway')", name="ck_aac_projects_year_stage"),
        CheckConstraint("status IN ('draft', 'revision_pending', 'approved', 'archived')", name="ck_aac_projects_status"),
    )
    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    subject = Column(String(120), nullable=False)
    examination_year = Column(Integer, nullable=True)
    current_year_stage = Column(String(32), nullable=False, default="fifth_year")
    weekly_minutes = Column(Integer, nullable=False, default=30)
    status = Column(String(16), nullable=False, default="draft")
    approved_revision_id = Column(Integer, ForeignKey("aac_plan_revisions.id", ondelete="RESTRICT", use_alter=True, name="fk_aac_projects_approved_revision"), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


class AacPlanRevisionModel(Base):
    __tablename__ = "aac_plan_revisions"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_aac_plan_revisions_version"),
        CheckConstraint("version > 0", name="ck_aac_plan_revisions_version"),
        CheckConstraint("state IN ('draft', 'approved', 'superseded')", name="ck_aac_plan_revisions_state"),
        CheckConstraint("(state = 'approved') = (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)", name="ck_aac_plan_revisions_approval"),
    )
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("aac_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    state = Column(String(16), nullable=False, default="draft")
    source_requirements_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list, server_default=text("'[]'"))
    plan_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict, server_default=text("'{}'"))
    assumptions_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list, server_default=text("'[]'"))
    source_document_ids_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list, server_default=text("'[]'"))
    planning_inputs_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict, server_default=text("'{}'"))
    approved_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


class AacStudentProgressModel(Base):
    __tablename__ = "aac_student_progress"
    __table_args__ = (UniqueConstraint("project_id", "student_id", name="uq_aac_student_progress"),)
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("aac_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    current_stage = Column(String(200), nullable=True)
    checkpoints_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list, server_default=text("'[]'"))
    observation = Column(String(500), nullable=True)
    next_action = Column(String(500), nullable=True)
    next_check_in_at = Column(DateTime(timezone=True), nullable=True)
    last_checked_in_at = Column(DateTime(timezone=True), nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


class AacSourceDocumentModel(Base):
    __tablename__ = "aac_source_documents"
    __table_args__ = (
        CheckConstraint("purpose IN ('specification', 'fifth_year_calendar', 'sixth_year_calendar')", name="ck_aac_source_documents_purpose"),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 15728640", name="ck_aac_source_documents_size"),
        CheckConstraint("extraction_state IN ('pending', 'extracted', 'unreadable', 'replaced')", name="ck_aac_source_documents_extraction_state"),
        Index("ix_aac_source_documents_project_purpose", "project_id", "purpose", "created_at"),
    )
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("aac_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    purpose = Column(String(32), nullable=False)
    academic_year = Column(String(32), nullable=True)
    display_filename = Column(String(255), nullable=False)
    storage_key = Column(String(512), nullable=False, unique=True)
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(CHAR(64), nullable=False)
    extraction_state = Column(String(16), nullable=False, default="pending", server_default=text("'pending'"))
    extraction_error = Column(String(300), nullable=True)
    extracted_sections_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list, server_default=text("'[]'"))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


class AacPracticalSessionModel(Base):
    __tablename__ = "aac_practical_sessions"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("aac_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    session_date = Column(DateTime(timezone=True), nullable=False)
    stage_name = Column(String(200), nullable=True)
    logistics_notes = Column(String(1000), nullable=True)
    allocations_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list, server_default=text("'[]'"))
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


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
