// src/api.ts
const TOKEN_KEY = "elume_token";
type JsonBody = BodyInit | Record<string, unknown> | unknown[] | null;
type ApiRequestInit = Omit<RequestInit, "body"> & { body?: JsonBody };

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function apiFetch(path: string, init: ApiRequestInit = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url =
    path.startsWith("/api")
      ? path
      : `/api${path.startsWith("/") ? "" : "/"}${path}`;

  const body: BodyInit | null | undefined =
    init.body && !isFormData && typeof init.body !== "string"
      ? JSON.stringify(init.body)
      : (init.body as BodyInit | null | undefined);

  const res = await fetch(url, { ...init, headers, body });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) ||
      (typeof data === "string" && data) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

export async function apiFetchBlob(path: string, init: ApiRequestInit = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const body: BodyInit | null | undefined =
    init.body && !isFormData && typeof init.body !== "string"
      ? JSON.stringify(init.body)
      : (init.body as BodyInit | null | undefined);

  const url =
    path.startsWith("/api")
      ? path
      : `/api${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, { ...init, headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  return res.blob();
}

export async function openProtectedFileInNewTab(path: string) {
  if (!path) throw new Error("Missing file path");

  if (path.startsWith("http://") || path.startsWith("https://")) {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }

  const url =
    path.startsWith("/api")
      ? path
      : "/api" + (path.startsWith("/") ? "" : "/") + path;

  const blob = await apiFetchBlob(url, { method: "GET" });

  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
