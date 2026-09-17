DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM saved_videos) THEN
        RAISE EXCEPTION 'Cannot roll back migration 015 while saved videos exist';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE ui_language <> 'en') THEN
        RAISE EXCEPTION 'Cannot roll back migration 015 while non-English UI language preferences exist';
    END IF;
END $$;

DROP TABLE saved_videos;
ALTER TABLE users DROP CONSTRAINT ck_users_ui_language;
ALTER TABLE users DROP COLUMN ui_language_updated_at;
ALTER TABLE users DROP COLUMN ui_language;
