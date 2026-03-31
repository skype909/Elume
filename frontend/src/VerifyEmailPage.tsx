import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch, setToken } from "./api";

export default function VerifyEmailPage() {
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Verifying your email…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (!token) {
        setError("Missing verification token.");
        setLoading(false);
        return;
      }
      try {
        const data = await apiFetch("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        const accessToken = String(data?.access_token || "").trim();
        const nextPath = String(data?.next_path || "/onboarding/billing").trim();
        if (accessToken) {
          localStorage.setItem("elume_token", accessToken);
          setToken(accessToken);
          setMessage(data?.message || "Email verified. Taking you into Elume setup...");
          window.setTimeout(() => {
            window.location.assign(`/#${nextPath.startsWith("/") ? nextPath : `/${nextPath}`}`);
          }, 800);
          return;
        }
        setMessage(data?.message || "Email verified. You can now sign in to Elume.");
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Could not verify email.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
        <div className="text-2xl font-black tracking-tight text-slate-900">Verify your email</div>
        <div className="mt-2 text-sm text-slate-600">We’re activating your Elume teacher account.</div>

        {loading && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>}
        {!loading && error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        {!loading && !error && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>}

        <div className="mt-6">
          <Link
            to="/"
            className="flex w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
