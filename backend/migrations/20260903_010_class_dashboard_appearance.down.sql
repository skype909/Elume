BEGIN;

DROP INDEX IF EXISTS ix_classes_owner_active_dashboard_order;

ALTER TABLE classes
    DROP COLUMN IF EXISTS dashboard_order;

COMMIT;
