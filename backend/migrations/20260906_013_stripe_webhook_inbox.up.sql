CREATE TABLE stripe_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    stripe_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    stripe_created_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stripe_api_version VARCHAR(64) NULL,
    livemode BOOLEAN NOT NULL,
    entity_key VARCHAR(255) NULL,
    stripe_customer_id VARCHAR(255) NULL,
    stripe_subscription_id VARCHAR(255) NULL,
    resolved_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    payload_sha256 CHAR(64) NOT NULL,
    event_data JSONB NOT NULL,
    processing_state VARCHAR(16) NOT NULL DEFAULT 'received',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ NULL,
    processed_at TIMESTAMPTZ NULL,
    next_attempt_at TIMESTAMPTZ NULL,
    failure_code VARCHAR(80) NULL,
    failure_detail VARCHAR(500) NULL,
    last_failure_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_stripe_webhook_events_stripe_event_id UNIQUE (stripe_event_id),
    CONSTRAINT ck_stripe_webhook_events_identifiers CHECK (
        stripe_event_id <> '' AND stripe_event_id = btrim(stripe_event_id) AND
        event_type <> '' AND event_type = btrim(event_type) AND
        (entity_key IS NULL OR (entity_key <> '' AND entity_key = btrim(entity_key))) AND
        (stripe_customer_id IS NULL OR (stripe_customer_id <> '' AND stripe_customer_id = btrim(stripe_customer_id))) AND
        (stripe_subscription_id IS NULL OR (stripe_subscription_id <> '' AND stripe_subscription_id = btrim(stripe_subscription_id)))
    ),
    CONSTRAINT ck_stripe_webhook_events_payload_sha256 CHECK (
        payload_sha256 ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_stripe_webhook_events_event_data_object CHECK (
        jsonb_typeof(event_data) = 'object'
    ),
    CONSTRAINT ck_stripe_webhook_events_state CHECK (
        processing_state IN ('received', 'processing', 'processed', 'failed', 'ignored')
    ),
    CONSTRAINT ck_stripe_webhook_events_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT ck_stripe_webhook_events_state_timestamps CHECK (
        (
            processing_state = 'received' AND claimed_at IS NULL AND processed_at IS NULL AND
            next_attempt_at IS NULL AND failure_code IS NULL AND failure_detail IS NULL AND last_failure_at IS NULL
        ) OR (
            processing_state = 'processing' AND claimed_at IS NOT NULL AND processed_at IS NULL AND
            next_attempt_at IS NULL AND failure_code IS NULL AND failure_detail IS NULL AND last_failure_at IS NULL
        ) OR (
            processing_state IN ('processed', 'ignored') AND processed_at IS NOT NULL AND
            next_attempt_at IS NULL AND failure_code IS NULL AND failure_detail IS NULL AND last_failure_at IS NULL
        ) OR (
            processing_state = 'failed' AND claimed_at IS NULL AND processed_at IS NULL AND
            failure_code IS NOT NULL AND failure_code <> '' AND failure_code = btrim(failure_code) AND
            failure_code ~ '^[a-z0-9_:-]+$' AND
            (failure_detail IS NULL OR (failure_detail <> '' AND failure_detail = btrim(failure_detail))) AND
            last_failure_at IS NOT NULL
        )
    )
);

COMMENT ON TABLE stripe_webhook_events IS
    'Durable Stripe webhook inbox. event_data is an allowlisted minimized projection only; never store raw payloads, headers, signatures, payment methods, card data, or billing addresses.';
COMMENT ON COLUMN stripe_webhook_events.event_data IS
    'Allowlisted minimal event projection required for local processing and replay; not a raw Stripe payload.';
COMMENT ON COLUMN stripe_webhook_events.failure_detail IS
    'Sanitized bounded operator detail only; never store raw exceptions or event payloads.';

CREATE INDEX ix_stripe_webhook_events_queue
    ON stripe_webhook_events (processing_state, next_attempt_at, received_at)
    WHERE processing_state IN ('received', 'failed');
CREATE INDEX ix_stripe_webhook_events_subscription_created
    ON stripe_webhook_events (stripe_subscription_id, stripe_created_at DESC);
CREATE INDEX ix_stripe_webhook_events_customer_created
    ON stripe_webhook_events (stripe_customer_id, stripe_created_at DESC);
CREATE INDEX ix_stripe_webhook_events_user_received
    ON stripe_webhook_events (resolved_user_id, received_at DESC);
CREATE INDEX ix_stripe_webhook_events_entity_created
    ON stripe_webhook_events (entity_key, stripe_created_at DESC);
