import React from "react";
import { render, screen } from "@testing-library/react";
import StructuredLessonPlanPreview, { type StructuredLessonPlanDocument } from "./StructuredLessonPlanPreview";

const juniorCycleDocument: StructuredLessonPlanDocument = {
  schema_version: 1,
  resource_type: "lesson_plan",
  title: "Materials and their properties",
  subject: "Science",
  level: "Junior Cycle",
  duration: "40 minutes",
  primary_outcome: "Students describe observable properties using accurate scientific vocabulary.",
  blocks: [
    { type: "info_panel", label: "Primary learning outcome", text: "Students describe observable properties using accurate scientific vocabulary." },
    { type: "bullet_list", title: "Learning intentions", items: ["Identify useful material properties."] },
    { type: "bullet_list", title: "Success criteria", items: ["I can justify a material choice."] },
    { type: "timeline", title: "Lesson flow", items: [
      { minutes: "5", phase: "Starter", teacher_action: "Show objects.", student_action: "Predict properties." },
      { minutes: "35", phase: "Application", teacher_action: "Guide sorting.", student_action: "Sort and justify." },
    ] },
    { type: "assessment_checkpoint", title: "Assessment and checks for understanding", items: ["Listen for justified choices."] },
  ],
};

test("renders Junior Cycle content through the canonical structured lesson-plan preview in block order", () => {
  render(<StructuredLessonPlanPreview document={juniorCycleDocument} footer="Elume" />);

  expect(screen.getByText("Elume lesson plan")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Materials and their properties" })).toBeInTheDocument();
  expect(screen.getByText("Junior Cycle")).toBeInTheDocument();
  const text = document.body.textContent || "";
  expect(text.indexOf("Primary learning outcome")).toBeLessThan(text.indexOf("Learning intentions"));
  expect(text.indexOf("Learning intentions")).toBeLessThan(text.indexOf("Success criteria"));
  expect(text.indexOf("Success criteria")).toBeLessThan(text.indexOf("Lesson flow"));
  expect(text.indexOf("Lesson flow")).toBeLessThan(text.indexOf("Assessment and checks for understanding"));
});
