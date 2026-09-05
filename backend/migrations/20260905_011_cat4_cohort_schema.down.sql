-- The explicit runner owns the transaction. This only removes migration-011
-- cohort objects and its ledger row; historical-v010 data is preserved.

DROP INDEX ix_cat4_baseline_sets_cohort_key;
DROP INDEX ix_cat4_term_result_sets_cohort_key;
DROP INDEX ix_cat4_workbook_versions_cohort_key;

ALTER TABLE cat4_baseline_sets DROP COLUMN cohort_name;
ALTER TABLE cat4_baseline_sets DROP COLUMN cohort_key;
ALTER TABLE cat4_term_result_sets DROP COLUMN cohort_name;
ALTER TABLE cat4_term_result_sets DROP COLUMN cohort_key;
ALTER TABLE cat4_workbook_versions DROP COLUMN cohort_name;
ALTER TABLE cat4_workbook_versions DROP COLUMN cohort_key;
