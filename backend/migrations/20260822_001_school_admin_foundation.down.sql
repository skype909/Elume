-- Rollback for 20260822_001_school_admin_foundation.up.sql.
-- WARNING: only safe before real school, membership, or invitation data exists.
-- Applying this rollback after use discards School Admin foundation data.

BEGIN;

DROP INDEX IF EXISTS ix_users_school_id;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_school_id,
    DROP CONSTRAINT IF EXISTS ck_users_role,
    DROP COLUMN IF EXISTS school_id,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS role;

DROP TABLE IF EXISTS schools;

COMMIT;
