-- Guarded runner must refuse if AAC history, AAC calendar milestones, or enabled classes exist.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM aac_projects)
       OR EXISTS (SELECT 1 FROM aac_plan_revisions)
       OR EXISTS (SELECT 1 FROM aac_student_progress)
       OR EXISTS (SELECT 1 FROM aac_practical_sessions)
       OR EXISTS (SELECT 1 FROM aac_source_documents)
       OR EXISTS (SELECT 1 FROM calendar_events WHERE event_type = 'aac' OR description LIKE '[aac:%')
       OR EXISTS (SELECT 1 FROM classes WHERE aac_planner_enabled) THEN
        RAISE EXCEPTION 'Cannot roll back migration 014: AAC records, links, or enablement exist';
    END IF;
END $$;

ALTER TABLE aac_projects DROP CONSTRAINT fk_aac_projects_approved_revision;
DROP TABLE aac_practical_sessions;
DROP TABLE aac_source_documents;
DROP TABLE aac_student_progress;
DROP TABLE aac_plan_revisions;
DROP TABLE aac_projects;
ALTER TABLE classes DROP COLUMN aac_planner_enabled;
