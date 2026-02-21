import React, { useEffect, useState } from "react";
import { apiFetch, setToken } from "./api";
import elumeLogo from "./assets/ELogo2.png";


type Props = { onLoggedIn: () => void };

export default function LoginPage({ onLoggedIn }: Props) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);


    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const data = await apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify({
                    email: email.trim(),
                    password: password.trim(),
                }),
            });

            const token = data?.access_token;
            if (!token) throw new Error("No token returned from server");

            localStorage.setItem("elume_token", token);

            try {
                setToken(token);
            } catch { }

            onLoggedIn();
        } catch (err: any) {
            setError(err?.message || "Login failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Brand header */}
                <div className="mb-4 rounded-3xl border-2 border-emerald-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl overflow-hidden border border-emerald-100 bg-white grid place-items-center">
                            <img
                                src={elumeLogo}
                                alt="Elume"
                                className="h-10 w-10 object-contain"
                            />
                        </div>
                        <div>
                            <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                                Elume
                            </div>
                            <div className="text-sm text-slate-600">
                                Learn, Grow, Succeed
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        Pilot access is issued by admin — please use the login details you were given.
                    </div>
                </div>

                {/* Login card */}
                <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                    <div className="text-xl font-extrabold tracking-tight text-slate-900">
                        Teacher Login
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                        Sign in to access your classes.
                    </div>

                    <form className="mt-6 space-y-3" onSubmit={submit}>
                        <label className="block text-sm font-semibold text-slate-800">
                            Email
                            <input
                                className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-emerald-300"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                inputMode="email"
                                required
                            />
                        </label>

                        <label className="block text-sm font-semibold text-slate-800">
                            Password
                            <input
                                type="password"
                                className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-emerald-300"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
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
                            className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 font-extrabold text-white shadow-sm disabled:opacity-60"
                        >
                            {loading ? "Signing in…" : "Log in"}
                        </button>
                    </form>

                    <div className="mt-4 text-center text-xs text-slate-500">
                        Trouble logging in? Ask Peter for a reset.
                    </div>
                </div>
            </div>
        </div>
    );
}
