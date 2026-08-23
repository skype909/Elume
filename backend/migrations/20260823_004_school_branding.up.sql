-- School branding foundation for PostgreSQL.
-- Apply manually after the School Admin migrations and an RDS snapshot.
-- Existing school rows deliberately retain NULL slugs: platform admins must
-- review and assign stable public slugs rather than relying on unsafe SQL
-- derivation from potentially ambiguous historic school names.

BEGIN;

ALTER TABLE schools
    ADD COLUMN slug VARCHAR(63) NULL,
    ADD COLUMN logo_storage_key VARCHAR(512) NULL;

ALTER TABLE schools
    ADD CONSTRAINT ck_schools_slug_format
    CHECK (
        slug IS NULL
        OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    );

CREATE UNIQUE INDEX uq_schools_slug
    ON schools (slug)
    WHERE slug IS NOT NULL;

COMMIT;
