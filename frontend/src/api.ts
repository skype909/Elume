// src/api.ts
const TOKEN_KEY = "elume_token";

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

export async function apiFetch(path: string, init: RequestInit = {}) {
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

  const res = await fetch(url, { ...init, headers });

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

export async function apiFetchBlob(path: string, init: RequestInit = {}) {
  const token = getToken();

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url =
    path.startsWith("/api")
      ? path
      : `/api${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  return res.blob();
}
