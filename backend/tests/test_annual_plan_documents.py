import unittest
from io import BytesIO
import zipfile
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from annual_plan_documents import normalise, validate_document
from annual_plan_docx import render_structured_annual_plan_docx
import main


class AnnualPlanDocumentTests(unittest.TestCase):
    def payload(self):
        return {"document": {"title": "Fifth Year Physics Year Plan", "subject": "Physics", "level": "Leaving Cert", "class_context": "5A", "academic_year": "2026-2027", "planning_basis": ["Confirmed weekly capacity: 120 lessons.", "All selected topics are included."], "calendar_constraints": ["Christmas closure: 21 December to 4 January."], "course_map": [{"dates": "September to January", "start_date": "2026-09-01", "end_date": "2027-01-29", "topic": "Mechanics", "learning_focus": "Use forces and motion models.", "practical_or_assessment": "Practical check.", "lessons": 45, "minutes": 2475}, {"dates": "February to May", "start_date": "2027-02-01", "end_date": "2027-05-28", "topic": "Waves", "learning_focus": "Explain wave behaviour.", "lessons": 40, "minutes": 2200}], "teaching_assessment_rhythm": ["Use retrieval checks every two weeks."], "practical_project_programme": ["Schedule practical work before revision."], "checkpoints_and_buffers": ["Keep a recovery week each term."], "planning_sources": ["Teacher-confirmed topic list."], "assumptions_and_adjustment_rules": ["Rebalance suggested pacing if closures change."], "first_lesson": "Introduce the year plan and check prior knowledge."}}

    def test_normalises_and_exports_a_structured_annual_plan(self):
        result = normalise(self.payload(), "Fallback")
        self.assertEqual(result["document"]["resource_type"], "annual_plan")
        self.assertEqual(len(result["document"]["course_map"]), 2)
        data = render_structured_annual_plan_docx(validate_document(result["document"]), teacher="Ms Example")
        self.assertTrue(zipfile.is_zipfile(BytesIO(data)))

    def test_rejects_missing_year_or_course_map(self):
        payload = self.payload()["document"]
        del payload["academic_year"]
        with self.assertRaises(Exception):
            normalise(payload, "Fallback")

    def test_rejects_omitted_topics_and_over_capacity(self):
        planning = {"start_date": "2026-09-01", "end_date": "2027-06-30", "topics": ["Mechanics", "Waves", "Electricity"], "capacity": {"lessons": 90, "minutes": 5000}}
        with self.assertRaisesRegex(ValueError, "omitted"):
            normalise(self.payload(), "Fallback", planning)
        planning["topics"] = ["Mechanics", "Waves"]
        planning["capacity"] = {"lessons": 80, "minutes": 4000}
        with self.assertRaisesRegex(ValueError, "exceeds"):
            normalise(self.payload(), "Fallback", planning)

    def test_rejects_course_map_dates_outside_confirmed_year(self):
        payload = self.payload()
        payload["document"]["course_map"][0]["end_date"] = "2027-07-05"
        planning = {"start_date": "2026-09-01", "end_date": "2027-06-30", "topics": ["Mechanics", "Waves"], "capacity": {"lessons": 100, "minutes": 6000}}
        with self.assertRaisesRegex(ValueError, "outside"):
            normalise(payload, "Fallback", planning)

    def test_pdf_endpoint_uses_annual_document_renderer_not_lesson_validator(self):
        document = normalise(self.payload(), "Fallback")["document"]
        payload = main.ExportDocxRequest(title=document["title"], content="annual content", document=document, teacher="Ms Example", meta={"schoolName": "Example School"})
        with patch("main.render_structured_annual_plan_docx", return_value=b"annual-docx") as annual_renderer, patch("main._convert_structured_lesson_plan_docx_to_pdf", return_value=b"%PDF-annual") as converter:
            response = main.export_pdf(payload)
        self.assertEqual(response.media_type, "application/pdf")
        annual_renderer.assert_called_once()
        converter.assert_called_once_with(b"annual-docx")


if __name__ == "__main__":
    unittest.main()
