import {
  findTopObjectAtPoint,
  isTemplateBackground,
  replaceTemplateBackground,
  shouldApplyReplayedBoardMutation,
  type BoardObject,
} from "./CollabBoard";

function image(id: string, x = 48, y = 48, w = 320, h = 220): BoardObject {
  return {
    id,
    type: "image",
    x,
    y,
    w,
    h,
    src: "data:image/png;base64,AA==",
    createdBy: "teacher",
    updatedAt: 1,
  };
}

test("a pasted image can be deselected, reselected, and resized without losing its object", () => {
  let objects = [image("pasted")]; // insert
  let selectedObjectId: string | null = "pasted";

  selectedObjectId = null; // deselect on empty board space
  selectedObjectId = findTopObjectAtPoint(objects, { x: 120, y: 120 })?.id ?? null;
  expect(selectedObjectId).toBe("pasted"); // select tool reselects the persistent object

  objects = objects.map((obj) =>
    obj.id === selectedObjectId ? { ...obj, w: 420, h: 280, updatedAt: 2 } : obj
  );
  expect(objects).toMatchObject([{ id: "pasted", w: 420, h: 280, src: "data:image/png;base64,AA==" }]);
  expect(findTopObjectAtPoint(objects, { x: 440, y: 320 })?.id).toBe("pasted");
});

test("overlapping images select the topmost object", () => {
  const objects = [image("lower"), image("upper", 80, 80)];
  expect(findTopObjectAtPoint(objects, { x: 120, y: 120 })?.id).toBe("upper");
});

test("a template is a locked 1600 by 1200 background and is skipped by normal hit testing", () => {
  const template = replaceTemplateBackground([], {
    templateId: "elume-01",
    title: "Digestive System - Label and Explain",
    src: "/collaboration-templates/science/01_digestive_system_label_explain.png",
  }, 1);

  expect(template).toHaveLength(1);
  expect(template[0]).toMatchObject({ x: 0, y: 0, w: 1600, h: 1200 });
  expect(isTemplateBackground(template[0])).toBe(true);
  expect(findTopObjectAtPoint(template, { x: 800, y: 600 })).toBeNull();
});

test("replacing a template preserves annotations and ordinary images without stacking backgrounds", () => {
  const annotation = image("ordinary-image");
  const first = replaceTemplateBackground([annotation], {
    templateId: "elume-01",
    title: "First",
    src: "/first.png",
  }, 1);
  const replaced = replaceTemplateBackground(first, {
    templateId: "elume-02",
    title: "Second",
    src: "/second.png",
  }, 2);

  expect(replaced.filter(isTemplateBackground)).toHaveLength(1);
  expect(replaced.find((object) => object.id === "ordinary-image")).toBeDefined();
  expect(replaced.find(isTemplateBackground)).toMatchObject({
    templateBackground: { templateId: "elume-02" },
    src: "/second.png",
  });
  expect(findTopObjectAtPoint(replaced, { x: 120, y: 120 })?.id).toBe("ordinary-image");
});

test("saved teacher board replay is applied after reopening while live self echoes remain ignored", () => {
  expect(shouldApplyReplayedBoardMutation(false, "teacher", "teacher", false)).toBe(false);
  expect(shouldApplyReplayedBoardMutation(true, "teacher", "teacher", false)).toBe(true);
  expect(shouldApplyReplayedBoardMutation(true, "teacher", "teacher", true)).toBe(true);
  expect(shouldApplyReplayedBoardMutation(false, "student", "teacher", false)).toBe(true);
});
