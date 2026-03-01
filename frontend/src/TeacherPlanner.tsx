import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

/**
 * TeacherPlanner.tsx
 *
 * - Mon–Fri weekly planner (6 slots per day)
 * - Click slot => modal editor (full note + relates-to dropdown)
 * - Shows calendar events on each day via a bell + hover/click popover
 * - Tasks checklist sticky bottom-right (due date optional) with archive/revive/delete
 *
 * Persistence:
 * - Notes + tasks stored in localStorage (no backend changes required)
 * - Classes + calendar events fetched from backend
 *
 * Backend references:
 * - GET /classes (teacher-owned classes) :contentReference[oaicite:5]{index=5}
 * - GET /calendar-events (global + class events) :contentReference[oaicite:6]{index=6}
 * - Calendar schema uses event_date/end_date/all_day/event_type :contentReference[oaicite:7]{index=7}
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
    event_date: string; // ISO datetime
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
    weekKey: string; // YYYY-MM-DD (monday)
    dayIndex: number; // 0..4 (Mon..Fri)
    slotIndex: number; // 0..5
    title: string; // short (first line)
    body: string; // full note
    relatesTo: RelatesTo;
    updatedAt: number;
};

type TaskItem = {
    id: string;
    text: string;
    dueDateISO?: string; // YYYY-MM-DD (optional)
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
    const day = x.getDay(); // 0=Sun
    const diff = (day + 6) % 7; // Mon=0
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
    // crypto.randomUUID not always available on older browsers
    // (but should be fine on modern Chrome/Chromebooks)
    return (globalThis.crypto?.randomUUID?.() || `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

function truncateOneLine(s: string, max = 26) {
    const t = (s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "…";
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

// -----------------------------
// Local Storage
// -----------------------------

const LS_NOTES_KEY = "elume.teacherPlanner.notes.v1";
const LS_TASKS_KEY = "elume.teacherPlanner.tasks.v1";

function loadNotes(): PlannerNote[] {
    try {
        const raw = localStorage.getItem(LS_NOTES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveNotes(notes: PlannerNote[]) {
    try {
        localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notes));
    } catch {
        // ignore
    }
}

function loadTasks(): TaskItem[] {
    try {
        const raw = localStorage.getItem(LS_TASKS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveTasks(tasks: TaskItem[]) {
    try {
        localStorage.setItem(LS_TASKS_KEY, JSON.stringify(tasks));
    } catch {
        // ignore
    }
}

// -----------------------------
// Component
// -----------------------------

export default function TeacherPlanner() {
    const navigate = useNavigate();

    // Data from backend
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    // Local data
    const [notes, setNotes] = useState<PlannerNote[]>(() => loadNotes());
    const [tasks, setTasks] = useState<TaskItem[]>(() => loadTasks());

    // Week navigation
    const [weekMonday, setWeekMonday] = useState<Date>(() => startOfWeekMonday(new Date()));

    // Slot editor modal
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

    // Day events popover
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

    // -----------------------------
    // Load calendar events (all)
    // -----------------------------
    useEffect(() => {
        let alive = true;
        (async () => {
            setLoadingEvents(true);
            try {
                const data = await apiFetch("/calendar-events");
                if (!alive) return;
                setEvents(Array.isArray(data) ? data : []);
            } catch {
                if (!alive) return;
                setEvents([]);
            } finally {
                if (!alive) return;
                setLoadingEvents(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    // -----------------------------
    // Persist local changes
    // -----------------------------
    useEffect(() => saveNotes(notes), [notes]);
    useEffect(() => saveTasks(tasks), [tasks]);

    // Close popover on outside click / ESC
    useEffect(() => {
        function onDocDown(e: MouseEvent) {
            if (!eventsPopover.open) return;
            const el = popoverRef.current;
            if (el && e.target && el.contains(e.target as Node)) return;
            setEventsPopover({ open: false, dayISO: null });
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setEventsPopover({ open: false, dayISO: null });
                setEditing((s) => ({ ...s, open: false }));
            }
        }
        document.addEventListener("mousedown", onDocDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [eventsPopover.open]);

    // -----------------------------
    // Derived: week keys/dates
    // -----------------------------
    const weekKey = useMemo(() => toYMD(weekMonday), [weekMonday]);
    const prevWeekMonday = useMemo(() => addWeeks(weekMonday, -1), [weekMonday]);
    const nextWeekMonday = useMemo(() => addWeeks(weekMonday, 1), [weekMonday]);

    const weekDays = useMemo(() => {
        // Mon..Fri
        return Array.from({ length: 5 }).map((_, i) => addDays(weekMonday, i));
    }, [weekMonday]);

    // -----------------------------
    // Derived: notes map for this week
    // -----------------------------
    const notesByCell = useMemo(() => {
        const map = new Map<string, PlannerNote>();
        for (const n of notes) {
            if (n.weekKey !== weekKey) continue;
            map.set(`${n.dayIndex}:${n.slotIndex}`, n);
        }
        return map;
    }, [notes, weekKey]);

    // -----------------------------
    // Derived: events within visible weeks (prev/current/next) grouped by day
    // -----------------------------
    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();

        const rangeStart = prevWeekMonday; // show bells for prev/current/next
        const rangeEnd = addDays(nextWeekMonday, 7); // monday after next week

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

        // sort within each day
        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "") || b.id - a.id);
            map.set(k, arr);
        }

        return map;
    }, [events, prevWeekMonday, nextWeekMonday]);

    // -----------------------------
    // Relates-to options
    // -----------------------------
    const relatesOptions = useMemo(() => {
        const classOpts = classes.map((c) => ({
            value: String(c.id),
            label: `${c.name}`,
        }));
        return classOpts;
    }, [classes]);

    // -----------------------------
    // Open editor
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

        // relates-to
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

        // allow clearing note
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

    // -----------------------------
    // Tasks
    // -----------------------------
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
        setTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, archived: true, archivedAt: Date.now() } : t))
        );
    }

    function reviveTask(id: string) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: false } : t)));
    }

    function deleteTask(id: string) {
        const ok = window.confirm("Delete this task? This cannot be undone.");
        if (!ok) return;
        setTasks((prev) => prev.filter((t) => t.id !== id));
    }

    const activeTasks = useMemo(() => {
        const arr = tasks.filter((t) => !t.archived);
        // due date first, then createdAt
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
    // UI Pieces
    // -----------------------------
    function WeekPreviewCard({
        monday,
        active,
        onClick,
        side = "left",
    }: {
        monday: Date;
        active: boolean;
        onClick: () => void;
        side?: "left" | "right";
    }) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={[
                    "w-full text-left rounded-3xl border-2 p-3 transition",
                    active ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50",
                    side === "left" ? "opacity-90" : "opacity-90",
                ].join(" ")}
            >
                <div className="text-xs font-semibold text-slate-600">Week</div>
                <div className="text-lg font-extrabold tracking-tight">{fmtWeekRange(monday)}</div>
                <div className="mt-1 text-xs text-slate-600">
                    {toYMD(monday)}
                </div>
            </button>
        );
    }

    function DayHeader({ d }: { d: Date }) {
        const iso = toYMD(d);
        const evs = eventsByDay.get(iso) || [];
        const hasEvents = evs.length > 0;

        return (
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-extrabold tracking-tight">
                        {d.toLocaleDateString("en-IE", { weekday: "long" })}
                    </div>
                    <div className="text-xs text-slate-600">
                        {d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {loadingEvents ? (
                        <div className="text-[11px] text-slate-500">…</div>
                    ) : (
                        <button
                            type="button"
                            title={hasEvents ? "View events" : "No events"}
                            onClick={() => {
                                if (!hasEvents) return;
                                setEventsPopover({ open: true, dayISO: iso });
                            }}
                            className={[
                                "h-9 w-9 grid place-items-center rounded-2xl border-2",
                                hasEvents ? "border-emerald-700 bg-white hover:bg-emerald-50" : "border-slate-200 bg-slate-50",
                            ].join(" ")}
                        >
                            <span className="text-lg leading-none">🔔</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    function relatesPill(r: RelatesTo) {
        if (r.kind === "personal") return <span className="text-[10px] text-purple-700 font-semibold">Personal</span>;
        if (r.kind === "class") return <span className="text-[10px] text-emerald-700 font-semibold">{r.label}</span>;
        return <span className="text-[10px] text-slate-600 font-semibold">General</span>;
    }

    // -----------------------------
    // Render
    // -----------------------------
    return (
        <div className="min-h-screen bg-[#dff3df]">
            <div className="mx-auto max-w-7xl px-4 pt-6 pb-14">
                {/* Top bar */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(`/`)}
                        className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                        type="button"
                    >
                        ← Back
                    </button>

                    <div className="flex-1">
                        <div className="text-3xl font-extrabold tracking-tight text-slate-700"
                style={{ textShadow: "0 3px 8px rgba(0,0,0,0.25)" }}>Teacher Planner </div>
                        <div className="text-sm text-slate-600">
                            Weekly diary + tasks (Mon–Fri) • Click any line to expand
                        </div>
                    </div>

                    <button
                        onClick={() => setWeekMonday(startOfWeekMonday(new Date()))}
                        className="rounded-xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        type="button"
                    >
                        This week
                    </button>
                </div>

                {/* Book layout */}
                <div className="mt-6 grid gap-4 lg:grid-cols-[0.6fr_3.2fr_0.6fr]">
                    {/* Left preview */}
                    <div className="hidden lg:block">
                        <WeekPreviewCard
                            monday={prevWeekMonday}
                            active={false}
                            onClick={() => setWeekMonday(prevWeekMonday)}
                            side="left"
                        />
                    </div>

                    {/* Main planner */}
                    <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                        {/* Week nav row */}
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="text-xs font-semibold text-slate-600">Week of</div>
                                <div className="text-xl font-extrabold tracking-tight">{fmtWeekRange(weekMonday)}</div>
                                <div className="text-xs text-slate-600 mt-1">
                                    Week key: <span className="font-mono">{weekKey}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setWeekMonday(addWeeks(weekMonday, -1))}
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                >
                                    ← Prev
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setWeekMonday(addWeeks(weekMonday, 1))}
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>

                        {/* Days grid */}
                        <div className="mt-5 grid gap-4 md:grid-cols-5">
                            {weekDays.map((d, dayIndex) => (
                                <div key={toYMD(d)} className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-3">
                                    <DayHeader d={d} />

                                    <div className="mt-3 grid gap-2">
                                        {Array.from({ length: 7 }).map((_, slotIndex) => {
                                            const note = notesByCell.get(`${dayIndex}:${slotIndex}`);
                                            return (
                                                <button
                                                    key={slotIndex}
                                                    type="button"
                                                    onClick={() => openSlot(dayIndex, slotIndex)}
                                                    className={[
                                                        "w-full text-left rounded-2xl border-2 px-3 py-2 transition",
                                                        note ? "border-emerald-200 bg-white hover:bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-100",
                                                    ].join(" ")}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-xs font-semibold text-slate-500">
                                                            {slotIndex < 6 ? `Class ${slotIndex + 1}` : "Extra"}
                                                        </div>
                                                        {note ? relatesPill(note.relatesTo) : <span className="text-[10px] text-slate-400">Empty</span>}
                                                    </div>

                                                    <div className="mt-1 text-sm font-semibold text-slate-800">
                                                        {note ? truncateOneLine(note.title || note.body, 28) : <span className="text-slate-400">Click to add…</span>}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right preview */}
                    <div className="hidden lg:block">
                        <WeekPreviewCard
                            monday={nextWeekMonday}
                            active={false}
                            onClick={() => setWeekMonday(nextWeekMonday)}
                            side="right"
                        />
                    </div>
                </div>

                {/* Events popover */}
                {eventsPopover.open && eventsPopover.dayISO && (
                    <div className="fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-black/10" />
                        <div className="absolute left-1/2 top-24 w-[min(560px,92vw)] -translate-x-1/2">
                            <div ref={popoverRef} className="rounded-3xl border-2 border-slate-200 bg-white p-4 shadow-xl">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-extrabold">Events</div>
                                        <div className="text-xs text-slate-600">{eventsPopover.dayISO}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEventsPopover({ open: false, dayISO: null })}
                                        className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                    >
                                        Close
                                    </button>
                                </div>

                                <div className="mt-3 grid gap-2">
                                    {(eventsByDay.get(eventsPopover.dayISO) || []).map((e) => (
                                        <div key={e.id} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`h-2.5 w-2.5 rounded-full ${typeDotClass(e.event_type)}`} />
                                                        <div className="font-semibold truncate">{e.title}</div>
                                                    </div>

                                                    <div className="mt-1 text-xs text-slate-700">
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
                                                        <div className="mt-2 text-xs text-slate-700 whitespace-pre-wrap">{e.description}</div>
                                                    ) : null}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/calendar`)}
                                                    className="shrink-0 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
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
                        <div className="absolute inset-0 bg-black/20" />
                        <div className="absolute left-1/2 top-16 w-[min(760px,94vw)] -translate-x-1/2">
                            <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-2xl">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-extrabold">
                                            Edit note • Day {editing.dayIndex + 1} • Line {editing.slotIndex + 1}
                                        </div>
                                        <div className="text-xs text-slate-600">
                                            Week: <span className="font-mono">{editing.weekKey}</span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={closeEditor}
                                        className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                    >
                                        Close
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-600">Short title</label>
                                        <input
                                            value={draftTitle}
                                            onChange={(e) => setDraftTitle(e.target.value)}
                                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                            placeholder="e.g. Print worksheets / Prep quiz / Call home…"
                                        />

                                        <label className="mt-3 block text-xs font-semibold text-slate-600">Full note</label>
                                        <textarea
                                            value={draftBody}
                                            onChange={(e) => setDraftBody(e.target.value)}
                                            rows={7}
                                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                            placeholder="Write the full detail here…"
                                        />

                                        <div className="mt-2 text-xs text-slate-500">
                                            Tip: Leave both fields blank and press <b>Save</b> to clear this line.
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                                        <div className="text-sm font-semibold">Relates to</div>

                                        <div className="mt-3 grid gap-2">
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="radio"
                                                    checked={draftRelatesKind === "general"}
                                                    onChange={() => setDraftRelatesKind("general")}
                                                />
                                                General
                                            </label>

                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="radio"
                                                    checked={draftRelatesKind === "personal"}
                                                    onChange={() => setDraftRelatesKind("personal")}
                                                />
                                                Personal
                                            </label>

                                            <label className="flex items-center gap-2 text-sm">
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
                                                    className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
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

                                        <div className="mt-5 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={saveEditor}
                                                className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                                            >
                                                Save
                                            </button>
                                            <button
                                                type="button"
                                                onClick={closeEditor}
                                                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>

                                        <div className="mt-3 text-xs text-slate-600">
                                            Saves locally for now (no server work needed). We can move this to SQLite later.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tasks - sticky bottom-right */}
                <div className="fixed bottom-5 right-5 z-30 w-[min(270px,92vw)]">
                    <div className="rounded-3xl border-2 border-slate-200 bg-white p-3 shadow-lg">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-xs font-extrabold">Tasks</div>
                                <div className="text-[11px] text-slate-600">Quick checklist • archive for reuse</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowArchived((s) => !s)}
                                className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                            >
                                {showArchived ? "Active" : "Archived"}
                            </button>
                        </div>

                        {!showArchived ? (
                            <>
                                <div className="mt-3 grid gap-2">
                                    <input
                                        value={taskDraft}
                                        onChange={(e) => setTaskDraft(e.target.value)}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
                                            className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={addTask}
                                            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 grid gap-2 max-h-[46vh] overflow-auto pr-1">
                                    {activeTasks.length === 0 ? (
                                        <div className="text-sm text-slate-600">No tasks yet.</div>
                                    ) : (
                                        activeTasks.map((t) => (
                                            <div key={t.id} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-2">
                                                <div className="flex items-start justify-between gap-3">
                                                    <label className="flex items-start gap-2 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={t.done}
                                                            onChange={() => toggleTaskDone(t.id)}
                                                            className="mt-1"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className={`text-sm font-semibold ${t.done ? "line-through text-slate-400" : "text-slate-800"}`}>
                                                                {t.text}
                                                            </div>
                                                            <div className="mt-1 text-xs text-slate-600">
                                                                {t.dueDateISO ? (
                                                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                                                                        Due: {t.dueDateISO}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400">No due date</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </label>

                                                    <div className="flex gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => archiveTask(t.id)}
                                                            className="rounded-xl border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50"
                                                            title="Archive"
                                                        >
                                                            Archive
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteTask(t.id)}
                                                            className="rounded-xl border-2 border-red-200 bg-white px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                                                            title="Delete"
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
                            <div className="mt-3 grid gap-2 max-h-[58vh] overflow-auto pr-1">
                                {archivedTasks.length === 0 ? (
                                    <div className="text-sm text-slate-600">No archived tasks.</div>
                                ) : (
                                    archivedTasks.map((t) => (
                                        <div key={t.id} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-slate-800">{t.text}</div>
                                                    <div className="mt-1 text-xs text-slate-600">
                                                        {t.dueDateISO ? `Due: ${t.dueDateISO}` : "No due date"}{" "}
                                                        {t.archivedAt ? `• Archived: ${new Date(t.archivedAt).toLocaleDateString("en-IE")}` : ""}
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => reviveTask(t.id)}
                                                        className="rounded-xl border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50"
                                                    >
                                                        Revive
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteTask(t.id)}
                                                        className="rounded-xl border-2 border-red-200 bg-white px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
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

                        <div className="mt-3 text-[11px] text-slate-500">
                            Stored locally for now. We can sync to teacher accounts in SQLite later.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}