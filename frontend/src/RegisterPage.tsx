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

    if (!firstName.trim() || !lastName.trim() || !schoolName.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute bottom-[-80px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-100 bg-white shadow-md">
              <img src={elumeLogo} alt="Elume" className="h-11 w-11 object-contain" />
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-slate-900">Create teacher account</div>
              <div className="mt-1 text-sm text-slate-600">Set up your Elume account, verify your email, then choose your plan and start your 14-day free trial.</div>
            </div>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-800">First name</span>
                <input className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-800">Last name</span>
                <input className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">School name</span>
              <input className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">Email</span>
              <input type="email" className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-800">Password</span>
                <input type="password" minLength={8} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-800">Confirm password</span>
                <input type="password" minLength={8} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
              Use at least 8 characters, including an uppercase letter, a lowercase letter, and a number.
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</div>}

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3.5 text-base font-black text-white shadow-lg transition duration-200 hover:scale-[1.01] hover:shadow-xl active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
              <span className="relative">{loading ? "Creating account…" : "Create teacher account"}</span>
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link to="/" className="font-semibold text-emerald-700 hover:underline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
