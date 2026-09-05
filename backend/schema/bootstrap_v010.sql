-- Elume final-v010 empty-database PostgreSQL bootstrap.
-- Generated from the complete SQLAlchemy mapped metadata; review before changing.
-- This file is schema-only and is intentionally not run by application startup.
BEGIN;

CREATE TABLE schema_migrations (
    version VARCHAR PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE school_days (
	id SERIAL NOT NULL,
	date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (date)
);


CREATE TABLE schools (
	id SERIAL NOT NULL,
	name VARCHAR(255) NOT NULL,
	slug VARCHAR(63),
	logo_storage_key VARCHAR(512),
	status VARCHAR(32) NOT NULL,
	seat_limit INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_schools_status CHECK (status IN ('active', 'suspended', 'inactive')),
	CONSTRAINT ck_schools_seat_limit_nonnegative CHECK (seat_limit >= 0)
);


CREATE TABLE teacher_planner_state (
	id SERIAL NOT NULL,
	teacher_id INTEGER,
	state_json TEXT,
	updated_at TEXT,
	PRIMARY KEY (id)
);


CREATE TABLE school_departments (
	id SERIAL NOT NULL,
	school_id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_school_departments_id_school UNIQUE (id, school_id),
	FOREIGN KEY(school_id) REFERENCES schools (id) ON DELETE RESTRICT
);


CREATE TABLE users (
	id SERIAL NOT NULL,
	email VARCHAR NOT NULL,
	password_hash VARCHAR NOT NULL,
	first_name VARCHAR,
	last_name VARCHAR,
	school_name VARCHAR,
	role VARCHAR(32) NOT NULL,
	school_id INTEGER,
	is_active BOOLEAN NOT NULL,
	email_verified BOOLEAN NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	subscription_status VARCHAR NOT NULL,
	billing_interval VARCHAR,
	stripe_customer_id VARCHAR,
	stripe_subscription_id VARCHAR,
	stripe_checkout_session_id VARCHAR,
	subscription_started_at TIMESTAMP WITHOUT TIME ZONE,
	current_period_end TIMESTAMP WITHOUT TIME ZONE,
	subscription_expires_at TIMESTAMP WITHOUT TIME ZONE,
	subscription_30_day_notice_sent_at TIMESTAMP WITHOUT TIME ZONE,
	payment_failed_at TIMESTAMP WITHOUT TIME ZONE,
	payment_recovery_deadline_at TIMESTAMP WITHOUT TIME ZONE,
	payment_failed_notice_sent_at TIMESTAMP WITHOUT TIME ZONE,
	payment_failed_final_notice_sent_at TIMESTAMP WITHOUT TIME ZONE,
	launch_offer_applied BOOLEAN NOT NULL,
	billing_onboarding_required BOOLEAN NOT NULL,
	trial_started_at TIMESTAMP WITHOUT TIME ZONE,
	trial_ends_at TIMESTAMP WITHOUT TIME ZONE,
	ai_daily_limit INTEGER NOT NULL,
	ai_prompt_count INTEGER NOT NULL,
	ai_prompt_count_date TIMESTAMP WITHOUT TIME ZONE,
	storage_used_bytes INTEGER NOT NULL,
	storage_warning_sent_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT ck_users_role CHECK (role IN ('teacher', 'school_admin', 'platform_admin')),
	CONSTRAINT uq_users_id_school UNIQUE (id, school_id),
	FOREIGN KEY(school_id) REFERENCES schools (id) ON DELETE RESTRICT
);


CREATE TABLE ai_usage_events (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	feature VARCHAR(64) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	model VARCHAR(128) NOT NULL,
	input_tokens INTEGER,
	output_tokens INTEGER,
	total_tokens INTEGER,
	PRIMARY KEY (id),
	CONSTRAINT ck_ai_usage_events_feature CHECK (feature IN ('quiz', 'calendar', 'three_ideas', 'lesson_plan', 'worksheet', 'report_comment', 'scheme_of_work', 'department_plan', 'cat4_interpretation')),
	CONSTRAINT ck_ai_usage_events_input_tokens CHECK (input_tokens IS NULL OR input_tokens >= 0),
	CONSTRAINT ck_ai_usage_events_output_tokens CHECK (output_tokens IS NULL OR output_tokens >= 0),
	CONSTRAINT ck_ai_usage_events_total_tokens CHECK (total_tokens IS NULL OR total_tokens >= 0),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE classes (
	id SERIAL NOT NULL,
	owner_user_id INTEGER,
	name VARCHAR NOT NULL,
	subject VARCHAR NOT NULL,
	stream VARCHAR,
	color VARCHAR,
	dashboard_order INTEGER,
	preferred_exam_subject VARCHAR,
	class_code VARCHAR,
	class_pin VARCHAR,
	is_archived BOOLEAN NOT NULL,
	archived_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id)
);


CREATE TABLE email_verification_tokens (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	token_hash VARCHAR NOT NULL,
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	used_at TIMESTAMP WITHOUT TIME ZONE,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id)
);


CREATE TABLE password_reset_tokens (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	token_hash VARCHAR NOT NULL,
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	used_at TIMESTAMP WITHOUT TIME ZONE,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id)
);


CREATE TABLE school_department_memberships (
	id SERIAL NOT NULL,
	department_id INTEGER NOT NULL,
	school_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_school_department_memberships_department_user UNIQUE (department_id, user_id),
	CONSTRAINT fk_school_department_memberships_department_school FOREIGN KEY(department_id, school_id) REFERENCES school_departments (id, school_id) ON DELETE CASCADE,
	CONSTRAINT fk_school_department_memberships_user_school FOREIGN KEY(user_id, school_id) REFERENCES users (id, school_id) ON DELETE RESTRICT
);


CREATE TABLE school_invitations (
	id SERIAL NOT NULL,
	school_id INTEGER NOT NULL,
	normalized_email VARCHAR(320) NOT NULL,
	intended_role VARCHAR(32) NOT NULL,
	token_hash VARCHAR(64) NOT NULL,
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	accepted_at TIMESTAMP WITHOUT TIME ZONE,
	revoked_at TIMESTAMP WITHOUT TIME ZONE,
	invited_by_user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_school_invitations_intended_role CHECK (intended_role IN ('teacher', 'school_admin')),
	FOREIGN KEY(school_id) REFERENCES schools (id) ON DELETE RESTRICT,
	UNIQUE (token_hash),
	FOREIGN KEY(invited_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE teacher_admin_state (
	id SERIAL NOT NULL,
	owner_user_id INTEGER NOT NULL,
	state_json TEXT NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id)
);


CREATE TABLE ui_translation_overrides (
	id SERIAL NOT NULL,
	language_code VARCHAR(16) NOT NULL,
	translation_key VARCHAR(160) NOT NULL,
	value TEXT NOT NULL,
	base_value_at_edit TEXT,
	updated_by_user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ui_translation_overrides_language_key UNIQUE (language_code, translation_key),
	FOREIGN KEY(updated_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE calendar_events (
	id SERIAL NOT NULL,
	class_id INTEGER,
	title VARCHAR NOT NULL,
	description TEXT,
	event_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	end_date TIMESTAMP WITHOUT TIME ZONE,
	all_day BOOLEAN NOT NULL,
	event_type VARCHAR,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	owner_user_id INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id)
);


CREATE TABLE cat4_baseline_sets (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	test_date TIMESTAMP WITHOUT TIME ZONE,
	is_locked BOOLEAN NOT NULL,
	locked_at TIMESTAMP WITHOUT TIME ZONE,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE cat4_term_result_sets (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	academic_year VARCHAR,
	term_key VARCHAR,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE cat4_workbook_versions (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	version_number INTEGER NOT NULL,
	workbook_name VARCHAR NOT NULL,
	uploaded_by_email VARCHAR NOT NULL,
	uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	is_active BOOLEAN NOT NULL,
	validation_summary_json TEXT NOT NULL,
	parsed_payload_json TEXT NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE class_assessments (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	assessment_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE collab_sessions (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	session_code VARCHAR NOT NULL,
	title VARCHAR NOT NULL,
	state VARCHAR NOT NULL,
	room_count INTEGER NOT NULL,
	timer_minutes INTEGER,
	started_at TIMESTAMP WITHOUT TIME ZONE,
	ended_at TIMESTAMP WITHOUT TIME ZONE,
	breakout_started_at TIMESTAMP WITHOUT TIME ZONE,
	board_round INTEGER NOT NULL,
	clean_snapshot_json TEXT,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE collab_templates (
	id SERIAL NOT NULL,
	owner_user_id INTEGER NOT NULL,
	source_class_id INTEGER,
	title VARCHAR(255) NOT NULL,
	board_state_json TEXT NOT NULL,
	room_count INTEGER NOT NULL,
	timer_minutes INTEGER,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
	FOREIGN KEY(source_class_id) REFERENCES classes (id) ON DELETE SET NULL
);


CREATE TABLE livequiz_sessions (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	session_code VARCHAR NOT NULL,
	title VARCHAR NOT NULL,
	anonymous BOOLEAN NOT NULL,
	quiz_id VARCHAR,
	questions_json TEXT NOT NULL,
	state VARCHAR NOT NULL,
	current_index INTEGER NOT NULL,
	seconds_per_question INTEGER,
	shuffle_questions BOOLEAN NOT NULL,
	auto_play BOOLEAN NOT NULL,
	auto_end_when_all_answered BOOLEAN NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	started_at TIMESTAMP WITHOUT TIME ZONE,
	question_started_at TIMESTAMP WITHOUT TIME ZONE,
	question_closed_at TIMESTAMP WITHOUT TIME ZONE,
	ended_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE posts (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	author VARCHAR NOT NULL,
	content TEXT NOT NULL,
	links TEXT,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE saved_quizzes (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	owner_user_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	category VARCHAR NOT NULL,
	description TEXT,
	is_starred BOOLEAN NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id)
);


CREATE TABLE school_admin_audit_log (
	id SERIAL NOT NULL,
	school_id INTEGER NOT NULL,
	actor_user_id INTEGER NOT NULL,
	target_user_id INTEGER,
	invitation_id INTEGER,
	action VARCHAR(64) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_school_admin_audit_log_action CHECK (action IN ('invitation_created', 'invitation_resent', 'invitation_revoked', 'invitation_accepted', 'teacher_deactivated', 'teacher_reactivated', 'school_admin_invitation_created', 'school_admin_invitation_accepted')),
	FOREIGN KEY(school_id) REFERENCES schools (id) ON DELETE RESTRICT,
	FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
	FOREIGN KEY(target_user_id) REFERENCES users (id) ON DELETE RESTRICT,
	FOREIGN KEY(invitation_id) REFERENCES school_invitations (id) ON DELETE RESTRICT
);


CREATE TABLE student_access_links (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	token VARCHAR NOT NULL,
	is_active BOOLEAN NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE students (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	first_name VARCHAR NOT NULL,
	notes TEXT,
	active BOOLEAN,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE test_categories (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	description TEXT,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE topics (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	name VARCHAR NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id)
);


CREATE TABLE ui_translation_override_revisions (
	id SERIAL NOT NULL,
	override_id INTEGER NOT NULL,
	language_code VARCHAR(16) NOT NULL,
	translation_key VARCHAR(160) NOT NULL,
	previous_value TEXT,
	new_value TEXT NOT NULL,
	base_value_at_edit TEXT,
	reviewed_by_user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(override_id) REFERENCES ui_translation_overrides (id) ON DELETE RESTRICT,
	FOREIGN KEY(reviewed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE whiteboard_states (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	owner_user_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	state_json TEXT NOT NULL,
	preview_image_path VARCHAR,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id)
);


CREATE TABLE assessment_results (
	id SERIAL NOT NULL,
	assessment_id INTEGER NOT NULL,
	student_id INTEGER NOT NULL,
	score_percent INTEGER,
	absent BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(assessment_id) REFERENCES class_assessments (id),
	FOREIGN KEY(student_id) REFERENCES students (id)
);


CREATE TABLE cat4_student_baselines (
	id SERIAL NOT NULL,
	baseline_set_id INTEGER NOT NULL,
	class_id INTEGER NOT NULL,
	student_id INTEGER,
	raw_name VARCHAR NOT NULL,
	matched_name VARCHAR,
	verbal_sas INTEGER,
	quantitative_sas INTEGER,
	non_verbal_sas INTEGER,
	spatial_sas INTEGER,
	overall_sas INTEGER,
	profile_label VARCHAR,
	confidence_note TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(baseline_set_id) REFERENCES cat4_baseline_sets (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(student_id) REFERENCES students (id)
);


CREATE TABLE cat4_student_term_results (
	id SERIAL NOT NULL,
	result_set_id INTEGER NOT NULL,
	class_id INTEGER NOT NULL,
	student_id INTEGER,
	raw_name VARCHAR NOT NULL,
	matched_name VARCHAR,
	average_percent INTEGER,
	subject_count INTEGER,
	raw_subjects_json TEXT,
	verbal_domain_score INTEGER,
	quantitative_domain_score INTEGER,
	non_verbal_domain_score INTEGER,
	spatial_domain_score INTEGER,
	PRIMARY KEY (id),
	FOREIGN KEY(result_set_id) REFERENCES cat4_term_result_sets (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(student_id) REFERENCES students (id)
);


CREATE TABLE collab_participants (
	id SERIAL NOT NULL,
	session_id INTEGER NOT NULL,
	anon_id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	room_number INTEGER,
	joined_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	last_seen_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	is_online BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(session_id) REFERENCES collab_sessions (id)
);


CREATE TABLE department_collab_template_shares (
	id SERIAL NOT NULL,
	department_id INTEGER NOT NULL,
	template_id INTEGER NOT NULL,
	shared_by_user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_department_collab_template_share UNIQUE (department_id, template_id),
	FOREIGN KEY(department_id) REFERENCES school_departments (id) ON DELETE CASCADE,
	FOREIGN KEY(template_id) REFERENCES collab_templates (id) ON DELETE CASCADE,
	FOREIGN KEY(shared_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE department_saved_quiz_shares (
	id SERIAL NOT NULL,
	department_id INTEGER NOT NULL,
	saved_quiz_id INTEGER NOT NULL,
	shared_by_user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_department_saved_quiz_share UNIQUE (department_id, saved_quiz_id),
	FOREIGN KEY(department_id) REFERENCES school_departments (id) ON DELETE CASCADE,
	FOREIGN KEY(saved_quiz_id) REFERENCES saved_quizzes (id) ON DELETE CASCADE,
	FOREIGN KEY(shared_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE livequiz_participants (
	id SERIAL NOT NULL,
	session_id INTEGER NOT NULL,
	anon_id VARCHAR NOT NULL,
	nickname VARCHAR,
	joined_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(session_id) REFERENCES livequiz_sessions (id)
);


CREATE TABLE notes (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	topic_id INTEGER NOT NULL,
	filename VARCHAR NOT NULL,
	stored_path VARCHAR NOT NULL,
	size_bytes INTEGER NOT NULL DEFAULT 0,
	whiteboard_state_id INTEGER,
	uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(topic_id) REFERENCES topics (id)
);


CREATE TABLE saved_quiz_questions (
	id SERIAL NOT NULL,
	quiz_id INTEGER NOT NULL,
	prompt TEXT NOT NULL,
	choice_a TEXT NOT NULL,
	choice_b TEXT NOT NULL,
	choice_c TEXT NOT NULL,
	choice_d TEXT NOT NULL,
	correct_index INTEGER NOT NULL,
	explanation TEXT,
	position INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(quiz_id) REFERENCES saved_quizzes (id)
);


CREATE TABLE tests (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	category_id INTEGER,
	title VARCHAR NOT NULL,
	description TEXT,
	filename VARCHAR NOT NULL,
	stored_path VARCHAR NOT NULL,
	size_bytes INTEGER NOT NULL DEFAULT 0,
	uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(category_id) REFERENCES test_categories (id)
);


CREATE TABLE livequiz_answers (
	id SERIAL NOT NULL,
	session_id INTEGER NOT NULL,
	participant_id INTEGER NOT NULL,
	question_id VARCHAR NOT NULL,
	choice VARCHAR NOT NULL,
	answered_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(session_id) REFERENCES livequiz_sessions (id),
	FOREIGN KEY(participant_id) REFERENCES livequiz_participants (id)
);


CREATE TABLE livequiz_attempts (
	id SERIAL NOT NULL,
	class_id INTEGER NOT NULL,
	session_id INTEGER NOT NULL,
	quiz_id VARCHAR,
	participant_id INTEGER,
	student_id INTEGER,
	participant_identifier VARCHAR,
	participant_display_name VARCHAR NOT NULL,
	score INTEGER NOT NULL,
	score_percent INTEGER,
	total_questions INTEGER NOT NULL,
	completed BOOLEAN NOT NULL,
	scored_mode BOOLEAN NOT NULL,
	excluded_from_average BOOLEAN NOT NULL,
	submitted_at TIMESTAMP WITHOUT TIME ZONE,
	finished_at TIMESTAMP WITHOUT TIME ZONE,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(class_id) REFERENCES classes (id),
	FOREIGN KEY(session_id) REFERENCES livequiz_sessions (id),
	FOREIGN KEY(participant_id) REFERENCES livequiz_participants (id),
	FOREIGN KEY(student_id) REFERENCES students (id)
);

CREATE INDEX ix_school_days_id ON school_days (id);

CREATE INDEX ix_schools_id ON schools (id);

CREATE INDEX ix_teacher_planner_state_id ON teacher_planner_state (id);

CREATE UNIQUE INDEX ix_teacher_planner_state_teacher_id ON teacher_planner_state (teacher_id);

CREATE INDEX ix_school_departments_id ON school_departments (id);

CREATE INDEX ix_school_departments_school_id ON school_departments (school_id);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE INDEX ix_users_id ON users (id);

CREATE INDEX ix_users_school_id ON users (school_id);

CREATE INDEX ix_ai_usage_events_created_at ON ai_usage_events (created_at);

CREATE INDEX ix_ai_usage_events_id ON ai_usage_events (id);

CREATE INDEX ix_ai_usage_events_user_feature_created ON ai_usage_events (user_id, feature, created_at);

CREATE INDEX ix_ai_usage_events_user_id ON ai_usage_events (user_id);

CREATE UNIQUE INDEX ix_classes_class_code ON classes (class_code);

CREATE INDEX ix_classes_id ON classes (id);

CREATE INDEX ix_classes_owner_active_dashboard_order ON classes (owner_user_id, is_archived, dashboard_order, id);

CREATE INDEX ix_classes_owner_user_id ON classes (owner_user_id);

CREATE INDEX ix_email_verification_tokens_id ON email_verification_tokens (id);

CREATE UNIQUE INDEX ix_email_verification_tokens_token_hash ON email_verification_tokens (token_hash);

CREATE INDEX ix_email_verification_tokens_user_id ON email_verification_tokens (user_id);

CREATE INDEX ix_password_reset_tokens_id ON password_reset_tokens (id);

CREATE UNIQUE INDEX ix_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);

CREATE INDEX ix_password_reset_tokens_user_id ON password_reset_tokens (user_id);

CREATE INDEX ix_school_department_memberships_department_id ON school_department_memberships (department_id);

CREATE INDEX ix_school_department_memberships_id ON school_department_memberships (id);

CREATE INDEX ix_school_department_memberships_school_id ON school_department_memberships (school_id);

CREATE INDEX ix_school_department_memberships_user_id ON school_department_memberships (user_id);

CREATE INDEX ix_school_invitations_id ON school_invitations (id);

CREATE INDEX ix_school_invitations_normalized_email ON school_invitations (normalized_email);

CREATE INDEX ix_school_invitations_school_id ON school_invitations (school_id);

CREATE INDEX ix_teacher_admin_state_id ON teacher_admin_state (id);

CREATE UNIQUE INDEX ix_teacher_admin_state_owner_user_id ON teacher_admin_state (owner_user_id);

CREATE INDEX ix_ui_translation_overrides_id ON ui_translation_overrides (id);

CREATE INDEX ix_ui_translation_overrides_language_code ON ui_translation_overrides (language_code);

CREATE INDEX ix_ui_translation_overrides_updated_by_user_id ON ui_translation_overrides (updated_by_user_id);

CREATE INDEX ix_calendar_events_id ON calendar_events (id);

CREATE INDEX ix_calendar_events_owner_user_id ON calendar_events (owner_user_id);

CREATE INDEX ix_cat4_baseline_sets_class_id ON cat4_baseline_sets (class_id);

CREATE INDEX ix_cat4_baseline_sets_id ON cat4_baseline_sets (id);

CREATE INDEX ix_cat4_term_result_sets_class_id ON cat4_term_result_sets (class_id);

CREATE INDEX ix_cat4_term_result_sets_id ON cat4_term_result_sets (id);

CREATE INDEX ix_cat4_workbook_versions_class_id ON cat4_workbook_versions (class_id);

CREATE INDEX ix_cat4_workbook_versions_id ON cat4_workbook_versions (id);

CREATE INDEX ix_class_assessments_id ON class_assessments (id);

CREATE INDEX ix_collab_sessions_class_id ON collab_sessions (class_id);

CREATE INDEX ix_collab_sessions_id ON collab_sessions (id);

CREATE UNIQUE INDEX ix_collab_sessions_session_code ON collab_sessions (session_code);

CREATE INDEX ix_collab_templates_id ON collab_templates (id);

CREATE INDEX ix_collab_templates_owner_user_id ON collab_templates (owner_user_id);

CREATE INDEX ix_collab_templates_source_class_id ON collab_templates (source_class_id);

CREATE INDEX ix_collab_templates_owner_updated ON collab_templates (owner_user_id, updated_at DESC);

CREATE INDEX ix_collab_templates_source_class ON collab_templates (source_class_id);

CREATE INDEX ix_livequiz_sessions_id ON livequiz_sessions (id);

CREATE UNIQUE INDEX ix_livequiz_sessions_session_code ON livequiz_sessions (session_code);

CREATE INDEX ix_posts_id ON posts (id);

CREATE INDEX ix_saved_quizzes_class_id ON saved_quizzes (class_id);

CREATE INDEX ix_saved_quizzes_id ON saved_quizzes (id);

CREATE INDEX ix_saved_quizzes_owner_user_id ON saved_quizzes (owner_user_id);

CREATE INDEX ix_school_admin_audit_log_actor_user_id ON school_admin_audit_log (actor_user_id);

CREATE INDEX ix_school_admin_audit_log_id ON school_admin_audit_log (id);

CREATE INDEX ix_school_admin_audit_log_invitation_id ON school_admin_audit_log (invitation_id);

CREATE INDEX ix_school_admin_audit_log_target_user_id ON school_admin_audit_log (target_user_id);

CREATE INDEX ix_student_access_links_class_id ON student_access_links (class_id);

CREATE INDEX ix_student_access_links_id ON student_access_links (id);

CREATE INDEX ix_student_access_links_is_active ON student_access_links (is_active);

CREATE UNIQUE INDEX ix_student_access_links_token ON student_access_links (token);

CREATE INDEX ix_students_id ON students (id);

CREATE INDEX ix_test_categories_id ON test_categories (id);

CREATE INDEX ix_topics_id ON topics (id);

CREATE INDEX ix_ui_translation_override_revisions_id ON ui_translation_override_revisions (id);

CREATE INDEX ix_ui_translation_override_revisions_language_code ON ui_translation_override_revisions (language_code);

CREATE INDEX ix_ui_translation_override_revisions_override_id ON ui_translation_override_revisions (override_id);

CREATE INDEX ix_ui_translation_override_revisions_reviewed_by_user_id ON ui_translation_override_revisions (reviewed_by_user_id);

CREATE INDEX ix_ui_translation_override_revisions_override_created_at ON ui_translation_override_revisions (override_id, created_at DESC);

CREATE INDEX ix_ui_translation_override_revisions_reviewer_user_id ON ui_translation_override_revisions (reviewed_by_user_id);

CREATE INDEX ix_whiteboard_states_class_id ON whiteboard_states (class_id);

CREATE INDEX ix_whiteboard_states_id ON whiteboard_states (id);

CREATE INDEX ix_whiteboard_states_owner_user_id ON whiteboard_states (owner_user_id);

CREATE INDEX ix_assessment_results_id ON assessment_results (id);

CREATE INDEX ix_cat4_student_baselines_baseline_set_id ON cat4_student_baselines (baseline_set_id);

CREATE INDEX ix_cat4_student_baselines_class_id ON cat4_student_baselines (class_id);

CREATE INDEX ix_cat4_student_baselines_id ON cat4_student_baselines (id);

CREATE INDEX ix_cat4_student_baselines_student_id ON cat4_student_baselines (student_id);

CREATE INDEX ix_cat4_student_term_results_class_id ON cat4_student_term_results (class_id);

CREATE INDEX ix_cat4_student_term_results_id ON cat4_student_term_results (id);

CREATE INDEX ix_cat4_student_term_results_result_set_id ON cat4_student_term_results (result_set_id);

CREATE INDEX ix_cat4_student_term_results_student_id ON cat4_student_term_results (student_id);

CREATE INDEX ix_collab_participants_anon_id ON collab_participants (anon_id);

CREATE INDEX ix_collab_participants_id ON collab_participants (id);

CREATE INDEX ix_collab_participants_session_id ON collab_participants (session_id);

CREATE INDEX ix_department_collab_template_shares_department_id ON department_collab_template_shares (department_id);

CREATE INDEX ix_department_collab_template_shares_id ON department_collab_template_shares (id);

CREATE INDEX ix_department_collab_template_shares_shared_by_user_id ON department_collab_template_shares (shared_by_user_id);

CREATE INDEX ix_department_collab_template_shares_template_id ON department_collab_template_shares (template_id);

CREATE INDEX ix_department_collab_template_shares_template ON department_collab_template_shares (template_id);

CREATE INDEX ix_department_saved_quiz_shares_department_id ON department_saved_quiz_shares (department_id);

CREATE INDEX ix_department_saved_quiz_shares_id ON department_saved_quiz_shares (id);

CREATE INDEX ix_department_saved_quiz_shares_saved_quiz_id ON department_saved_quiz_shares (saved_quiz_id);

CREATE INDEX ix_department_saved_quiz_shares_shared_by_user_id ON department_saved_quiz_shares (shared_by_user_id);

CREATE INDEX ix_department_saved_quiz_shares_quiz ON department_saved_quiz_shares (saved_quiz_id);

CREATE INDEX ix_school_department_memberships_school_user ON school_department_memberships (school_id, user_id);

CREATE INDEX ix_livequiz_participants_id ON livequiz_participants (id);

CREATE INDEX ix_notes_id ON notes (id);

CREATE INDEX ix_notes_whiteboard_state_id ON notes (whiteboard_state_id);

CREATE INDEX ix_saved_quiz_questions_id ON saved_quiz_questions (id);

CREATE INDEX ix_saved_quiz_questions_quiz_id ON saved_quiz_questions (quiz_id);

CREATE INDEX ix_tests_id ON tests (id);

CREATE INDEX ix_livequiz_answers_id ON livequiz_answers (id);

CREATE INDEX ix_livequiz_attempts_class_id ON livequiz_attempts (class_id);

CREATE INDEX ix_livequiz_attempts_id ON livequiz_attempts (id);

CREATE INDEX ix_livequiz_attempts_participant_id ON livequiz_attempts (participant_id);

CREATE INDEX ix_livequiz_attempts_session_id ON livequiz_attempts (session_id);

CREATE INDEX ix_livequiz_attempts_student_id ON livequiz_attempts (student_id);

ALTER TABLE schools ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE schools ALTER COLUMN seat_limit SET DEFAULT 0;
ALTER TABLE schools ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE schools ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE schools ADD CONSTRAINT ck_schools_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
CREATE UNIQUE INDEX uq_schools_slug ON schools (slug) WHERE slug IS NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'teacher';
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
ALTER TABLE school_invitations ALTER COLUMN intended_role SET DEFAULT 'teacher';
ALTER TABLE school_invitations ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX uq_school_invitations_open_school_email ON school_invitations (school_id, normalized_email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE school_admin_audit_log ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX ix_school_admin_audit_log_school_created_at ON school_admin_audit_log (school_id, created_at DESC);
ALTER TABLE ai_usage_events ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE collab_templates ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE collab_templates ALTER COLUMN updated_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE school_departments ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE school_departments ALTER COLUMN updated_at SET DEFAULT (timezone('utc', now()));
CREATE UNIQUE INDEX uq_school_departments_school_name_ci ON school_departments (school_id, lower(name));
ALTER TABLE school_department_memberships ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE department_collab_template_shares ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE department_saved_quiz_shares ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE ui_translation_overrides ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE ui_translation_overrides ALTER COLUMN updated_at SET DEFAULT (timezone('utc', now()));
ALTER TABLE ui_translation_override_revisions ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));

INSERT INTO schema_migrations (version) VALUES ('001'), ('002'), ('003'), ('004'), ('005'), ('006'), ('007'), ('008'), ('009'), ('010');
COMMIT;
