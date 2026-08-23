-- Rollback is safe only while no School Admin invitation or related audit event
-- exists. It deliberately refuses to discard that history.

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM school_invitations WHERE intended_role = 'school_admin') THEN
        RAISE EXCEPTION 'Cannot roll back: School Admin invitations exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM school_admin_audit_log
        WHERE action IN ('school_admin_invitation_created', 'school_admin_invitation_accepted')
    ) THEN
        RAISE EXCEPTION 'Cannot roll back: School Admin invitation audit events exist';
    END IF;
END $$;

ALTER TABLE school_admin_audit_log
    DROP CONSTRAINT IF EXISTS ck_school_admin_audit_log_action;
ALTER TABLE school_admin_audit_log
    ADD CONSTRAINT ck_school_admin_audit_log_action CHECK (
        action IN (
            'invitation_created', 'invitation_resent', 'invitation_revoked',
            'invitation_accepted', 'teacher_deactivated', 'teacher_reactivated'
        )
    );

ALTER TABLE school_invitations
    DROP CONSTRAINT IF EXISTS ck_school_invitations_intended_role;
ALTER TABLE school_invitations
    ADD CONSTRAINT ck_school_invitations_intended_role CHECK (intended_role = 'teacher');

COMMIT;
