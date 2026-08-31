BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM department_collab_template_shares)
       OR EXISTS (SELECT 1 FROM department_saved_quiz_shares)
       OR EXISTS (SELECT 1 FROM school_department_memberships)
       OR EXISTS (SELECT 1 FROM school_departments) THEN
        RAISE EXCEPTION 'Cannot roll back: department or sharing data exists';
    END IF;
END $$;

DROP TABLE department_saved_quiz_shares;
DROP TABLE department_collab_template_shares;
DROP TABLE school_department_memberships;
DROP TABLE school_departments;
ALTER TABLE users DROP CONSTRAINT uq_users_id_school;

COMMIT;
