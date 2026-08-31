BEGIN;

ALTER TABLE users ADD CONSTRAINT uq_users_id_school UNIQUE (id, school_id);

CREATE TABLE school_departments (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    updated_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    CONSTRAINT uq_school_departments_id_school UNIQUE (id, school_id)
);
CREATE INDEX ix_school_departments_school_id ON school_departments (school_id);
CREATE UNIQUE INDEX uq_school_departments_school_name_ci ON school_departments (school_id, lower(name));

CREATE TABLE school_department_memberships (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL,
    school_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    CONSTRAINT uq_school_department_memberships_department_user UNIQUE (department_id, user_id),
    CONSTRAINT fk_school_department_memberships_department_school
        FOREIGN KEY (department_id, school_id) REFERENCES school_departments (id, school_id) ON DELETE CASCADE,
    CONSTRAINT fk_school_department_memberships_user_school
        FOREIGN KEY (user_id, school_id) REFERENCES users (id, school_id) ON DELETE RESTRICT
);
CREATE INDEX ix_school_department_memberships_school_user ON school_department_memberships (school_id, user_id);

CREATE TABLE department_collab_template_shares (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES school_departments(id) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES collab_templates(id) ON DELETE CASCADE,
    shared_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    CONSTRAINT uq_department_collab_template_share UNIQUE (department_id, template_id)
);
CREATE INDEX ix_department_collab_template_shares_template ON department_collab_template_shares (template_id);

CREATE TABLE department_saved_quiz_shares (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES school_departments(id) ON DELETE CASCADE,
    saved_quiz_id INTEGER NOT NULL REFERENCES saved_quizzes(id) ON DELETE CASCADE,
    shared_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    CONSTRAINT uq_department_saved_quiz_share UNIQUE (department_id, saved_quiz_id)
);
CREATE INDEX ix_department_saved_quiz_shares_quiz ON department_saved_quiz_shares (saved_quiz_id);

COMMIT;
