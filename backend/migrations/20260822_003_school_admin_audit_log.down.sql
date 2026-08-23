-- Rollback for 20260822_003_school_admin_audit_log.up.sql.
-- WARNING: this permanently removes School Admin audit history.

BEGIN;

DROP INDEX IF EXISTS ix_school_admin_audit_log_invitation_id;
DROP INDEX IF EXISTS ix_school_admin_audit_log_target_user_id;
DROP INDEX IF EXISTS ix_school_admin_audit_log_actor_user_id;
DROP INDEX IF EXISTS ix_school_admin_audit_log_school_created_at;
DROP TABLE IF EXISTS school_admin_audit_log;

COMMIT;
