import { canAddCreateResourceFiles, isCreateResourceImage, MAX_CREATE_RESOURCE_IMAGES } from "./createResourcesUploads";

const image = (n: number) => ({ name: `calendar-${n}.png`, type: "image/png" } as File);
describe("Create Resources image limit", () => {
  test("allows 12 images and rejects a thirteenth, including repeated selections", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => image(i));
    expect(canAddCreateResourceFiles([], twelve)).toBe(true);
    expect(canAddCreateResourceFiles(twelve, [image(12)])).toBe(false);
    expect(MAX_CREATE_RESOURCE_IMAGES).toBe(12);
  });
  test("removing an image releases a slot and documents do not consume one", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => image(i));
    expect(canAddCreateResourceFiles(eleven, [image(12)])).toBe(true);
    expect(canAddCreateResourceFiles(Array.from({ length: 12 }, (_, i) => image(i)), [{ name: "topics.pdf", type: "application/pdf" } as File])).toBe(true);
    expect(isCreateResourceImage({ name: "notes.txt", type: "text/plain" } as File)).toBe(false);
  });
});
