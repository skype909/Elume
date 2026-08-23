-- Rollback for 20260822_002_school_invitations.up.sql.
-- WARNING: only safe before real invitation data is relied upon.

BEGIN;

DROP INDEX IF EXISTS uq_school_invitations_open_school_email;
DROP INDEX IF EXISTS ix_school_invitations_normalized_email;
DROP INDEX IF EXISTS ix_school_invitations_school_id;
DROP TABLE IF EXISTS school_invitations;

COMMIT;
