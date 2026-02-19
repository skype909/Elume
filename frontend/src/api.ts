// src/api.ts
const API_BASE = "/api";

export function getToken(): string | null {
  return localStorage.getItem("elume_token");
}

export function setToken(token: string) {
  localStorage.setItem("elume_token", token);
}

export function clearToken() {
  localStorage.removeItem("elume_token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();

  const headers = new Headers(options.headers || {});
  // Only set JSON header if caller didn't already set one (e.g., FormData uploads)
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // If token is missing/expired, force logout
  if (res.status === 401) {
    clearToken();
    throw new Error("Unauthorized");
  }

  // Try to return JSON; fall back to text for debugging
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
