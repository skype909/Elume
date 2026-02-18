import { Routes, Route, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import ClassPage from "./ClassPage";
import WhiteboardPage from "./WhiteboardPage";
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



import elumeLogo from "./assets/elume-logo.png";
import ELogo from "./assets/ELogo.png";
import ELogo2 from "./assets/ELogo2.png";


type ClassItem = {
  id: number;
  name: string;
  subject: string;
};

const API_BASE = "http://localhost:8000";

// local-only metadata (color + order)
type ClassMeta = {
  color: string;
  order: number;
};
type MetaStore = Record<string, ClassMeta>;
const META_KEY = "elume_class_layout_v1";

// 20 bright classroom colours
const COLOURS: { name: string; bg: string; ring: string }[] = [
  { name: "Emerald", bg: "bg-emerald-600", ring: "ring-emerald-200" },
  { name: "Teal", bg: "bg-teal-600", ring: "ring-teal-200" },
  { name: "Cyan", bg: "bg-cyan-600", ring: "ring-cyan-200" },
  { name: "Sky", bg: "bg-sky-600", ring: "ring-sky-200" },
  { name: "Blue", bg: "bg-blue-700", ring: "ring-blue-200" },
  { name: "Indigo", bg: "bg-indigo-700", ring: "ring-indigo-200" },
  { name: "Violet", bg: "bg-violet-700", ring: "ring-violet-200" },
  { name: "Purple", bg: "bg-purple-700", ring: "ring-purple-200" },
  { name: "Slate", bg: "bg-slate-800", ring: "ring-slate-300" },
  { name: "Charcoal", bg: "bg-zinc-800", ring: "ring-zinc-300" },
];

const DEFAULT_BG = COLOURS[0]?.bg ?? "bg-emerald-500";

function loadMeta(): MetaStore {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MetaStore;
  } catch {
    return {};
  }
}

function saveMeta(meta: MetaStore) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function textClassForBg(bg: string) {
  if (bg.includes("yellow") || bg.includes("amber")) return "text-slate-900";
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

  const navigate = useNavigate();

  // layout metadata (color + order)
  const [meta, setMeta] = useState<MetaStore>(() => loadMeta());
  const dragIdRef = useRef<number | null>(null);

  // header clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [stream, setStream] = useState<Stream>("Junior Cycle");
  const [year, setYear] = useState<YearOption>("1st Year");
  const [level, setLevel] = useState<LevelOption>("Common Level");
  const [subject, setSubject] = useState("Maths");
  const [customName, setCustomName] = useState("");
  const [pickedColour, setPickedColour] = useState(DEFAULT_BG);
  const [creating, setCreating] = useState(false);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editColour, setEditColour] = useState(DEFAULT_BG);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/classes`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Classes fetch failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        const arr = Array.isArray(data) ? (data as ClassItem[]) : [];
        setClasses(arr);

        // Ensure each class has metadata
        setMeta((prev) => {
          const next = { ...prev };

          const orders = Object.values(next)
            .map((m) => (typeof m?.order === "number" ? m.order : 0))
            .filter((n) => Number.isFinite(n));
          let maxOrder = orders.length ? Math.max(...orders) : 0;

          for (const c of arr) {
            const key = String(c.id);
            if (!next[key]) {
              maxOrder += 1;
              next[key] = {
                color: COLOURS[(c.id - 1) % COLOURS.length].bg,
                order: maxOrder,
              };
            }
          }

          saveMeta(next);
          return next;
        });
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load classes");
        setClasses([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
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
    second: "2-digit",
  });

  // Design tokens
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const btn =
    "rounded-2xl border-2 border-slate-300 bg-white px-6 py-3 text-base font-semibold shadow-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary =
    "rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 active:translate-y-[1px] disabled:opacity-50";
  const pill =
    "rounded-full border-2 border-slate-200 bg-slate-50 px-4 py-2 text-sm hover:bg-slate-100 active:translate-y-[1px]";

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
    setCustomName("");
    setPickedColour(DEFAULT_BG);
    setCreateOpen(true);
  }

  async function createClass() {
    const name = (customName.trim() || suggestedName()).trim();
    const subj = subject.trim() || "Subject";
    if (!name) return;

    setCreating(true);
    setError(null);

    try {
      const r = await fetch(`${API_BASE}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject: subj }),
      });

      if (!r.ok) throw new Error(`Create class failed (${r.status})`);
      const created = (await r.json()) as ClassItem;

      setClasses((prev) => [created, ...prev]);

      setMeta((prev) => {
        const next = { ...prev };
        const minOrder = Object.values(next).reduce(
          (m, v) => Math.min(m, typeof v?.order === "number" ? v.order : 0),
          999999
        );
        next[String(created.id)] = {
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
      const r = await fetch(`${API_BASE}/classes/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject: subj || "Subject" }),
      });

      if (!r.ok) {
        throw new Error(
          `Edit failed (${r.status}). Add PUT /classes/{id} on backend.`
        );
      }

      const updated = (await r.json()) as ClassItem;

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
            <img src={ELogo2} alt="ELume" className="h-28 w-auto object-contain"/>
            <div className="leading-tight">
            <div className="text-5xl font-extrabold tracking-tight text-slate-700"
     style={{ textShadow: "0 3px 8px rgba(0,0,0,0.25)" }}> ELume </div>
              <div className="text-base font-semibold text-slate-500">Learn, Grow, Succeed</div>
            </div>
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-4">
            <button className={btn} type="button" onClick={() => alert("Admin coming soon")}>
              Admin
            </button>

            <button className={btnPrimary} type="button" onClick={() => navigate("/calendar")}>
              Calendar
            </button>

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

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button className={btnPrimary} type="button" onClick={openCreate}>
            + Create Class
          </button>

          <div className="text-base font-semibold text-slate-700">
            Drag tiles to arrange. Colour + order save on this device.
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
              const bg = m?.color ?? "bg-blue-500";
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
                  {/* Edit button (top-right) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(c);
                    }}
                    className="absolute right-3 top-3 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur hover:bg-white/30"
                    title="Edit class"
                  >
                    Edit
                  </button>
                  <div className="text-center">
                    <div className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight drop-shadow-md">
                      {c.name}
                    </div>
                    <div className="mt-1 text-xl md:text-2xl font-semibold tracking-wide text-white/95 drop-shadow-md">
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

        <div className="mt-8 text-xs text-slate-500">© 2026 ELume Beta. P Fitzgerald</div>
      </main>

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
                  <div className="mb-1 text-sm font-bold text-slate-700">
                    Class name (optional override)
                  </div>
                  <input
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={`Suggested: ${suggestedName()}`}
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    If blank, ELume will use:{" "}
                    <span className="font-semibold">{suggestedName()}</span>
                  </div>
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
  return (
    <Routes>
      {/* Student join MUST be above "/" */}
      <Route path="/join/:code" element={<StudentJoinQuizPage />} />

      {/* Teacher pages */}
      <Route path="/class/:id" element={<ClassPage />} />
      <Route path="/class/:id/seating-plan" element={<SeatingPlanPage />} />
      <Route path="/class/:id/live-quiz" element={<LiveQuizPage />} />
      <Route path="/whiteboard/:id" element={<WhiteboardPage />} />
      <Route path="/class/:id/notes" element={<NotesPage />} />
      <Route path="/class/:id/exam-papers" element={<ExamPapersPage />} />
      <Route path="/class/:id/videos" element={<VideosPage />} />
      <Route path="/class/:id/links" element={<LinksPage />} />
      <Route path="/class/:id/quizzes" element={<QuizzesPage />} />
      <Route path="/class/:id/tests" element={<Tests />} />
      <Route path="/class/:id/calendar" element={<CalendarPage />} />
      <Route path="/class/:id/admin" element={<ClassAdminPage />} />
      <Route path="/calendar" element={<CalendarPage />} />

      {/* Dashboard LAST */}
      <Route path="/" element={<Dashboard />} />
    </Routes>
  );
}
