import {
  COLLABORATION_TEMPLATES,
  COLLABORATION_TEMPLATE_SUBJECTS,
  templatesForSubject,
} from "./collaborationTemplates";

test("the approved Elume collaboration catalogue has eight subjects and forty 1600 by 1200 templates", () => {
  expect(COLLABORATION_TEMPLATE_SUBJECTS).toEqual([
    "Science",
    "English",
    "Maths",
    "Gaeilge",
    "Geography",
    "History",
    "Business Studies",
    "French",
  ]);
  expect(COLLABORATION_TEMPLATES).toHaveLength(40);

  COLLABORATION_TEMPLATE_SUBJECTS.forEach((subject) => {
    expect(templatesForSubject(subject)).toHaveLength(5);
  });
  expect(COLLABORATION_TEMPLATES.every((template) => template.width === 1600 && template.height === 1200)).toBe(true);
  expect(COLLABORATION_TEMPLATES.some((template) => template.subject === "Gaeilge")).toBe(true);
});
