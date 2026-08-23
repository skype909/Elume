-- Rollback for 20260823_004_school_branding.up.sql.
-- WARNING: removes all persisted school branding metadata.

BEGIN;

DROP INDEX IF EXISTS uq_schools_slug;

ALTER TABLE schools
    DROP CONSTRAINT IF EXISTS ck_schools_slug_format,
    DROP COLUMN IF EXISTS logo_storage_key,
    DROP COLUMN IF EXISTS slug;

COMMIT;
