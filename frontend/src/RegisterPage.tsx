import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import elumeLogo from "./assets/ELogo2.png";

function passwordPolicyError(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  return null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setError("Please complete all fields.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    const passwordError = passwordPolicyError(password.trim());
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
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

      setSuccess(data?.message || "Account created. Please verify your email before signing in.");
      setTimeout(() => navigate("/"), 1200);
    } catch (err: any) {
      setError(err?.message || "Could not create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
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
                  Start with a 14-day free trial
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
                      The AI-Powered Teaching Platform
                    </p>
                  </div>
                </div>

                <h2 className="mt-8 text-5xl font-black leading-tight tracking-tight text-slate-900">
                  Build your teacher workspace
                  <span className="block bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                    and get started fast.
                  </span>
                </h2>

                <p className="mt-5 text-lg leading-8 text-slate-600">
                  Create your Elume account, verify your email, then log in to choose your plan.
                  No plan is selected on this page. Your 14-day free trial begins once you complete billing setup after verification.
                </p>

                <div className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      14-Day Trial
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Register first, verify your email, then choose your plan and begin your free trial.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      Early Adopter Pricing
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Join now at €6 monthly or €60 yearly during our early launch phase.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      Best Annual Value
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Annual accounts purchased now stay active until the end of September 2027.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                    <div className="text-sm font-bold text-slate-900">
                      Built for Schools
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Teacher-first, practical and designed for real secondary school classrooms.
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                    Trusted by pilot teachers
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                    Early adopter rates
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                    Built in Ireland
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
                      The AI-Powered Teaching Platform
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
                  Create your account now, then verify your email and choose your plan to start your 14-day free trial.
                </div>
              </div>

              <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black tracking-tight text-slate-900">
                      Create teacher account
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Register now, verify your email, then log in to choose your plan.
                    </div>
                  </div>

                  <div className="hidden rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:block">
                    Teacher Sign Up
                  </div>
                </div>

                <div className="mb-5 space-y-3">
                  <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white">
                        14-day free trial
                      </span>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                        Early adopter pricing
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      <p>
                        After you verify your email and log in, you’ll choose your Elume plan and begin your free trial.
                      </p>
                      <p>
                        Early adopter prices are <span className="font-black text-slate-900">€6 monthly</span> or{" "}
                        <span className="font-black text-slate-900">€60 yearly</span>.
                      </p>
                      <p>
                        <span className="font-bold text-slate-900">Special launch offer:</span> annual accounts purchased now will remain active until the{" "}
                        <span className="font-black text-emerald-700">end of September 2027</span>.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      Register first
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      Verify email
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      Choose plan
                    </div>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={submit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                        First name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        autoComplete="given-name"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                        Last name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        autoComplete="family-name"
                        required
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-800">
                      School name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="Your school"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-800">
                      Email
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
                        Password
                      </span>
                      <input
                        type="password"
                        minLength={8}
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Create password"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">
                        Confirm password
                      </span>
                      <input
                        type="password"
                        minLength={8}
                        className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Confirm password"
                        required
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                    Use at least 8 characters, including an uppercase letter, a lowercase letter, and a number.
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
                      {loading ? "Creating account…" : "Create teacher account"}
                    </span>
                  </button>
                </form>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-4 py-3 text-center shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      What happens next
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      Verify your email, log in, choose your plan, and start using Elume.
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      Secure signup
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      Teacher-first
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      School-ready
                    </div>
                  </div>
                </div>

                <div className="mt-5 text-center text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link to="/" className="font-semibold text-emerald-700 hover:underline">
                    Log in
                  </Link>
                </div>
              </div>

              <div className="mt-4 text-center text-xs text-slate-500">
                Built to help teachers save time, stay organised and make lessons shine.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}