import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

/**
 * TeacherPlanner.tsx
 *
 * - Mon–Fri weekly planner (6 class slots + 1 extra slot per day)
 * - Click slot => modal editor (full note + relates-to dropdown)
 * - Shows calendar events on each day via a bell + popover
 * - Tasks checklist sticky bottom-right (due date optional) with archive/revive/delete
 *
 * Persistence:
 * - Notes + tasks loaded from and saved to backend
 * - Classes + calendar events fetched from backend
 *
 * Backend references:
 * - GET /classes
 * - GET /calendar-events
 * - GET /teacher-planner
 * - PUT /teacher-planner
 */

// -----------------------------
// Types
// -----------------------------

type ClassItem = { id: number; name: string; subject: string };

type CalendarEvent = {
    id: number;
    class_id: number | null;
    title: string;
    description?: string | null;
    event_date: string;
    end_date?: string | null;
    all_day?: boolean;
    event_type: string;
};

type RelatesTo =
    | { kind: "general" }
    | { kind: "personal" }
    | { kind: "class"; classId: number; label: string };

type PlannerNote = {
    id: string;
    weekKey: string;
    dayIndex: number;
    slotIndex: number;
    title: string;
    body: string;
    relatesTo: RelatesTo;
    updatedAt: number;
};

type TaskItem = {
    id: string;
    text: string;
    dueDateISO?: string;
    createdAt: number;
    done: boolean;
    archived: boolean;
    archivedAt?: number;
};

// -----------------------------
// Helpers
// -----------------------------

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeekMonday(d: Date) {
    const x = new Date(d);
    const day = x.getDay();
    const diff = (day + 6) % 7;
    x.setDate(x.getDate() - diff);
    x.setHours(0, 0, 0, 0);
    return x;
}

function addDays(d: Date, n: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function addWeeks(d: Date, n: number) {
    return addDays(d, n * 7);
}

function fmtWeekRange(monday: Date) {
    const fri = addDays(monday, 4);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    const a = monday.toLocaleDateString("en-IE", opts);
    const b = fri.toLocaleDateString("en-IE", opts);
    return `${a} – ${b}`;
}

function fmtTime12h(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d
        .toLocaleTimeString("en-IE", { hour: "numeric", minute: "2-digit", hour12: true })
        .replace(" a.m.", " am")
        .replace(" p.m.", " pm");
}

function safeId() {
    return globalThis.crypto?.randomUUID?.() || `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function truncateOneLine(s: string, max = 26) {
    const t = (s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
}

function typeDotClass(t: string) {
    switch ((t || "").toLowerCase()) {
        case "test":
            return "bg-red-500";
        case "homework":
            return "bg-yellow-400";
        case "trip":
            return "bg-blue-500";
        default:
            return "bg-emerald-500";
    }
}

function eventTypeLabel(t: string) {
    switch ((t || "").toLowerCase()) {
        case "test":
            return "Test";
        case "homework":
            return "Homework";
        case "trip":
            return "Trip";
        default:
            return "General";
    }
}

// -----------------------------
// Planner API helpers
// -----------------------------

async function loadPlanner(): Promise<{ notes: PlannerNote[]; tasks: TaskItem[] }> {
    const data = await apiFetch("/teacher-planner");

    const notes = Array.isArray(data?.notes)
        ? data.notes.map((n: any) => ({
            id: String(n.id),
            weekKey: String(n.weekKey ?? ""),
            dayIndex: Number(n.dayIndex ?? 0),
            slotIndex: Number(n.slotIndex ?? 0),
            title: String(n.title ?? ""),
            body: String(n.body ?? n.text ?? ""),
            relatesTo: n.relatesTo ?? { kind: "general" },
            updatedAt: Number(n.updatedAt ?? Date.now()),
        }))
        : [];

    const tasks = Array.isArray(data?.tasks)
        ? data.tasks.map((t: any) => ({
            id: String(t.id),
            text: String(t.text ?? ""),
            dueDateISO: t.dueDateISO ? String(t.dueDateISO) : undefined,
            createdAt: Number(t.createdAt ?? Date.now()),
            done: Boolean(t.done ?? false),
            archived: Boolean(t.archived ?? false),
            archivedAt: t.archivedAt ? Number(t.archivedAt) : undefined,
        }))
        : [];

    return { notes, tasks };
}

async function savePlanner(notes: PlannerNote[], tasks: TaskItem[]) {
    await apiFetch("/teacher-planner", {
        method: "PUT",
        body: JSON.stringify({ notes, tasks }),
    });
}

// -----------------------------
// Component
// -----------------------------

export default function TeacherPlanner() {
    const navigate = useNavigate();

    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    const [notes, setNotes] = useState<PlannerNote[]>([]);
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [plannerLoadState, setPlannerLoadState] = useState<"idle" | "success" | "error">("idle");
    const plannerHydratedRef = useRef(false);

    const [weekMonday, setWeekMonday] = useState<Date>(() => startOfWeekMonday(new Date()));

    const [editing, setEditing] = useState<{
        open: boolean;
        weekKey: string;
        dayIndex: number;
        slotIndex: number;
        noteId?: string;
    }>({ open: false, weekKey: "", dayIndex: 0, slotIndex: 0 });

    const [draftTitle, setDraftTitle] = useState("");
    const [draftBody, setDraftBody] = useState("");
    const [draftRelatesKind, setDraftRelatesKind] = useState<"general" | "personal" | "class">("general");
    const [draftRelatesClassId, setDraftRelatesClassId] = useState<number>(() => 0);

    const [eventsPopover, setEventsPopover] = useState<{ open: boolean; dayISO: string | null }>({
        open: false,
        dayISO: null,
    });

    const popoverRef = useRef<HTMLDivElement | null>(null);

    // -----------------------------
    // Load classes
    // -----------------------------
    useEffect(() => {
        apiFetch("/classes")
            .then((data) => setClasses(Array.isArray(data) ? data : []))
            .catch(() => setClasses([]));
    }, []);

    useEffect(() => {
        let alive = true;
        setLoadingEvents(true);

        apiFetch("/calendar-events")
            .then((data) => {
                if (!alive) return;
                setEvents(Array.isArray(data) ? data : []);
            })
            .catch((err) => {
                if (!alive) return;
                console.error("Failed to load calendar events", err);
                setEvents([]);
            })
            .finally(() => {
                if (alive) setLoadingEvents(false);
            });

        return () => {
            alive = false;
        };
    }, []);

    // -----------------------------
    // Load planner data
    // -----------------------------
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const data = await loadPlanner();
                if (!alive) return;

                plannerHydratedRef.current = false;
                setNotes(Array.isArray(data.notes) ? data.notes : []);
                setTasks(Array.isArray(data.tasks) ? data.tasks : []);
                setPlannerLoadState("success");

                setTimeout(() => {
                    if (alive) plannerHydratedRef.current = true;
                }, 0);
            } catch (err) {
                if (!alive) return;
                console.error("Failed to load planner data", err);
                setPlannerLoadState("error");
            }
        })();

        return () => {
            alive = false;
            plannerHydratedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (plannerLoadState !== "success") return;
        if (!plannerHydratedRef.current) return;

        const timer = window.setTimeout(() => {
            savePlanner(notes, tasks).catch((err) => {
                console.error("Failed to save planner", err);
            });
        }, 300);

        return () => window.clearTimeout(timer);
    }, [notes, tasks, plannerLoadState]);

    // -----------------------------
    // Derived
    // -----------------------------
    const weekKey = useMemo(() => toYMD(weekMonday), [weekMonday]);
    const prevWeekMonday = useMemo(() => addWeeks(weekMonday, -1), [weekMonday]);
    const nextWeekMonday = useMemo(() => addWeeks(weekMonday, 1), [weekMonday]);
    const todayISO = useMemo(() => toYMD(new Date()), []);

    const weekDays = useMemo(() => Array.from({ length: 5 }).map((_, i) => addDays(weekMonday, i)), [weekMonday]);

    const notesByCell = useMemo(() => {
        const map = new Map<string, PlannerNote>();
        for (const n of notes) {
            if (n.weekKey !== weekKey) continue;
            map.set(`${n.dayIndex}:${n.slotIndex}`, n);
        }
        return map;
    }, [notes, weekKey]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();

        const rangeStart = prevWeekMonday;
        const rangeEnd = addDays(nextWeekMonday, 7);

        const startMs = rangeStart.getTime();
        const endMs = rangeEnd.getTime();

        for (const ev of events) {
            const d = new Date(ev.event_date);
            if (Number.isNaN(d.getTime())) continue;
            const ms = d.getTime();
            if (ms < startMs || ms >= endMs) continue;

            const iso = toYMD(d);
            if (!map.has(iso)) map.set(iso, []);
            map.get(iso)!.push(ev);
        }

        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "") || b.id - a.id);
            map.set(k, arr);
        }

        return map;
    }, [events, prevWeekMonday, nextWeekMonday]);

    const relatesOptions = useMemo(() => {
        return classes.map((c) => ({
            value: String(c.id),
            label: `${c.name}`,
        }));
    }, [classes]);

    const activeTasks = useMemo(() => {
        const arr = tasks.filter((t) => !t.archived);
        arr.sort((a, b) => {
            const ad = a.dueDateISO || "9999-12-31";
            const bd = b.dueDateISO || "9999-12-31";
            if (ad !== bd) return ad.localeCompare(bd);
            return b.createdAt - a.createdAt;
        });
        return arr;
    }, [tasks]);

    const archivedTasks = useMemo(() => {
        const arr = tasks.filter((t) => t.archived);
        arr.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
        return arr;
    }, [tasks]);

    const [showArchived, setShowArchived] = useState(false);

    // -----------------------------
    // Actions
    // -----------------------------
    function openSlot(dayIndex: number, slotIndex: number) {
        const existing = notesByCell.get(`${dayIndex}:${slotIndex}`);
        setEditing({
            open: true,
            weekKey,
            dayIndex,
            slotIndex,
            noteId: existing?.id,
        });

        setDraftTitle(existing?.title || "");
        setDraftBody(existing?.body || "");

        if (!existing) {
            setDraftRelatesKind("general");
            setDraftRelatesClassId(relatesOptions.length ? Number(relatesOptions[0].value) : 0);
            return;
        }

        const r = existing.relatesTo;
        if (r.kind === "personal") {
            setDraftRelatesKind("personal");
            setDraftRelatesClassId(relatesOptions.length ? Number(relatesOptions[0].value) : 0);
        } else if (r.kind === "class") {
            setDraftRelatesKind("class");
            setDraftRelatesClassId(r.classId);
        } else {
            setDraftRelatesKind("general");
            setDraftRelatesClassId(relatesOptions.length ? Number(relatesOptions[0].value) : 0);
        }
    }

    function closeEditor() {
        setEditing((s) => ({ ...s, open: false }));
    }

    function saveEditor() {
        const title = (draftTitle || "").trim();
        const body = (draftBody || "").trim();
        const shouldDelete = !title && !body;

        const key = `${editing.dayIndex}:${editing.slotIndex}`;
        const existing = notesByCell.get(key);

        if (shouldDelete) {
            if (existing) {
                setNotes((prev) => prev.filter((n) => n.id !== existing.id));
            }
            closeEditor();
            return;
        }

        let relatesTo: RelatesTo = { kind: "general" };
        if (draftRelatesKind === "personal") relatesTo = { kind: "personal" };
        if (draftRelatesKind === "class") {
            const cls = classes.find((c) => c.id === Number(draftRelatesClassId));
            relatesTo = {
                kind: "class",
                classId: Number(draftRelatesClassId),
                label: cls ? cls.name : "Class",
            };
        }

        const updated: PlannerNote = {
            id: existing?.id || safeId(),
            weekKey,
            dayIndex: editing.dayIndex,
            slotIndex: editing.slotIndex,
            title: title || truncateOneLine(body, 32) || "Note",
            body,
            relatesTo,
            updatedAt: Date.now(),
        };

        setNotes((prev) => {
            const filtered = prev.filter((n) => n.id !== updated.id);
            return [...filtered, updated];
        });

        closeEditor();
    }

    const [taskDraft, setTaskDraft] = useState("");
    const [taskDueDraft, setTaskDueDraft] = useState("");

    function addTask() {
        const t = (taskDraft || "").trim();
        if (!t) return;

        const item: TaskItem = {
            id: safeId(),
            text: t,
            dueDateISO: taskDueDraft ? taskDueDraft : undefined,
            createdAt: Date.now(),
            done: false,
            archived: false,
        };

        setTasks((prev) => [item, ...prev]);
        setTaskDraft("");
        setTaskDueDraft("");
    }

    function toggleTaskDone(id: string) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    }

    function archiveTask(id: string) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: true, archivedAt: Date.now() } : t)));
    }

    function reviveTask(id: string) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: false } : t)));
    }

    function deleteTask(id: string) {
        const ok = window.confirm("Delete this task? This cannot be undone.");
        if (!ok) return;
        setTasks((prev) => prev.filter((t) => t.id !== id));
    }

    // -----------------------------
    // UI Pieces
    // -----------------------------
    function WeekPreviewCard({
        monday,
        onClick,
    }: {
        monday: Date;
        onClick: () => void;
    }) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="w-full rounded-[28px] border border-white/70 bg-white/70 p-4 text-left shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_45px_rgba(15,23,42,0.12)]"
            >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Week</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{fmtWeekRange(monday)}</div>
                <div className="mt-2 text-sm font-medium text-slate-500">{toYMD(monday)}</div>
            </button>
        );
    }

    function DayHeader({ d, isToday }: { d: Date; isToday?: boolean }) {
        const iso = toYMD(d);
        const evs = eventsByDay.get(iso) || [];
        const hasEvents = evs.length > 0;

        return (
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="text-xl font-black tracking-tight text-slate-900">
                            {d.toLocaleDateString("en-IE", { weekday: "long" })}
                        </div>
                        {isToday ? (
                            <span className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                                Today
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-500">
                        {d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {loadingEvents ? (
                        <div className="text-[11px] text-slate-400">…</div>
                    ) : (
                        <button
                            type="button"
                            title={hasEvents ? "View events" : "No events"}
                            onClick={() => {
                                if (!hasEvents) return;
                                setEventsPopover({ open: true, dayISO: iso });
                            }}
                            className={[
                                "h-6 w-6 mt-8 grid place-items-center rounded-full border shadow-sm",
                                hasEvents
                                    ? "border-emerald-400 bg-white hover:bg-emerald-50"
                                    : "border-slate-200 bg-slate-50",
                            ].join(" ")}
                        >
                            <span className="text-[12px] leading-none">🔔</span>
                        </button>

                    )}
                </div>
            </div>
        );
    }

    function relatesPill(r: RelatesTo) {
        if (r.kind === "personal") {
            return (
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700">
                    Personal
                </span>
            );
        }
        if (r.kind === "class") {
            return (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    {r.label}
                </span>
            );
        }
        return (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                General
            </span>
        );
    }

    // -----------------------------
    // Render
    // -----------------------------
    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
                <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-violet-300/15 blur-3xl" />
                <div className="absolute bottom-[-80px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />
                <div className="absolute bottom-10 right-[18%] h-72 w-72 rounded-full bg-lime-300/15 blur-3xl" />
            </div>

            <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:36px_36px]" />

            <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-8">
                {/* Header */}
                <div className="mb-4 rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-xl">

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 shadow-sm">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                Weekly planning workspace
                            </div>

                            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                                Teacher Planner
                            </h1>

                            <p className="mt-1 text-sm text-slate-600">
                                Weekly diary + tasks for your teaching week. Keep lesson notes, reminders and upcoming
                                events in one clean workspace.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => navigate(`/`)}
                                className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                                type="button"
                            >
                                ← Back to Dashboard
                            </button>

                            <button
                                onClick={() => setWeekMonday(startOfWeekMonday(new Date()))}
                                className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                                type="button"
                            >
                                This week
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main layout */}
                <div className="grid gap-5 lg:grid-cols-[0.72fr_3.2fr_0.72fr]">
                    {/* Left preview */}
                    <div className="hidden lg:block">
                        <WeekPreviewCard monday={prevWeekMonday} onClick={() => setWeekMonday(prevWeekMonday)} />
                    </div>

                    {/* Main planner */}
                    <div className="rounded-[34px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                        <div className="mt-2 grid gap-3 md:grid-cols-5">
                            {weekDays.map((d, dayIndex) => {
                                const isToday = toYMD(d) === todayISO;

                                return (
                                    <div
                                        key={toYMD(d)}
                                        className={[
                                            "rounded-[28px] border p-3 shadow-sm backdrop-blur transition-all duration-200",
                                            isToday
                                                ? "border-emerald-200 bg-gradient-to-b from-white to-emerald-50/80 shadow-[0_18px_45px_rgba(16,185,129,0.14)] ring-2 ring-emerald-200"
                                                : "border-white/70 bg-white/70 hover:bg-white",
                                        ].join(" ")}
                                    >
                                        <DayHeader d={d} isToday={isToday} />

                                        <div className="mt-4 grid gap-2.5">
                                            {Array.from({ length: 7 }).map((_, slotIndex) => {
                                                const note = notesByCell.get(`${dayIndex}:${slotIndex}`);

                                                return (
                                                    <button
                                                        key={slotIndex}
                                                        type="button"
                                                        onClick={() => openSlot(dayIndex, slotIndex)}
                                                        className={[
                                                            "w-full rounded-2xl border px-3 py-3 text-left shadow-sm transition-all duration-150",
                                                            note
                                                                ? "border-emerald-200 bg-white hover:-translate-y-[1px] hover:bg-emerald-50/70 hover:shadow-md"
                                                                : "border-slate-200 bg-white/90 hover:-translate-y-[1px] hover:bg-slate-50 hover:shadow-md",
                                                        ].join(" ")}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                {slotIndex < 6 ? `Class ${slotIndex + 1}` : "Extra"}
                                                            </div>
                                                            {note ? (
                                                                relatesPill(note.relatesTo)
                                                            ) : (
                                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                                    Empty
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="mt-2 text-base font-bold tracking-tight text-slate-800">
                                                            {note ? (
                                                                truncateOneLine(note.title || note.body, 28)
                                                            ) : (
                                                                <span className="font-medium text-slate-400">
                                                                    Click to add…
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right preview */}
                    <div className="hidden lg:block">
                        <WeekPreviewCard monday={nextWeekMonday} onClick={() => setWeekMonday(nextWeekMonday)} />
                    </div>
                </div>

                {/* Events popover */}
                {eventsPopover.open && eventsPopover.dayISO && (
                    <div className="fixed inset-0 z-40">
                        <div
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]"
                            onClick={() => setEventsPopover({ open: false, dayISO: null })}
                        />
                        <div className="absolute left-1/2 top-24 w-[min(620px,92vw)] -translate-x-1/2">
                            <div
                                ref={popoverRef}
                                className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                                            Events
                                        </div>
                                        <div className="mt-1 text-xl font-black tracking-tight text-slate-900">
                                            {eventsPopover.dayISO}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setEventsPopover({ open: false, dayISO: null })}
                                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                    >
                                        Close
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-3">
                                    {(eventsByDay.get(eventsPopover.dayISO) || []).map((e) => (
                                        <div
                                            key={e.id}
                                            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`h-2.5 w-2.5 rounded-full ${typeDotClass(e.event_type)}`} />
                                                        <div className="truncate text-base font-bold text-slate-900">{e.title}</div>
                                                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                                            {eventTypeLabel(e.event_type)}
                                                        </span>
                                                    </div>

                                                    <div className="mt-2 text-xs font-medium text-slate-600">
                                                        {e.all_day ? (
                                                            <span>All day</span>
                                                        ) : (
                                                            <span>
                                                                {fmtTime12h(e.event_date)}
                                                                {e.end_date ? ` – ${fmtTime12h(e.end_date)}` : ""}
                                                            </span>
                                                        )}

                                                        {typeof e.class_id === "number" ? (
                                                            <span className="ml-2 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px]">
                                                                Class #{e.class_id}
                                                            </span>
                                                        ) : (
                                                            <span className="ml-2 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px]">
                                                                Global
                                                            </span>
                                                        )}
                                                    </div>

                                                    {e.description ? (
                                                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                                                            {e.description}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/calendar`)}
                                                    className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                                    title="Open calendar"
                                                >
                                                    Open
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {(eventsByDay.get(eventsPopover.dayISO) || []).length === 0 && (
                                        <div className="text-sm text-slate-600">No events.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Slot editor modal */}
                {editing.open && (
                    <div className="fixed inset-0 z-50">
                        <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[3px]" />
                        <div className="absolute left-1/2 top-14 w-[min(820px,94vw)] -translate-x-1/2">
                            <div className="rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                                            Edit note
                                        </div>
                                        <div className="mt-1 text-xl font-black tracking-tight text-slate-900">
                                            Day {editing.dayIndex + 1} • Line {editing.slotIndex + 1}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            Week:{" "}
                                            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-slate-700">
                                                {editing.weekKey}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={closeEditor}
                                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                    >
                                        Close
                                    </button>
                                </div>

                                <div className="mt-5 grid gap-5 md:grid-cols-[1.25fr_0.82fr]">
                                    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                                        <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                            Short title
                                        </label>
                                        <input
                                            value={draftTitle}
                                            onChange={(e) => setDraftTitle(e.target.value)}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                            placeholder="e.g. Print worksheets / Prep quiz / Call home…"
                                        />

                                        <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                            Full note
                                        </label>
                                        <textarea
                                            value={draftBody}
                                            onChange={(e) => setDraftBody(e.target.value)}
                                            rows={8}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                            placeholder="Write the full detail here…"
                                        />

                                        <div className="mt-3 text-xs text-slate-500">
                                            Tip: Leave both fields blank and press <b>Save</b> to clear this line.
                                        </div>
                                    </div>

                                    <div className="rounded-[28px] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm">
                                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                            Relates to
                                        </div>

                                        <div className="mt-4 grid gap-3">
                                            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                                                <input
                                                    type="radio"
                                                    checked={draftRelatesKind === "general"}
                                                    onChange={() => setDraftRelatesKind("general")}
                                                />
                                                General
                                            </label>

                                            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                                                <input
                                                    type="radio"
                                                    checked={draftRelatesKind === "personal"}
                                                    onChange={() => setDraftRelatesKind("personal")}
                                                />
                                                Personal
                                            </label>

                                            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                                                <input
                                                    type="radio"
                                                    checked={draftRelatesKind === "class"}
                                                    onChange={() => setDraftRelatesKind("class")}
                                                />
                                                Class / Club
                                            </label>

                                            {draftRelatesKind === "class" && (
                                                <select
                                                    value={draftRelatesClassId}
                                                    onChange={(e) => setDraftRelatesClassId(Number(e.target.value))}
                                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                                                >
                                                    {relatesOptions.length === 0 ? (
                                                        <option value={0}>No classes found</option>
                                                    ) : (
                                                        relatesOptions.map((o) => (
                                                            <option key={o.value} value={Number(o.value)}>
                                                                {o.label}
                                                            </option>
                                                        ))
                                                    )}
                                                </select>
                                            )}
                                        </div>

                                        <div className="mt-6 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={saveEditor}
                                                className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl"
                                            >
                                                Save
                                            </button>
                                            <button
                                                type="button"
                                                onClick={closeEditor}
                                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>

                                        <div className="mt-4 text-xs text-slate-500">Saves to your account automatically.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tasks */}
                <div className="fixed bottom-16 right-4 z-40 w-[min(320px,92vw)]">
                    <div className="rounded-[28px] border border-white/70 bg-white/88 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-black tracking-tight text-slate-900">Tasks</div>
                                <div className="text-[12px] text-slate-500">Quick checklist • archive for reuse</div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowArchived((s) => !s)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                            >
                                {showArchived ? "Active" : "Archived"}
                            </button>
                        </div>

                        {!showArchived ? (
                            <>
                                <div className="mt-4 grid gap-2">
                                    <input
                                        value={taskDraft}
                                        onChange={(e) => setTaskDraft(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                        placeholder="Add a task…"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") addTask();
                                        }}
                                    />

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={taskDueDraft}
                                            onChange={(e) => setTaskDueDraft(e.target.value)}
                                            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                                        />

                                        <button
                                            type="button"
                                            onClick={addTask}
                                            className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 grid max-h-[48vh] gap-2 overflow-auto pr-1">
                                    {activeTasks.length === 0 ? (
                                        <div className="text-sm text-slate-600">No tasks yet.</div>
                                    ) : (
                                        activeTasks.map((t) => (
                                            <div
                                                key={t.id}
                                                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm"
                                            >
                                                <div className="flex flex-col gap-3">
                                                    <label className="flex items-start gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={t.done}
                                                            onChange={() => toggleTaskDone(t.id)}
                                                            className="mt-1"
                                                        />

                                                        <div className="min-w-0 flex-1">
                                                            <div
                                                                title={t.text}
                                                                className={[
                                                                    "text-[14px] font-semibold leading-snug whitespace-pre-wrap break-words",
                                                                    t.done ? "text-slate-400 line-through" : "text-slate-800",
                                                                ].join(" ")}
                                                            >
                                                                {t.text}
                                                            </div>

                                                            <div className="mt-2 text-xs text-slate-600">
                                                                {t.dueDateISO ? (
                                                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                                                                        Due: {t.dueDateISO}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400">No due date</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </label>

                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => archiveTask(t.id)}
                                                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                        >
                                                            Archive
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteTask(t.id)}
                                                            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="mt-4 grid max-h-[58vh] gap-2 overflow-auto pr-1">
                                {archivedTasks.length === 0 ? (
                                    <div className="text-sm text-slate-600">No archived tasks.</div>
                                ) : (
                                    archivedTasks.map((t) => (
                                        <div
                                            key={t.id}
                                            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div
                                                        title={t.text}
                                                        className="text-[13px] font-semibold leading-snug whitespace-pre-wrap break-words text-slate-800"
                                                    >
                                                        {t.text}
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-600">
                                                        {t.dueDateISO ? `Due: ${t.dueDateISO}` : "No due date"}{" "}
                                                        {t.archivedAt
                                                            ? `• Archived: ${new Date(t.archivedAt).toLocaleDateString("en-IE")}`
                                                            : ""}
                                                    </div>
                                                </div>

                                                <div className="flex shrink-0 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => reviveTask(t.id)}
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        Revive
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteTask(t.id)}
                                                        className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
