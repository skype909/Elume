import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import elumeLogo from "./assets/ELogo2.png";
import LanguageSwitch from "./Components/LanguageSwitch";
import { useUiLanguage } from "./i18n/UiLanguageContext";

function passwordPolicyError(password: string, t: (key: string) => string) {
  if (password.length < 8) return t("register.passwordMinimum");
  if (!/[A-Z]/.test(password)) return t("register.passwordUppercase");
  if (!/[a-z]/.test(password)) return t("register.passwordLowercase");
  if (!/[0-9]/.test(password)) return t("register.passwordNumber");
  return null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useUiLanguage();
  const [role, setRole] = useState<"teacher" | null>(null);
  const teacherChoiceRef = useRef<HTMLButtonElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (role) {
      firstNameRef.current?.focus();
    } else {
      teacherChoiceRef.current?.focus();
    }
  }, [role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !schoolName.trim() ||
      !email.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      setError(t("register.completeFields"));
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError(t("register.validEmail"));
      return;
    }

    const passwordError = passwordPolicyError(password.trim(), t);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError(t("register.passwordMismatch"));
      return;
    }

    setLoading(true);

    try {
      const data = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          school_name: schoolName.trim(),
          email: email.trim(),
          password: password.trim(),
        }),
      });

      setSuccess(data?.message || t("register.success"));
      setTimeout(() => navigate("/"), 1200);
    } catch (err: any) {
      setError(err?.message || t("register.failure"));
    } finally {
      setLoading(false);
    }
  }

  if (!role) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
        <div className="absolute right-4 top-4 z-20"><LanguageSwitch /></div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
          <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-violet-300/25 blur-3xl" />
          <div className="absolute bottom-[-80px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
        </div>

        <main className="relative z-10 w-full max-w-xl rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-10">
          <img src={elumeLogo} alt="Elume" className="mx-auto h-20 w-20 object-contain" />
          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {t("register.welcome")}
          </h1>
          <p className="mt-3 text-lg text-slate-600">{t("register.rolePrompt")}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button
              ref={teacherChoiceRef}
              type="button"
              onClick={() => setRole("teacher")}
              className="min-h-[132px] rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-5 text-left shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-200"
            >
              <span className="block text-lg font-black text-emerald-950">{t("register.teacherChoice")}</span>
              <span className="mt-2 block text-sm leading-6 text-emerald-900">{t("register.teacherChoiceHelp")}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/student")}
              className="min-h-[132px] rounded-3xl border-2 border-cyan-200 bg-cyan-50 p-5 text-left shadow-sm transition hover:border-cyan-400 hover:bg-cyan-100 focus:outline-none focus:ring-4 focus:ring-cyan-200"
            >
              <span className="block text-lg font-black text-cyan-950">{t("register.studentChoice")}</span>
              <span className="mt-2 block text-sm leading-6 text-cyan-900">{t("register.studentChoiceHelp")}</span>
            </button>
          </div>

          <p className="mt-7 text-sm text-slate-600">
            {t("register.alreadyAccount")}{" "}
            <Link to="/" className="font-semibold text-emerald-700 hover:underline">{t("login.signIn")}</Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="absolute right-4 top-4 z-20"><LanguageSwitch /></div>
      {/* Background glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute bottom-[-80px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
        <div className="absolute bottom-10 right-[18%] h-72 w-72 rounded-full bg-lime-300/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.75),transparent_45%)]" />
      </div>

      {/* Decorative grid glow */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.10] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            {/* Left hero section */}
            <div className="hidden lg:block">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm backdrop-blur">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
                  {t("register.freeTrialHero")}
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <div className="grid h-20 w-20 place-items-center rounded-3xl border border-white/70 bg-white/80 shadow-xl ring-1 ring-emerald-100 backdrop-blur">
                    <img
                      src={elumeLogo}
                      alt="Elume"
                      className="h-16 w-16 object-contain drop-shadow-sm"
                    />
                  </div>

                  <div>
                    <h1 className="text-5xl font-black tracking-tight text-slate-900">
                      <span className="bg-gradient-to-r from-cyan-500 via-emerald-500 to-violet-500 bg-clip-text text-transparent">
                        Elume
                      </span>
                    </h1>
                    <p className="mt-1 text-lg font-medium text-slate-600">
                      {t("public.platform")}
                    </p>
                  </div>
                </div>

                <h2 className="mt-8 text-5xl font-black leading-tight tracking-tight text-slate-900">
                  {t("register.heroTitle")}
                  <span className="block bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                    {t("register.heroAccent")}
                  </span>
                </h2>

                <p className="mt-5 text-lg leading-8 text-slate-600">
                  {t("register.heroDescription")}
                </p>

                <div className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      {t("register.trialTitle")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {t("register.trialDescription")}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      {t("register.earlyPricingTitle")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {t("register.earlyPricingDescription")}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      {t("register.annualValueTitle")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {t("register.annualValueDescription")}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      {t("public.builtForSchools")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {t("register.builtForSchoolsDescription")}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                    {t("public.trustedPilots")}
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                    {t("register.earlyRates")}
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                    {t("public.builtInIreland")}
                  </div>
                </div>
              </div>
            </div>

            {/* Right side register card */}
            <div className="mx-auto w-full max-w-md">
              {/* Mobile brand intro */}
              <div className="mb-5 rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-xl backdrop-blur lg:hidden">
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-100 bg-white shadow-md">
                    <img
                      src={elumeLogo}
                      alt="Elume"
                      className="h-11 w-11 object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-3xl font-black tracking-tight text-slate-900">
                      <span className="bg-gradient-to-r from-cyan-500 via-emerald-500 to-violet-500 bg-clip-text text-transparent">
                        Elume
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      {t("public.platform")}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
                  {t("register.mobileTrialDescription")}
                </div>
              </div>

              <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <button
                      type="button"
                      onClick={() => setRole(null)}
                      className="mb-3 text-sm font-semibold text-emerald-700 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
                    >
                      {t("register.changeChoice")}
                    </button>
                    <div className="text-2xl font-black tracking-tight text-slate-900">
                      {t("register.title")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {t("register.formDescription")}
                    </div>
                  </div>

                  <div className="hidden rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:block">
                    {t("register.teacherSignup")}
                  </div>
                </div>

                <div className="mb-5 space-y-3">
                  <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white">
                        {t("register.trialBadge")}
                      </span>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                        {t("register.pricingBadge")}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      <p>
                        {t("register.afterVerify")}
                      </p>
                      <p>
                        {t("register.pricingLead")} <span className="font-black text-slate-900">{t("register.monthlyPrice")}</span> {t("register.or")}{" "}
                        <span className="font-black text-slate-900">{t("register.yearlyPrice")}</span>.
                      </p>
                      <p>
                        <span className="font-bold text-slate-900">{t("register.launchOffer")}</span> {t("register.annualActiveLead")}{" "}
                        <span className="font-black text-emerald-700">{t("register.annualActiveDate")}</span>.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      {t("register.stepRegister")}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      {t("register.stepVerify")}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      {t("register.stepPlan")}
                    </div>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={submit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                        {t("register.firstName")}
                      </span>
                      <input
                        ref={firstNameRef}
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder={t("register.firstNamePlaceholder")}
                        autoComplete="given-name"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                        {t("register.lastName")}
                      </span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder={t("register.lastNamePlaceholder")}
                        autoComplete="family-name"
                        required
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-800">
                      {t("register.schoolName")}
                    </span>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder={t("register.schoolPlaceholder")}
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-800">
                      {t("login.email")}
                    </span>
                    <input
                      type="email"
                      className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@school.ie"
                      required
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                      {t("login.password")}
                      </span>
                      <input
                        type="password"
                        minLength={8}
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder={t("register.passwordPlaceholder")}
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                        {t("register.confirmPassword")}
                      </span>
                      <input
                        type="password"
                        minLength={8}
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder={t("register.confirmPasswordPlaceholder")}
                        required
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                    {t("register.passwordHelp")}
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                      {success}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3.5 text-base font-black text-white shadow-lg transition duration-200 hover:scale-[1.01] hover:shadow-xl active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                    <span className="relative">
                      {loading ? t("register.loading") : t("register.submit")}
                    </span>
                  </button>
                </form>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-4 py-3 text-center shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t("register.whatNext")}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      {t("register.nextHelp")}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      {t("register.secureSignup")}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      {t("login.teacherFirst")}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      {t("login.schoolReadyBadge")}
                    </div>
                  </div>
                </div>

                <div className="mt-5 text-center text-sm text-slate-600">
                  {t("register.alreadyAccount")}{" "}
                  <Link to="/" className="font-semibold text-emerald-700 hover:underline">
                    {t("login.signIn")}
                  </Link>
                </div>
              </div>

              <div className="mt-4 text-center text-xs text-slate-500">
                {t("register.footer")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
