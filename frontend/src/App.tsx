import { Routes, Route, useNavigate, useLocation, Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import ClassPage from "./ClassPage";
import NotesPage from "./NotesPage";
import ExamPapersPage from "./ExamPapersPage";
import VideosPage from "./VideosPage";
import LinksPage from "./LinksPage";
import QuizzesPage from "./QuizzesPage";
import Tests from "./Tests";
import CalendarPage from "./CalendarPage";
import ClassAdminPage from "./ClassAdminPage";
import SeatingPlanPage from "./SeatingPlanPage";
import LiveQuizPage from "./LiveQuizPage";
import StudentJoinQuizPage from "./StudentJoinQuizPage";
import LoginPage from "./LoginPage";
import StudentClassPage from "./StudentClassPage";
import { getToken, clearToken } from "./api";
import { apiFetch } from "./api";
import WhiteBoardPage from "./WhiteBoardPage";
import TeacherAdminPage from "./TeacherAdminPage";
import ClassReportPage from "./ClassReportPage";
import StudentReportPage from "./StudentReportPage";
import TeacherPlanner from "./TeacherPlanner";
import CreateResources from "./CreateResources";
import AdminUsersPage from "./AdminUsersPage";
import StudentCollabRoomPage from "./StudentCollabRoomPage";
import CollaborationPage from "./CollaborationPage";
import LegalPage from "./LegalPage";
import ResetPasswordPage from "./ResetPasswordPage";
import StudentPage from "./StudentPage";


import ELogo2 from "./assets/ELogo2.png";
import PlannerLogo from "./assets/Planner_Logo.png";
import pilotUserBadge from "./assets/Elume Pilot User.png";


type ClassItem = {
  id: number;
  name: string;
  subject: string;
};

const API_BASE = "/api";

// local-only metadata (color + order)
type ClassMeta = {
  color: string;
  order: number;
};
type MetaStore = Record<string, ClassMeta>;

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type SlotKind = "period" | "break" | "lunch";

type Slot = {
  id: string;
  kind: SlotKind;
  label: string;
  start: string;
  end: string;
};

type TimetableEntry = {
  classId: number | null;
  classLabel: string;
  room: string;
  supervisionRank: number | null;
  dutyNote: string;
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

const TT_DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function fmtDayLong(d: DayKey) {
  if (d === "Mon") return "Monday";
  if (d === "Tue") return "Tuesday";
  if (d === "Wed") return "Wednesday";
  if (d === "Thu") return "Thursday";
  return "Friday";
}

function currentSchoolDay(): DayKey {
  const n = new Date().getDay(); // 0 Sun, 1 Mon ... 6 Sat
  if (n === 0 || n === 6) return "Mon"; // weekend → next Monday
  return TT_DAYS[n - 1] as DayKey;
}

function isLandscapeNow() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(orientation: landscape)").matches;
}

function loadTeacherTimetableLocal(): StoredAdminState | null {
  try {
    const raw =
      localStorage.getItem(teacherAdminStorageKeyForUser()) ??
      localStorage.getItem(teacherAdminLegacyKeyForUser());

    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredAdminState;
    if (!parsed?.profile || !parsed?.schedule) return null;

    return parsed;
  } catch {
    return null;
  }
}

// 12 bright classroom colours
const COLOURS: { name: string; bg: string; ring: string }[] = [
  { name: "Black", bg: "bg-black", ring: "ring-slate-300" },
  { name: "Dark Green", bg: "bg-green-800", ring: "ring-green-300" },
  { name: "Navy", bg: "bg-blue-900", ring: "ring-blue-300" },
  { name: "Maroon", bg: "bg-rose-800", ring: "ring-rose-300" },
  { name: "Red", bg: "bg-red-500", ring: "ring-red-200" },
  { name: "Gold", bg: "bg-yellow-400", ring: "ring-yellow-200" },
  { name: "Lime", bg: "bg-lime-400", ring: "ring-lime-200" },
  { name: "Deep Sky", bg: "bg-sky-400", ring: "ring-sky-200" },
  { name: "Fuchsia", bg: "bg-fuchsia-500", ring: "ring-fuchsia-200" },
  { name: "Dark Orange", bg: "bg-orange-700", ring: "ring-orange-300" },
];

const DEFAULT_BG = COLOURS[0]?.bg ?? "bg-emerald-500";

function getEmailFromToken(): string | null {
  const t = localStorage.getItem("elume_token");
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    // common JWT fields
    return payload?.email ?? payload?.sub ?? payload?.username ?? null;
  } catch {
    return null;
  }
}

function teacherAdminStorageKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v3__${email}`;
}

function teacherAdminLegacyKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v2__${email}`;
}

function teacherAdminKeyForUser() {
  return teacherAdminStorageKeyForUser();
}

function loadTeacherWelcome(): string {
  try {
    const raw =
      localStorage.getItem(teacherAdminStorageKeyForUser()) ??
      localStorage.getItem(teacherAdminLegacyKeyForUser());

    if (!raw) return "";

    const parsed = JSON.parse(raw);
    const p = parsed?.profile;
    if (!p) return "";

    const title = String(p.title ?? "").trim();
    const surname = String(p.surname ?? "").trim();

    if (!title || !surname) return "";
    return `Welcome ${title} ${surname}`;
  } catch {
    return "";
  }
}

function metaKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_class_layout_v1__${email}`;
}


function loadMeta(): MetaStore {
  try {
    const raw = localStorage.getItem(metaKeyForUser());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MetaStore;
  } catch {
    return {};
  }
}

function saveMeta(meta: MetaStore) {
  localStorage.setItem(metaKeyForUser(), JSON.stringify(meta));
}


function textClassForBg(bgClass: string) {
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

// -------------------- Create Class hierarchy types --------------------
type Stream =
  | "Junior Cycle"
  | "Senior Cycle"
  | "Transition Year (TY)"
  | "LCA"
  | "LCVP"
  | "SEN"
  | "Clubs";

type YearOption =
  | "1st Year"
  | "2nd Year"
  | "3rd Year"
  | "5th Year"
  | "6th Year"
  | "TY"
  | "LCA"
  | "LCVP"
  | "SEN"
  | "Club";

type LevelOption =
  | "Common Level"
  | "Higher Level"
  | "Ordinary Level"
  | "Vocational/Practical"
  | "Link Modules + Traditional Subjects"
  | "Resource"
  | "Learning Support"
  | "L2LP (Level 1 & 2)"
  | "Sports"
  | "Coding"
  | "Music"
  | "Debating";

function yearOptionsForStream(s: Stream): YearOption[] {
  switch (s) {
    case "Junior Cycle":
      return ["1st Year", "2nd Year", "3rd Year"];
    case "Senior Cycle":
      return ["5th Year", "6th Year"];
    case "Transition Year (TY)":
      return ["TY"];
    case "LCA":
      return ["LCA"];
    case "LCVP":
      return ["LCVP"];
    case "SEN":
      return ["SEN"];
    case "Clubs":
      return ["Club"];
    default:
      return ["1st Year"];
  }
}

function levelOptionsForStream(s: Stream, y: YearOption): LevelOption[] {
  if (s === "Junior Cycle") {
    if (y === "1st Year") return ["Common Level"];
    if (y === "2nd Year" || y === "3rd Year")
      return ["Higher Level", "Ordinary Level", "Common Level"];
    return ["Common Level"];
  }
  if (s === "Senior Cycle") return ["Higher Level", "Ordinary Level"];
  if (s === "Transition Year (TY)") return ["Common Level"];
  if (s === "LCA") return ["Vocational/Practical"];
  if (s === "LCVP") return ["Link Modules + Traditional Subjects"];
  if (s === "SEN") return ["Resource", "Learning Support", "L2LP (Level 1 & 2)"];
  if (s === "Clubs") return ["Sports", "Coding", "Music", "Debating"];
  return ["Common Level"];
}

function Dashboard() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<string>(() => loadTeacherWelcome());

  const navigate = useNavigate();

  // layout metadata (color + order)
  const [meta, setMeta] = useState<MetaStore>(() => loadMeta());
  const dragIdRef = useRef<number | null>(null);

  // header clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [stream, setStream] = useState<Stream>("Junior Cycle");
  const [year, setYear] = useState<YearOption>("1st Year");
  const [level, setLevel] = useState<LevelOption>("Common Level");
  const [subject, setSubject] = useState("Maths");
  const [pickedColour, setPickedColour] = useState(DEFAULT_BG);
  const [creating, setCreating] = useState(false);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editColour, setEditColour] = useState(DEFAULT_BG);
  const [savingEdit, setSavingEdit] = useState(false);

  // mobile timetable quick-view
  const [ttOpen, setTtOpen] = useState(false);
  const [ttMode, setTtMode] = useState<"day" | "week">(
    () => (isLandscapeNow() ? "week" : "day")
  );
  const [ttDay, setTtDay] = useState<DayKey>(() => currentSchoolDay());
  const [ttState, setTtState] = useState<StoredAdminState | null>(() => loadTeacherTimetableLocal());
  const [ttLoading, setTtLoading] = useState(false);
  const [ttError, setTtError] = useState<string | null>(null);
  const [ttDesktopOpen, setTtDesktopOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    apiFetch("/classes")
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];

        setClasses((prev) => {
          // Prefer server truth; keep local extras only if server doesn't have them yet
          const byId = new Map<number, any>();

          arr.forEach((c: any) => byId.set(c.id, c));      // server wins
          prev.forEach((c: any) => {
            if (!byId.has(c.id)) byId.set(c.id, c);        // keep local extras
          });

          return Array.from(byId.values());
        });
      })

      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load classes");
        setClasses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = () => setWelcome(loadTeacherWelcome());
    window.addEventListener("storage", onStorage);

    // also refresh when user comes back to the tab
    const onFocus = () => setWelcome(loadTeacherWelcome());
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const sortedClasses = useMemo(() => {
    const copy = [...classes];
    copy.sort((a, b) => {
      const ao = meta[String(a.id)]?.order ?? 0;
      const bo = meta[String(b.id)]?.order ?? 0;
      return ao - bo;
    });
    return copy;
  }, [classes, meta]);

  const headerDay = now.toLocaleDateString("en-IE", { weekday: "long" });
  const headerDate = now.toLocaleDateString("en-IE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const headerTime = now.toLocaleTimeString("en-IE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  async function loadTimetableReference(preferredMode: "day" | "week") {
    setTtDay(currentSchoolDay());
    setTtMode(preferredMode);
    setTtError(null);

    const local = loadTeacherTimetableLocal();
    if (local) setTtState(local);

    setTtLoading(true);
    try {
      const data = await apiFetch("/teacher-admin/state");
      const serverState = (data as any)?.state as StoredAdminState | null;
      if (serverState?.profile && serverState?.schedule) {
        setTtState(serverState);
        try {
          localStorage.setItem(teacherAdminStorageKeyForUser(), JSON.stringify(serverState));
        } catch { }
      } else if (!local) {
        setTtError("No timetable saved yet.");
      }
    } catch {
      if (!local) setTtError("Could not load timetable.");
    } finally {
      setTtLoading(false);
    }
  }

  async function openTimetableQuickView() {
    setTtOpen(true);
    await loadTimetableReference(isLandscapeNow() ? "week" : "day");
  }

  async function openDesktopTimetableQuickView() {
    setTtDesktopOpen(true);
    await loadTimetableReference("week");
  }

  function timetableCardClass(slot: Slot, hasEntry: boolean) {
    if (slot.kind === "break") return "border-amber-200 bg-amber-50 text-amber-900";
    if (slot.kind === "lunch") return "border-orange-200 bg-orange-50 text-orange-900";
    if (hasEntry) return "border-emerald-200 bg-emerald-50 text-slate-900";
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  function renderDayStack(day: DayKey) {
    if (!ttState?.schedule?.[day]) return null;

    const daySchedule = ttState.schedule[day];

    return (
      <div className="space-y-3">
        {daySchedule.slots.map((slot) => {
          const entry = daySchedule.entries?.[slot.id];
          const hasClass = !!entry?.classLabel?.trim();
          const hasDuty = !!entry?.dutyNote?.trim();

          return (
            <div
              key={`${day}_${slot.id}`}
              className={`rounded-2xl border p-3 ${timetableCardClass(slot, hasClass || hasDuty)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold">{slot.label}</div>
                  <div className="text-xs opacity-80">
                    {slot.start}–{slot.end}
                  </div>
                </div>

                <div className="text-right text-xs opacity-80">
                  {fmtDayLong(day)}
                </div>
              </div>

              <div className="mt-2">
                {hasClass ? (
                  <>
                    <div className="text-base font-extrabold">{entry.classLabel}</div>
                    {entry.room && (
                      <div className="mt-1 text-sm">Room: {entry.room}</div>
                    )}
                  </>
                ) : hasDuty ? (
                  <div className="text-sm font-semibold">{entry.dutyNote}</div>
                ) : (
                  <div className="text-sm opacity-70">Free</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderWeekGrid() {
    if (!ttState?.schedule?.Mon) return null;

    const mondaySlots = ttState.schedule["Mon"].slots;

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[820px] rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
            <div className="p-3">Time</div>
            {TT_DAYS.map((d) => (
              <div key={d} className={`p-3 ${ttDay === d ? "text-emerald-800" : ""}`}>
                {fmtDayLong(d)}
              </div>
            ))}
          </div>

          {mondaySlots.map((rowSlot) => (
            <div key={rowSlot.id} className="grid grid-cols-6 border-b border-slate-100 last:border-b-0">
              <div className="p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">{rowSlot.label}</div>
                <div>{rowSlot.start}–{rowSlot.end}</div>
              </div>

              {TT_DAYS.map((day) => {
                const slot = ttState.schedule[day].slots.find((s) => s.id === rowSlot.id) ?? rowSlot;
                const entry = ttState.schedule[day].entries?.[rowSlot.id];
                const hasClass = !!entry?.classLabel?.trim();
                const hasDuty = !!entry?.dutyNote?.trim();

                return (
                  <div key={`${day}_${rowSlot.id}`} className="p-2">
                    <div className={`rounded-xl border p-2 min-h-[76px] ${timetableCardClass(slot, hasClass || hasDuty)}`}>
                      {hasClass ? (
                        <>
                          <div className="text-xs font-extrabold leading-tight">{entry.classLabel}</div>
                          {entry.room && <div className="mt-1 text-[11px]">Room: {entry.room}</div>}
                        </>
                      ) : hasDuty ? (
                        <div className="text-[11px] font-semibold leading-tight">{entry.dutyNote}</div>
                      ) : (
                        <div className="text-[11px] opacity-70">Free</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function timetableTileVisual(slot: Slot, entry?: TimetableEntry) {
    const hasClass = !!entry?.classLabel?.trim();
    const hasDuty = !!entry?.dutyNote?.trim();

    if (hasClass) {
      const bg = entry?.classId != null
        ? meta[String(entry.classId)]?.color ?? COLOURS[entry.classId % COLOURS.length]?.bg ?? DEFAULT_BG
        : DEFAULT_BG;
      return {
        tile: `border-black/70 ${bg} ${textClassForBg(bg)} shadow-[0_4px_0_rgba(15,23,42,0.18)]`,
        caption: textClassForBg(bg) === "text-white" ? "text-white/85" : "text-slate-700",
      };
    }

    if (slot.kind === "break") {
      return {
        tile: "border-amber-200 bg-amber-50 text-amber-900",
        caption: "text-amber-700",
      };
    }
    if (slot.kind === "lunch") {
      return {
        tile: "border-orange-200 bg-orange-50 text-orange-900",
        caption: "text-orange-700",
      };
    }
    if (hasDuty) {
      return {
        tile: "border-cyan-200 bg-cyan-50 text-cyan-900",
        caption: "text-cyan-700",
      };
    }
    return {
      tile: "border-slate-200 bg-slate-50 text-slate-700",
      caption: "text-slate-500",
    };
  }

  function renderDesktopDayStackBranded(day: DayKey) {
    if (!ttState?.schedule?.[day]) return null;

    const daySchedule = ttState.schedule[day];
    const isToday = currentSchoolDay() === day;

    return (
      <div className="space-y-3">
        {daySchedule.slots.map((slot) => {
          const entry = daySchedule.entries?.[slot.id];
          const visual = timetableTileVisual(slot, entry);
          const hasClass = !!entry?.classLabel?.trim();
          const hasDuty = !!entry?.dutyNote?.trim();

          return (
            <div
              key={`${day}_${slot.id}`}
              className={`rounded-[24px] border p-4 ${visual.tile} ${isToday ? "ring-2 ring-emerald-200/80" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.16em] opacity-80">{slot.label}</div>
                  <div className={`mt-1 text-xs font-semibold ${visual.caption}`}>
                    {slot.start}–{slot.end}
                  </div>
                </div>
                {isToday && (
                  <div className="rounded-full border border-white/40 bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
                    Today
                  </div>
                )}
              </div>

              <div className="mt-3">
                {hasClass ? (
                  <>
                    <div className="text-lg font-black leading-tight">{entry?.classLabel}</div>
                    {entry?.room && <div className={`mt-1 text-sm font-semibold ${visual.caption}`}>Room: {entry.room}</div>}
                  </>
                ) : hasDuty ? (
                  <div className="text-sm font-semibold leading-tight">{entry?.dutyNote}</div>
                ) : (
                  <div className="text-sm font-semibold opacity-70">Free</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function isCompactReferenceSlot(slot: Slot) {
    if (slot.kind === "break" || slot.kind === "lunch") return true;

    const label = String(slot.label ?? "").toLowerCase();
    return label.includes("supervision");
  }

  function desktopTimetableRowClasses(slot: Slot) {
    if (isCompactReferenceSlot(slot)) {
      return {
        cellPad: "p-1.5",
        tile: "min-h-[42px] rounded-[14px] px-3 py-2",
        title: "text-[11px] font-semibold leading-tight",
        room: "hidden",
        free: "text-[11px] font-semibold opacity-70",
        duty: "text-[11px] font-semibold leading-tight",
        timePad: "p-2",
        timeTitle: "font-black uppercase tracking-[0.1em] text-slate-700",
        timeText: "mt-0.5 font-semibold",
      };
    }

    return {
      cellPad: "p-2",
      tile: "min-h-[74px] rounded-[18px] p-2.5",
      title: "text-[13px] font-black leading-tight",
      room: "mt-1 text-[11px] font-semibold",
      free: "text-[11px] font-semibold opacity-70",
      duty: "text-[11px] font-semibold leading-tight",
      timePad: "p-3",
      timeTitle: "font-black uppercase tracking-[0.12em] text-slate-700",
      timeText: "mt-0.5 font-semibold",
    };
  }

 function renderDesktopWeekGridBranded() {
  if (!ttState?.schedule?.Mon) return null;

  const mondaySlots = ttState.schedule["Mon"].slots;
  const today = currentSchoolDay();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px] rounded-[24px] border border-white/70 bg-white/80 shadow-inner backdrop-blur">
        <div className="grid grid-cols-6 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-emerald-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
          <div className="p-3">Time</div>
          {TT_DAYS.map((d) => (
            <div
              key={d}
              className={`p-3 ${today === d ? "bg-emerald-50/80 text-emerald-800" : ""}`}
            >
              <div>{fmtDayLong(d)}</div>
              {today === d && (
                <div className="mt-1 inline-flex rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[9px] font-black text-emerald-700">
                  Today
                </div>
              )}
            </div>
          ))}
        </div>

        {mondaySlots.map((rowSlot) => {
          const rowUi = desktopTimetableRowClasses(rowSlot);

          return (
            <div
              key={rowSlot.id}
              className="grid grid-cols-6 border-b border-slate-100/90 last:border-b-0"
            >
              <div className={`${rowUi.timePad} text-[11px] text-slate-600`}>
                <div className={rowUi.timeTitle}>{rowSlot.label}</div>
                <div className={rowUi.timeText}>
                  {rowSlot.start}–{rowSlot.end}
                </div>
              </div>

              {TT_DAYS.map((day) => {
                const slot =
                  ttState.schedule[day].slots.find((s) => s.id === rowSlot.id) ?? rowSlot;
                const entry = ttState.schedule[day].entries?.[rowSlot.id];
                const visual = timetableTileVisual(slot, entry);
                const hasClass = !!entry?.classLabel?.trim();
                const hasDuty = !!entry?.dutyNote?.trim();

                return (
                  <div
                    key={`${day}_${rowSlot.id}`}
                    className={`${rowUi.cellPad} ${today === day ? "bg-emerald-50/30" : ""}`}
                  >
                    <div className={`border ${rowUi.tile} ${visual.tile}`}>
                      {hasClass ? (
                        <>
                          <div className={rowUi.title}>{entry?.classLabel}</div>
                          {!isCompactReferenceSlot(slot) && entry?.room && (
                            <div className={`${rowUi.room} ${visual.caption}`}>
                              Room: {entry.room}
                            </div>
                          )}
                        </>
                      ) : hasDuty ? (
                        <div className={rowUi.duty}>{entry?.dutyNote}</div>
                      ) : (
                        <div className={rowUi.free}>Free</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

  // Design tokens
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const btn =
    "rounded-2xl border-2 border-slate-300 bg-white px-6 py-3 text-base font-semibold shadow-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnGlow =
    "relative inline-flex items-center gap-3 rounded-2xl border-2 border-emerald-600 " +
    "bg-gradient-to-r from-sky-500 to-emerald-500 " +
    "px-7 py-3 text-base font-extrabold text-white " +
    "shadow-[0_0_18px_rgba(120,120,120,0.35)] " +
    "ring-4 ring-slate-300/60 " +
    "hover:shadow-[0_0_40px_rgba(120,120,120,0.6)] hover:ring-slate-400 " +
    "hover:-translate-y-[2px] hover:scale-[1.03] active:scale-[0.98] " +
    "transition-all duration-200 overflow-hidden " +
    "after:absolute after:top-0 after:left-[-60%] after:h-full after:w-[60%] " +
    "after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent " +
    "after:rotate-12 hover:after:left-[120%] after:transition-all after:duration-700";
  const btnPrimary =
    "rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 active:translate-y-[1px] disabled:opacity-50 ";

  const pill =
    "rounded-full border-2 border-slate-200 bg-slate-50 px-4 py-2 text-sm hover:bg-slate-100 active:translate-y-[1px]";

  const headerBtn =
    "w-32 text-center rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all hover:bg-slate-100 hover:shadow-md hover:-translate-y-[1px] active:translate-y-[0px] w-32 text-center";

  const headerBtnPrimary =
    "w-32 text-center rounded-2xl border border-emerald-600 bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur transition-all hover:bg-emerald-700 hover:border-emerald-700 hover:shadow-md hover:-translate-y-[1px] active:translate-y-[0px] w-32 text-center";

  function swapOrder(dragId: number, overId: number) {
    if (dragId === overId) return;

    setMeta((prev) => {
      const next = { ...prev };
      const aKey = String(dragId);
      const bKey = String(overId);
      const ao = next[aKey]?.order ?? 0;
      const bo = next[bKey]?.order ?? 0;

      next[aKey] = { ...(next[aKey] ?? { color: COLOURS[0].bg, order: ao }), order: bo };
      next[bKey] = { ...(next[bKey] ?? { color: COLOURS[1].bg, order: bo }), order: ao };

      saveMeta(next);
      return next;
    });
  }

  function suggestedName() {
    const subj = subject.trim() || "Subject";

    if (stream === "Transition Year (TY)") return `TY ${subj}`;
    if (stream === "LCA") return `LCA ${subj}`;
    if (stream === "LCVP") return `LCVP ${subj}`;
    if (stream === "SEN") return `SEN ${level} ${subj}`.replace(/\s+/g, " ").trim();
    if (stream === "Clubs") return `Club ${level}`.replace(/\s+/g, " ").trim();

    const lvlSuffix =
      level === "Higher Level"
        ? " (Higher)"
        : level === "Ordinary Level"
          ? " (Ordinary)"
          : "";

    return `${year} ${subj}${lvlSuffix}`.trim();
  }

  function openCreate() {
    setStream("Junior Cycle");
    setYear("1st Year");
    setLevel("Common Level");
    setSubject("Maths");
    setPickedColour(DEFAULT_BG);
    setCreateOpen(true);
  }

  async function createClass() {
    const name = year.trim();
    const subj = subject.trim() || "Subject";
    if (!name) return;

    setCreating(true);
    setError(null);

    try {
      const created = (await apiFetch("/classes", {
        method: "POST",
        body: JSON.stringify({ name, subject: subj }),
      })) as ClassItem;

      console.log("CREATE /classes response:", created);

      const createdFixed: ClassItem = {
        ...created,
        name: (created as any)?.name ?? name,
        subject: (created as any)?.subject ?? subj,
      };

      if (!createdFixed?.id) throw new Error("Create returned no id");

      setClasses((prev) => [createdFixed, ...prev]);

      const fresh = await apiFetch("/classes");
      const arr = Array.isArray(fresh) ? fresh : [];
      setClasses(arr);


      setMeta((prev) => {
        const next = { ...prev };
        const minOrder = Object.values(next).reduce(
          (m, v) => Math.min(m, typeof v?.order === "number" ? v.order : 0),
          999999
        );
        next[String(createdFixed.id)] = {
          color: pickedColour,
          order: Number.isFinite(minOrder) ? minOrder - 1 : 0,
        };
        saveMeta(next);
        return next;
      });

      setCreateOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to create class");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(c: ClassItem) {
    const m = meta[String(c.id)];
    setEditingId(c.id);
    setEditName(c.name || "");
    setEditSubject(c.subject || "");
    setEditColour(m?.color ?? DEFAULT_BG);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (editingId == null) return;

    const name = editName.trim();
    const subj = editSubject.trim();

    if (!name) {
      setError("Class name cannot be empty.");
      return;
    }

    setSavingEdit(true);
    setError(null);

    try {
      // 1) Save name/subject to backend
      const updated = (await apiFetch(`/classes/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ name, subject: subj || "Subject" }),
      })) as ClassItem;


      // update local list
      setClasses((prev) => prev.map((x) => (x.id === editingId ? updated : x)));

      // 2) Save tile colour to local meta
      setMeta((prev) => {
        const next = { ...prev };
        const key = String(editingId);
        const existing = next[key] ?? { color: COLOURS[0].bg, order: 0 };
        next[key] = { ...existing, color: editColour };
        saveMeta(next);
        return next;
      });

      setEditOpen(false);
      setEditingId(null);
    } catch (e: any) {
      setError(e?.message || "Failed to edit class");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="min-h-screen bg-emerald-100">
      {/* Header bar */}
      <header className="border-b-2 border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-6">
          {/* Left brand */}
          <div className="flex items-center gap-5">
            <img src={ELogo2} alt="ELume" className="h-28 w-auto object-contain" />
            <div className="leading-tight">
              <div className="hidden md:block text-5xl font-extrabold tracking-tight text-slate-700"
                style={{ textShadow: "0 3px 8px rgba(0,0,0,0.25)" }}> ELume </div>
              <div className="hidden md:block text-base font-semibold text-slate-500">
                Learn, Grow, Succeed
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-3 md:gap-4">
            {/* ✅ Mobile-only: Admin + Calendar beside logo */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all hover:bg-slate-100"
                type="button"
                onClick={openTimetableQuickView}
              >
                Timetable
              </button>

              <button
                className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all hover:bg-slate-100"
                type="button"
                onClick={() => navigate("/admin")}
              >
                Admin
              </button>

              <button
                className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all hover:bg-slate-100"
                type="button"
                onClick={() => navigate("/calendar")}
              >
                Calendar
              </button>
            </div>

            {/* Desktop-only: Create Resources (primary) */}
            <button
              className={`hidden md:inline-flex ${btnGlow}`}
              type="button"
              onClick={() => navigate("/create-resources")}
              title="AI-powered lesson planning and resource creation"
            >
              <span className="relative flex items-center justify-center">
                {/* pulsing AI halo */}
                <span className="absolute inline-flex h-6 w-6 rounded-full bg-pink-400 opacity-60 animate-[ping_2.2s_ease-out_infinite]"></span>

                {/* brain icon */}
                <span className="relative text-lg leading-none drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                  🧠
                </span>
              </span>

              <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]">Create Resources</span>

              <span className="ml-1 rounded-full bg-white/20 px-2 py-[2px] text-[10px] font-bold tracking-wide text-white border border-white/40">
                AI
              </span>
            </button>

            {/* Admin + Calendar stacked to the right (desktop) */}
            <div className="hidden md:flex flex-col gap-2 items-end">
              <button className={headerBtn} type="button" onClick={() => navigate("/admin")}>
                Admin
              </button>

              <button className={headerBtn} type="button" onClick={() => navigate("/calendar")}>
                Calendar
              </button>
            </div>

            {/* Date card */}
            <div className="hidden md:block rounded-3xl border-2 border-slate-200 bg-slate-50 px-6 py-4 text-right shadow-sm">
              <div className="text-sm font-semibold text-slate-600">{headerDay}</div>
              <div className="text-lg font-extrabold text-slate-800">{headerDate}</div>
              <div className="text-sm font-semibold text-slate-600">{headerTime}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-3xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-5 w-full">
          {/* Mobile layout */}
          <div className="flex items-stretch gap-3 md:hidden">
            <button
              type="button"
              onClick={openCreate}
              className="shrink-0 rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-5 py-2.5 text-xl font-extrabold text-white shadow-md hover:bg-emerald-700 active:translate-y-[1px]"
              style={{ textShadow: "0 2px 4px rgba(0,0,0,0.35)" }}
            >
              + Create Class
            </button>
            <button
              type="button"
              onClick={() => navigate("/planner")}
              title="Open ELume Planner"
              className="group min-w-0 flex-1 flex items-center gap-3 rounded-3xl border-2 border-emerald-200 bg-gradient-to-r from-white via-emerald-50 to-sky-50 px-4 py-2.5 shadow-[0_4px_14px_rgba(16,185,129,0.10)] hover:border-emerald-300 hover:from-emerald-50 hover:to-sky-100 active:translate-y-[1px] transition-all"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white shadow-sm">
                <img
                  src={PlannerLogo}
                  alt="Planner"
                  className="h-8 w-8 object-contain"
                />
              </div>

              <div className="min-w-0 text-left leading-tight">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700/80">
                  ELume Planner
                </div>

                <div className="truncate text-lg font-extrabold tracking-tight text-slate-800">
                  {welcome ? welcome.replace(/^Welcome\s*/i, "Welcome, ") : "Welcome"}
                </div>

                <div className="text-[11px] text-slate-600">
                  Tasks • Week view
                  <span className="ml-1 text-emerald-600 opacity-70 group-hover:opacity-100">→</span>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-3 text-base font-semibold text-slate-700 md:hidden">
            Drag tiles to arrange. Colour + order save on this device.
          </div>

          {/* Desktop layout */}
          <div className="hidden md:flex flex-wrap items-center gap-3 w-full justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-6 py-2.5 text-xl font-extrabold text-white shadow-md hover:bg-emerald-700 active:translate-y-[1px]"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.35)" }}
              >
                + Create Class
              </button>

              <div className="text-base font-semibold text-slate-700">
                Drag tiles to arrange. Colour + order save on this device.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openDesktopTimetableQuickView}
                className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-white via-emerald-50 to-cyan-50 px-5 py-3 text-sm font-semibold text-slate-800 shadow-[0_4px_14px_rgba(16,185,129,0.10)] transition-all hover:border-emerald-300 hover:shadow-md hover:-translate-y-[1px]"
              >
                View Timetable
              </button>

              <button
                type="button"
                onClick={() => navigate("/planner")}
                title="Open ELume Planner"
                className="group min-w-0 flex-1 flex items-center gap-3 rounded-3xl border-2 border-emerald-200 bg-gradient-to-r from-white via-emerald-50 to-sky-50 px-4 py-2.5 shadow-[0_4px_14px_rgba(16,185,129,0.10)] hover:border-emerald-300 hover:from-emerald-50 hover:to-sky-100 active:translate-y-[1px] transition-all"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white shadow-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgb(16 185 129)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="3" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="14" x2="12" y2="14" />
                    <line x1="8" y1="18" x2="16" y2="18" />
                  </svg>
                </div>
                <div className="min-w-0 text-left leading-tight">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700/80">
                    ELume Planner
                  </div>

                  <div className="truncate text-lg font-extrabold tracking-tight text-slate-800">
                    {welcome ? welcome.replace(/^Welcome\s*/i, "Welcome, ") : "Welcome"}
                  </div>

                  <div className="text-[11px] text-slate-600">
                    Tasks • Week view
                    <span className="ml-1 text-emerald-600 opacity-70 group-hover:opacity-100">→</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {loading && (
            <div className={`${card} p-4 text-sm text-slate-600 md:col-span-4`}>
              Loading classes…
            </div>
          )}

          {!loading && sortedClasses.length === 0 && (
            <div className={`${card} p-4 text-sm text-slate-600 md:col-span-4`}>
              No classes yet — click <span className="font-semibold">Create Class</span> to start.
            </div>
          )}

          {!loading &&
            sortedClasses.map((c) => {
              const m = meta[String(c.id)];
              const bg = m?.color ?? COLOURS[c.id % COLOURS.length].bg;
              const txt = textClassForBg(bg);

              return (
                <button
                  key={c.id}
                  type="button"
                  draggable
                  onDragStart={() => (dragIdRef.current = c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const dragId = dragIdRef.current;
                    if (dragId != null) swapOrder(dragId, c.id);
                    dragIdRef.current = null;
                  }}
                  onClick={() => navigate(`/class/${c.id}`)}
                  className={`group relative h-44 w-full rounded-3xl border-[5px] border-black ${bg} ${txt}
                    shadow-[0_4px_0_rgba(15,23,42,0.16)]
                    transition-all duration-200
                    hover:-translate-y-[2px] hover:shadow-[0_12px_26px_rgba(0,0,0,0.22)]
                    hover:ring-4 hover:ring-white/60
                    active:translate-y-[1px] active:scale-[0.98]
                    flex items-center justify-center p-4`}
                  title="Open class"
                >
                  {/* Delete class button */}
                  <div
                    onClick={async (e) => {
                      e.stopPropagation();

                      const confirmed = window.confirm(
                        "Are you sure you want to delete this class?"
                      );
                      if (!confirmed) return;

                      try {
                        await apiFetch(`/classes/${c.id}`, { method: "DELETE" });

                        // refresh tiles
                        setClasses((prev) => prev.filter(cls => cls.id !== c.id));
                      } catch (err) {
                        alert("Could not delete class");
                      }
                    }}
                    className="absolute bottom-2 right-2 opacity-70 hover:opacity-100"
                    title="Delete class"
                  >
                    🗑️
                  </div>

                  <div className="text-center">
                    <div
                      className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight"
                      style={{ textShadow: "0 3px 6px rgba(0,0,0,0.45)" }}
                    >
                      {c.name}
                    </div>

                    <div
                      className="mt-1 text-xl md:text-2xl font-semibold tracking-wide text-white/95"
                      style={{ textShadow: "0 2px 5px rgba(0,0,0,0.4)" }}
                    >
                      {c.subject}
                    </div>
                    <div className="mt-3 inline-flex items-center justify-center rounded-full bg-white/20 px-4 py-1.5 text-xs font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      Click to open • Drag to arrange
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </main>

      {/* Mobile Timetable Quick View */}
      {ttOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 p-3 md:hidden">
          <div className="mx-auto mt-2 max-w-md rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <div className="text-lg font-extrabold tracking-tight text-slate-800">Timetable</div>
                <div className="text-xs text-slate-500">
                  {ttMode === "day"
                    ? `${fmtDayLong(ttDay)} at a glance`
                    : "Weekly overview • rotate phone for best view"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTtOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTtMode("day")}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${ttMode === "day"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-800"
                    }`}
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => setTtMode("week")}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${ttMode === "week"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-800"
                    }`}
                >
                  Week
                </button>
              </div>

              {ttMode === "day" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {TT_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTtDay(d)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${ttDay === d
                        ? "border-sky-300 bg-sky-50 text-sky-900"
                        : "border-slate-200 bg-white text-slate-700"
                        }`}
                    >
                      {fmtDayLong(d)}
                      {currentSchoolDay() === d ? " • Today" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="max-h-[78vh] overflow-auto px-4 py-4">
              {ttLoading && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Loading timetable…
                </div>
              )}

              {!ttLoading && ttError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  {ttError}
                </div>
              )}

              {!ttLoading && !ttError && !ttState && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No timetable found yet. Set it up in Admin first.
                </div>
              )}

              {!ttLoading && !ttError && ttState && (
                <>
                  {ttMode === "day" ? renderDayStack(ttDay) : renderWeekGrid()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {ttDesktopOpen && (
        <div className="fixed inset-0 z-50 hidden bg-slate-950/45 p-6 backdrop-blur-sm md:block">
          <div className="mx-auto mt-3 max-w-[1240px] overflow-hidden rounded-[30px] border border-white/70 bg-white/88 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 bg-gradient-to-r from-white via-emerald-50/70 to-cyan-50/70 px-6 py-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Quick Reference</div>
                <div className="mt-1 text-2xl font-black tracking-tight text-slate-900">Timetable</div>
                <div className="mt-1 text-xs text-slate-600">
                  Weekly snapshot with your live Teacher Admin colours and layout.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden lg:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTtMode("day")}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${ttMode === "day"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700"
                      }`}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setTtMode("week")}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${ttMode === "week"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700"
                      }`}
                  >
                    Week
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setTtDesktopOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[82vh] overflow-auto px-5 py-4">
              {ttLoading && (
                <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  Loading timetable…
                </div>
              )}

              {!ttLoading && ttError && (
                <div className="rounded-[26px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
                  {ttError}
                </div>
              )}

              {!ttLoading && !ttError && !ttState && (
                <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  No timetable found yet. Set it up in Admin first.
                </div>
              )}

              {!ttLoading && !ttError && ttState && (
                <div className="space-y-5">
                  {ttMode === "day" && (
                    <div className="flex flex-wrap gap-2">
                      {TT_DAYS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setTtDay(d)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${ttDay === d
                            ? "border-sky-300 bg-sky-50 text-sky-900"
                            : "border-slate-200 bg-white text-slate-700"
                            }`}
                        >
                          {fmtDayLong(d)}
                          {currentSchoolDay() === d ? " • Today" : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  {ttMode === "day" ? renderDesktopDayStackBranded(ttDay) : renderDesktopWeekGridBranded()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-extrabold tracking-tight">Create a new class</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Choose stream/year/level and a tile colour.
                  </div>
                </div>
                <button className={pill} type="button" onClick={() => setCreateOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">Stream</div>
                  <select
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={stream}
                    onChange={(e) => {
                      const s = e.target.value as Stream;
                      setStream(s);
                      const years = yearOptionsForStream(s);
                      const y = years[0];
                      setYear(y);
                      const lvls = levelOptionsForStream(s, y);
                      setLevel(lvls[0]);
                    }}
                  >
                    <option>Junior Cycle</option>
                    <option>Senior Cycle</option>
                    <option>Transition Year (TY)</option>
                    <option>LCA</option>
                    <option>LCVP</option>
                    <option>SEN</option>
                    <option>Clubs</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">Year</div>
                  <select
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={year}
                    onChange={(e) => {
                      const y = e.target.value as YearOption;
                      setYear(y);
                      const lvls = levelOptionsForStream(stream, y);
                      setLevel(lvls[0]);
                    }}
                  >
                    {yearOptionsForStream(stream).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">Level</div>
                  <select
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={level}
                    onChange={(e) => setLevel(e.target.value as LevelOption)}
                  >
                    {levelOptionsForStream(stream, year).map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">Subject</div>
                  <input
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Maths, Physics, English"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-2 text-sm font-bold text-slate-700">Tile colour</div>
                  <div className="grid grid-cols-10 gap-2">
                    {COLOURS.map((c) => {
                      const selected = pickedColour === c.bg;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setPickedColour(c.bg)}
                          className={`h-9 w-9 rounded-2xl border-2 border-white ${c.bg}
                            ring-2 ${selected ? c.ring : "ring-transparent"} hover:brightness-110`}
                          title={c.name}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button className={pill} type="button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={createClass} disabled={creating}>
                  {creating ? "Creating…" : "Create Class"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-extrabold tracking-tight">Edit class</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Update name/subject and choose a tile colour.
                  </div>
                </div>
                <button className={pill} type="button" onClick={() => setEditOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">Class name</div>
                  <input
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. 6th Year Maths"
                  />
                </div>

                <div>
                  <div className="mb-1 text-sm font-bold text-slate-700">Subject</div>
                  <input
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="e.g. Maths"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-2 text-sm font-bold text-slate-700">Tile colour</div>
                  <div className="grid grid-cols-10 gap-2">
                    {COLOURS.map((c) => {
                      const selected = editColour === c.bg;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setEditColour(c.bg)}
                          className={`h-9 w-9 rounded-2xl border-2 border-white ${c.bg}
                            ring-2 ${selected ? c.ring : "ring-transparent"} hover:brightness-110`}
                          title={c.name}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button className={pill} type="button" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "Saving…" : "Save changes"}
                </button>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Note: name/subject save to the database (requires PUT endpoint). Colour saves locally.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const [isAuthed, setIsAuthed] = useState(() => !!getToken());
  const userEmail = useMemo(() => getEmailFromToken(), [isAuthed]);
  const userLabel = userEmail ?? "";
  const pilotUsers = new Set(["admin@elume.ie", "rob@elume.ie", "emma@elume.ie", "gillian@elume.ie"]);
  const isPilotUser = userEmail ? pilotUsers.has(userEmail.toLowerCase()) : false;
  const location = useLocation();
  const navigate = useNavigate();

  // Dashboard is the root route in App.tsx
  const isDashboard = location.pathname === "/";

  // Public routes should NOT require login
  const isPublicRoute =
    location.pathname.startsWith("/s/") ||
    location.pathname === "/student" ||
    location.pathname.startsWith("/student/") ||
    location.pathname.startsWith("/join/") ||
    location.pathname.startsWith("/collab/join/") ||
    location.pathname.startsWith("/reset-password");

  function logout() {
    clearToken();
    setIsAuthed(false);
  }

  if (!isAuthed && !isPublicRoute) {
    return <LoginPage onLoggedIn={() => setIsAuthed(true)} />;
  }

  return (
    <>
      {/* GLOBAL TOP BAR */}
      {!isPublicRoute && (

        <div className="flex items-center justify-between px-6 py-3 border-b bg-white">
          {/* ✅ Logo only (no text) -> Dashboard */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-xl p-1 hover:bg-slate-100"
            title="Back to Dashboard"
          >
            <img src={ELogo2} alt="Elume" className="h-9 w-9 object-contain" />
          </button>

          <button
            onClick={logout}
            className="rounded-xl border-2 border-slate-200 px-4 py-1 font-semibold hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      )}
      {/* APP ROUTES */}
      <Routes>
        <Route path="/join/:code" element={<StudentJoinQuizPage />} />
        <Route path="/class/:id" element={<ClassPage />} />
        <Route path="/class/:id/seating-plan" element={<SeatingPlanPage />} />
        <Route path="/class/:id/live-quiz" element={<LiveQuizPage />} />
        <Route path="/whiteboard/:id" element={<WhiteBoardPage />} />
        <Route path="/class/:id/notes" element={<NotesPage />} />
        <Route path="/class/:id/exam-papers" element={<ExamPapersPage />} />
        <Route path="/class/:id/videos" element={<VideosPage />} />
        <Route path="/class/:id/links" element={<LinksPage />} />
        <Route path="/class/:id/quizzes" element={<QuizzesPage />} />
        <Route path="/class/:id/tests" element={<Tests />} />
        <Route path="/class/:id/calendar" element={<CalendarPage />} />
        <Route path="/class/:id/admin" element={<ClassAdminPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/student/:token" element={<StudentClassPage />} />
        <Route path="/s/:token" element={<StudentClassPage />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<TeacherAdminPage />} />
        <Route path="/admin-users" element={<AdminUsersPage />} />
        <Route path="/class/:id/report" element={<ClassReportPage />} />
        <Route path="/class/:id/student-report/:studentId" element={<StudentReportPage />} />
        <Route path="/collab/join/:code" element={<StudentCollabRoomPage />} />
        <Route path="/class/:id/collaboration" element={<CollaborationPage />} />
        <Route path="/planner" element={<TeacherPlanner />} />
        <Route path="/create-resources" element={<CreateResources />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>

      {!location.pathname.startsWith("/join/") &&
        location.pathname !== "/student" &&
        !location.pathname.startsWith("/student/") &&
        !location.pathname.startsWith("/s/") &&
        !location.pathname.startsWith("/collab/join/") &&
        !location.pathname.startsWith("/reset-password") && (
          <footer className="mt-10 border-t border-slate-200/80 bg-white/85 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-sm text-slate-600 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <div className="text-xs sm:text-sm">© 2026 Elume. All rights reserved.</div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm">
                <Link
                  to="/legal"
                  className="font-medium text-slate-600 transition hover:text-emerald-700 hover:underline underline-offset-4"
                >
                  Legal & Privacy
                </Link>

                <a
                  href="mailto:admin@elume.ie"
                  className="font-medium text-slate-600 transition hover:text-emerald-700 hover:underline underline-offset-4"
                >
                  admin@elume.ie
                </a>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70">
              <div className="mx-auto max-w-7xl px-4 py-3 text-[11px] leading-relaxed text-slate-500 sm:px-6 lg:px-8">
                Elume is operated in Ireland. For legal, privacy, or data queries, contact admin@elume.ie.
              </div>
            </div>
          </footer>
        )}


      {userEmail && (
        <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
          {isDashboard && isPilotUser && (
            <img
              src={pilotUserBadge}
              alt="Pilot User"
              className="hidden md:block w-[75px] h-auto object-contain drop-shadow-md"
            />
          )}

          <div className="rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-[10px] leading-tight text-slate-600 shadow-sm">
            <div className="opacity-70">Signed in</div>
            <div className="font-semibold truncate max-w-[140px]">{userEmail}</div>
          </div>
        </div>
      )}
    </>
  );
}
