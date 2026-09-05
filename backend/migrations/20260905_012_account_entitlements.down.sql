DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM school_admin_audit_log WHERE action = 'school_domain_linked') THEN
        RAISE EXCEPTION 'Cannot roll back migration 012: school domain link audit history exists';
    END IF;
END $$;
DROP INDEX IF EXISTS ix_user_access_grants_user_active;
DROP TABLE user_access_grants;
DROP INDEX IF EXISTS ix_school_email_domains_school_active;
DROP TABLE school_email_domains;
ALTER TABLE school_admin_audit_log DROP CONSTRAINT ck_school_admin_audit_log_action;
ALTER TABLE school_admin_audit_log ADD CONSTRAINT ck_school_admin_audit_log_action CHECK (action IN (
    'invitation_created', 'invitation_resent', 'invitation_revoked',
    'invitation_accepted', 'teacher_deactivated', 'teacher_reactivated',
    'school_admin_invitation_created', 'school_admin_invitation_accepted'
));
