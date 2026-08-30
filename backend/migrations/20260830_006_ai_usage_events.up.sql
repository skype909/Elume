-- Add per-feature successful AI generation usage records. Apply manually after 005.

BEGIN;

CREATE TABLE ai_usage_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    feature VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (timezone('utc', now())),
    model VARCHAR(128) NOT NULL,
    input_tokens INTEGER NULL,
    output_tokens INTEGER NULL,
    total_tokens INTEGER NULL,
    CONSTRAINT ck_ai_usage_events_feature CHECK (
        feature IN (
            'quiz', 'calendar', 'three_ideas', 'lesson_plan', 'worksheet',
            'report_comment', 'scheme_of_work', 'department_plan', 'cat4_interpretation'
        )
    ),
    CONSTRAINT ck_ai_usage_events_input_tokens CHECK (input_tokens IS NULL OR input_tokens >= 0),
    CONSTRAINT ck_ai_usage_events_output_tokens CHECK (output_tokens IS NULL OR output_tokens >= 0),
    CONSTRAINT ck_ai_usage_events_total_tokens CHECK (total_tokens IS NULL OR total_tokens >= 0)
);

CREATE INDEX ix_ai_usage_events_user_feature_created
    ON ai_usage_events (user_id, feature, created_at);
CREATE INDEX ix_ai_usage_events_created_at
    ON ai_usage_events (created_at);

COMMIT;
