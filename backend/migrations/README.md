# PostgreSQL migrations

This directory contains explicit, reviewed PostgreSQL SQL migrations. They are **not** discovered or run automatically by Elume, SQLAlchemy, or application startup.

Before applying a production migration, take and verify an AWS RDS snapshot, review the matching rollback file, and run the SQL through an approved manual deployment process. Apply each forward migration once and record the deployment externally until a migration runner is introduced.

Do not rely on `Base.metadata.create_all()` for changes to existing tables; it creates missing tables but does not alter an existing schema.

School branding migration `20260823_004_school_branding` intentionally leaves existing school slugs NULL. Assign reviewed, stable slugs through the Platform Admin workflow after migration rather than deriving them automatically from historic names.

`20260823_005_school_admin_invitations` extends the existing invitation and audit
constraints for School Admin invitations. Its rollback deliberately refuses if
School Admin invitation data already exists.
