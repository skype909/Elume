import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type SlotKind = "period" | "break" | "lunch";

type Slot = {
  id: string;
  kind: SlotKind;
  label: string;
  start: string; // HH:MM
  end: string; // HH:MM
};

type TimetableEntry = {
  classId: number | null;
  classLabel: string; // cached display label
  room: string;
  supervisionRank: number | null; // only for free/unused slots
  dutyNote: string; // for break/lunch notes (and can be used for period notes if you want later)
};

type DaySchedule = {
  slots: Slot[];
  entries: Record<string, TimetableEntry>;
};

type TeacherProfile = {
  title: string;
  firstName: string;
  surname: string;
  schoolName: string;
  schoolAddress: string;
  rollNumber: string;
};

type StoredAdminState = {
  profile: TeacherProfile;
  schedule: Record<DayKey, DaySchedule>;
  updatedAt: string | null;
};

type ClassItem = {
  id: number;
  name: string;
  subject: string;
};

type ClassMeta = { color: string; order: number };
type MetaStore = Record<string, ClassMeta>;

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function nowLocalMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function dayKeyToday(): DayKey | null {
  // JS: 0 Sun, 1 Mon, ... 6 Sat
  const d = new Date().getDay();
  if (d === 1) return "Mon";
  if (d === 2) return "Tue";
  if (d === 3) return "Wed";
  if (d === 4) return "Thu";
  if (d === 5) return "Fri";
  return null;
}

function getEmailFromToken(): string | null {
  const t = localStorage.getItem("elume_token");
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return payload?.email ?? payload?.sub ?? payload?.username ?? null;
  } catch {
    return null;
  }
}

function storageKey() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v2__${email}`;
}

function metaKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_class_layout_v1__${email}`;
}

function loadMeta(): MetaStore {
  try {
    const raw = localStorage.getItem(metaKeyForUser());
    return raw ? (JSON.parse(raw) as MetaStore) : {};
  } catch {
    return {};
  }
}

// A simple readable text-color heuristic based on your tile palette.
function tileTextClass(bgClass: string) {
  // Yellow/amber/light backgrounds need dark text; most others are fine with white.
  if (
    bgClass.includes("bg-yellow") ||
    bgClass.includes("bg-amber") ||
    bgClass.includes("bg-lime") ||
    bgClass.includes("bg-slate-100") ||
    bgClass.includes("bg-slate-200") ||
    bgClass.includes("bg-white")
  ) {
    return "text-slate-900";
  }
  return "text-white";
}

function defaultSlotsForDay(day: DayKey): Slot[] {
  // Adds:
  // - AM Supervision (15 mins before P1)
  // - PM Supervision (15 mins after last period)
  if (day === "Fri") {
    return [
      { id: "PRE", kind: "break", label: "AM Supervision", start: "08:35", end: "08:50" },

      { id: "P1", kind: "period", label: "Period 1", start: "08:50", end: "09:48" },
      { id: "P2", kind: "period", label: "Period 2", start: "09:48", end: "10:46" },
      { id: "SB", kind: "break", label: "Small Break", start: "10:46", end: "11:01" },
      { id: "P3", kind: "period", label: "Period 3", start: "11:01", end: "11:59" },
      { id: "P4", kind: "period", label: "Period 4", start: "11:59", end: "12:59" },
      { id: "L", kind: "lunch", label: "Lunch", start: "12:59", end: "13:14" },
      { id: "P5", kind: "period", label: "Period 5", start: "13:14", end: "14:12" },

      { id: "POST", kind: "break", label: "PM Supervision", start: "14:12", end: "14:27" },
    ];
  }

  const lunchEnd = day === "Mon" ? "13:44" : "13:54";

  return [
    { id: "PRE", kind: "break", label: "AM Supervision", start: "08:35", end: "08:50" },

    { id: "P1", kind: "period", label: "Period 1", start: "08:50", end: "09:48" },
    { id: "P2", kind: "period", label: "Period 2", start: "09:48", end: "10:46" },
    { id: "SB", kind: "break", label: "Small Break", start: "10:46", end: "11:01" },
    { id: "P3", kind: "period", label: "Period 3", start: "11:01", end: "11:59" },
    { id: "P4", kind: "period", label: "Period 4", start: "11:59", end: "12:57" },
    { id: "L", kind: "lunch", label: "Lunch", start: "12:57", end: lunchEnd },
    { id: "P5", kind: "period", label: "Period 5", start: lunchEnd, end: "14:52" },
    { id: "P6", kind: "period", label: "Period 6", start: "14:52", end: "15:50" },

    { id: "POST", kind: "break", label: "PM Supervision", start: "15:50", end: "16:05" },
  ];
}

function defaultEntry(): TimetableEntry {
  return {
    classId: null,
    classLabel: "",
    room: "",
    supervisionRank: null,
    dutyNote: "",
  };
}

function makeDefaultState(): StoredAdminState {
  const profile: TeacherProfile = {
    title: "Mr",
    firstName: "",
    surname: "",
    schoolName: "",
    schoolAddress: "",
    rollNumber: "",
  };

  const schedule = {} as Record<DayKey, DaySchedule>;
  for (const day of DAYS) {
    const slots = defaultSlotsForDay(day);
    const entries: Record<string, TimetableEntry> = {};
    for (const s of slots) entries[s.id] = defaultEntry();
    schedule[day] = { slots, entries };
  }

  return { profile, schedule, updatedAt: null };
}

function fmtDay(d: DayKey) {
  if (d === "Mon") return "Monday";
  if (d === "Tue") return "Tuesday";
  if (d === "Wed") return "Wednesday";
  if (d === "Thu") return "Thursday";
  return "Friday";
}

export default function TeacherAdminPage() {
  const navigate = useNavigate();

  const [state, setState] = useState<StoredAdminState>(() => {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return makeDefaultState();
    try {
      const parsed = JSON.parse(raw) as StoredAdminState;
      if (!parsed?.profile || !parsed?.schedule) return makeDefaultState();
      return parsed;
    } catch {
      return makeDefaultState();
    }
  });

  const [savedToast, setSavedToast] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [meta, setMeta] = useState<MetaStore>(() => loadMeta());

  const today = dayKeyToday();
  const nowMins = nowLocalMinutes();

  // Mobile: show one day at a time
  const [dayView, setDayView] = useState<DayKey>(() => today ?? "Mon");

  // Editor modal state
  const [editing, setEditing] = useState<{
    day: DayKey;
    slotId: string;
  } | null>(null);

  const editingSlot = useMemo(() => {
    if (!editing) return null;
    return state.schedule[editing.day].slots.find((s) => s.id === editing.slotId) ?? null;
  }, [editing, state.schedule]);

  const editingEntry = useMemo(() => {
    if (!editing) return null;
    const daySch = state.schedule[editing.day];
    return daySch.entries[editing.slotId] ?? defaultEntry();
  }, [editing, state.schedule]);

  function saveState(next: StoredAdminState) {
    localStorage.setItem(storageKey(), JSON.stringify(next));
    setState(next);
    setSavedToast("Saved ✓");
    window.setTimeout(() => setSavedToast(null), 1200);
  }

  function touch(next: StoredAdminState) {
    saveState({ ...next, updatedAt: new Date().toISOString() });
  }

  function updateProfile(patch: Partial<TeacherProfile>) {
    touch({
      ...state,
      profile: { ...state.profile, ...patch },
    });
  }

  function updateEntry(day: DayKey, slotId: string, patch: Partial<TimetableEntry>) {
    const daySch = state.schedule[day];
    const prev = daySch.entries[slotId] ?? defaultEntry();
    const nextEntries = { ...daySch.entries, [slotId]: { ...prev, ...patch } };
    touch({
      ...state,
      schedule: { ...state.schedule, [day]: { ...daySch, entries: nextEntries } },
    });
  }

  function updateSlotTime(day: DayKey, slotId: string, field: "start" | "end", val: string) {
    const daySch = state.schedule[day];
    const nextSlots = daySch.slots.map((s) => (s.id === slotId ? { ...s, [field]: val } : s));
    touch({
      ...state,
      schedule: { ...state.schedule, [day]: { ...daySch, slots: nextSlots } },
    });
  }

  function clearEntry(day: DayKey, slotId: string) {
    updateEntry(day, slotId, defaultEntry());
  }

  function slotIsActive(day: DayKey, slot: Slot) {
    if (today !== day) return false;
    const a = toMinutes(slot.start);
    const b = toMinutes(slot.end);
    return nowMins >= a && nowMins < b;
  }

  function exportPdf() {
    window.print();
  }

  function autoRankUnusedToday() {
    const d = today ?? dayView;
    const daySch = state.schedule[d];
    let r = 1;
    const nextEntries = { ...daySch.entries };

    // candidates: periods with no class assigned
    const candidates = daySch.slots.filter((s) => s.kind === "period");

    for (const slot of candidates) {
      const e = nextEntries[slot.id] ?? defaultEntry();
      const isFree = !e.classId && !e.classLabel;
      if (isFree) {
        nextEntries[slot.id] = { ...e, supervisionRank: r++ };
      }
    }

    touch({
      ...state,
      schedule: { ...state.schedule, [d]: { ...daySch, entries: nextEntries } },
    });
  }

  // Pull real classes + refresh colour meta (dashboard tile colours)
  useEffect(() => {
    setMeta(loadMeta());

    let cancelled = false;
    apiFetch("/classes")
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? (data as any[]) : [];
        const cleaned: ClassItem[] = arr
          .map((c) => ({
            id: Number(c.id),
            name: String(c.name ?? ""),
            subject: String(c.subject ?? ""),
          }))
          .filter((c) => Number.isFinite(c.id) && c.id > 0);

        setClasses(cleaned);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const classOptions = useMemo(() => {
    return [
      { id: 0, label: "— Free / Unused" },
      ...classes.map((c) => ({
        id: c.id,
        label: `${c.name}${c.subject ? ` — ${c.subject}` : ""}`,
      })),
    ];
  }, [classes]);

  function tileBgForClassId(classId: number | null) {
    if (!classId) return "bg-white";
    const m = meta[String(classId)];
    return m?.color ?? "bg-slate-200";
  }

  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)] print:shadow-none";
  const btn =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50";
  const input =
    "w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm";

  // When dayView changes and today exists, keep it aligned unless user chose otherwise
  useEffect(() => {
    if (today) setDayView(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-emerald-100 p-6 print:bg-white print:p-0">
      <style>
        {`
          @media print {
            @page { size: A4 landscape; margin: 10mm; }

            /* Hide everything by default */
            body * { visibility: hidden; }

            /* Show timetable only */
            #timetablePrint, #timetablePrint * { visibility: visible; }

            /* Place timetable at top-left */
            #timetablePrint { position: absolute; left: 0; top: 0; width: 100%; }

            .print-hide { display: none !important; }
            .print-tight { padding: 0 !important; }
          }
        `}
      </style>

      <div className="mx-auto max-w-7xl px-4 py-6 print:px-0 print:py-0">
        {/* Header + Profile strip (hidden in print via visibility rule above anyway) */}
        <div className={`${card} p-4 print:border-0 print:shadow-none print-tight`}>
          <div className="flex flex-wrap items-start justify-between gap-3 print-hide">
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                Teacher Admin
              </div>
              <div className="text-sm text-slate-600">
                Quick reference timetable • editable profile • print-ready
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={btn} type="button" onClick={() => navigate("/")}>
                Back to Dashboard
              </button>
              <button className={btn} type="button" onClick={exportPdf}>
                Export PDF
              </button>
              {savedToast && (
                <span className="rounded-full border-2 border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {savedToast}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-12 print:mt-2">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-600">
                Title
                <select
                  className={`${input} mt-1`}
                  value={state.profile.title}
                  onChange={(e) => updateProfile({ title: e.target.value })}
                >
                  {["Mr", "Mrs", "Ms", "Miss", "Mx", "Dr"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-slate-600">
                First name
                <input
                  className={`${input} mt-1`}
                  value={state.profile.firstName}
                  onChange={(e) => updateProfile({ firstName: e.target.value })}
                  placeholder="e.g. Peter"
                />
              </label>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-slate-600">
                Surname
                <input
                  className={`${input} mt-1`}
                  value={state.profile.surname}
                  onChange={(e) => updateProfile({ surname: e.target.value })}
                  placeholder="e.g. Fitzgerald"
                />
              </label>
            </div>

            <div className="md:col-span-4">
              <label className="text-xs font-bold text-slate-600">
                School name
                <input
                  className={`${input} mt-1`}
                  value={state.profile.schoolName}
                  onChange={(e) => updateProfile({ schoolName: e.target.value })}
                  placeholder="School name"
                />
              </label>
            </div>

            <div className="md:col-span-8">
              <label className="text-xs font-bold text-slate-600">
                School address
                <input
                  className={`${input} mt-1`}
                  value={state.profile.schoolAddress}
                  onChange={(e) => updateProfile({ schoolAddress: e.target.value })}
                  placeholder="School address"
                />
              </label>
            </div>

            <div className="md:col-span-4">
              <label className="text-xs font-bold text-slate-600">
                Roll number
                <input
                  className={`${input} mt-1`}
                  value={state.profile.rollNumber}
                  onChange={(e) => updateProfile({ rollNumber: e.target.value })}
                  placeholder="e.g. 12345A"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="mt-6 grid gap-4 md:grid-cols-12 print:mt-0">
          {/* Timetable full width */}
          <div className="md:col-span-12">
            <div id="timetablePrint" className={`${card} p-4 print-tight`}>
              <div className="flex items-center justify-between print-hide">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">
                    Weekly Timetable
                  </div>
                  <div className="text-sm text-slate-600">
                    Click a slot to edit. “Now” highlights the current period.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className={btn} type="button" onClick={autoRankUnusedToday}>
                    Auto-rank unused (today)
                  </button>
                  <button
                    className={btn}
                    type="button"
                    onClick={() => {
                      touch(makeDefaultState());
                      setMeta(loadMeta());
                    }}
                  >
                    Reset template
                  </button>
                </div>
              </div>

              {/* Mobile day tabs */}
              <div className="mt-3 flex flex-wrap gap-2 md:hidden print-hide">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                      dayView === d
                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-800"
                    }`}
                    onClick={() => setDayView(d)}
                  >
                    {fmtDay(d)}
                    {today === d ? " • Today" : ""}
                  </button>
                ))}
              </div>

              {/* Timetable grid (NO internal scrollbar) */}
              <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-white print:border-0 print:mt-0">
                <div className="min-w-[980px] md:min-w-0">
                  {/* Header row */}
                  <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                    <div className="p-3">Time</div>

                    {/* Desktop: show all days */}
                    <div className="hidden md:contents">
                      {DAYS.map((d) => (
                        <div key={d} className={`p-3 ${today === d ? "text-emerald-800" : ""}`}>
                          {fmtDay(d)}
                          {today === d ? " • Today" : ""}
                        </div>
                      ))}
                    </div>

                    {/* Mobile: only active day */}
                    <div className="md:hidden col-span-5 p-3 text-emerald-800">
                      {fmtDay(dayView)}
                      {today === dayView ? " • Today" : ""}
                    </div>
                  </div>

                  {/* Use Monday as master row labels; all days have same slot ids now incl PRE/POST */}
                  {state.schedule["Mon"].slots.map((rowSlot) => {
                    return (
                      <div
                        key={rowSlot.id}
                        className="grid grid-cols-6 border-b border-slate-100 last:border-b-0"
                      >
                        {/* Time column */}
                        <div className="p-3 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">{rowSlot.label}</div>
                          <div>
                            {rowSlot.start}–{rowSlot.end}
                          </div>
                        </div>

                        {/* Desktop day columns */}
                        <div className="hidden md:contents">
                          {DAYS.map((day) => (
                            <DayCell
                              key={day}
                              day={day}
                              rowSlotId={rowSlot.id}
                              state={state}
                              meta={meta}
                              tileBgForClassId={tileBgForClassId}
                              setEditing={setEditing}
                              slotIsActive={slotIsActive}
                              today={today}
                            />
                          ))}
                        </div>

                        {/* Mobile single day column */}
                        <div className="md:hidden col-span-5 p-3">
                          <MobileDayCell
                            day={dayView}
                            rowSlotId={rowSlot.id}
                            state={state}
                            meta={meta}
                            tileBgForClassId={tileBgForClassId}
                            setEditing={setEditing}
                            slotIsActive={slotIsActive}
                            today={today}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500 print-hide">
                Export tip: Click <b>Export PDF</b> → choose <b>Save as PDF</b> in the printer dropdown.
              </div>
            </div>
          </div>

          {/* Class list moved to bottom (full width) */}
          <div className="md:col-span-12 print-hide">
            <div className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">My class groups</div>
                  <div className="mt-1 text-sm text-slate-600">
                    These come from your live Elume classes.
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => alert("Archived classes coming soon (wired stub).")}
                >
                  Archived classes
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {classes.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    No classes found (or still loading).
                  </div>
                ) : (
                  classes.map((c) => {
                    const bg = tileBgForClassId(c.id);
                    const tc = tileTextClass(bg);
                    return (
                      <div key={c.id} className={`rounded-2xl border-2 border-black px-3 py-2 ${bg} ${tc}`}>
                        <div className="text-sm font-extrabold leading-tight">{c.name}</div>
                        <div className={`text-xs ${tc === "text-white" ? "text-white/90" : "text-slate-800/80"}`}>
                          {c.subject}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Print footer (won’t show now because we print timetable only) */}
      </div>

      {/* EDIT MODAL */}
      {editing && editingSlot && editingEntry && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center print-hide">
          <div className="w-full max-w-xl rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  {fmtDay(editing.day)} • {editingSlot.label} ({editingSlot.start}–{editingSlot.end})
                </div>
                <div className="text-xs text-slate-600">
                  Edit this slot. Changes save instantly.
                </div>
              </div>

              <button
                type="button"
                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                onClick={() => setEditing(null)}
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {/* PERIOD EDITOR */}
              {editingSlot.kind === "period" && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Class
                      <select
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingEntry.classId ?? 0}
                        onChange={(e) => {
                          const picked = Number(e.target.value);
                          const opt = classOptions.find((o) => o.id === picked);
                          if (!opt || picked === 0) {
                            updateEntry(editing.day, editing.slotId, {
                              classId: null,
                              classLabel: "",
                            });
                          } else {
                            updateEntry(editing.day, editing.slotId, {
                              classId: picked,
                              classLabel: opt.label,
                              supervisionRank: null,
                            });
                          }
                        }}
                      >
                        {classOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-600">
                      Room
                      <input
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingEntry.room}
                        onChange={(e) =>
                          updateEntry(editing.day, editing.slotId, { room: e.target.value })
                        }
                        placeholder="e.g. Lab 1"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Supervision rank (only if Free/Unused)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingEntry.supervisionRank ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.trunc(Number(e.target.value || 0)));
                          updateEntry(editing.day, editing.slotId, { supervisionRank: v === 0 ? null : v });
                        }}
                        disabled={!!editingEntry.classId || !!editingEntry.classLabel}
                      />
                    </label>

                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                        onClick={() => clearEntry(editing.day, editing.slotId)}
                      >
                        Clear slot
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* BREAK / LUNCH EDITOR */}
              {(editingSlot.kind === "break" || editingSlot.kind === "lunch") && (
                <>
                  <label className="text-xs font-bold text-slate-600">
                    Duty / Note
                    <input
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                      value={editingEntry.dutyNote}
                      onChange={(e) =>
                        updateEntry(editing.day, editing.slotId, { dutyNote: e.target.value })
                      }
                      placeholder="e.g. Lunch supervision / Corridor duty / Yard duty"
                    />
                  </label>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Start time
                      <input
                        type="time"
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingSlot.start}
                        onChange={(e) =>
                          updateSlotTime(editing.day, editing.slotId, "start", e.target.value)
                        }
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-600">
                      End time
                      <input
                        type="time"
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingSlot.end}
                        onChange={(e) =>
                          updateSlotTime(editing.day, editing.slotId, "end", e.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      onClick={() => clearEntry(editing.day, editing.slotId)}
                    >
                      Clear note
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop cell component */
function DayCell({
  day,
  rowSlotId,
  state,
  meta,
  tileBgForClassId,
  setEditing,
  slotIsActive,
  today,
}: {
  day: DayKey;
  rowSlotId: string;
  state: StoredAdminState;
  meta: MetaStore;
  tileBgForClassId: (id: number | null) => string;
  setEditing: React.Dispatch<React.SetStateAction<{ day: DayKey; slotId: string } | null>>;
  slotIsActive: (d: DayKey, s: Slot) => boolean;
  today: DayKey | null;
}) {
  const daySch = state.schedule[day];
  const slot = daySch.slots.find((s) => s.id === rowSlotId);
  if (!slot) {
    return <div className="p-3 text-xs text-slate-400">—</div>;
  }

  const entry = daySch.entries[slot.id] ?? defaultEntry();
  const isActive = slotIsActive(day, slot);

  // Period tiles look like dashboard; break/lunch are slim and calm.
  if (slot.kind === "period") {
    const hasClass = !!entry.classId || !!entry.classLabel;
    const bg = hasClass ? tileBgForClassId(entry.classId) : "bg-white";
    const tc = hasClass ? tileTextClass(bg) : "text-slate-900";

    const tile =
      hasClass
        ? `border-[4px] border-black ${bg} ${tc} shadow-[0_4px_0_rgba(15,23,42,0.16)]`
        : "border-2 border-slate-200 bg-white text-slate-900";

    const showRank = !hasClass && (entry.supervisionRank ?? 0) > 0;

    // Split label into two lines: "Class name" and "Subject"
    const parts = (entry.classLabel || "").split(" — ");
    const clsName = parts[0] || "";
    const subj = parts[1] || "";

    return (
      <div className="p-3">
        <button
          type="button"
          onClick={() => setEditing({ day, slotId: slot.id })}
          className={`w-full text-left rounded-3xl p-3 ${tile} ${
            isActive ? "ring-2 ring-emerald-300" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {isActive && (
                <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                  Now
                </div>
              )}

              <div className="text-lg font-extrabold leading-tight truncate">
                {hasClass ? clsName : "Free"}
              </div>

              {hasClass && subj && (
                <div className={`text-sm font-semibold leading-tight truncate ${tc === "text-white" ? "text-white/90" : "text-slate-700"}`}>
                  {subj}
                </div>
              )}

              <div className={`text-sm ${tc === "text-white" ? "text-white/90" : "text-slate-700"}`}>
                {slot.start}–{slot.end}
                {entry.room ? ` • ${entry.room}` : ""}
              </div>
            </div>

            {showRank && (
              <div className="grid h-12 w-12 place-items-center rounded-3xl border-[4px] border-black bg-white text-2xl font-extrabold text-slate-900 shadow-[0_4px_0_rgba(15,23,42,0.16)]">
                {entry.supervisionRank}
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  // Break/Lunch: small, not “tile-y”
  const note = entry.dutyNote?.trim();
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={() => setEditing({ day, slotId: slot.id })}
        className={`w-full text-left rounded-2xl border-2 ${
          slot.kind === "lunch" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
        } p-2 ${isActive ? "ring-2 ring-emerald-300" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {isActive && (
              <div className="mb-1 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                Now
              </div>
            )}
            <div className="text-xs font-extrabold text-slate-900">{slot.label}</div>
            <div className="text-[11px] text-slate-600">
              {slot.start}–{slot.end}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-slate-800 truncate">
              {note ? note : "No duty"}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

/** Mobile cell wrapper (same rendering but already inside correct column span) */
function MobileDayCell(props: React.ComponentProps<typeof DayCell>) {
  return <DayCell {...props} />;
}