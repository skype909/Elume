# PostgreSQL migrations

This directory contains explicit, reviewed PostgreSQL SQL migrations. They are **not** discovered or run automatically by Elume, SQLAlchemy, or application startup.

Before applying a production migration, take and verify an AWS RDS snapshot,
review the matching rollback file, and use an approved deployment process.
Historical migrations `001`â€“`010` remain manual reviewed SQL; migration `011`
is the first explicit ledger-aware runner.

`20260905_011_cat4_cohort_schema` is the exception: it is deliberately
ledger-gated and must be run only through
`python -m schema.migrate_011_cat4_cohort_schema`. The runner requires an
exact tracked historical `001`â€“`010` state, validates the full v010 schema
fingerprint, applies its SQL and ledger row `011` in one transaction, and
refuses duplicate, partial, or divergent states. Its SQL files intentionally
contain no `BEGIN`/`COMMIT`; the runner owns the transaction.

Do not rely on `Base.metadata.create_all()` for changes to existing tables; it creates missing tables but does not alter an existing schema.

School branding migration `20260823_004_school_branding` intentionally leaves existing school slugs NULL. Assign reviewed, stable slugs through the Platform Admin workflow after migration rather than deriving them automatically from historic names.

`20260823_005_school_admin_invitations` extends the existing invitation and audit
constraints for School Admin invitations. Its rollback deliberately refuses if
School Admin invitation data already exists.
