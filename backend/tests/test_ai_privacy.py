import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_privacy import (
    append_report_comment_sign_off,
    cat4_facts_for_ai,
    report_comment_ai_input,
    restore_report_comment_student_name,
)


class AIPrivacyTests(unittest.TestCase):
    def test_cat4_ai_payload_omits_direct_student_identifiers(self):
        facts = {
            "student_name": "Example Student",
            "student_id": 123,
            "class_id": 45,
            "email": "student@example.invalid",
            "date_of_birth": "2010-01-01",
            "status_label": "Within Expected Range",
            "latest_average_percent": 72,
            "subject_story_summary": "Recent attainment is broadly steady.",
        }

        safe_facts = cat4_facts_for_ai(facts)

        self.assertNotIn("student_name", safe_facts)
        self.assertNotIn("student_id", safe_facts)
        self.assertNotIn("class_id", safe_facts)
        self.assertNotIn("email", safe_facts)
        self.assertNotIn("date_of_birth", safe_facts)
        self.assertEqual(safe_facts["latest_average_percent"], 72)
        self.assertEqual(safe_facts["status_label"], "Within Expected Range")

    def test_report_comment_name_is_restored_only_after_the_ai_draft(self):
        draft = "The student has shown steady progress this term. The student should continue practising."

        comment = restore_report_comment_student_name(draft, "Aoife")

        self.assertEqual(
            comment,
            "Aoife has shown steady progress this term. The student should continue practising.",
        )

    def test_report_comment_name_restoration_only_changes_the_opening_reference(self):
        self.assertEqual(
            restore_report_comment_student_name(
                "The student has made very good progress this term.",
                "Peter",
            ),
            "Peter has made very good progress this term.",
        )
        self.assertEqual(
            restore_report_comment_student_name(
                "The student has worked consistently and the student should continue to revise regularly.",
                "Peter",
            ),
            "Peter has worked consistently and the student should continue to revise regularly.",
        )
        self.assertEqual(
            restore_report_comment_student_name("The student's work is improving.", "Peter"),
            "Peter's work is improving.",
        )
        self.assertEqual(restore_report_comment_student_name("Well done.", ""), "Well done.")

    def test_report_sign_off_stays_local_and_is_appended_after_generation(self):
        sign_off = "Kind regards, Ms Example."
        prompt = report_comment_ai_input(
            average=72.5,
            latest_score=76,
            assessments_completed=4,
            assessments_missed=1,
            indicators=["Consistent effort"],
            length_instruction="Write about 3 sentences.",
        )

        self.assertNotIn(sign_off, prompt)
        self.assertEqual(
            append_report_comment_sign_off("Peter has made steady progress.", sign_off),
            "Peter has made steady progress. Kind regards, Ms Example.",
        )

    def test_report_comment_ai_input_contains_educational_facts_not_identifiers(self):
        prompt = report_comment_ai_input(
            average=72.5,
            latest_score=76,
            assessments_completed=4,
            assessments_missed=1,
            indicators=["Consistent effort"],
            length_instruction="Write about 3 sentences.",
        )

        self.assertIn("Average score: 72.5", prompt)
        self.assertIn("Indicators: Consistent effort", prompt)
        self.assertNotIn("Student name", prompt)
        self.assertNotIn("Teacher email", prompt)
        self.assertNotIn("Sign-off", prompt)


if __name__ == "__main__":
    unittest.main()
