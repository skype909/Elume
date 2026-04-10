import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";

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

type AIParseResponse = {
  draft: {
    class_id: number | null;
    title: string;
    description?: string | null;
    event_date: string;
    end_date?: string | null;
    all_day: boolean;
    event_type: string;
  };
  warnings: string[];
};

function toISODate(value: string): string {
  if (!value) return "";
  if (value.length >= 10 && value[4] === "-" && value[7] === "-") return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const todayISO = new Date().toISOString().slice(0, 10);

function toLocalTimeHHMM(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function combineDateTime(dateYMD: string, timeHHMM: string): string {
  const t = timeHHMM || "09:00";
  const d = new Date(`${dateYMD}T${t}:00`);
  return d.toISOString();
}

function eventTypeMeta(t: string) {
  switch ((t || "").toLowerCase()) {
    case "test":
      return {
        dot: "bg-rose-500",
        soft: "border-rose-200 bg-rose-50 text-rose-800",
        chip: "bg-rose-100 text-rose-700 border-rose-200",
        accent: "from-rose-500/12 via-pink-500/8 to-white",
      };
    case "homework":
      return {
        dot: "bg-amber-500",
        soft: "border-amber-200 bg-amber-50 text-amber-800",
        chip: "bg-amber-100 text-amber-700 border-amber-200",
        accent: "from-amber-500/12 via-yellow-400/8 to-white",
      };
    case "trip":
      return {
        dot: "bg-sky-500",
        soft: "border-sky-200 bg-sky-50 text-sky-800",
        chip: "bg-sky-100 text-sky-700 border-sky-200",
        accent: "from-sky-500/12 via-cyan-400/8 to-white",
      };
    default:
      return {
        dot: "bg-emerald-500",
        soft: "border-emerald-200 bg-emerald-50 text-emerald-800",
        chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
        accent: "from-emerald-500/12 via-teal-400/8 to-white",
      };
  }
}

function formatEventTypeLabel(t: string) {
  if (!t) return "General";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function CalendarPage() {
  const { id } = useParams();
  const routeClassId = useMemo(() => Number(id), [id]);
  const hasRouteClass = Number.isFinite(routeClassId) && routeClassId > 0;

  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  type FilterMode = "all" | "global" | "class";
  const [filterMode, setFilterMode] = useState<FilterMode>(hasRouteClass ? "class" : "all");
  const [filterClassId, setFilterClassId] = useState<number>(hasRouteClass ? routeClassId : 1);

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [showModal, setShowModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("09:30");
  const [draftEndTime, setDraftEndTime] = useState("");
  const [draftAllDay, setDraftAllDay] = useState(false);
  const [draftType, setDraftType] = useState("general");
  const [draftDesc, setDraftDesc] = useState("");

  type DraftScope = "global" | "class";
  const [draftScope, setDraftScope] = useState<DraftScope>("global");
  const [draftClassId, setDraftClassId] = useState<number>(1);

  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<AIParseResponse | null>(null);

  useEffect(() => {
    apiFetch("/classes")
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!classes.length) return;

    const firstClassId = classes[0]?.id;
    if (!firstClassId) return;

    if (!hasRouteClass && !classes.some((c) => c.id === filterClassId)) {
      setFilterClassId(firstClassId);
    }

    if (!hasRouteClass && draftScope === "class" && !classes.some((c) => c.id === draftClassId)) {
      setDraftClassId(firstClassId);
    }
  }, [classes, hasRouteClass, filterClassId, draftClassId, draftScope]);

  useEffect(() => {
    if (hasRouteClass) {
      setFilterMode("class");
      setFilterClassId(routeClassId);
    }
  }, [hasRouteClass, routeClassId]);

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      let url = `/calendar-events`;

      if (hasRouteClass) {
        url += `?class_id=${routeClassId}`;
      } else if (filterMode === "global") {
        url += `?global_only=true`;
      } else if (filterMode === "class") {
        url += `?class_id=${filterClassId}`;
      }

      const data = await apiFetch(url);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [filterMode, filterClassId, hasRouteClass, routeClassId]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const iso = toISODate(e.event_date);
      if (!iso) continue;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(e);
    }
    Array.from(map.keys()).forEach((k) => {
      const arr = map.get(k) || [];
      arr.sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "") || b.id - a.id);
      map.set(k, arr);
    });
    return map;
  }, [events]);

  const classById = useMemo(() => {
    const m = new Map<number, ClassItem>();
    for (const c of classes) m.set(c.id, c);
    return m;
  }, [classes]);

  function classLabel(classId: number | null) {
    if (!classId) return "";
    const c = classById.get(classId);
    if (!c) return `Class ${classId}`;
    return c.subject ? `${c.name} • ${c.subject}` : c.name;
  }

  const visibleYear = visibleMonth.getFullYear();
  const visibleMonthIndex = visibleMonth.getMonth();
  const daysInMonth = new Date(visibleYear, visibleMonthIndex + 1, 0).getDate();
  const firstDay = new Date(visibleYear, visibleMonthIndex, 1).getDay();
  const offset = (firstDay + 6) % 7;

  const monthLabel = visibleMonth.toLocaleString("en-IE", {
    month: "long",
    year: "numeric",
  });

  const totalVisibleMonthEvents = useMemo(() => {
    return events.filter((e) => {
      const d = new Date(e.event_date);
      return d.getFullYear() === visibleYear && d.getMonth() === visibleMonthIndex;
    }).length;
  }, [events, visibleYear, visibleMonthIndex]);

  function resetDraft() {
    setDraftTitle("");
    setDraftDesc("");
    setDraftType("general");
    setDraftAllDay(false);
    const localTodayISO = new Date().toISOString().slice(0, 10);
    setDraftDate(localTodayISO);
    setDraftTime("09:30");
    setDraftEndTime("");
    setDraftScope(hasRouteClass ? "class" : "global");
    setDraftClassId(hasRouteClass ? routeClassId : classes?.[0]?.id ?? 1);
  }

  function hydrateDraftFromAIDraft(draft: AIParseResponse["draft"]) {
    setDraftTitle(draft.title || "");
    setDraftDesc(draft.description || "");
    setDraftType(draft.event_type || "general");
    setDraftAllDay(Boolean(draft.all_day));
    setDraftDate(toISODate(draft.event_date) || new Date().toISOString().slice(0, 10));
    setDraftTime(toLocalTimeHHMM(draft.event_date) || "09:30");
    setDraftEndTime(toLocalTimeHHMM(draft.end_date) || "");
    setDraftScope(draft.class_id ? "class" : hasRouteClass ? "class" : "global");
    setDraftClassId(draft.class_id ?? (hasRouteClass ? routeClassId : classes?.[0]?.id ?? 1));
  }

  function openCreate(prefillISO?: string) {
    setErr(null);
    setEditingEventId(null);
    setAiPreview(null);
    resetDraft();
    if (prefillISO) setDraftDate(prefillISO);
    setShowModal(true);
  }

  function openEdit(ev: CalendarEvent) {
    setErr(null);
    setAiPreview(null);
    setEditingEventId(ev.id);

    setDraftTitle(ev.title || "");
    setDraftDesc(ev.description || "");
    setDraftType(ev.event_type || "general");
    setDraftAllDay(Boolean(ev.all_day));

    const ymd = toISODate(ev.event_date) || new Date().toISOString().slice(0, 10);
    setDraftDate(ymd);

    const startHHMM = toLocalTimeHHMM(ev.event_date) || "09:30";
    setDraftTime(startHHMM);

    const endHHMM = toLocalTimeHHMM(ev.end_date) || "";
    setDraftEndTime(endHHMM);

    setDraftScope(ev.class_id ? "class" : "global");
    setDraftClassId(ev.class_id ?? (hasRouteClass ? routeClassId : classes?.[0]?.id ?? 1));

    setShowModal(true);
  }

  function currentTargetClassId(): number | null {
    if (hasRouteClass) return routeClassId;
    if (filterMode === "class") return filterClassId;
    return null;
  }

  async function saveEvent() {
    const title = draftTitle.trim();
    if (!title || !draftDate) {
      setErr("Please enter a title and date.");
      return;
    }

    const classIdToSave = draftScope === "class" ? draftClassId : null;

    const startISO = draftAllDay
      ? combineDateTime(draftDate, "09:00")
      : combineDateTime(draftDate, draftTime || "09:30");

    const endISO = draftEndTime && !draftAllDay ? combineDateTime(draftDate, draftEndTime) : null;

    const body = {
      class_id: classIdToSave,
      title,
      description: draftDesc.trim() || null,
      event_date: startISO,
      end_date: endISO,
      all_day: draftAllDay,
      event_type: draftType,
    };

    try {
      setErr(null);

      if (editingEventId) {
        await apiFetch(`/calendar-events/${editingEventId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/calendar-events`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      setShowModal(false);
      setEditingEventId(null);
      setAiPreview(null);
      resetDraft();
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    }
  }

  async function deleteEvent() {
    if (!editingEventId) return;
    const ok = window.confirm("Delete this event? This cannot be undone.");
    if (!ok) return;

    try {
      setErr(null);
      await apiFetch(`/calendar-events/${editingEventId}`, { method: "DELETE" });
      setShowModal(false);
      setEditingEventId(null);
      setAiPreview(null);
      resetDraft();
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  }

  async function deleteEventById(eventId: number) {
    const ok = window.confirm("Delete this event? This cannot be undone.");
    if (!ok) return;

    try {
      setErr(null);
      await apiFetch(`/calendar-events/${eventId}`, { method: "DELETE" });

      if (editingEventId === eventId) {
        setEditingEventId(null);
        resetDraft();
      }

      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  }

  async function runAIParse() {
    const text = aiText.trim();
    if (!text) return;

    setAiBusy(true);
    setErr(null);
    setAiPreview(null);

    try {
      const data = (await apiFetch(`/ai/parse-event`, {
        method: "POST",
        body: JSON.stringify({
          text,
          class_id: currentTargetClassId(),
          timezone: "Europe/Dublin",
          default_duration_minutes: 60,
        }),
      })) as AIParseResponse;

      setEditingEventId(null);
      setAiPreview(data);
      hydrateDraftFromAIDraft(data.draft);
      setShowModal(true);
    } catch (e: any) {
      setErr(e?.message || "AI parse failed");
    } finally {
      setAiBusy(false);
    }
  }

  const pageTitle = hasRouteClass ? "Class Calendar" : "Calendar";

  const subTitle = hasRouteClass
    ? "Keep class events tidy, visible, and easy to update."
    : filterMode === "all"
      ? "See everything at a glance across classes and school-wide events."
      : filterMode === "global"
        ? "Showing school-wide events only."
        : `Showing events for ${classLabel(filterClassId) || `Class ${filterClassId}`}.`;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f2c14e_0%,#efbe49_30%,#ebb84a_64%,#e5af42_100%)]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6">
        <div className="rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,253,245,0.9),rgba(239,246,255,0.88))] p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <button
              onClick={() => (hasRouteClass ? navigate(`/class/${routeClassId}`) : navigate(`/`))}
              className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-[1px] hover:bg-slate-50"
              type="button"
            >
              ← Back
            </button>

            <div className="min-w-[220px] flex-1">
              <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                Elume Calendar
              </div>
              <div className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                {pageTitle}
              </div>
              <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                {subTitle}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
                  {totalVisibleMonthEvents} event{totalVisibleMonthEvents === 1 ? "" : "s"} this month
                </div>
                <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800">
                  AI-assisted planning
                </div>
                {hasRouteClass && (
                  <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800">
                    {classLabel(routeClassId)}
                  </div>
                )}
              </div>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => openCreate()}
                className="rounded-2xl bg-[linear-gradient(90deg,#4fb788,#5ec7d8)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:-translate-y-[1px]"
                type="button"
              >
                + New Event
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr,1.45fr]">
          {!hasRouteClass ? (
            <div className="rounded-[24px] border border-white/90 bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    View
                  </div>
                  <div className="mt-1 text-lg font-black tracking-tight text-slate-900">
                    Filter events
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  Quick switch
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                    filterMode === "all"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  type="button"
                  onClick={() => setFilterMode("all")}
                >
                  All events
                </button>

                <button
                  className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                    filterMode === "global"
                      ? "border-sky-300 bg-sky-50 text-sky-800 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  type="button"
                  onClick={() => setFilterMode("global")}
                >
                  Global only
                </button>

                <button
                  className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                    filterMode === "class"
                      ? "border-violet-300 bg-violet-50 text-violet-800 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  type="button"
                  onClick={() => setFilterMode("class")}
                >
                  Class
                </button>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => navigate(`/planner`)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] border border-emerald-200 bg-emerald-50/85 px-4 py-3.5 text-base font-bold text-emerald-900 shadow-sm transition hover:bg-white"
                >
                  <span className="text-lg leading-none">🗂️</span>
                  <span>↻ Planner</span>
                </button>
              </div>

              {filterMode === "class" && (
                <div className="mt-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Selected class
                  </label>
                  <select
                    value={filterClassId}
                    onChange={(e) => setFilterClassId(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-200 focus:bg-white"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.subject ? `${c.name} • ${c.subject}` : c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,253,245,0.94),rgba(240,253,250,0.9))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <div className="flex h-full flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800">
                    Class Calendar
                  </div>
                  <div className="mt-3 text-lg font-black tracking-tight text-slate-900">
                    Focused class view
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Events here are linked directly to this class.
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/planner`)}
                    className="mt-4 inline-flex items-center gap-2 rounded-[22px] border border-emerald-200 bg-white/85 px-4 py-2.5 text-sm font-bold text-emerald-900 transition hover:bg-white"
                  >
                    <span className="text-base leading-none">🗂️</span>
                    <span>↻ Planner</span>
                  </button>
                </div>

                <button
                  onClick={() => openCreate()}
                  className="rounded-2xl bg-[linear-gradient(90deg,#33b17a,#58c7cf)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.18)] transition hover:-translate-y-[1px]"
                  type="button"
                >
                  + New Event
                </button>
              </div>
            </div>
          )}

          <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.94),rgba(239,246,255,0.94))] p-5 shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800">
                  AI Calendar Assistant
                </div>
                <div className="mt-3 text-xl font-black tracking-tight text-slate-950">
                  Turn a quick thought into a proper event
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Try something like <span className="font-semibold">“6th year maths test next Friday at 9:30”</span>
                </div>
              </div>

              <button
                onClick={runAIParse}
                disabled={aiBusy || !aiText.trim()}
                className="group relative overflow-hidden rounded-2xl bg-[linear-gradient(90deg,#17663d,#23985d)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(20,83,45,0.28)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(20,83,45,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                {aiBusy ? "Generating…" : "Generate"}
              </button>
            </div>

            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={3}
              className="mt-4 w-full rounded-[24px] border border-emerald-100 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-200 focus:ring-4 focus:ring-emerald-100/70"
              placeholder="e.g. Staff meeting next Monday at 3pm"
            />

            {aiPreview && (
              <div className="mt-4 rounded-[24px] border border-emerald-200 bg-white/85 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">AI suggestion ready</div>
                    <div className="mt-1 text-sm text-slate-600">
                      We’ve opened it in the event modal so you can review and adjust it.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    Reopen review
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {err}
          </div>
        )}

        {loading && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
            Loading…
          </div>
        )}

        <div className="mt-6 rounded-[32px] border border-white/80 bg-white/85 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.08)] backdrop-blur md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Month View
              </div>
              <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                {monthLabel}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Tap a day to add something quickly.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                ← Previous
              </button>

              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                }
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() =>
                  setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="mt-5 hidden grid-cols-7 gap-3 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-500 lg:grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {Array.from({ length: offset }).map((__, i) => (
              <div
                key={`pad_${i}`}
                className="hidden min-h-[178px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 lg:block"
              />
            ))}

            {Array.from({ length: daysInMonth }).map((__, dayIndex) => {
              const day = dayIndex + 1;
              const dateISO = `${visibleYear}-${String(visibleMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDay.get(dateISO) || [];
              const isToday = dateISO === todayISO;
              const busyDay = dayEvents.length >= 3;

              return (
                <button
                  key={dateISO}
                  type="button"
                  onClick={() => openCreate(dateISO)}
                  className={`min-h-[178px] rounded-[26px] border p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
                    isToday
                      ? "border-emerald-300 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.96))] ring-2 ring-emerald-200"
                      : busyDay
                        ? "border-sky-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.9),rgba(255,255,255,0.96))]"
                        : "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9))]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-950">{day}</span>
                      {isToday && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">
                          Today
                        </span>
                      )}
                    </div>

                    {dayEvents.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        {dayEvents.slice(0, 4).map((e) => (
                          <span
                            key={e.id}
                            className={`h-2.5 w-2.5 rounded-full ${eventTypeMeta(e.event_type).dot}`}
                            title={e.class_id ? `${e.title} — ${classLabel(e.class_id)}` : e.title}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEdit(e);
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {dayEvents.slice(0, 3).map((e) => {
                      const meta = eventTypeMeta(e.event_type);
                      return (
                        <div
                          key={e.id}
                          className={`rounded-2xl border px-3 py-2 shadow-sm ${meta.soft} bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.4))]`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openEdit(e);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="line-clamp-2 text-xs font-black text-slate-900">
                              {e.title}
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}>
                              {formatEventTypeLabel(e.event_type)}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-600">
                            {e.all_day ? "All day" : toLocalTimeHHMM(e.event_date)}
                            {e.class_id ? ` • ${classLabel(e.class_id)}` : ""}
                          </div>
                        </div>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <div className="pt-1 text-xs font-semibold text-slate-500">
                        +{dayEvents.length - 3} more
                      </div>
                    )}

                    {dayEvents.length === 0 && (
                      <div className="pt-10 text-sm font-medium text-slate-400">
                        Click to add…
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[86vh] w-full max-w-[46rem] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.98))] shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
            <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(239,246,255,0.92),rgba(255,255,255,0.95))] px-3 py-3 md:px-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xl font-black tracking-tight text-slate-950">
                      {editingEventId ? "Edit event" : aiPreview ? "Review AI event" : "Create event"}
                    </div>

                    {!editingEventId && aiPreview && (
                      <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800">
                        AI suggested
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    {editingEventId
                      ? "Update the event details below."
                      : aiPreview
                        ? "Check the suggestion, adjust anything you like, then save it."
                        : "Add an event in a clean, teacher-friendly way."}
                  </div>

                  {(draftTitle || draftDate) && (
                    <div className="mt-4 rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                            Preview
                          </div>
                          <div className="mt-2 text-lg font-black text-slate-950">
                            {draftTitle || "Untitled event"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                              {draftDate || "No date"}
                            </span>

                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${eventTypeMeta(draftType).chip}`}
                            >
                              {formatEventTypeLabel(draftType)}
                            </span>

                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                              {draftAllDay
                                ? "All day"
                                : `${draftTime || "09:30"}${draftEndTime ? `–${draftEndTime}` : ""}`}
                            </span>

                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                              {draftScope === "class"
                                ? classLabel(draftClassId) || "Class event"
                                : "Global event"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {aiPreview?.warnings?.length ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          {aiPreview.warnings.join(" • ")}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowModal(false);
                    if (!editingEventId) setAiPreview(null);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-4">
              <div className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr]">
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                      Details
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Event title
                        </label>
                        <input
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-200 focus:bg-white"
                          placeholder="Event title"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Description
                        </label>
                        <textarea
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-200 focus:bg-white"
                          rows={3}
                          placeholder="Description (optional)"
                          value={draftDesc}
                          onChange={(e) => setDraftDesc(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                      Scheduling
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Date
                        </label>
                        <input
                          type="date"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-200 focus:bg-white"
                          value={draftDate}
                          onChange={(e) => setDraftDate(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Type
                        </label>
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-200 focus:bg-white"
                          value={draftType}
                          onChange={(e) => setDraftType(e.target.value)}
                        >
                          <option value="general">General</option>
                          <option value="test">Test</option>
                          <option value="homework">Homework</option>
                          <option value="trip">Trip</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={draftAllDay}
                          onChange={(e) => setDraftAllDay(e.target.checked)}
                        />
                        All day
                      </label>

                      {!draftAllDay && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                              Start time
                            </label>
                            <input
                              type="time"
                              value={draftTime}
                              onChange={(e) => setDraftTime(e.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-200"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                              End time
                            </label>
                            <input
                              type="time"
                              value={draftEndTime}
                              onChange={(e) => setDraftEndTime(e.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-200"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                      Visibility
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftScope("global")}
                        disabled={hasRouteClass}
                        className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                          draftScope === "global"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        } ${hasRouteClass ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        Global
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftScope("class")}
                        className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                          draftScope === "class"
                            ? "border-violet-300 bg-violet-50 text-violet-800"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Class
                      </button>
                    </div>

                    {draftScope === "class" && (
                      <div className="mt-4">
                        <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Class
                        </label>
                        <select
                          value={draftClassId}
                          onChange={(e) => setDraftClassId(Number(e.target.value))}
                          disabled={hasRouteClass}
                          className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-200 focus:bg-white ${
                            hasRouteClass ? "cursor-not-allowed opacity-70" : ""
                          }`}
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.subject ? `${c.name} • ${c.subject}` : c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {draftDate && (eventsByDay.get(draftDate) || []).length > 0 && (
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                            Same day
                          </div>
                          <div className="mt-1 text-sm font-bold text-slate-900">
                            Existing events on {draftDate}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {(eventsByDay.get(draftDate) || []).slice(0, 6).map((e) => {
                          const meta = eventTypeMeta(e.event_type);
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => openEdit(e)}
                              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:bg-white"
                            >
                              <div className="flex items-start gap-3">
                                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                                <div>
                                  <div className="text-sm font-bold text-slate-900">{e.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {e.all_day ? "All day" : toLocalTimeHHMM(e.event_date)}
                                    {e.class_id ? ` • ${classLabel(e.class_id)}` : ""}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  deleteEventById(e.id);
                                }}
                                className="rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                                title="Delete event"
                                aria-label="Delete event"
                              >
                                Delete
                              </button>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(239,246,255,0.9))] p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                      Action
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      Save when the details look right.
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        {editingEventId && (
                          <button
                            onClick={deleteEvent}
                            className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
                            type="button"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowModal(false);
                            if (!editingEventId) setAiPreview(null);
                          }}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          type="button"
                        >
                          Cancel
                        </button>

                        <button
                          onClick={saveEvent}
                          className="rounded-full bg-[linear-gradient(90deg,#4fb788,#5ec7d8)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.18)] transition hover:-translate-y-[1px]"
                          type="button"
                        >
                          {editingEventId ? "Save changes" : "Save event"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
