import React, { useState } from "react";
import { apiFetch, setToken } from "./api";

type Props = { onLoggedIn: () => void };

export default function LoginPage({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";

      const data = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const token = data?.access_token;
      if (!token) throw new Error("No token returned from server");

      // ✅ Persist token so refresh + subsequent API calls work
      localStorage.setItem("elume_token", token);

      // Optional: if your api.ts uses an in-memory token too
      try {
        setToken(token);
      } catch {}

      onLoggedIn();
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-2xl font-extrabold tracking-tight">
          {mode === "login" ? "Teacher Login" : "Create Teacher Account"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          ELume • Secure access to your classes
        </div>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <label className="block text-sm font-semibold">
            Email
            <input
              className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="block text-sm font-semibold">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
            />
          </label>

          {error && (
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 font-bold"
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
