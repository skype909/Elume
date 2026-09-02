BEGIN;

CREATE TABLE ui_translation_overrides (
    id SERIAL PRIMARY KEY,
    language_code VARCHAR(16) NOT NULL,
    translation_key VARCHAR(160) NOT NULL,
    value TEXT NOT NULL,
    base_value_at_edit TEXT NULL,
    updated_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    updated_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    CONSTRAINT uq_ui_translation_overrides_language_key UNIQUE (language_code, translation_key)
);
CREATE INDEX ix_ui_translation_overrides_language_code ON ui_translation_overrides (language_code);
CREATE INDEX ix_ui_translation_overrides_updated_by_user_id ON ui_translation_overrides (updated_by_user_id);

CREATE TABLE ui_translation_override_revisions (
    id SERIAL PRIMARY KEY,
    override_id INTEGER NOT NULL REFERENCES ui_translation_overrides(id) ON DELETE RESTRICT,
    language_code VARCHAR(16) NOT NULL,
    translation_key VARCHAR(160) NOT NULL,
    previous_value TEXT NULL,
    new_value TEXT NOT NULL,
    base_value_at_edit TEXT NULL,
    reviewed_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now()))
);
CREATE INDEX ix_ui_translation_override_revisions_override_created_at
    ON ui_translation_override_revisions (override_id, created_at DESC);
CREATE INDEX ix_ui_translation_override_revisions_reviewer_user_id
    ON ui_translation_override_revisions (reviewed_by_user_id);

COMMIT;
