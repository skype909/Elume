CREATE TABLE school_email_domains (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
    domain VARCHAR(253) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMP NULL,
    revoked_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_school_email_domains_domain UNIQUE (domain),
    CONSTRAINT ck_school_email_domains_domain_canonical CHECK (
        domain = lower(btrim(domain)) AND position('@' IN domain) = 0 AND position(' ' IN domain) = 0
    ),
    CONSTRAINT ck_school_email_domains_revocation CHECK (
        (revoked_at IS NULL AND revoked_by_user_id IS NULL) OR
        (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
    )
);
CREATE INDEX ix_school_email_domains_school_active ON school_email_domains (school_id, is_active);
CREATE TABLE user_access_grants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    grant_type VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    granted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMP NULL,
    revoked_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    revocation_reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_user_access_grants_type CHECK (grant_type IN ('pilot', 'reviewer', 'internal', 'complimentary', 'promotional_annual')),
    CONSTRAINT ck_user_access_grants_window CHECK (expires_at IS NULL OR expires_at > starts_at),
    CONSTRAINT ck_user_access_grants_revocation CHECK (
        (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL) OR
        (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revocation_reason IS NOT NULL)
    )
);
CREATE INDEX ix_user_access_grants_user_active ON user_access_grants (user_id, starts_at, expires_at) WHERE revoked_at IS NULL;
