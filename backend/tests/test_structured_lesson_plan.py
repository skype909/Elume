import sys
import unittest
import zipfile
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lesson_plan_docx import render_structured_lesson_plan_docx
from structured_documents import ValidationError, normalise_create_resources_result, validate_structured_lesson_plan_document


def lesson_plan_payload():
    return {
        "document": {
            "title": "Photosynthesis: energy transfer",
            "subject": "Biology",
            "level": "Leaving Certificate",
            "class_context": "5th Year",
            "duration": "55 minutes",
            "primary_outcome": "Students explain how light energy is converted into chemical energy during photosynthesis.",
            "learning_intentions": ["Describe the reactants and products of photosynthesis."],
            "success_criteria": ["I can use the word equation accurately."],
            "definitions": [{"term": "Chlorophyll", "definition": "A pigment that absorbs light energy."}],
            "resources": ["Equation handout", "Mini whiteboards"],
            "prior_knowledge": ["Plant cells contain chloroplasts."],
            "lesson_flow": [
                {"minutes": "0-8 min", "phase": "Starter", "teacher_action": "Elicit the plant-cell structures needed for photosynthesis.", "student_action": "Annotate a chloroplast diagram.", "check_for_understanding": "Students hold up the correct labelled diagram."},
                {"minutes": "8-45 min", "phase": "Development", "teacher_action": "Model the word equation and question likely misconceptions.", "student_action": "Complete and explain the equation in pairs.", "check_for_understanding": "Pairs justify where the energy enters the process."},
            ],
            "differentiation": ["Provide a labelled word bank where needed."],
            "misconceptions": ["Plants do not get their food from soil."],
            "assessment": ["Ask each student to complete the word equation independently."],
            "teacher_note": "Use the source vocabulary consistently before introducing the balanced chemical equation.",
            "homework": "Explain why a destarched leaf is used in the starch test.",
            "stopping_point": "Begin the chemical equation next lesson.",
        }
    }


class StructuredLessonPlanTests(unittest.TestCase):
    def test_valid_structured_lesson_plan_builds_document_and_export_text(self):
        result = normalise_create_resources_result("lesson_plan", lesson_plan_payload(), "Fallback")

        self.assertEqual(result["title"], "Photosynthesis: energy transfer")
        self.assertEqual(result["document"]["schema_version"], 1)
        self.assertEqual(result["document"]["resource_type"], "lesson_plan")
        self.assertIn("## Lesson Flow", result["content"])
        self.assertIn("Photosynthesis: energy transfer", result["content"])

    def test_missing_required_core_field_is_rejected(self):
        payload = lesson_plan_payload()
        del payload["document"]["primary_outcome"]

        with self.assertRaises(ValidationError):
            normalise_create_resources_result("lesson_plan", payload, "Fallback")

    def test_excessive_lesson_flow_is_rejected(self):
        payload = lesson_plan_payload()
        payload["document"]["lesson_flow"] *= 5

        with self.assertRaises(ValidationError):
            normalise_create_resources_result("lesson_plan", payload, "Fallback")

    def test_malformed_lesson_plan_document_is_rejected(self):
        with self.assertRaises(ValueError):
            normalise_create_resources_result("lesson_plan", {"title": "Not structured", "content": "Legacy text"}, "Fallback")

    def test_lesson_plan_document_rejects_unknown_fields(self):
        payload = lesson_plan_payload()
        payload["document"]["colour_scheme"] = "emerald"

        with self.assertRaises(ValidationError):
            normalise_create_resources_result("lesson_plan", payload, "Fallback")

    def test_non_lesson_plan_modes_keep_legacy_response_shape(self):
        result = normalise_create_resources_result("worksheet", {"title": "Cells worksheet", "content": "Questions"}, "Fallback")

        self.assertEqual(result, {"title": "Cells worksheet", "content": "Questions"})

    def test_structured_lesson_plan_docx_contains_document_sections_and_tables(self):
        from docx import Document

        result = normalise_create_resources_result("lesson_plan", lesson_plan_payload(), "Fallback")
        document = validate_structured_lesson_plan_document(result["document"])
        data = render_structured_lesson_plan_docx(document, teacher="Ms Example", meta={"schoolName": "Example School"})

        self.assertTrue(zipfile.is_zipfile(BytesIO(data)))
        reopened = Document(BytesIO(data))
        text = "\n".join(paragraph.text for paragraph in reopened.paragraphs)
        table_text = "\n".join(cell.text for table in reopened.tables for row in table.rows for cell in row.cells)
        self.assertIn("Photosynthesis: energy transfer", text)
        self.assertIn("PRIMARY LEARNING OUTCOME", table_text)
        self.assertIn("Time", table_text)
        self.assertIn("Teacher", table_text)
        self.assertIn("Chlorophyll", table_text)
        self.assertIn("Suggested homework", table_text)
        self.assertIn("Misconceptions to address", table_text)
        self.assertIn("Assessment and checks for understanding", table_text)

    def test_structured_lesson_plan_docx_allows_absent_optional_sections(self):
        payload = lesson_plan_payload()
        for field in ("definitions", "resources", "prior_knowledge", "differentiation", "misconceptions", "assessment"):
            payload["document"][field] = []
        payload["document"]["teacher_note"] = None
        payload["document"]["homework"] = None
        payload["document"]["stopping_point"] = None

        result = normalise_create_resources_result("lesson_plan", payload, "Fallback")
        data = render_structured_lesson_plan_docx(validate_structured_lesson_plan_document(result["document"]))
        self.assertTrue(zipfile.is_zipfile(BytesIO(data)))

    def test_export_document_rejects_malformed_renderer_blocks(self):
        result = normalise_create_resources_result("lesson_plan", lesson_plan_payload(), "Fallback")
        result["document"]["blocks"][0]["unexpected"] = "not allowed"

        with self.assertRaises(ValueError):
            validate_structured_lesson_plan_document(result["document"])

    def test_legacy_docx_exporter_remains_available(self):
        from main import _docx_from_markdownish

        data = _docx_from_markdownish("Legacy worksheet", "# Questions\n\n- Explain the process.")
        self.assertTrue(zipfile.is_zipfile(BytesIO(data)))


if __name__ == "__main__":
    unittest.main()
