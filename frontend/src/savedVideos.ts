import { apiFetch } from "./api";

export type SavedVideo = { id: number; youtube_id: string; url: string; title: string; category: string; added_at: string; updated_at?: string };
export type LegacySavedVideo = { id: string; url: string; title?: string; category?: string; addedAt?: number };
const key = (classId: number) => `elume:videos:class:${classId}`;

export async function listSavedVideos(classId: number): Promise<SavedVideo[]> {
  return apiFetch(`/classes/${classId}/videos`);
}
export async function createSavedVideo(classId: number, value: Omit<SavedVideo, "id" | "added_at" | "updated_at"> & { added_at?: string }) {
  return apiFetch(`/classes/${classId}/videos`, { method: "POST", body: value }) as Promise<SavedVideo>;
}
export async function updateSavedVideo(classId: number, id: number, value: Pick<SavedVideo, "youtube_id" | "url" | "title" | "category">) {
  return apiFetch(`/classes/${classId}/videos/${id}`, { method: "PUT", body: value }) as Promise<SavedVideo>;
}
export async function deleteSavedVideo(classId: number, id: number) {
  return apiFetch(`/classes/${classId}/videos/${id}`, { method: "DELETE" });
}

/** Server remains authoritative. Keep unconfirmed local entries for a later authorised retry. */
export async function importLegacySavedVideos(classId: number): Promise<SavedVideo[]> {
  const current = await listSavedVideos(classId); // authorised class check before reading/importing
  let legacy: LegacySavedVideo[] = [];
  try { const raw = localStorage.getItem(key(classId)); legacy = raw ? JSON.parse(raw) : []; } catch { return current; }
  if (!Array.isArray(legacy) || !legacy.length) return current;
  let confirmed = new Map(current.map((v) => [v.youtube_id, v]));
  for (const item of legacy) {
    if (!item?.id || !item.url || confirmed.has(item.id)) continue;
    try { confirmed.set(item.id, await createSavedVideo(classId, { youtube_id: item.id, url: item.url, title: item.title || "Untitled Video", category: item.category || "General", added_at: new Date(item.addedAt || Date.now()).toISOString() })); }
    catch (error: any) {
      if (error?.status === 409) {
        const verified = await listSavedVideos(classId);
        const match = verified.find((v) => v.youtube_id === item.id);
        if (match) confirmed.set(item.id, match);
      }
    }
  }
  const result = await listSavedVideos(classId);
  const ids = new Set(result.map((v) => v.youtube_id));
  if (legacy.every((item) => item?.id && ids.has(item.id))) localStorage.removeItem(key(classId));
  return result;
}
