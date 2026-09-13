export const MAX_CREATE_RESOURCE_IMAGES = 12;

export function isCreateResourceImage(file: Pick<File, "name" | "type">): boolean {
  return /^image\/(jpeg|png)$/i.test(file.type || "") || /\.(jpg|jpeg|png)$/i.test(file.name || "");
}

/** Counts current selections, so removing an image immediately releases a slot. */
export function canAddCreateResourceFiles(existing: Array<Pick<File, "name" | "type">>, incoming: Array<Pick<File, "name" | "type">>): boolean {
  return existing.filter(isCreateResourceImage).length + incoming.filter(isCreateResourceImage).length <= MAX_CREATE_RESOURCE_IMAGES;
}
