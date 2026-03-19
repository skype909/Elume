import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import ELogo2 from "./assets/ELogo2.png";

type BillingStatus = {
  subscription_status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  has_stripe_customer: boolean;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

export default function BillingSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useMemo(() => new URLSearchParams(location.search).get("session_id"), [location.search]);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/billing/me")
      .then((data) => {
        if (!cancelled) setBilling(data as BillingStatus);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Could not confirm your billing status yet.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const status = (billing?.subscription_status || "").toLowerCase();
  const isActive = status === "active" || status === "trialing";
  const periodEnd = formatDate(billing?.current_period_end || null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-[36px] border border-white/70 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/70 bg-white shadow-md ring-1 ring-emerald-100">
          <img src={ELogo2} alt="Elume" className="h-14 w-14 object-contain" />
        </div>

        <div className="mt-5 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Billing
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            {isActive ? "Subscription active" : "Checkout received"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isActive
              ? "Your Elume monthly plan is now active."
              : "Your checkout completed. We are confirming your subscription status now."}
          </p>
        </div>

        <div className="mt-6 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-sm">
          {loading ? (
            <div className="text-sm font-semibold text-slate-700">Checking subscription status…</div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {error}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-black text-slate-900">Status:</span>{" "}
                <span className="capitalize">{billing?.subscription_status || "pending"}</span>
              </div>
              <div>
                <span className="font-black text-slate-900">Plan:</span>{" "}
                <span className="capitalize">{billing?.billing_interval || "monthly"}</span>
              </div>
              {periodEnd ? (
                <div>
                  <span className="font-black text-slate-900">Current period end:</span> {periodEnd}
                </div>
              ) : null}
              {sessionId ? (
                <div className="text-xs text-slate-500">Checkout session: {sessionId}</div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Back to Teacher Admin
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-full border-2 border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
