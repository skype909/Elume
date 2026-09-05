-- Explicit, ledger-gated CAT4 cohort schema migration.
-- The schema.migrate_011_cat4_cohort_schema runner owns the surrounding
-- transaction and records version 011 only after every statement succeeds.

ALTER TABLE cat4_baseline_sets ADD COLUMN cohort_key VARCHAR;
ALTER TABLE cat4_baseline_sets ADD COLUMN cohort_name VARCHAR;
ALTER TABLE cat4_term_result_sets ADD COLUMN cohort_key VARCHAR;
ALTER TABLE cat4_term_result_sets ADD COLUMN cohort_name VARCHAR;
ALTER TABLE cat4_workbook_versions ADD COLUMN cohort_key VARCHAR;
ALTER TABLE cat4_workbook_versions ADD COLUMN cohort_name VARCHAR;

UPDATE cat4_baseline_sets SET cohort_key = 'default', cohort_name = 'Default Cohort'
WHERE cohort_key IS NULL OR cohort_name IS NULL;
UPDATE cat4_term_result_sets SET cohort_key = 'default', cohort_name = 'Default Cohort'
WHERE cohort_key IS NULL OR cohort_name IS NULL;
UPDATE cat4_workbook_versions SET cohort_key = 'default', cohort_name = 'Default Cohort'
WHERE cohort_key IS NULL OR cohort_name IS NULL;

ALTER TABLE cat4_baseline_sets ALTER COLUMN cohort_key SET NOT NULL;
ALTER TABLE cat4_baseline_sets ALTER COLUMN cohort_name SET NOT NULL;
ALTER TABLE cat4_term_result_sets ALTER COLUMN cohort_key SET NOT NULL;
ALTER TABLE cat4_term_result_sets ALTER COLUMN cohort_name SET NOT NULL;
ALTER TABLE cat4_workbook_versions ALTER COLUMN cohort_key SET NOT NULL;
ALTER TABLE cat4_workbook_versions ALTER COLUMN cohort_name SET NOT NULL;

CREATE INDEX ix_cat4_baseline_sets_cohort_key ON cat4_baseline_sets (cohort_key);
CREATE INDEX ix_cat4_term_result_sets_cohort_key ON cat4_term_result_sets (cohort_key);
CREATE INDEX ix_cat4_workbook_versions_cohort_key ON cat4_workbook_versions (cohort_key);
