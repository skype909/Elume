import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ai_usage
from ai_usage import AI_FEATURES, allowance_available, allowance_message, allowance_warning, current_allowance_period, feature_policy


class AIUsagePolicyTests(unittest.TestCase):
    def setUp(self):
        self.original_timezone = ai_usage.DUBLIN_TZ
        # The local Windows Python may not ship IANA tzdata. These August fixtures
        # exercise the same +01:00 Dublin offset as production at that date.
        if ai_usage.DUBLIN_TZ is None:
            ai_usage.DUBLIN_TZ = timezone(timedelta(hours=1))

    def tearDown(self):
        ai_usage.DUBLIN_TZ = self.original_timezone

    def test_daily_period_uses_dublin_midnight(self):
        start, end = current_allowance_period("daily", datetime(2026, 8, 30, 12, tzinfo=timezone.utc))
        self.assertEqual(start, datetime(2026, 8, 29, 23, tzinfo=None))
        self.assertEqual(end, datetime(2026, 8, 30, 23, tzinfo=None))

    def test_weekly_period_starts_at_dublin_monday(self):
        start, end = current_allowance_period("weekly", datetime(2026, 8, 30, 12, tzinfo=timezone.utc))
        self.assertEqual(start, datetime(2026, 8, 23, 23, tzinfo=None))
        self.assertEqual(end, datetime(2026, 8, 30, 23, tzinfo=None))

    def test_feature_thresholds(self):
        self.assertTrue(allowance_available("quiz", 19))
        self.assertFalse(allowance_available("quiz", 20))
        for feature in ("scheme_of_work", "department_plan"):
            self.assertTrue(allowance_available(feature, 0))
            self.assertTrue(allowance_available(feature, 1))
            self.assertTrue(allowance_available(feature, 2))
            self.assertFalse(allowance_available(feature, 3))
        self.assertTrue(allowance_available("cat4_interpretation", 99))
        self.assertFalse(allowance_available("cat4_interpretation", 100))

    def test_report_comment_monthly_limits_and_warnings(self):
        normal_month = datetime(2026, 2, 15, 12, tzinfo=timezone.utc)
        for month in (2, 3, 4, 7, 8, 9, 10, 11):
            policy = feature_policy("report_comment", datetime(2026, month, 15, 12, tzinfo=timezone.utc))
            self.assertEqual((policy["period"], policy["limit"], policy["warning_at"]), ("monthly", 250, 188))
        self.assertTrue(allowance_available("report_comment", 249, normal_month))
        self.assertFalse(allowance_available("report_comment", 250, normal_month))
        self.assertIsNone(allowance_warning("report_comment", 187, normal_month))
        self.assertEqual(allowance_warning("report_comment", 188, normal_month), "62 student report comments remaining this month")

        for month in (12, 1, 5, 6):
            policy = feature_policy("report_comment", datetime(2026, month, 15, 12, tzinfo=timezone.utc))
            self.assertEqual((policy["period"], policy["limit"], policy["warning_at"]), ("monthly", 300, 225))
        december = datetime(2026, 12, 15, 12, tzinfo=timezone.utc)
        self.assertTrue(allowance_available("report_comment", 299, december))
        self.assertFalse(allowance_available("report_comment", 300, december))
        self.assertIsNone(allowance_warning("report_comment", 224, december))
        self.assertEqual(allowance_warning("report_comment", 225, december), "75 student report comments remaining this month")

    def test_report_comment_month_boundaries_use_dublin_offsets(self):
        fixtures = (
            # November and winter report periods use UTC; summer periods use Dublin's +01:00 offset.
            (datetime(2026, 11, 15, 12, tzinfo=timezone.utc), timezone.utc, datetime(2026, 11, 1), datetime(2026, 12, 1)),
            (datetime(2026, 1, 15, 12, tzinfo=timezone.utc), timezone.utc, datetime(2026, 1, 1), datetime(2026, 2, 1)),
            (datetime(2026, 4, 15, 12, tzinfo=timezone.utc), timezone(timedelta(hours=1)), datetime(2026, 3, 31, 23), datetime(2026, 4, 30, 23)),
            (datetime(2026, 6, 15, 12, tzinfo=timezone.utc), timezone(timedelta(hours=1)), datetime(2026, 5, 31, 23), datetime(2026, 6, 30, 23)),
        )
        for now, expected_offset, expected_start, expected_end in fixtures:
            original_timezone = ai_usage.DUBLIN_TZ
            ai_usage.DUBLIN_TZ = expected_offset
            try:
                start, end = current_allowance_period("monthly", now)
            finally:
                ai_usage.DUBLIN_TZ = original_timezone
            self.assertEqual((start, end), (expected_start, expected_end))

    def test_report_comment_limit_message_names_next_month_reset(self):
        message = allowance_message("report_comment", 250, datetime(2026, 11, 15, 12, tzinfo=timezone.utc))
        self.assertIn("this month", message)
        self.assertIn("1 December", message)

    def test_other_feature_configurations_are_unchanged(self):
        expected = {
            "quiz": ("weekly", 20, 15),
            "calendar": ("daily", 30, 23),
            "three_ideas": ("daily", 10, 8),
            "lesson_plan": ("daily", 3, 2),
            "worksheet": ("daily", 3, 2),
            "scheme_of_work": ("weekly", 3, 2),
            "department_plan": ("weekly", 3, 2),
            "cat4_interpretation": ("daily", 100, 75),
        }
        for feature, values in expected.items():
            self.assertEqual(
                (AI_FEATURES[feature]["period"], AI_FEATURES[feature]["limit"], AI_FEATURES[feature]["warning_at"]),
                values,
            )

    def test_warnings_only_begin_at_configured_threshold(self):
        self.assertIsNone(allowance_warning("scheme_of_work", 1))
        self.assertEqual(allowance_warning("scheme_of_work", 2), "1 Scheme of Work generation remaining this week")
        self.assertIsNone(allowance_warning("quiz", 14))
        self.assertEqual(allowance_warning("quiz", 15), "5 AI quiz generations remaining this week")


if __name__ == "__main__":
    unittest.main()
