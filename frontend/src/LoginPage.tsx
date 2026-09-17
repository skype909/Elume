import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, INVITATION_LOGIN_NOTICE_KEY, setToken } from "./api";
import elumeLogo from "./assets/ELogo2.png";
import SchoolBrand from "./Components/SchoolBrand";
import { normalElumeLoginUrl, resolveSchoolBrandingSlug } from "./schoolBranding";
import LanguageSwitch from "./Components/LanguageSwitch";
import { useUiLanguage } from "./i18n/UiLanguageContext";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Sparkles } from "lucide-react";

type Props = { onLoggedIn: () => void };
type SchoolBranding = { name: string; slug: string; logo_url?: string | null; status: "active" | "suspended" | "inactive" };
type BrandingState =
    | { kind: "none" | "loading" }
    | { kind: "ready"; branding: SchoolBranding }
    | { kind: "unavailable"; branding: SchoolBranding }
    | { kind: "unknown" }
    | { kind: "error" };

function SocialIconLink({
    href,
    label,
    bgClass,
    ringClass,
    icon,
}: {
    href: string;
    label: string;
    bgClass: string;
    ringClass: string;
    icon: React.ReactNode;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            title={label}
            className="group inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white/85 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:bg-white hover:shadow-md"
        >
            <span
                className={`grid h-10 w-10 place-items-center rounded-2xl ring-1 ${bgClass} ${ringClass}`}
            >
                {icon}
            </span>
        </a>
    );
}

function StudentHubCard({ className = "" }: { className?: string }) {
  return <div className={`rounded-[28px] border border-amber-300/80 bg-gradient-to-r from-[#FFF36A] to-[#FFD447] p-4 text-[#111827] shadow-[0_14px_40px_rgba(146,99,0,0.18)] sm:p-5 ${className}`}><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#142D50]"><GraduationCap className="h-4 w-4" aria-hidden="true" />Student Hub</div><div className="mt-1 text-2xl font-black tracking-tight">Students start here</div><p className="mt-2 text-sm font-medium leading-6 text-[#142D50]">Enter your class code and PIN to join your class.</p><a href={`${window.location.origin}/#/student`} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#142D50] px-5 py-3 text-base font-black text-white focus-visible:ring-4 focus-visible:ring-[#142D50]/35"><span>Open Student Hub</span><ArrowRight className="h-5 w-5" aria-hidden="true" /></a></div>;
}

export default function LoginPage({ onLoggedIn }: Props) {
    const navigate = useNavigate();
    const { language, t } = useUiLanguage();
    const [schoolSlug] = useState(() => resolveSchoolBrandingSlug());
    const [brandingState, setBrandingState] = useState<BrandingState>(() => schoolSlug ? { kind: "loading" } : { kind: "none" });
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [invitationNotice] = useState<string | null>(() => {
        try {
            const message = sessionStorage.getItem(INVITATION_LOGIN_NOTICE_KEY);
            sessionStorage.removeItem(INVITATION_LOGIN_NOTICE_KEY);
            return message;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(false);
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState<string | null>(null);
    const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
    const [gaeilgeDiscoveryPinned, setGaeilgeDiscoveryPinned] = useState(false);
    const [gaeilgeDiscoveryHovered, setGaeilgeDiscoveryHovered] = useState(false);
    const [gaeilgeDiscoveryHoverDismissed, setGaeilgeDiscoveryHoverDismissed] = useState(false);
    const gaeilgeDiscoveryOpen = gaeilgeDiscoveryPinned || (gaeilgeDiscoveryHovered && !gaeilgeDiscoveryHoverDismissed);

    useEffect(() => {
        let cancelled = false;
        if (!schoolSlug) {
            setBrandingState({ kind: "none" });
            return;
        }
        setBrandingState({ kind: "loading" });
        void apiFetch(`/school-branding/${encodeURIComponent(schoolSlug)}`)
            .then((data) => {
                if (cancelled) return;
                const branding = data as SchoolBranding;
                setBrandingState(branding.status === "active" ? { kind: "ready", branding } : { kind: "unavailable", branding });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const message = String((err as { message?: string })?.message || "").toLowerCase();
                setBrandingState(message.includes("not found") ? { kind: "unknown" } : { kind: "error" });
            });
        return () => { cancelled = true; };
    }, [schoolSlug]);

    useEffect(() => {
        document.title = language === "ga" ? "Elume – An tArdán Múinteoireachta Uile-i-Aon" : "Elume – The All-in-One Teaching Platform";

        let meta = document.querySelector('meta[name="description"]');

        if (!meta) {
            meta = document.createElement("meta");
            meta.setAttribute("name", "description");
            document.head.appendChild(meta);
        }

        meta.setAttribute(
            "content",
            t("public.description")
        );
    }, [language, t]);

    useEffect(() => {
        function closeGaeilgeDiscovery(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setGaeilgeDiscoveryPinned(false);
                setGaeilgeDiscoveryHovered(false);
                setGaeilgeDiscoveryHoverDismissed(false);
            }
        }

        window.addEventListener("keydown", closeGaeilgeDiscovery);
        return () => window.removeEventListener("keydown", closeGaeilgeDiscovery);
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

            setForgotPasswordSuccess(t("login.resetSent"));
        } catch (err: any) {
            setForgotPasswordError(err?.message || t("login.resetFailure"));
        } finally {
            setForgotPasswordLoading(false);
        }
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (brandingState.kind === "unavailable" || brandingState.kind === "unknown") return;
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
            } catch {}

            try {
                const billing = await apiFetch("/billing/me");
                if (billing?.access_allowed !== true && (
                    billing?.billing_onboarding_required ||
                    billing?.subscription_expired ||
                    billing?.requires_billing_redirect
                )) {
                    onLoggedIn();
                    navigate("/onboarding/billing", { replace: true });
                    return;
                }
            } catch {}

            onLoggedIn();
            navigate("/", { replace: true });
        } catch (err: any) {
            setError(err?.message || "Login failed");
        } finally {
            setLoading(false);
        }
    }

    const brandingBlocksLogin = brandingState.kind === "unavailable" || brandingState.kind === "unknown";

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
                <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-violet-300/25 blur-3xl" />
                <div className="absolute bottom-[-80px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
                <div className="absolute bottom-10 right-[18%] h-72 w-72 rounded-full bg-lime-300/20 blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.75),transparent_45%)]" />
            </div>

            <div className="pointer-events-none absolute inset-0 opacity-[0.10] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:36px_36px]" />
            <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2 sm:right-6 sm:top-6">
                <LanguageSwitch />
                <div
                    className="relative"
                    onMouseEnter={() => {
                        setGaeilgeDiscoveryHovered(true);
                        setGaeilgeDiscoveryHoverDismissed(false);
                    }}
                    onMouseLeave={() => {
                        setGaeilgeDiscoveryHovered(false);
                        setGaeilgeDiscoveryHoverDismissed(false);
                    }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            if (gaeilgeDiscoveryPinned) {
                                setGaeilgeDiscoveryPinned(false);
                                setGaeilgeDiscoveryHoverDismissed(true);
                            } else {
                                setGaeilgeDiscoveryPinned(true);
                                setGaeilgeDiscoveryHoverDismissed(false);
                            }
                        }}
                        aria-label="Learn about Elume in Irish"
                        aria-expanded={gaeilgeDiscoveryOpen}
                        aria-controls="gaeilge-discovery-popover"
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-white/85 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-md shadow-emerald-900/10 backdrop-blur transition hover:-translate-y-px hover:border-teal-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
                    >
                        <Sparkles aria-hidden="true" size={14} className="text-violet-500" />
                        Bain triail as Gaeilge
                    </button>

                    {gaeilgeDiscoveryOpen ? (
                        <div
                            id="gaeilge-discovery-popover"
                            className="absolute right-0 top-full mt-3 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-200/80 bg-white/95 p-4 text-left shadow-2xl shadow-emerald-900/15 backdrop-blur sm:w-80"
                        >
                            <div className="absolute -top-1.5 right-7 h-3 w-3 rotate-45 border-l border-t border-emerald-200/80 bg-white/95" />
                            <div className="relative flex items-center gap-2">
                                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-sm">
                                    <Sparkles aria-hidden="true" size={16} />
                                </div>
                                <div>
                                    <div className="text-sm font-black text-slate-900">Elume as Gaeilge</div>
                                    <div className="text-xs font-semibold text-emerald-700">Béarla ↔ Gaeilge</div>
                                </div>
                            </div>
                            <div className="relative mt-3 space-y-3 text-sm leading-5 text-slate-700">
                                <p>
                                    <span className="font-bold text-emerald-800">Tá Elume ar fáil i nGaeilge.</span><br />
                                    Úsáid an lasc thuas chun aistriú idir Béarla agus Gaeilge.
                                </p>
                                <div className="h-px bg-gradient-to-r from-emerald-100 via-cyan-200 to-violet-100" />
                                <p>
                                    <span className="font-bold text-slate-900">Elume is available in Irish.</span><br />
                                    Use the switch above to move between English and Gaeilge.
                                </p>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
                <div className="w-full max-w-6xl">
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
                        {/* Left side */}
                        <div className="hidden lg:block">
                            <div className="max-w-2xl">
                                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm backdrop-blur">
                                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
                                    {t("public.aiTools")}
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

                                <h2 className="mt-8 text-5xl font-black leading-tight tracking-tight text-slate-900 xl:text-6xl">
                                    {t("public.makeTeaching")}
                                    <span className="block bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                                        {t("public.makeTeachingAccent")}
                                    </span>
                                </h2>

                                <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
                                    {t("public.description")}
                                </p>

                                <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            {t("public.saveTime")}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            {t("public.saveTimeDescription")}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            {t("public.engageClasses")}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            {t("public.engageClassesDescription")}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            {t("public.stayOrganised")}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            {t("public.stayOrganisedDescription")}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-md backdrop-blur">
                                        <div className="text-sm font-bold text-slate-900">
                                            {t("public.builtForSchools")}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            {t("public.builtForSchoolsDescription")}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                    <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                                        {t("public.trustedPilots")}
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                                        {t("public.teacherFirst")}
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                                        {t("public.builtInIreland")}
                                    </div>
                                </div>

                                {/* Social row under left block */}
                                <div className="mt-8 flex items-center gap-4">
                                    <div className="text-sm font-semibold text-slate-600">
                                        {t("public.seeInAction")}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <SocialIconLink
                                            href="https://www.tiktok.com/@elume_education?lang=en"
                                            label="TikTok"
                                            bgClass="bg-slate-50"
                                            ringClass="ring-slate-200"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <path
                                                        fill="#111827"
                                                        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.12v12.4a2.67 2.67 0 1 1-2.67-2.67c.23 0 .45.03.67.08V8.65a5.79 5.79 0 0 0-.67-.04A5.79 5.79 0 1 0 15.82 14V8.72a7.9 7.9 0 0 0 4.77 1.6V7.2c-.34 0-.67-.18-1-.51Z"
                                                    />
                                                    <path
                                                        fill="#EC4899"
                                                        d="M18.59 7.2V10.32a7.9 7.9 0 0 1-4.77-1.6V14A5.79 5.79 0 1 1 8.03 8.21c.22 0 .44.01.67.04v1.56a4.25 4.25 0 1 0 3.12 4.09V2h1.8a4.83 4.83 0 0 0 3.77 4.25Z"
                                                        opacity="0.85"
                                                    />
                                                    <path
                                                        fill="#22D3EE"
                                                        d="M15.42 2h.4a4.83 4.83 0 0 0 3.77 4.25v.95a4.93 4.93 0 0 1-4.17-2.17V2Zm-6.72 6.61c.23 0 .45.01.67.04v1.16a3.36 3.36 0 1 0 2.45 3.23V2h1.3v12a4.66 4.66 0 1 1-4.42-5.39Z"
                                                        opacity="0.9"
                                                    />
                                                </svg>
                                            }
                                        />

                                        <SocialIconLink
                                            href="https://www.instagram.com/elume_education/"
                                            label="Instagram"
                                            bgClass="bg-gradient-to-br from-[#FDF2F8] via-[#FEF3C7] to-[#DBEAFE]"
                                            ringClass="ring-pink-100"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <defs>
                                                        <linearGradient id="igGradientLogin" x1="0%" y1="100%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor="#F59E0B" />
                                                            <stop offset="45%" stopColor="#EC4899" />
                                                            <stop offset="100%" stopColor="#8B5CF6" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path
                                                        fill="url(#igGradientLogin)"
                                                        d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm8.95 1.35a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1ZM12 6.85A5.15 5.15 0 1 1 6.85 12 5.15 5.15 0 0 1 12 6.85Zm0 1.8A3.35 3.35 0 1 0 15.35 12 3.36 3.36 0 0 0 12 8.65Z"
                                                    />
                                                </svg>
                                            }
                                        />

                                        <SocialIconLink
                                            href="https://www.youtube.com/channel/UC1wiZlhQX0iYFbsqENzd2Ww"
                                            label="YouTube"
                                            bgClass="bg-red-50"
                                            ringClass="ring-red-100"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <path
                                                        fill="#EF4444"
                                                        d="M21.58 7.19a2.98 2.98 0 0 0-2.1-2.11C17.69 4.58 12 4.58 12 4.58s-5.69 0-7.48.5A2.98 2.98 0 0 0 2.42 7.2 31.13 31.13 0 0 0 2 12a31.13 31.13 0 0 0 .42 4.81 2.98 2.98 0 0 0 2.1 2.11c1.79.5 7.48.5 7.48.5s5.69 0 7.48-.5a2.98 2.98 0 0 0 2.1-2.11A31.13 31.13 0 0 0 22 12a31.13 31.13 0 0 0-.42-4.81Z"
                                                    />
                                                    <path fill="#fff" d="M10.2 15.01V8.99L15.4 12l-5.2 3.01Z" />
                                                </svg>
                                            }
                                        />

                                        <SocialIconLink
                                            href="https://www.facebook.com/profile.php?id=61572143122729&sk=about"
                                            label="Facebook"
                                            bgClass="bg-blue-50"
                                            ringClass="ring-blue-100"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <path
                                                        fill="#1877F2"
                                                        d="M13.5 22v-8.2h2.76l.41-3.2H13.5V8.56c0-.93.26-1.56 1.59-1.56h1.7V4.14c-.29-.04-1.29-.14-2.46-.14-2.43 0-4.09 1.48-4.09 4.21v2.39H7.5v3.2h2.74V22h3.26Z"
                                                    />
                                                </svg>
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right side */}
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

                                <StudentHubCard className="mt-4" />

                                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
                                    {t("public.mobileDescription")}
                                </div>

                                <div className="mt-4">
                                    <div className="text-sm font-semibold text-slate-600">
                                        {t("public.seeInAction")}
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                        <SocialIconLink
                                            href="https://www.tiktok.com/@elume_education?lang=en"
                                            label="TikTok"
                                            bgClass="bg-slate-50"
                                            ringClass="ring-slate-200"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <path
                                                        fill="#111827"
                                                        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.12v12.4a2.67 2.67 0 1 1-2.67-2.67c.23 0 .45.03.67.08V8.65a5.79 5.79 0 0 0-.67-.04A5.79 5.79 0 1 0 15.82 14V8.72a7.9 7.9 0 0 0 4.77 1.6V7.2c-.34 0-.67-.18-1-.51Z"
                                                    />
                                                    <path
                                                        fill="#EC4899"
                                                        d="M18.59 7.2V10.32a7.9 7.9 0 0 1-4.77-1.6V14A5.79 5.79 0 1 1 8.03 8.21c.22 0 .44.01.67.04v1.56a4.25 4.25 0 1 0 3.12 4.09V2h1.8a4.83 4.83 0 0 0 3.77 4.25Z"
                                                        opacity="0.85"
                                                    />
                                                    <path
                                                        fill="#22D3EE"
                                                        d="M15.42 2h.4a4.83 4.83 0 0 0 3.77 4.25v.95a4.93 4.93 0 0 1-4.17-2.17V2Zm-6.72 6.61c.23 0 .45.01.67.04v1.16a3.36 3.36 0 1 0 2.45 3.23V2h1.3v12a4.66 4.66 0 1 1-4.42-5.39Z"
                                                        opacity="0.9"
                                                    />
                                                </svg>
                                            }
                                        />

                                        <SocialIconLink
                                            href="https://www.instagram.com/elume_education/"
                                            label="Instagram"
                                            bgClass="bg-gradient-to-br from-[#FDF2F8] via-[#FEF3C7] to-[#DBEAFE]"
                                            ringClass="ring-pink-100"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <defs>
                                                        <linearGradient id="igGradientMobile" x1="0%" y1="100%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor="#F59E0B" />
                                                            <stop offset="45%" stopColor="#EC4899" />
                                                            <stop offset="100%" stopColor="#8B5CF6" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path
                                                        fill="url(#igGradientMobile)"
                                                        d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm8.95 1.35a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1ZM12 6.85A5.15 5.15 0 1 1 6.85 12 5.15 5.15 0 0 1 12 6.85Zm0 1.8A3.35 3.35 0 1 0 15.35 12 3.36 3.36 0 0 0 12 8.65Z"
                                                    />
                                                </svg>
                                            }
                                        />

                                        <SocialIconLink
                                            href="https://www.youtube.com/channel/UC1wiZlhQX0iYFbsqENzd2Ww"
                                            label="YouTube"
                                            bgClass="bg-red-50"
                                            ringClass="ring-red-100"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <path
                                                        fill="#EF4444"
                                                        d="M21.58 7.19a2.98 2.98 0 0 0-2.1-2.11C17.69 4.58 12 4.58 12 4.58s-5.69 0-7.48.5A2.98 2.98 0 0 0 2.42 7.2 31.13 31.13 0 0 0 2 12a31.13 31.13 0 0 0 .42 4.81 2.98 2.98 0 0 0 2.1 2.11c1.79.5 7.48.5 7.48.5s5.69 0 7.48-.5a2.98 2.98 0 0 0 2.1-2.11A31.13 31.13 0 0 0 22 12a31.13 31.13 0 0 0-.42-4.81Z"
                                                    />
                                                    <path fill="#fff" d="M10.2 15.01V8.99L15.4 12l-5.2 3.01Z" />
                                                </svg>
                                            }
                                        />

                                        <SocialIconLink
                                            href="https://www.facebook.com/profile.php?id=61572143122729&sk=about"
                                            label="Facebook"
                                            bgClass="bg-blue-50"
                                            ringClass="ring-blue-100"
                                            icon={
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                                    <path
                                                        fill="#1877F2"
                                                        d="M13.5 22v-8.2h2.76l.41-3.2H13.5V8.56c0-.93.26-1.56 1.59-1.56h1.7V4.14c-.29-.04-1.29-.14-2.46-.14-2.43 0-4.09 1.48-4.09 4.21v2.39H7.5v3.2h2.74V22h3.26Z"
                                                    />
                                                </svg>
                                            }
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
                                <div className="mb-5 flex items-center justify-between">
                                    <div>
                                        <div className="text-2xl font-black tracking-tight text-slate-900">
                                            {brandingState.kind === "ready" ? `${t("login.signIn")} ${brandingState.branding.name}` : t("login.welcomeBack")}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            {brandingState.kind === "ready" ? t("login.schoolGuidance") : t("login.defaultGuidance")}
                                        </div>
                                    </div>

                                    <div className="hidden rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:block">
                                        {t("login.teacherLogin")}
                                    </div>
                                </div>

                                {invitationNotice && (
                                    <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                        {invitationNotice}
                                    </div>
                                )}

                                {brandingState.kind === "loading" && <div className="mb-5 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">{t("login.schoolLoading")}</div>}
                                {brandingState.kind === "ready" && <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><SchoolBrand name={brandingState.branding.name} logoUrl={brandingState.branding.logo_url} poweredByElume /><p className="mt-2 text-sm font-medium text-slate-700">{t("login.schoolReady").replace("{{school}}", brandingState.branding.name)}</p></div>}
                                {brandingState.kind === "unavailable" && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><SchoolBrand name={brandingState.branding.name} logoUrl={brandingState.branding.logo_url} poweredByElume /><p className="mt-2 text-sm font-medium text-amber-900">{t("login.schoolUnavailable")}</p><a href={normalElumeLoginUrl()} className="mt-3 inline-flex rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100">{t("login.goToElume")}</a></div>}
                                {brandingState.kind === "unknown" && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{t("login.schoolUnknown")} <a href={normalElumeLoginUrl()} className="font-bold underline underline-offset-2">{t("login.goToElume")}</a></div>}
                                {brandingState.kind === "error" && <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">{t("login.schoolBrandingError")}</div>}

                                {!brandingBlocksLogin && <form className="space-y-4" onSubmit={submit}>
                                    <label className="block">
                                        <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                            {t("login.email")}
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
                                            {t("login.password")}
                                        </span>
                                        <input
                                            type="password"
                                            className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete="current-password"
                                            placeholder={t("login.passwordPlaceholder")}
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
                                            {t("login.forgotPassword")}
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
                                            {loading ? t("login.signingIn") : t("login.signIn")}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => navigate("/register")}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white/90 px-5 py-3.5 text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                    >
                                        {t("login.createAccount")}
                                    </button>
                                </form>}

                            </div>

                            <StudentHubCard className="mt-4 hidden lg:block" />

                            {showForgotPasswordModal && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
                                    <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                                    {t("login.recovery")}
                                                </div>
                                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                                    {t("login.resetPassword")}
                                                </h3>
                                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                                    {t("login.recoveryHelp")}
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setShowForgotPasswordModal(false)}
                                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                                            >
                                                {t("common.close")}
                                            </button>
                                        </div>

                                        <form className="mt-5 space-y-4" onSubmit={submitForgotPassword}>
                                            <label className="block">
                                                <span className="mb-1.5 block text-sm font-bold text-slate-800">
                                                    {t("login.email")}
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
                                                {forgotPasswordLoading ? t("common.loading") : t("login.sendReset")}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 text-center text-xs text-slate-500">
                                {t("login.footer")}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
