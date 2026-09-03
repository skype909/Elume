BEGIN;

ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS dashboard_order INTEGER NULL;

CREATE INDEX IF NOT EXISTS ix_classes_owner_active_dashboard_order
    ON classes (owner_user_id, is_archived, dashboard_order NULLS LAST, id);

COMMIT;
