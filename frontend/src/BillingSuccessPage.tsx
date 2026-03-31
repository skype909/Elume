import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import ELogo2 from "./assets/ELogo2.png";

type BillingStatus = {
  subscription_status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  has_stripe_customer: boolean;
  billing_onboarding_required: boolean;
  trial_ends_at: string | null;
  trial_active: boolean;
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
  const sessionId = useMemo(() => new URLSearchParams(location.search).get("session_id") || "", [location.search]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let attempts = 0;

    async function loadStatus() {
      try {
        if (sessionId) {
          await apiFetch(`/billing/confirm-checkout-session?session_id=${encodeURIComponent(sessionId)}`, {
            method: "POST",
          }).catch(() => {});
        }
        const data = (await apiFetch("/billing/me")) as BillingStatus;
        if (cancelled) return;
        setBilling(data);
        setError(null);

        const nextStatus = (data?.subscription_status || "").toLowerCase();
        const hasAccess = nextStatus === "active" || nextStatus === "trialing" || !!data?.trial_active;

        if (!hasAccess && attempts < 8) {
          attempts += 1;
          pollTimer = window.setTimeout(() => {
            void loadStatus();
          }, 1500);
          return;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not confirm your billing status yet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [sessionId]);

  const status = (billing?.subscription_status || "").toLowerCase();
  const isActive = status === "active" || status === "trialing";
  const isTrial = status === "trialing" || !!billing?.trial_active;
  const planLabel = billing?.billing_interval === "annual" ? "Annual plan" : "Monthly plan";
  const renewalDate = formatDate(billing?.current_period_end || null);
  const trialDate = formatDate(billing?.trial_ends_at || billing?.current_period_end || null);

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
            {isTrial ? "Trial active" : isActive ? "Subscription active" : "Checkout received"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isTrial
              ? "Your 14-day Elume trial is now active. Stripe will collect your first payment automatically when the trial ends."
              : isActive
                ? "Your Elume plan is now active."
                : "Your checkout completed. We are confirming your billing status now."}
          </p>
        </div>

        <div className="mt-6 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-sm">
          {loading ? (
            <div className="text-sm font-semibold text-slate-700">Checking subscription status...</div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {error}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <span className="font-black text-slate-900">Status:</span>{" "}
                {isTrial ? "Trial active" : isActive ? "Active" : "Checkout processing"}
              </div>
              <div>
                <span className="font-black text-slate-900">Plan:</span> {planLabel}
              </div>
              {isTrial && trialDate ? (
                <div>
                  <span className="font-black text-slate-900">First payment date:</span> {trialDate}
                </div>
              ) : renewalDate ? (
                <div>
                  <span className="font-black text-slate-900">Renewal date:</span> {renewalDate}
                </div>
              ) : null}
              <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm text-slate-600">
                {isTrial
                  ? "Your trial includes the full Elume setup flow. You will not be charged today."
                  : isActive
                    ? "Your subscription is set up and ready to use in Elume."
                    : "We are still confirming your subscription with Stripe. This usually takes a few seconds."}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/onboarding/billing")}
            className="rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Review billing
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            disabled={!isActive && !isTrial}
            className="rounded-full border-2 border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
