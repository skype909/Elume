import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "./api";
import elumeLogo from "./assets/ELogo2.png";

export default function ResetPasswordPage() {
    const [params] = useSearchParams();
    const token = useMemo(() => (params.get("token") || "").trim(), [params]);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!token) {
            setError("This reset link is invalid or incomplete.");
            return;
        }
        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const data = await apiFetch("/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({
                    token,
                    new_password: newPassword,
                }),
            });
            setSuccess(data?.message || "Password reset successful.");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            setError(err?.message || "Could not reset password.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />
                <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
            </div>

            <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
                <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
                    <div className="mb-6 flex items-center gap-4">
                        <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/70 bg-white/80 shadow-xl ring-1 ring-emerald-100 backdrop-blur">
                            <img src={elumeLogo} alt="Elume" className="h-12 w-12 object-contain" />
                        </div>
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                Account recovery
                            </div>
                            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                                Reset your password
                            </h1>
                        </div>
                    </div>

                    <p className="mb-5 text-sm leading-6 text-slate-600">
                        Choose a new password for your Elume account. This page does not require login.
                    </p>

                    <form className="space-y-4" onSubmit={submit}>
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                New password
                            </span>
                            <input
                                type="password"
                                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={6}
                                required
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                Confirm password
                            </span>
                            <input
                                type="password"
                                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={6}
                                required
                            />
                        </label>

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
                            disabled={loading || !token}
                            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-base font-black text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? "Updating password..." : "Set new password"}
                        </button>
                    </form>

                    <div className="mt-5 text-center text-sm text-slate-600">
                        <Link to="/" className="font-semibold text-emerald-700 transition hover:text-emerald-800 hover:underline">
                            Back to login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
