import { findTopObjectAtPoint, type BoardObject } from "./CollabBoard";

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
