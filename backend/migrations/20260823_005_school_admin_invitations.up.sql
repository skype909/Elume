-- Allow the existing secure school invitation model to invite School Admins.
-- Apply manually after 20260822_002 and 20260822_003. Not run by startup.

BEGIN;

ALTER TABLE school_invitations
    DROP CONSTRAINT IF EXISTS ck_school_invitations_intended_role;
ALTER TABLE school_invitations
    ADD CONSTRAINT ck_school_invitations_intended_role
    CHECK (intended_role IN ('teacher', 'school_admin'));

ALTER TABLE school_admin_audit_log
    DROP CONSTRAINT IF EXISTS ck_school_admin_audit_log_action;
ALTER TABLE school_admin_audit_log
    ADD CONSTRAINT ck_school_admin_audit_log_action CHECK (
        action IN (
            'invitation_created', 'invitation_resent', 'invitation_revoked',
            'invitation_accepted', 'teacher_deactivated', 'teacher_reactivated',
            'school_admin_invitation_created', 'school_admin_invitation_accepted'
        )
    );

COMMIT;
