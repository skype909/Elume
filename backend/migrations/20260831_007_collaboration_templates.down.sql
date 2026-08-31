-- Safe only while no reusable Collaboration templates need to be retained.

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM collab_templates)
       OR EXISTS (SELECT 1 FROM collab_sessions WHERE clean_snapshot_json IS NOT NULL OR board_round <> 1) THEN
        RAISE EXCEPTION 'Cannot roll back: Collaboration template or round data exists';
    END IF;
END $$;

DROP TABLE collab_templates;

ALTER TABLE collab_sessions
    DROP COLUMN clean_snapshot_json,
    DROP COLUMN board_round;

COMMIT;
