from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
import unittest

import main


class _UnexpectedQuerySession:
    def query(self, *_args, **_kwargs):
        raise AssertionError("empty CAT4 report must not query student rows")


class _RowsQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _PopulatedSession:
    def __init__(self):
        self._rows = [[], [], []]

    def query(self, *_args, **_kwargs):
        return _RowsQuery(self._rows.pop(0))


class Cat4CohortReportPayloadTests(unittest.TestCase):
    def _empty_report(self, baselines, terms):
        with (
            patch.object(main, "_cat4_cohort_columns_available", return_value=True),
            patch.object(main, "_cat4_resolve_cohort_key", return_value="default"),
            patch.object(main, "_cat4_baseline_sets_for_class", return_value=baselines),
            patch.object(main, "_cat4_term_sets_for_class", return_value=terms),
        ):
            return main._build_cat4_report_payload(18, _UnexpectedQuerySession(), cohort_key="default")

    def test_missing_baseline_returns_empty_report(self):
        report = self._empty_report([], [SimpleNamespace(id=20)])
        self.assertIsNone(report["baseline_set"])
        self.assertIsNone(report["latest_term_set"])
        self.assertEqual(report["all_matched_students"], [])

    def test_missing_terms_returns_empty_report(self):
        report = self._empty_report([SimpleNamespace(id=10)], [])
        self.assertIsNone(report["baseline_set"])
        self.assertIsNone(report["latest_term_set"])
        self.assertEqual(report["summary_cards"], [])

    def test_missing_baseline_and_terms_returns_empty_report(self):
        report = self._empty_report([], [])
        self.assertTrue(report["feature_enabled"])
        self.assertEqual(report["at_risk"], [])
        self.assertEqual(report["unmatched_term_rows"], [])

    def test_populated_cohort_uses_loaded_report_path(self):
        baseline = SimpleNamespace(id=10)
        term = SimpleNamespace(id=20, academic_year=None, term_key=None, created_at=datetime(2026, 1, 1))
        sentinel = {"feature_enabled": True, "baseline_set": {"id": 10}}
        with (
            patch.object(main, "_cat4_cohort_columns_available", return_value=True),
            patch.object(main, "_cat4_resolve_cohort_key", return_value="default"),
            patch.object(main, "_cat4_baseline_sets_for_class", return_value=[baseline]),
            patch.object(main, "_cat4_term_sets_for_class", return_value=[term]),
            patch.object(main, "_cat4_term_sort_key", return_value=(0,)),
            patch.object(main, "_cat4_build_report_payload_from_loaded", return_value=sentinel) as build,
        ):
            result = main._build_cat4_report_payload(18, _PopulatedSession(), cohort_key="default")
        self.assertIs(result, sentinel)
        self.assertEqual(build.call_args.args[:2], ([baseline], [term]))


if __name__ == "__main__":
    unittest.main()
