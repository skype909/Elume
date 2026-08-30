-- Safe only while no AI usage events need to be retained.

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM ai_usage_events) THEN
        RAISE EXCEPTION 'Cannot roll back: AI usage events exist';
    END IF;
END $$;

DROP TABLE ai_usage_events;

COMMIT;
