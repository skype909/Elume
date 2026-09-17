-- Apply only through schema.migrate_015_saved_videos_and_ui_language.
ALTER TABLE users ADD COLUMN ui_language VARCHAR(16) NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN ui_language_updated_at TIMESTAMP NULL;
ALTER TABLE users ADD CONSTRAINT ck_users_ui_language CHECK (ui_language IN ('en', 'ga'));

CREATE TABLE saved_videos (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    youtube_id VARCHAR(64) NOT NULL,
    url TEXT NOT NULL,
    title VARCHAR(500) NOT NULL,
    category VARCHAR(200) NOT NULL DEFAULT 'General',
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_saved_videos_class_youtube UNIQUE (class_id, youtube_id)
);
CREATE INDEX ix_saved_videos_class_added ON saved_videos (class_id, added_at DESC);

UPDATE ui_translation_overrides SET value = 'féach ar an amchlár'
WHERE language_code = 'ga' AND translation_key = 'dashboard.viewTimetable' AND value = 'Féach ar an Tráthchlár';
UPDATE ui_translation_overrides SET value = 'Scrúduithe'
WHERE language_code = 'ga' AND translation_key = 'class.tests' AND value = 'Tástálacha';
UPDATE ui_translation_overrides SET value = 'Uirlisí tapa don seomra ranga'
WHERE language_code = 'ga' AND translation_key = 'class.quickToolsSubtitle' AND value = 'Cabhair thapa sa cheacht';
UPDATE ui_translation_overrides SET value = 'Coimeádóir ama'
WHERE language_code = 'ga' AND translation_key IN ('class.timer', 'tools.timer') AND value = 'Amadóir';
