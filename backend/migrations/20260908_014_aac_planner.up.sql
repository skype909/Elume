-- Applied only by the guarded migration-014 runner; no independent transaction.
ALTER TABLE classes ADD COLUMN aac_planner_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE aac_projects (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL CHECK (btrim(title) <> ''),
    subject VARCHAR(120) NOT NULL CHECK (btrim(subject) <> ''),
    examination_year INTEGER NULL,
    current_year_stage VARCHAR(32) NOT NULL DEFAULT 'fifth_year',
    weekly_minutes INTEGER NOT NULL DEFAULT 30,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    approved_revision_id INTEGER NULL,
    archived_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_aac_projects_class UNIQUE (class_id),
    CONSTRAINT ck_aac_projects_year_stage CHECK (current_year_stage IN ('fifth_year','sixth_year','underway')),
    CONSTRAINT ck_aac_projects_weekly_minutes CHECK (weekly_minutes BETWEEN 5 AND 600),
    CONSTRAINT ck_aac_projects_status CHECK (status IN ('draft','revision_pending','approved','archived'))
);
CREATE TABLE aac_plan_revisions (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES aac_projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'draft',
    source_requirements_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_requirements_json)='array'),
    plan_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(plan_json)='object'),
    assumptions_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumptions_json)='array'),
    source_document_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_document_ids_json)='array'),
    planning_inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(planning_inputs_json)='object'),
    approved_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_aac_plan_revisions_version UNIQUE(project_id, version),
    CONSTRAINT ck_aac_plan_revisions_version CHECK (version > 0),
    CONSTRAINT ck_aac_plan_revisions_state CHECK (state IN ('draft','approved','superseded')),
    CONSTRAINT ck_aac_plan_revisions_approval CHECK ((state='approved') = (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL))
);
CREATE TABLE aac_source_documents (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES aac_projects(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    purpose VARCHAR(32) NOT NULL,
    academic_year VARCHAR(32) NULL, display_filename VARCHAR(255) NOT NULL CHECK (btrim(display_filename) <> ''),
    storage_key VARCHAR(512) NOT NULL UNIQUE, content_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL, sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    extraction_state VARCHAR(16) NOT NULL DEFAULT 'pending',
    extraction_error VARCHAR(300) NULL, extracted_sections_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(extracted_sections_json)='array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_aac_source_documents_purpose CHECK (purpose IN ('specification','fifth_year_calendar','sixth_year_calendar')),
    CONSTRAINT ck_aac_source_documents_size CHECK (size_bytes > 0 AND size_bytes <= 15728640),
    CONSTRAINT ck_aac_source_documents_extraction_state CHECK (extraction_state IN ('pending','extracted','unreadable','replaced'))
);
ALTER TABLE aac_projects ADD CONSTRAINT fk_aac_projects_approved_revision FOREIGN KEY (approved_revision_id) REFERENCES aac_plan_revisions(id) ON DELETE RESTRICT;
CREATE TABLE aac_student_progress (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES aac_projects(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, current_stage VARCHAR(200) NULL,
    checkpoints_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checkpoints_json)='array'), observation VARCHAR(500) NULL,
    next_action VARCHAR(500) NULL, next_check_in_at TIMESTAMPTZ NULL, last_checked_in_at TIMESTAMPTZ NULL,
    updated_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_aac_student_progress UNIQUE(project_id, student_id)
);
CREATE TABLE aac_practical_sessions (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES aac_projects(id) ON DELETE CASCADE,
    session_date TIMESTAMPTZ NOT NULL, stage_name VARCHAR(200) NULL, logistics_notes VARCHAR(1000) NULL,
    allocations_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allocations_json)='array'),
    created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_aac_projects_owner_class ON aac_projects(owner_user_id, class_id);
CREATE INDEX ix_aac_student_progress_project ON aac_student_progress(project_id, student_id);
CREATE INDEX ix_aac_practical_sessions_project_date ON aac_practical_sessions(project_id, session_date);
CREATE INDEX ix_aac_source_documents_project_purpose ON aac_source_documents(project_id, purpose, created_at);
