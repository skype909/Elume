DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM stripe_webhook_events) THEN
        RAISE EXCEPTION 'Cannot roll back migration 013: Stripe webhook inbox contains history';
    END IF;
END $$;

DROP TABLE stripe_webhook_events;
