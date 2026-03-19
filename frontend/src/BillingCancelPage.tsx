import React from "react";
import { useNavigate } from "react-router-dom";
import ELogo2 from "./assets/ELogo2.png";

export default function BillingCancelPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-[36px] border border-white/70 bg-white/90 p-8 text-center shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/70 bg-white shadow-md ring-1 ring-emerald-100">
          <img src={ELogo2} alt="Elume" className="h-14 w-14 object-contain" />
        </div>

        <div className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
          Billing
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Checkout cancelled</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your subscription checkout was cancelled. Nothing has been charged, and you can try again whenever you are ready.
        </p>

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
