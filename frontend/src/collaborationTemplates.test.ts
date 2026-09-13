import fs from "fs";
import path from "path";
import {
  COLLABORATION_TEMPLATES,
  COLLABORATION_TEMPLATE_SUBJECTS,
  templatesForSubject,
} from "./collaborationTemplates";

test("the approved Elume collaboration catalogue keeps its eight subjects and adds five Teaching Templates", () => {
  expect(COLLABORATION_TEMPLATE_SUBJECTS).toEqual([
    "Teaching Templates",
    "Science",
    "English",
    "Maths",
    "Gaeilge",
    "Geography",
    "History",
    "Business Studies",
    "French",
  ]);
  expect(COLLABORATION_TEMPLATES).toHaveLength(45);

  COLLABORATION_TEMPLATE_SUBJECTS.forEach((subject) => {
    expect(templatesForSubject(subject)).toHaveLength(5);
  });
  expect(COLLABORATION_TEMPLATES.every((template) => template.width === 1600 && template.height === 1200)).toBe(true);
  expect(COLLABORATION_TEMPLATES.some((template) => template.subject === "Gaeilge")).toBe(true);
  expect(COLLABORATION_TEMPLATES.filter((template) => template.subject !== "Teaching Templates")).toHaveLength(40);
  expect(new Set(COLLABORATION_TEMPLATES.map((template) => template.id)).size).toBe(45);
});

test("Teaching Templates use the five approved titles and real 1600 by 1200 production assets", () => {
  const teachingTemplates = templatesForSubject("Teaching Templates");
  expect(teachingTemplates.map((template) => template.title)).toEqual([
    "Mind Map",
    "KWL Board",
    "Compare & Contrast",
    "Cause & Effect",
    "Frayer Model",
  ]);

  teachingTemplates.forEach((template) => {
    expect(template.src).toMatch(/^\/collaboration-templates\/teaching\//);
    const filePath = path.resolve(__dirname, "../public", template.src.replace(/^\//, ""));
    const png = fs.readFileSync(filePath);
    expect(png.readUInt32BE(16)).toBe(1600);
    expect(png.readUInt32BE(20)).toBe(1200);
  });
});

test("every catalogue asset path exists in the production public tree", () => {
  COLLABORATION_TEMPLATES.forEach((template) => {
    const filePath = path.resolve(__dirname, "../public", template.src.replace(/^\//, ""));
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
