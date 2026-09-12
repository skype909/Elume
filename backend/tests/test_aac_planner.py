import unittest
from io import BytesIO
from unittest.mock import patch
from datetime import date, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from aac_planner import AacProposalError, AacSourceError, DEFAULT_WEEKLY_MINUTES, build_schedule, document_stage_structure, extract_source_document, make_proposal, official_deadline_candidates, physics_starter_template, plan_warnings, proposal_input, validate_proposal, validate_weekly_minutes


class AacPlannerSafetyTests(unittest.TestCase):
    def test_default_and_physics_template_are_planning_only(self):
        self.assertEqual(DEFAULT_WEEKLY_MINUTES, 30)
        self.assertEqual(len(physics_starter_template()), 6)
        self.assertTrue(all(stage["completion_date"] is None for stage in physics_starter_template()))

    def test_short_midweek_window_never_proposes_an_excluded_monday(self):
        inputs = {"weekly_minutes":30,"planned_start":"2026-09-16","normal_finish_target":"2026-09-18","final_classroom_deadline":"2027-02-26","controlling_deadline":"2027-03-12","fifth_year_end":"2026-05-29","sixth_year_restart":"2026-09-14","reviewed_closures":["2026-09-16"]}
        result = build_schedule({"planning_inputs":inputs,"stages":[{"id":"a","name":"Research"}]})
        self.assertEqual(result["stages"][0]["proposed_completion_date"], "2026-09-17")
        result = build_schedule({"planning_inputs":inputs,"stages":[{"id":"a","name":"Research","estimated_minutes":30,"completion_date":"2026-09-14"}]})
        self.assertTrue(any("outside" in warning for warning in result["warnings"]))

    def test_deadline_and_buffer_require_teacher_confirmation(self):
        deadline = date(2027, 4, 20)
        self.assertTrue(plan_warnings({"controlling_deadline": deadline.isoformat()}))
        self.assertTrue(plan_warnings({"controlling_deadline": deadline.isoformat(), "internal_completion_target": (deadline - timedelta(days=13)).isoformat()}))
        self.assertFalse(plan_warnings({"controlling_deadline": deadline.isoformat(), "internal_completion_target": (deadline - timedelta(days=14)).isoformat(), "official_deadline_confirmed": True}))

    def test_infeasible_and_provisional_plans_are_visible(self):
        warnings = plan_warnings({"sixth_year_calendar_provisional": True, "capacity_minutes": 30, "estimated_minutes": 31})
        self.assertTrue(any("provisional" in warning for warning in warnings))
        self.assertTrue(any("exceeds" in warning for warning in warnings))

    def test_weekly_allocation_is_editable_but_bounded(self):
        self.assertEqual(validate_weekly_minutes(30), 30)
        with self.assertRaises(ValueError): validate_weekly_minutes(0)
        with self.assertRaises(ValueError): validate_weekly_minutes(601)

    def test_docx_extraction_uses_real_paragraph_references(self):
        from docx import Document
        doc = Document(); doc.add_paragraph("Fictional AAC hand-in: 20 April 2027.")
        data = BytesIO(); doc.save(data)
        result = extract_source_document("brief.docx", data.getvalue())
        self.assertEqual(result["sections"][0]["reference"], "paragraph 1")
        self.assertIn("20 April", result["sections"][0]["text"])

    def test_unreadable_or_unsupported_sources_are_rejected(self):
        with self.assertRaises(AacSourceError): extract_source_document("brief.txt", b"not accepted")
        with patch("pypdf.PdfReader", side_effect=ValueError("bad fictional PDF")):
            with self.assertRaises(AacSourceError): extract_source_document("brief.pdf", b"%PDF-fictional")

    def test_proposal_is_bounded_and_citations_must_exist(self):
        docs = [{"id": 7, "purpose": "specification", "sections": [{"reference": "page 2", "text": "Students hand in work by 20 April 2027."}]}]
        proposal = {"requirements": [{"source_document_id": 7, "source_reference": "page 2", "text": "fictional requirement"}], "candidate_deadlines": [{"source_document_id": 7, "source_reference": "page 2", "date": "2027-04-20", "meaning": "student hand-in", "supporting_excerpt": "Students hand in work by 20 April 2027."}], "stages": [{"name": "Evidence review", "checkpoints": []}], "interruptions": [], "missing_information": [], "conflicts": [], "assumptions": []}
        self.assertEqual(make_proposal(docs, {"weekly_minutes": 30}, lambda _: proposal)["stages"][0]["name"], "Evidence review")
        proposal["requirements"][0]["source_reference"] = "page 99"
        with self.assertRaises(AacProposalError): validate_proposal(proposal, docs)

    def test_proposal_context_excludes_student_information(self):
        context = proposal_input([{"id": 1, "purpose": "specification", "sections": []}], {"weekly_minutes": 30})
        self.assertEqual(set(context), {"documents", "planning_inputs"})
        self.assertNotIn("students", repr(context).lower())

    def test_two_year_schedule_excludes_summer_and_requires_stage_dates(self):
        result = build_schedule({"planning_inputs": {"weekly_minutes": 30, "planned_start": "2025-09-01", "fifth_year_end": "2026-05-29", "sixth_year_restart": "2026-09-14", "controlling_deadline": "2027-04-20", "internal_completion_target": "2027-04-06", "official_deadline_confirmed": True, "reviewed_closures": ["2026-10-26"]}, "stages": [{"id": "fictional-a", "name": "Research", "estimated_minutes": 60, "completion_date": "2026-10-12"}, {"id": "fictional-b", "name": "Report", "estimated_minutes": 90, "completion_date": "2027-03-29"}]})
        self.assertFalse(result["warnings"], result["warnings"])
        self.assertTrue(result["estimated"])
        self.assertGreater(result["capacity_minutes"], result["estimated_minutes"])

    def test_schedule_returns_editable_provisional_dates_when_source_stages_have_no_duration(self):
        result = build_schedule({"planning_inputs": {"weekly_minutes": 30, "planned_start": "2026-09-01", "fifth_year_end": "2027-05-28", "sixth_year_restart": "2027-09-13", "controlling_deadline": "2028-05-15", "normal_finish_target": "2028-04-15", "final_classroom_deadline": "2028-05-01", "official_deadline_confirmed": True, "sixth_year_calendar_status": "reviewed"}, "stages": [{"id": "fictional-a", "name": "Source stage", "estimated_minutes": None, "completion_date": None}, {"id": "fictional-b", "name": "Teacher stage", "estimated_minutes": None, "completion_date": None}]})
        self.assertEqual(len(result["stages"]), 2)
        self.assertTrue(all(stage["provisional_estimate"] for stage in result["stages"]))
        self.assertTrue(all(stage.get("proposed_completion_date") for stage in result["stages"]))
        self.assertTrue(any("planning estimates" in warning for warning in result["warnings"]))

    def test_saved_provisional_stage_time_remains_distinct_from_teacher_time(self):
        inputs = {"planned_start": "2026-09-14", "fifth_year_end": "2026-05-31", "sixth_year_restart": "2026-09-01", "controlling_deadline": "2027-03-12", "normal_finish_target": "2027-02-08", "final_classroom_deadline": "2027-02-19", "official_deadline_confirmed": True, "fifth_year_aac_minutes": 30, "sixth_year_aac_minutes": 30}
        generated = build_schedule({"planning_inputs": inputs, "stages": [{"id": "suggested", "name": "Suggested", "estimated_minutes": None}, {"id": "teacher", "name": "Teacher", "estimated_minutes": 45}]})
        suggested_minutes = next(stage["estimated_minutes"] for stage in generated["stages"] if stage["id"] == "suggested")
        reloaded = build_schedule({"planning_inputs": inputs, "stages": [{"id": "suggested", "name": "Suggested", "estimated_minutes": suggested_minutes, "provisional_estimate": True}, {"id": "teacher", "name": "Teacher", "estimated_minutes": 45}]})
        rows = {stage["id"]: stage for stage in reloaded["stages"]}
        self.assertEqual(rows["suggested"]["estimated_minutes"], suggested_minutes)
        self.assertTrue(rows["suggested"]["provisional_estimate"])
        self.assertFalse(rows["teacher"]["provisional_estimate"])

    def test_sixth_year_window_spreads_missing_durations_from_september_to_february(self):
        result = build_schedule({"planning_inputs": {"planned_start": "2026-09-14", "fifth_year_end": "2026-05-31", "sixth_year_restart": "2026-09-01", "controlling_deadline": "2027-03-12", "normal_finish_target": "2027-02-08", "final_classroom_deadline": "2027-02-19", "official_deadline_confirmed": True, "fifth_year_aac_minutes": 30, "sixth_year_aac_minutes": 30, "sixth_year_calendar_status": "provisional"}, "stages": [{"id": f"stage-{number}", "name": f"Stage {number}", "estimated_minutes": None, "completion_date": None} for number in range(1, 7)]})
        dates = [date.fromisoformat(stage["proposed_completion_date"]) for stage in result["stages"]]
        self.assertEqual(len(dates), 6)
        self.assertLessEqual(dates[0], date(2026, 10, 15))
        self.assertGreaterEqual(dates[-1], date(2027, 1, 1))
        self.assertEqual(result["completion_target"], "2027-02-08")

    def test_schedule_rejects_summer_dates_short_buffer_and_infeasible_capacity(self):
        result = build_schedule({"planning_inputs": {"weekly_minutes": 30, "fifth_year_end": "2026-05-29", "sixth_year_restart": "2026-09-14", "controlling_deadline": "2027-04-20", "internal_completion_target": "2027-04-08"}, "stages": [{"id": "fictional", "name": "Summer work", "estimated_minutes": 999999, "completion_date": "2026-07-01"}]})
        self.assertTrue(result["warnings"])

    def test_key_dates_and_yearly_allocations_preserve_catch_up_time(self):
        result = build_schedule({"planning_inputs": {"planned_start": "2026-09-01", "fifth_year_end": "2027-05-28", "sixth_year_restart": "2027-09-01", "controlling_deadline": "2028-05-15", "normal_finish_target": "2028-04-15", "final_classroom_deadline": "2028-05-01", "fifth_year_aac_minutes": 30, "sixth_year_aac_minutes": 45, "fifth_year_lessons_per_week": 3, "fifth_year_minutes_per_lesson": 40, "sixth_year_lessons_per_week": 4, "sixth_year_minutes_per_lesson": 40, "sixth_year_calendar_status": "reviewed"}, "stages": []})
        self.assertEqual(result["completion_target"], "2028-04-15")
        self.assertGreater(result["capacity_minutes"], 0)
        self.assertFalse(any("14-calendar-day" in warning for warning in result["warnings"]))

    def test_key_date_order_and_yearly_overallocation_warn(self):
        warnings = plan_warnings({"planned_start": "2028-04-20", "normal_finish_target": "2028-04-15", "final_classroom_deadline": "2028-04-10", "controlling_deadline": "2028-04-20", "fifth_year_aac_minutes": 200, "fifth_year_lessons_per_week": 3, "fifth_year_minutes_per_lesson": 40})
        self.assertTrue(any("planned start" in warning for warning in warnings))
        self.assertTrue(any("normal finish" in warning for warning in warnings))
        self.assertTrue(any("cannot exceed" in warning for warning in warnings))

    def test_official_deadline_candidate_requires_student_completion_language_and_full_date(self):
        docs = [{"id": 7, "purpose": "specification", "sections": [{"reference": "paragraph 2", "text": "Students must complete and hand in their AAC by 15 May 2028."}, {"reference": "paragraph 3", "text": "Publication date: 15 May 2028."}, {"reference": "paragraph 4", "text": "School administration submits work by 16 May 2028."}]}]
        candidates = official_deadline_candidates(docs)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["date"], "2028-05-15")
        self.assertEqual(candidates[0]["source_reference"], "paragraph 2")
        self.assertIn(candidates[0]["supporting_excerpt"], docs[0]["sections"][0]["text"])

    def test_weekday_prefixed_coursework_submission_to_class_teacher_is_a_deadline(self):
        docs = [{"id": 9, "purpose": "specification", "sections": [{"reference": "page 2", "text": "The coursework must be carried out and submitted to the class teacher by Friday, 11 December 2026 and will then be submitted to the SEC."}]}]
        candidates = official_deadline_candidates(docs)
        self.assertEqual([(item["date"], item["source_reference"]) for item in candidates], [("2026-12-11", "page 2")])

    def test_ordinal_coursework_deadline_and_explicit_investigative_stages(self):
        text = """The stages of the process for completing the investigative study are listed below.
Stage 1: Getting Started
Stage 2: Developing a question to research
Stage 3: Developing a project plan
Stage 4: Identifying sources and gathering information and data
Stage 5: Analysis and evaluation
Stage 6: Applying learning and drawing conclusions
Compilation of the final report"""
        docs = [{"id": 12, "purpose": "specification", "sections": [{"reference": "page 2", "text": "The coursework must be carried out and submitted to the class teacher by 12th March 2027 and will then be submitted to the SEC."}, {"reference": "page 5", "text": text}, {"reference": "page 7", "text": "1. Introduction 2. Investigation and Findings 3. Analysis and Evaluation"}]}]
        self.assertEqual(official_deadline_candidates(docs)[0]["date"], "2027-03-12")
        stages = document_stage_structure(docs)
        self.assertEqual([item["name"] for item in stages], ["Getting Started", "Developing a question to research", "Developing a project plan", "Identifying sources and gathering information and data", "Analysis and evaluation", "Applying learning and drawing conclusions"])
        self.assertTrue(all(item["source_reference"] == "page 5" for item in stages))

    def test_differently_named_section_and_report_headings_do_not_block_or_replace_stages(self):
        docs = [{"id": 13, "purpose": "specification", "sections": [{"reference": "page 5", "text": "Engaging with an investigation. Your investigation should involve the following six stages:\nStage 1: Initial response\nStage 2: Background research\nStage 3: Planning\nStage 4: Experiment\nStage 5: Analysis\nStage 6: Finalising report"}, {"reference": "page 7", "text": "Report structure: 1. Title 2. Background 3. References"}]}]
        self.assertEqual([item["name"] for item in document_stage_structure(docs)], ["Initial response", "Background research", "Planning", "Experiment", "Analysis", "Finalising report"])

    def test_unbacked_deadline_candidate_is_rejected(self):
        docs = [{"id": 7, "purpose": "specification", "sections": [{"reference": "paragraph 1", "text": "Students complete work by 15 May 2028."}]}]
        proposal = {"requirements": [], "candidate_deadlines": [{"source_document_id": 7, "source_reference": "paragraph 1", "date": "2028-05-15", "meaning": "student hand-in", "supporting_excerpt": "not in the source"}], "stages": [], "interruptions": [], "missing_information": [], "conflicts": [], "assumptions": []}
        with self.assertRaises(AacProposalError): make_proposal(docs, {}, lambda _: proposal)


if __name__ == "__main__":
    unittest.main()
