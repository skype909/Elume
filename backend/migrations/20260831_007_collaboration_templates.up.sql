-- Persist private teacher Collaboration templates and board-round identities.
-- Apply manually after migration 006.

BEGIN;

ALTER TABLE collab_sessions
    ADD COLUMN board_round INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN clean_snapshot_json TEXT NULL;

CREATE TABLE collab_templates (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    source_class_id INTEGER NULL REFERENCES classes(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    board_state_json TEXT NOT NULL,
    room_count INTEGER NOT NULL DEFAULT 4,
    timer_minutes INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    updated_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    CONSTRAINT ck_collab_templates_room_count CHECK (room_count BETWEEN 1 AND 12),
    CONSTRAINT ck_collab_templates_timer_minutes CHECK (timer_minutes IS NULL OR timer_minutes BETWEEN 1 AND 60)
);

CREATE INDEX ix_collab_templates_owner_updated
    ON collab_templates (owner_user_id, updated_at DESC);
CREATE INDEX ix_collab_templates_source_class
    ON collab_templates (source_class_id);

COMMIT;
