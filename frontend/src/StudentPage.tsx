import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, BrainCircuit, UsersRound } from "lucide-react";
import ELogo2 from "./assets/ELogo2.png";
import {
    readRememberedStudentClasses,
    rememberStudentClass,
    removeRememberedStudentClass,
    type RememberedStudentClass,
} from "./studentClasses";

type JoinMode = "quiz" | "collab" | "class";
const API_BASE = "/api";

type JoinRequest = {
    code: string;
    name: string;
    pin?: string;
};

type JoinResponse = {
    ok: boolean;
    redirect_url?: string;
    token_url?: string;
    message?: string;
    session_name?: string;
    teacher_label?: string;
    requires_pin?: boolean;
};

type RecentJoin = {
    mode: JoinMode;
    code: string;
    label: string;
    lastJoinedAt: number;
};

const STORAGE_NAME_KEY = "elume_student_name_v1";
const STORAGE_RECENTS_KEY = "elume_student_recents_v1";

const MODE_LABELS: Record<JoinMode, string> = {
    quiz: "Live Quiz",
    collab: "Collab Board",
    class: "Your Class",
};

const MODE_CONFIG: Record<JoinMode, {
    heading: string;
    codeLabel: string;
    placeholder: string;
    description: string;
    pinDescription?: string;
    icon: typeof BookOpen;
    surface: string;
    badge: string;
    button: string;
    focus: string;
}> = {
    class: {
        heading: "JOIN YOUR CLASS",
        codeLabel: "CLASS CODE",
        placeholder: "Enter class code",
        description: "Use the class code your teacher gave you.",
        pinDescription: "Enter the class PIN your teacher gave you.",
        icon: BookOpen,
        surface: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-emerald-100/70",
        badge: "from-emerald-600 via-teal-500 to-cyan-500",
        button: "from-emerald-600 via-teal-500 to-cyan-500",
        focus: "focus:border-emerald-500 focus:ring-emerald-100",
    },
    quiz: {
        heading: "JOIN A LIVE QUIZ",
        codeLabel: "QUIZ CODE",
        placeholder: "Enter quiz code",
        description: "Use the Live Quiz code shown by your teacher.",
        icon: BrainCircuit,
        surface: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50 shadow-amber-100/70",
        badge: "from-amber-500 via-yellow-400 to-orange-400",
        button: "from-amber-500 via-yellow-400 to-orange-400 text-slate-900",
        focus: "focus:border-amber-500 focus:ring-amber-100",
    },
    collab: {
        heading: "JOIN A COLLAB BOARD",
        codeLabel: "COLLAB CODE",
        placeholder: "Enter collab code",
        description: "Use the Collaboration code shown on the board.",
        icon: UsersRound,
        surface: "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 shadow-violet-100/70",
        badge: "from-violet-600 via-purple-500 to-fuchsia-500",
        button: "from-violet-600 via-purple-500 to-fuchsia-500",
        focus: "focus:border-violet-500 focus:ring-violet-100",
    },
};

function cleanCodeInput(value: string) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cleanPinInput(value: string) {
    return value.replace(/\D/g, "").slice(0, 6);
}

function readRecentJoins(): RecentJoin[] {
    try {
        const raw = localStorage.getItem(STORAGE_RECENTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as RecentJoin[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (item) =>
                    item &&
                    (item.mode === "quiz" || item.mode === "collab" || item.mode === "class") &&
                    typeof item.code === "string" &&
                    typeof item.label === "string" &&
                    typeof item.lastJoinedAt === "number"
            )
            .sort((a, b) => b.lastJoinedAt - a.lastJoinedAt)
            .slice(0, 6);
    } catch {
        return [];
    }
}

function saveRecentJoin(join: RecentJoin) {
    try {
        const existing = readRecentJoins();
        const filtered = existing.filter(
            (item) => !(item.mode === join.mode && item.code === join.code)
        );
        const next = [join, ...filtered].slice(0, 6);
        localStorage.setItem(STORAGE_RECENTS_KEY, JSON.stringify(next));
    } catch {
        // no-op
    }
}

async function publicPost<TResponse>(url: string, body: unknown): Promise<TResponse> {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: any = null;

    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }

    if (!res.ok) {
        const message =
            parsed?.message ||
            parsed?.detail ||
            "We could not join that session. Please check your code and try again.";
        throw new Error(message);
    }

    return parsed as TResponse;
}

function StudentJoinCard(props: {
    mode: JoinMode;
    open: boolean;
    onOpen: () => void;
    code: string;
    pin: string;
    onCodeChange: (value: string) => void;
    onPinChange: (value: string) => void;
    loading: boolean;
    error: string;
    onSubmit: () => void;
    autoFocused?: boolean;
}) {
    const {
        mode,
        open,
        onOpen,
        code,
        pin,
        onCodeChange,
        onPinChange,
        loading,
        error,
        onSubmit,
        autoFocused,
    } = props;

    const isClass = mode === "class";
    const config = MODE_CONFIG[mode];
    const Icon = config.icon;

    return (
        <div className={`rounded-[28px] border shadow-xl backdrop-blur-xl ${config.surface}`}>
            <button
                type="button"
                onClick={onOpen}
                className="w-full text-left"
            >
                <div className="p-6 sm:p-7">
                    <div className={`inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r ${config.badge} px-4 py-2 text-sm font-black tracking-wide text-white shadow-lg`}>
                        <Icon aria-hidden="true" size={18} strokeWidth={2.5} />
                        {config.codeLabel}
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-[28px]">
                                {config.heading}
                            </h2>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                                {config.description}
                            </p>
                        </div>

                        <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:block">
                            {MODE_LABELS[mode]}
                        </div>
                    </div>
                </div>
            </button>

            {open ? (
                <div className="border-t border-slate-100 px-6 pb-6 pt-5 sm:px-7 sm:pb-7">
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor={`${mode}-code`}
                                className="mb-2 block text-sm font-semibold text-slate-700"
                            >
                                {config.codeLabel}
                            </label>
                            <input
                                id={`${mode}-code`}
                                autoFocus={autoFocused}
                                value={code}
                                onChange={(e) => onCodeChange(cleanCodeInput(e.target.value))}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") onSubmit();
                                }}
                                inputMode="text"
                                autoCapitalize="characters"
                                spellCheck={false}
                                placeholder={config.placeholder}
                                className={`w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-lg font-semibold uppercase tracking-[0.12em] text-slate-900 outline-none transition focus:ring-4 ${config.focus}`}
                                maxLength={8}
                            />
                        </div>

                        {isClass ? (
                            <div>
                                <label
                                    htmlFor={`${mode}-pin`}
                                    className="mb-2 block text-sm font-semibold text-slate-700"
                                >
                                    CLASS PIN
                                </label>
                                <input
                                    id={`${mode}-pin`}
                                    value={pin}
                                    onChange={(e) => onPinChange(cleanPinInput(e.target.value))}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onSubmit();
                                    }}
                                    inputMode="numeric"
                                    placeholder="Enter class PIN"
                                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-lg font-semibold tracking-[0.18em] text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                    maxLength={6}
                                />
                                <p className="mt-2 text-xs leading-5 text-slate-500">
                                    {config.pinDescription}
                                </p>
                            </div>
                        ) : null}

                        {error ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                                {error}
                            </div>
                        ) : null}

                        <button
                            type="button"
                            onClick={onSubmit}
                            disabled={loading}
                            className={`inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r ${config.button} px-5 py-4 text-base font-black shadow-lg transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                            {loading ? "Joining..." : `Join ${MODE_LABELS[mode]}`}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function destinationForMode(mode: JoinMode, code: string) {
    const clean = cleanCodeInput(code);
    if (mode === "quiz") return `${window.location.origin}/#/join/${clean}`;
    if (mode === "collab") return `${window.location.origin}/#/collab/join/${clean}`;
    return null;
}

export default function StudentPage() {
    const [studentName, setStudentName] = useState("");
    const [editingName, setEditingName] = useState(false);

    const [openMode, setOpenMode] = useState<JoinMode>("class");

    const [quizCode, setQuizCode] = useState("");
    const [collabCode, setCollabCode] = useState("");
    const [classCode, setClassCode] = useState("");
    const [classPin, setClassPin] = useState("");

    const [quizError, setQuizError] = useState("");
    const [collabError, setCollabError] = useState("");
    const [classError, setClassError] = useState("");

    const [quizLoading, setQuizLoading] = useState(false);
    const [collabLoading, setCollabLoading] = useState(false);
    const [classLoading, setClassLoading] = useState(false);

    const [recentJoins, setRecentJoins] = useState<RecentJoin[]>([]);
    const [rememberedClasses, setRememberedClasses] = useState<RememberedStudentClass[]>([]);

    useEffect(() => {
        const savedName = localStorage.getItem(STORAGE_NAME_KEY) || "";
        if (savedName) {
            setStudentName(savedName);
        } else {
            setEditingName(true);
        }

        setRecentJoins(readRecentJoins());
        setRememberedClasses(readRememberedStudentClasses());

        const params = new URLSearchParams(window.location.search);
        const modeParam = params.get("mode");
        const codeParam = params.get("code");

        const validMode =
            modeParam === "quiz" || modeParam === "collab" || modeParam === "class"
                ? modeParam
                : null;

        if (validMode) {
            setOpenMode(validMode);
        }

        if (codeParam && validMode) {
            const cleaned = cleanCodeInput(codeParam);
            if (validMode === "quiz") setQuizCode(cleaned);
            if (validMode === "collab") setCollabCode(cleaned);
            if (validMode === "class") setClassCode(cleaned);
        }

        if (params.get("notice") === "access-refreshed") {
            setOpenMode("class");
            setClassError("Your class access has been refreshed. Enter the class PIN again to continue.");
        }
    }, []);

    const nameReady = useMemo(() => studentName.trim().length >= 2, [studentName]);

    function persistStudentName() {
        const trimmed = studentName.trim();
        if (trimmed.length < 2) return;
        localStorage.setItem(STORAGE_NAME_KEY, trimmed);
        setEditingName(false);
    }

    function updateStudentName(value: string) {
        setStudentName(value);
        if (value.trim().length >= 2) {
            localStorage.setItem(STORAGE_NAME_KEY, value.trim());
        }
    }

    function clearErrors() {
        setQuizError("");
        setCollabError("");
        setClassError("");
    }

    function buildRecentLabel(mode: JoinMode, code: string, response?: JoinResponse) {
        if (response?.session_name?.trim()) return response.session_name.trim();
        return `${MODE_LABELS[mode]} • ${code}`;
    }

    function redirectFromJoinResponse(data: JoinResponse) {
        const target = data.redirect_url || data.token_url;
        if (target) {
            if (/^https?:\/\//i.test(target)) {
                window.location.href = target;
                return;
            }
            const hashPath = target.startsWith("/") ? target : `/${target}`;
            window.location.href = `${window.location.origin}/#${hashPath}`;
            return;
        }
        throw new Error("Joined successfully, but no destination was returned.");
    }

    function accessTokenFromJoinResponse(data: JoinResponse) {
        const target = data.redirect_url || data.token_url;
        if (!target || /^https?:\/\//i.test(target)) return "";
        const pathname = target.startsWith("/") ? target : `/${target}`;
        const match = pathname.match(/^\/student\/([A-Za-z0-9_-]{16,128})$/);
        return match?.[1] || "";
    }

    async function submitJoin(mode: JoinMode, overrideCode?: string) {
        clearErrors();

        if (!nameReady) {
            const message = "Please enter your name first.";
            if (mode === "quiz") setQuizError(message);
            if (mode === "collab") setCollabError(message);
            if (mode === "class") setClassError(message);
            setEditingName(true);
            return;
        }

        const code =
            overrideCode ??
            (mode === "quiz" ? quizCode : mode === "collab" ? collabCode : classCode);

        const pin = mode === "class" ? classPin : "";

        if (!code.trim()) {
            const message = `Please enter a ${MODE_LABELS[mode].toLowerCase()} code.`;
            if (mode === "quiz") setQuizError(message);
            if (mode === "collab") setCollabError(message);
            if (mode === "class") setClassError(message);
            return;
        }

        if (mode === "class" && !pin.trim()) {
            setClassError("Please enter your class PIN.");
            return;
        }

        const setLoading =
            mode === "quiz"
                ? setQuizLoading
                : mode === "collab"
                    ? setCollabLoading
                    : setClassLoading;

        const setError =
            mode === "quiz"
                ? setQuizError
                : mode === "collab"
                    ? setCollabError
                    : setClassError;

        try {
            setLoading(true);

            if (mode !== "class") {
                const target = destinationForMode(mode, code.trim());
                if (!target) {
                    throw new Error("That code could not be joined.");
                }

                const recentJoin: RecentJoin = {
                    mode,
                    code: code.trim(),
                    label: `${MODE_LABELS[mode]} • ${code.trim()}`,
                    lastJoinedAt: Date.now(),
                };
                saveRecentJoin(recentJoin);
                setRecentJoins(readRecentJoins());
                window.location.href = target;
                return;
            }

            const body: JoinRequest = {
                code: code.trim(),
                name: studentName.trim(),
                pin: pin.trim(),
            };

            const data = await publicPost<JoinResponse>(`${API_BASE}/student/join/class`, body);

            if (!data?.ok) {
                setError(data?.message || "That code could not be joined.");
                return;
            }

            const label = buildRecentLabel(mode, code.trim(), data);
            const recentJoin: RecentJoin = {
                mode,
                code: code.trim(),
                label,
                lastJoinedAt: Date.now(),
            };

            saveRecentJoin(recentJoin);
            setRecentJoins(readRecentJoins());
            const accessToken = accessTokenFromJoinResponse(data);
            rememberStudentClass({ classCode: code.trim(), accessToken: accessToken || undefined });
            setRememberedClasses(readRememberedStudentClasses());

            redirectFromJoinResponse(data);
        } catch (err: any) {
            setError(
                err?.message ||
                "We could not join that session. Please check your details and try again."
            );
        } finally {
            setLoading(false);
        }
    }

    async function rejoinRecent(item: RecentJoin) {
        clearErrors();
        setOpenMode(item.mode);

        if (item.mode === "quiz") {
            setQuizCode(item.code);
            await submitJoin("quiz", item.code);
            return;
        }

        if (item.mode === "collab") {
            setCollabCode(item.code);
            await submitJoin("collab", item.code);
            return;
        }

        const remembered = readRememberedStudentClasses().find((entry) => entry.classCode === item.code);
        if (remembered?.accessToken) {
            window.location.href = `${window.location.origin}/#/student/${remembered.accessToken}`;
            return;
        }

        setClassCode(item.code);
        setClassError("Please enter your class PIN to continue.");
    }

    function openRememberedClass(item: RememberedStudentClass) {
        clearErrors();
        if (item.accessToken) {
            window.location.href = `${window.location.origin}/#/student/${item.accessToken}`;
            return;
        }
        setClassCode(item.classCode);
        setClassPin("");
        setOpenMode("class");
        setClassError("Enter your class PIN to continue.");
    }

    function removeRememberedClass(item: RememberedStudentClass) {
        removeRememberedStudentClass(item.classCode);
        setRememberedClasses(readRememberedStudentClasses());
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(250,204,21,0.18),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(20,184,166,0.14),_transparent_30%),linear-gradient(180deg,_#fcfbff_0%,_#f7f5ff_42%,_#f4f8fc_100%)] text-slate-900">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
                <div className="overflow-hidden rounded-[32px] border border-white/60 bg-white/70 shadow-2xl shadow-slate-200/80 backdrop-blur-xl">
                    <div className="border-b border-white/70 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-400 px-6 py-6 text-white sm:px-8 sm:py-7 lg:px-10">
                        <div className="max-w-4xl">
                            <div className="flex items-center gap-6 sm:gap-8">
                                <img
                                    src={ELogo2}
                                    alt="Elume"
                                    className="h-[115px] w-[115px] shrink-0 object-contain drop-shadow-[0_14px_22px_rgba(15,23,42,0.22)] sm:h-[134px] sm:w-[134px]"
                                />

                                <div className="flex min-w-0 flex-col justify-center">
                                    <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                                        Student Hub
                                    </h1>

                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/90 sm:text-base">
                                        Choose what you are joining. Each activity has its own colour, icon and code label.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-10">
                        <div className="space-y-5">
                            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Join something</div>
                            <StudentJoinCard
                                mode="class"
                                open={openMode === "class"}
                                onOpen={() => {
                                    clearErrors();
                                    setOpenMode("class");
                                }}
                                code={classCode}
                                pin={classPin}
                                onCodeChange={setClassCode}
                                onPinChange={setClassPin}
                                loading={classLoading}
                                error={classError}
                                onSubmit={() => submitJoin("class")}
                                autoFocused={openMode === "class"}
                            />

                            <StudentJoinCard
                                mode="quiz"
                                open={openMode === "quiz"}
                                onOpen={() => {
                                    clearErrors();
                                    setOpenMode("quiz");
                                }}
                                code={quizCode}
                                pin=""
                                onCodeChange={setQuizCode}
                                onPinChange={() => undefined}
                                loading={quizLoading}
                                error={quizError}
                                onSubmit={() => submitJoin("quiz")}
                                autoFocused={openMode === "quiz"}
                            />

                            <StudentJoinCard
                                mode="collab"
                                open={openMode === "collab"}
                                onOpen={() => {
                                    clearErrors();
                                    setOpenMode("collab");
                                }}
                                code={collabCode}
                                pin=""
                                onCodeChange={setCollabCode}
                                onPinChange={() => undefined}
                                loading={collabLoading}
                                error={collabError}
                                onSubmit={() => submitJoin("collab")}
                                autoFocused={openMode === "collab"}
                            />

                            <section className="mt-8 border-t border-slate-200 pt-8">
                                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Study</div>
                                <div className="mt-3 rounded-[28px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-6 shadow-xl shadow-blue-100/50">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 px-4 py-2 text-sm font-black tracking-wide text-white shadow-lg">
                                                <BookOpen aria-hidden="true" size={18} strokeWidth={2.5} />
                                                STUDY RESOURCE
                                            </div>
                                            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900 sm:text-[28px]">EXAM PAPERS</h2>
                                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                                                Browse past Junior Cycle and Leaving Certificate exam papers.
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-xl border border-blue-200 bg-blue-100 px-3 py-2 text-xs font-black tracking-[0.12em] text-blue-800">
                                            NO CODE NEEDED
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            window.location.href = `${window.location.origin}/#/student/exam-papers`;
                                        }}
                                        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.01]"
                                    >
                                        Browse Exam Papers
                                        <ArrowUpRight aria-hidden="true" size={17} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </section>
                        </div>

                        <div className="space-y-5">
                            {rememberedClasses.length > 0 ? (
                                <section className="rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 shadow-xl shadow-emerald-100/40 backdrop-blur-xl">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h2 className="text-xl font-bold tracking-tight text-slate-900">My Classes</h2>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">Classes are remembered on this device. No student account required.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                clearErrors();
                                                setOpenMode("class");
                                            }}
                                            className="shrink-0 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:shadow-md"
                                        >
                                            Join another class
                                        </button>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {rememberedClasses.map((item) => (
                                            <div key={item.classCode} className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => openRememberedClass(item)}
                                                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition hover:bg-emerald-50"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate text-base font-black text-slate-900">{item.className || "Class"}</div>
                                                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                                                            {item.subject ? `${item.subject} · ` : ""}Code {item.classCode}
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Open</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeRememberedClass(item)}
                                                    className="mt-2 px-2 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                                                >
                                                    Remove from this device
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold tracking-tight text-slate-900">
                                            Your name
                                        </h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                            We’ll remember your name on this device so you do not have
                                            to keep entering it each time.
                                        </p>
                                    </div>

                                    {!editingName && nameReady ? (
                                        <button
                                            type="button"
                                            onClick={() => setEditingName(true)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                        >
                                            Change
                                        </button>
                                    ) : null}
                                </div>

                                {editingName || !nameReady ? (
                                    <div className="mt-5">
                                        <label
                                            htmlFor="student-name"
                                            className="mb-2 block text-sm font-semibold text-slate-700"
                                        >
                                            Student name
                                        </label>
                                        <input
                                            id="student-name"
                                            value={studentName}
                                            onChange={(e) => updateStudentName(e.target.value)}
                                            onBlur={persistStudentName}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    persistStudentName();
                                                }
                                            }}
                                            placeholder="Enter your name"
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                            maxLength={40}
                                        />
                                        <div className="mt-3 flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={persistStudentName}
                                                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                                            >
                                                Save name
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                                        <div className="text-sm font-medium text-emerald-800">
                                            Signed in on this device as
                                        </div>
                                        <div className="mt-1 text-xl font-bold text-emerald-900">
                                            {studentName}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
                                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                                    Quick help
                                </h2>
                                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                                    <p>
                                        <span className="font-semibold text-slate-800">Live Quiz:</span>{" "}
                                        enter the code from your teacher and join straight away.
                                    </p>
                                    <p>
                                        <span className="font-semibold text-slate-800">
                                            Collaboration Board:
                                        </span>{" "}
                                        use the board code shown in class.
                                    </p>
                                    <p>
                                        <span className="font-semibold text-slate-800">Class:</span>{" "}
                                        enter your class code and your teacher’s class PIN.
                                    </p>
                                    <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-cyan-800">
                                        You can still join by scanning your teacher’s QR code at any time.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
                                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                                    Recent joins
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Rejoin something you used recently on this device.
                                </p>

                                <div className="mt-4 space-y-3">
                                    {recentJoins.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                                            No recent joins yet.
                                        </div>
                                    ) : (
                                        recentJoins.map((item) => (
                                            <button
                                                key={`${item.mode}-${item.code}`}
                                                type="button"
                                                onClick={() => rejoinRecent(item)}
                                                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">
                                                        {item.label}
                                                    </div>
                                                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                                        {MODE_LABELS[item.mode]} • {item.code}
                                                    </div>
                                                </div>
                                                <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                                    Rejoin
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 bg-white/80 px-6 py-5 text-center text-xs font-medium text-slate-500 sm:px-8 lg:px-10">
                        Built for fast classroom access with simple codes, QR support, and low-friction rejoining.
                    </div>
                </div>
            </div>
        </div>
    );
}
