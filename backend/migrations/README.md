# PostgreSQL migrations

This directory contains explicit, reviewed PostgreSQL SQL migrations. They are **not** discovered or run automatically by Elume, SQLAlchemy, or application startup.

Before applying a production migration, take and verify an AWS RDS snapshot, review the matching rollback file, and run the SQL through an approved manual deployment process. Apply each forward migration once and record the deployment externally until a migration runner is introduced.

Do not rely on `Base.metadata.create_all()` for changes to existing tables; it creates missing tables but does not alter an existing schema.
