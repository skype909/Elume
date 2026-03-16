import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "./api";
import elumeLogo from "./assets/ELogo2.png";


type Props = { onLoggedIn: () => void };

export default function LoginPage({ onLoggedIn }: Props) {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");

    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showWaitlistModal, setShowWaitlistModal] = useState(false);
    const [waitlistName, setWaitlistName] = useState("");
    const [waitlistEmail, setWaitlistEmail] = useState("");
    const [waitlistSchool, setWaitlistSchool] = useState("");
    const [waitlistLoading, setWaitlistLoading] = useState(false);
    const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null);
    const [waitlistError, setWaitlistError] = useState<string | null>(null);
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState<string | null>(null);
    const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);

    function isLocalDev() {
        const h = window.location.hostname;
        return h === "localhost" || h === "127.0.0.1";
    }

    useEffect(() => {
        let cancelled = false;

        async function devAutoLogin() {
            if (!isLocalDev()) return;

            try {
                const data = await apiFetch("/auth/dev-auto-login", {
                    method: "POST",
                });

                if (cancelled) return;

                const token = data?.access_token;
                if (!token) throw new Error("No token returned from dev auto login");

                localStorage.setItem("elume_token", token);

                try {
                    setToken(token);
                } catch { }

                onLoggedIn();
                navigate("/", { replace: true });

            } catch {
                // silently fail so normal login form still works
            }
        }

        devAutoLogin();

        return () => {
            cancelled = true;
        };
    }, [onLoggedIn, navigate]);

    useEffect(() => {
        document.title = "Elume – AI Tools for Secondary School Teachers";

        let meta = document.querySelector('meta[name="description"]');

        if (!meta) {
            meta = document.createElement("meta");
            meta.setAttribute("name", "description");
            document.head.appendChild(meta);
        }

        meta.setAttribute(
            "content",
            "Elume is an AI teaching platform for secondary school teachers. Create quizzes, organise class resources, build exam materials and use live classroom tools."
        );
    }, []);

    async function submitForgotPassword(e: React.FormEvent) {
        e.preventDefault();
        setForgotPasswordError(null);
        setForgotPasswordSuccess(null);
        setForgotPasswordLoading(true);

        try {
            await apiFetch("/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({
                    email: forgotPasswordEmail.trim(),
                }),
            });

            setForgotPasswordSuccess(
                "If that email is registered, a password reset link has been sent."
            );
        } catch (err: any) {
            setForgotPasswordError(err?.message || "Could not send reset link");
        } finally {
            setForgotPasswordLoading(false);
        }
    }

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
            navigate("/", { replace: true });

        } catch (err: any) {
            setError(err?.message || "Login failed");
        } finally {
            setLoading(false);
        }
    }

    async function submitWaitlist(e: React.FormEvent) {
        e.preventDefault();
        setWaitlistError(null);
        setWaitlistSuccess(null);
        setWaitlistLoading(true);

        try {
            await apiFetch("/waitlist", {
                method: "POST",
                body: JSON.stringify({
                    name: waitlistName.trim(),
                    email: waitlistEmail.trim(),
                    school: waitlistSchool.trim(),
                }),
            });

            setWaitlistSuccess("Thanks — you’ve been added to the Elume waitlist.");
            setWaitlistName("");
            setWaitlistEmail("");
            setWaitlistSchool("");

            setTimeout(() => {
                setShowWaitlistModal(false);
                setWaitlistSuccess(null);
            }, 1400);
        } catch (err: any) {
            setWaitlistError(err?.message || "Could not join waitlist");
        } finally {
            setWaitlistLoading(false);
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
                    <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                        {/* Left hero section */}
                        <div className="hidden lg:block">
                            <div className="max-w-xl">
                                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm backdrop-blur">
                                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
                                    AI-powered tools for modern teachers
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
                                    Make teaching
                                    <span className="block bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                                        smarter, faster, brighter.
                                    </span>
                                </h2>

                                <p className="mt-5 text-lg leading-8 text-slate-600">
                                    Elume is an AI teaching platform for secondary school teachers,
                                    helping you create quizzes, organise class resources, build exam materials,
                                    and run live classroom tools from one teacher-friendly workspace.
                                </p>

                                <div className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            Save Time
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            Create quizzes, class resources and teaching materials in minutes.
                                        </div>

                                    </div>

                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            Engage Classes
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            Run live classroom tools and quizzes that work beautifully on screen.
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            Stay Organised
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            Organise notes, tests, class files and teaching spaces in one place.
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            Built for Schools
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            Professional, secure and designed for real secondary school classrooms.
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                    <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                                        Trusted by pilot teachers
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                                        Teacher-first design
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                                        Built in Ireland
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right side login card */}
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
                                    Smarter tools for lesson planning, quizzes, reports,
                                    whiteboards and class management.
                                </div>
                            </div>

                            <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
                                <div className="mb-5 flex items-center justify-between">
                                    <div>
                                        <div className="text-2xl font-black tracking-tight text-slate-900">
                                            Welcome back
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            Sign in to access your classes and tools.
                                        </div>
                                    </div>

                                    <div className="hidden rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:block">
                                        Teacher Login
                                    </div>
                                </div>

                                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                                    Pilot access is currently issued by admin. Use the email and
                                    password you were given.
                                </div>

                                <form className="space-y-4" onSubmit={submit}>
                                    <label className="block">
                                        <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                            Email
                                        </span>
                                        <input
                                            className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                            inputMode="email"
                                            placeholder="you@school.ie"
                                            required
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                            Password
                                        </span>
                                        <input
                                            type="password"
                                            className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete="current-password"
                                            placeholder="Enter your password"
                                            required
                                            minLength={6}
                                        />
                                    </label>

                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setForgotPasswordEmail(email.trim());
                                                setForgotPasswordError(null);
                                                setForgotPasswordSuccess(null);
                                                setShowForgotPasswordModal(true);
                                            }}
                                            className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-800 hover:underline"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>

                                    {error && (
                                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3.5 text-base font-black text-white shadow-lg transition duration-200 hover:scale-[1.01] hover:shadow-xl active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                                        <span className="relative">
                                            {loading ? "Signing in…" : "Log in"}
                                        </span>
                                    </button>
                                </form>

                                {/* Stripe / trust area */}
                                <div className="mt-6 space-y-3">
                                    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-4 py-3 text-center shadow-sm">
                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Secure billing
                                        </div>
                                        <div className="mt-1 text-sm text-slate-700">
                                            Payments powered by{" "}
                                            <span className="font-black text-indigo-600">Stripe</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                                            Secure access
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                                            Teacher-first
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                                            School-ready
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 border-t border-slate-200 pt-4">
                                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-4 shadow-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                                    Early Access
                                                </div>
                                                <div className="mt-1 text-base font-black tracking-tight text-slate-900">
                                                    Join the Elume Waitlist
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setWaitlistError(null);
                                                    setWaitlistSuccess(null);
                                                    setShowWaitlistModal(true);
                                                }}
                                                className="shrink-0 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
                                            >
                                                Join
                                            </button>
                                        </div>

                                        <p className="mt-2 text-sm leading-5 text-slate-600">
                                            Be first to hear when new teacher and school access opens.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {showForgotPasswordModal && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
                                    <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                                    Account recovery
                                                </div>
                                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                                    Reset your password
                                                </h3>
                                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                                    Enter your email and we’ll send you a secure password reset link.
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setShowForgotPasswordModal(false)}
                                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                                            >
                                                Close
                                            </button>
                                        </div>

                                        <form className="mt-5 space-y-4" onSubmit={submitForgotPassword}>
                                            <label className="block">
                                                <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                                    Email
                                                </span>
                                                <input
                                                    type="email"
                                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                                    value={forgotPasswordEmail}
                                                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                                                    placeholder="you@school.ie"
                                                    required
                                                />
                                            </label>

                                            {forgotPasswordError && (
                                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                                    {forgotPasswordError}
                                                </div>
                                            )}

                                            {forgotPasswordSuccess && (
                                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                                                    {forgotPasswordSuccess}
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={forgotPasswordLoading}
                                                className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-base font-black text-white shadow-lg transition hover:shadow-xl disabled:opacity-60"
                                            >
                                                {forgotPasswordLoading ? "Sending link..." : "Send reset link"}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 text-center text-xs text-slate-500">
                                Designed to help teachers save time, stay organised and make
                                lessons shine.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {showWaitlistModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                    Early Access
                                </div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                    Join the Elume Waitlist
                                </h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Leave your details and I’ll keep you updated on early access and rollout.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowWaitlistModal(false)}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <form className="mt-5 space-y-4" onSubmit={submitWaitlist}>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                    Name
                                </span>
                                <input
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                    value={waitlistName}
                                    onChange={(e) => setWaitlistName(e.target.value)}
                                    placeholder="Your name"
                                    required
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                    Email
                                </span>
                                <input
                                    type="email"
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                    value={waitlistEmail}
                                    onChange={(e) => setWaitlistEmail(e.target.value)}
                                    placeholder="you@school.ie"
                                    required
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                    School <span className="font-normal text-slate-400">(optional)</span>
                                </span>
                                <input
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                    value={waitlistSchool}
                                    onChange={(e) => setWaitlistSchool(e.target.value)}
                                    placeholder="School name"
                                />
                            </label>

                            {waitlistError && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                    {waitlistError}
                                </div>
                            )}

                            {waitlistSuccess && (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                                    {waitlistSuccess}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={waitlistLoading}
                                className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-base font-black text-white shadow-lg transition hover:shadow-xl disabled:opacity-60"
                            >
                                {waitlistLoading ? "Joining..." : "Join the Waitlist"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}