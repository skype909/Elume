import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import ELogo2 from "./assets/ELogo2.png";

type BillingStatus = {
  subscription_status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  subscription_expires_at?: string | null;
  subscription_expired?: boolean;
  requires_billing_redirect?: boolean;
  has_stripe_customer: boolean;
  billing_onboarding_required: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_active: boolean;
  prompt_usage_today: number;
  prompt_limit_today: number;
};

function daysLeft(value: string | null) {
  if (!value) return 0;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return 0;
  const diff = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export default function BillingOnboardingPage() {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual" | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let attempts = 0;

    async function loadStatus() {
      try {
        const data = (await apiFetch("/billing/me")) as BillingStatus;
        if (cancelled) return;
        setBilling(data);
        setError(null);

        const onboardingRequired = !!data?.billing_onboarding_required;
        const nextStatus = (data?.subscription_status || "").toLowerCase();
        const hasAccess = nextStatus === "active" || nextStatus === "trialing" || !!data?.trial_active;
        if (!onboardingRequired && !hasAccess) {
          navigate("/", { replace: true });
          return;
        }

        const awaitingActivation = nextStatus === "pending" && !!data?.has_stripe_customer;
        if (awaitingActivation && attempts < 8) {
          attempts += 1;
          pollTimer = window.setTimeout(() => {
            void loadStatus();
          }, 1500);
          return;
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not load billing status.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [navigate]);

  const status = useMemo(() => (billing?.subscription_status || "inactive").toLowerCase(), [billing]);
  const isTrial = (status === "trialing" || !!billing?.trial_active) && !billing?.billing_onboarding_required;
  const isPaid = status === "active" || isTrial;
  const isPendingActivation = status === "pending" && !!billing?.has_stripe_customer;
  const trialDaysLeft = daysLeft(billing?.trial_ends_at || null);
  const isExpired = Boolean(billing?.subscription_expired);
  const subscriptionExpiresAt = billing?.subscription_expires_at ?? null;
  const annualOfferCopy =
    "Annual subscriptions started on or before 30 June 2026 include access through to 30 September 2027.";

  async function startCheckout(plan: "monthly" | "annual") {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch("/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      const checkoutUrl = String((data as any)?.checkout_url || "").trim();
      if (!checkoutUrl) throw new Error("No Stripe checkout URL was returned.");
      window.location.assign(checkoutUrl);
    } catch (err: any) {
      setError(err?.message || "Could not start checkout.");
      setBusy(false);
    }
  }

  function openTermsForPlan(plan: "monthly" | "annual") {
    setSelectedPlan(plan);
    setShowTermsModal(true);
    setHasScrolledToEnd(false);
    setTermsAccepted(false);
  }

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch("/billing/create-portal-session", { method: "POST" });
      const portalUrl = String((data as any)?.portal_url || "").trim();
      if (!portalUrl) throw new Error("No billing portal URL was returned.");
      window.location.assign(portalUrl);
    } catch (err: any) {
      setError(err?.message || "Could not open billing portal.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-[36px] border border-white/70 bg-white/90 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/70 bg-white shadow-md ring-1 ring-emerald-100">
              <img src={ELogo2} alt="Elume" className="h-11 w-11 object-contain" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
                Welcome to Elume
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                {isExpired ? "Renew your Elume subscription" : "Complete your Elume setup"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {isExpired
                  ? "Your subscription has expired. Renew now to restore full access to your account."
                  : "Choose a monthly or annual plan, enter your card details securely in Stripe, and start with a 14-day free trial. No charge is taken today."}
              </p>
              {isExpired && subscriptionExpiresAt && (
                <p className="mt-2 text-sm font-medium text-slate-600">
                  Your previous subscription expired on {new Date(subscriptionExpiresAt).toLocaleDateString("en-IE")}.
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-slate-700">{annualOfferCopy}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
            Loading your billing options...
          </div>
        ) : (
          <>
            {(isPaid || isTrial) && (
              <div className="mt-6 rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-5 py-4">
                <div className="text-sm font-bold text-slate-900">
                  {isTrial
                    ? `Trial active • ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                    : `Plan active • ${billing?.billing_interval === "annual" ? "Annual" : "Monthly"}`}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {isTrial
                    ? `Your card is saved and your first charge will happen automatically after the trial. AI usage today: ${billing?.prompt_usage_today ?? 0} / ${billing?.prompt_limit_today ?? 0}.`
                    : "Your billing is already set up. You can continue into your workspace now."}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate("/", { replace: true })}
                    className="rounded-full border-2 border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Continue to Dashboard
                  </button>
                  {billing?.has_stripe_customer && (
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={busy}
                      className="rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Manage plan
                    </button>
                  )}
                </div>
              </div>
            )}

            {isPendingActivation && (
              <div className="mt-6 rounded-[28px] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-5 py-4">
                <div className="text-sm font-bold text-slate-900">Finishing your billing setup</div>
                <div className="mt-2 text-sm text-slate-600">
                  Stripe checkout completed. Elume is waiting for confirmation from Stripe before opening your workspace. This usually takes a few seconds.
                </div>
              </div>
            )}

            {!isPaid && !isTrial && !isPendingActivation && (
              <div className="mt-6 space-y-5">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-bold text-slate-900">How billing works</div>
                  <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                    <p>Your Elume plan starts with a 14-day free trial.</p>
                    <p>Stripe collects your card details today, but no charge is taken today.</p>
                    <p>Your first payment is taken automatically 14 days after your trial starts unless you cancel first.</p>
                    <p>You can cancel before the first charge date from Teacher Admin.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[30px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Monthly</div>
                  <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{"\u20AC"}6/month</div>
                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    Start a 14-day free trial today. Card details are required through Stripe now, and the first payment is taken automatically when the trial ends unless cancelled.
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">Includes 5 AI prompts per day during trial, then 25 per day on the paid plan.</div>
                  <button
                    type="button"
                    onClick={() => openTermsForPlan("monthly")}
                    disabled={busy}
                    className="mt-5 w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {busy && selectedPlan === "monthly"
                      ? "Redirecting..."
                      : isExpired
                        ? "Renew monthly plan"
                        : "Continue with monthly"}
                  </button>
                </div>

                <div className="rounded-[30px] border border-cyan-200 bg-white p-5 shadow-[0_16px_40px_rgba(14,116,144,0.10)]">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700">Annual</div>
                  <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{"\u20AC"}60/year</div>
                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    Start a 14-day free trial today. Save for the year, enter your card details now, and let Stripe bill automatically after the trial unless cancelled.
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">Includes 5 AI prompts per day during trial, then 25 per day on the paid plan.</div>
                  <button
                    type="button"
                    onClick={() => openTermsForPlan("annual")}
                    disabled={busy}
                    className="mt-5 w-full rounded-2xl border-2 border-cyan-600 bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
                  >
                    {busy && selectedPlan === "annual"
                      ? "Redirecting..."
                      : isExpired
                        ? "Renew annual plan"
                        : "Continue with annual"}
                  </button>
                </div>
              </div>
              </div>
            )}

            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900">
              If your subscription ends, your workspace may be removed after 30 days. Please export important materials before then.
            </div>

            {!isPaid && !isTrial && !isPendingActivation && (
              <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                Checkout collects your payment method now, starts your 14-day trial immediately, and only charges the first renewal at the end of the trial.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {showTermsModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Billing terms
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                  Review before continuing to Stripe
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Please read this summary before you continue with the {selectedPlan === "annual" ? "annual" : "monthly"} plan.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div
              className="mt-5 max-h-[42vh] overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700"
              onScroll={(e) => {
                const el = e.currentTarget;
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
                if (atBottom) setHasScrolledToEnd(true);
              }}
            >
              <p className="font-semibold text-slate-900">Plan selected: {selectedPlan === "annual" ? "Annual (€60/year)" : "Monthly (€6/month)"}</p>
              <p className="mt-3">Your Elume subscription includes a 14-day free trial from the date your setup is completed.</p>
              <p className="mt-3">Stripe will ask for your card details today to set up the subscription, but no charge is taken today.</p>
              <p className="mt-3">Unless you cancel first, the first payment will be taken automatically 14 days after your trial starts.</p>
              <p className="mt-3">You can cancel before the first charge date from Teacher Admin using the billing controls.</p>
              <p className="mt-3">If your subscription ends, your workspace may be removed after 30 days. Please export important materials before then.</p>
              <p className="mt-3">By continuing, you confirm that you have read this billing summary and want Elume to begin your free trial with the selected subscription plan.</p>
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
                Scroll to the bottom of this summary to enable agreement.
              </div>
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                disabled={!hasScrolledToEnd}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
              />
              <span className="text-sm leading-6 text-slate-700">
                I have read and agree to this billing summary, including the 14-day free trial, automatic payment after the trial unless cancelled, and the workspace retention warning.
              </span>
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!hasScrolledToEnd || !termsAccepted || busy}
                onClick={() => startCheckout(selectedPlan)}
                className="rounded-full border-2 border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Redirecting to Stripe..." : "Continue to Stripe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
