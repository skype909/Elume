import {
  classColourBackgroundClass,
  normaliseClassColourKey,
  resolveClassColourKey,
} from "./classAppearance";
import {
  plannerClassBadgeClass,
  resolveClassPageColourKey,
  tileVisualForClass,
} from "./classAppearanceViews";

test("canonical and legacy palette values resolve to the same colour", () => {
  expect(normaliseClassColourKey("violet")).toBe("violet");
  expect(normaliseClassColourKey("bg-violet-500")).toBe("violet");
  expect(classColourBackgroundClass(resolveClassColourKey("violet", 7))).toBe("bg-violet-500");
  expect(classColourBackgroundClass(resolveClassColourKey("bg-violet-500", 7))).toBe("bg-violet-500");
});

test("unsupported values use the same deterministic fallback", () => {
  expect(resolveClassColourKey("not-a-colour", 25)).toBe(resolveClassColourKey(null, 25));
  expect(resolveClassColourKey("bg-violet-700", 25)).toBe(resolveClassColourKey(null, 25));
  expect(classColourBackgroundClass(resolveClassColourKey(null, 25))).toBe("bg-teal-500");
});

test("Planner and Create Resources render canonical class colour keys", () => {
  expect(plannerClassBadgeClass(7, "violet"))
    .toBe("border-violet-200 bg-violet-50 text-violet-700");
  expect(tileVisualForClass({ id: 7, color: "violet" }))
    .toMatchObject({ bg: "bg-violet-500", ring: "ring-violet-200" });
});

test("ClassPage prefers a recognized local legacy colour only when the server has none", () => {
  expect(resolveClassPageColourKey(null, "bg-violet-500", 3)).toBe("violet");
  expect(resolveClassPageColourKey("amber", "bg-violet-500", 3)).toBe("amber");
  expect(resolveClassPageColourKey(null, "bg-violet-700", 3)).toBe(resolveClassColourKey(null, 3));
});
