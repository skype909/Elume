import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";

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

type AIParseResponse = {
  draft: {
    class_id: number | null;
    title: string;
    description?: string | null;
    event_date: string; // ISO datetime
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

export default function CalendarPage() {
  const { id } = useParams();
  const routeClassId = useMemo(() => Number(id), [id]);
  const hasRouteClass = Number.isFinite(routeClassId) && routeClassId > 0;

  const navigate = useNavigate();

  // data
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filter
  type FilterMode = "all" | "global" | "class";
  const [filterMode, setFilterMode] = useState<FilterMode>(hasRouteClass ? "class" : "all");
  const [filterClassId, setFilterClassId] = useState<number>(hasRouteClass ? routeClassId : 1);

  // calendar month view
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState(""); // YYYY-MM-DD
  const [draftTime, setDraftTime] = useState("09:30"); // HH:MM
  const [draftEndTime, setDraftEndTime] = useState(""); // optional HH:MM
  const [draftAllDay, setDraftAllDay] = useState(false);
  const [draftType, setDraftType] = useState("general");
  const [draftDesc, setDraftDesc] = useState("");

  type DraftScope = "global" | "class";
  const [draftScope, setDraftScope] = useState<DraftScope>("global");
  const [draftClassId, setDraftClassId] = useState<number>(1);

  // AI assistant
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<AIParseResponse | null>(null);

  // --------- load classes ---------
  useEffect(() => {
    apiFetch("/classes")
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]));
  }, []);

  // If we land on /class/:id/calendar, default filter to that class
  useEffect(() => {
    if (hasRouteClass) {
      setFilterMode("class");
      setFilterClassId(routeClassId);
    }
  }, [hasRouteClass, routeClassId]);

  // --------- fetch events ---------
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

  // --------- derived maps ---------
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

  // --------- modal helpers ---------
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

  function openCreate(prefillISO?: string) {
    setErr(null);
    setEditingEventId(null);
    resetDraft();
    if (prefillISO) setDraftDate(prefillISO);
    setShowModal(true);
  }

  function openEdit(ev: CalendarEvent) {
    setErr(null);
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

  // --------- AI parsing ---------
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

      setAiPreview(data);
    } catch (e: any) {
      setErr(e?.message || "AI parse failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function createFromPreview() {
    if (!aiPreview?.draft) return;

    try {
      setErr(null);
      await apiFetch(`/calendar-events`, {
        method: "POST",
        body: JSON.stringify(aiPreview.draft),
      });

      await refresh();
      setAiPreview(null);
      setAiText("");
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    }
  }

  const pageTitle = hasRouteClass ? "Class Calendar" : "Calendar";

  return (
    <div className="min-h-screen bg-[#dff3df]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => (hasRouteClass ? navigate(`/class/${routeClassId}`) : navigate(`/`))}
            className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            type="button"
          >
            ← Back
          </button>

          <div className="flex-1">
            <div className="text-2xl font-semibold text-slate-900">{pageTitle}</div>
            <div className="text-sm text-slate-600">
              {hasRouteClass
                ? "Showing events linked to this class only"
                : filterMode === "all"
                  ? "Showing: All events"
                  : filterMode === "global"
                    ? "Showing: Global only"
                    : `Showing: Class ${filterClassId}`}
            </div>
          </div>

          {!hasRouteClass && (
            <button
              onClick={() => openCreate()}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              type="button"
            >
              + New Event
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {!hasRouteClass ? (
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold">View</div>

              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full border-2 px-4 py-2 text-sm ${
                    filterMode === "all"
                      ? "border-emerald-700 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                  type="button"
                  onClick={() => setFilterMode("all")}
                >
                  All
                </button>

                <button
                  className={`rounded-full border-2 px-4 py-2 text-sm ${
                    filterMode === "global"
                      ? "border-emerald-700 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                  type="button"
                  onClick={() => setFilterMode("global")}
                >
                  Global only
                </button>

                <button
                  className={`rounded-full border-2 px-4 py-2 text-sm ${
                    filterMode === "class"
                      ? "border-emerald-700 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                  type="button"
                  onClick={() => setFilterMode("class")}
                >
                  Class
                </button>
              </div>

              {filterMode === "class" && (
                <div className="mt-3">
                  <label className="text-xs font-semibold text-slate-600">Class</label>
                  <select
                    value={filterClassId}
                    onChange={(e) => setFilterClassId(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
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
            <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.98))] p-4 shadow-sm">
              <div className="flex h-full flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800">
                    Class Calendar
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Showing events linked to this class only.
                  </div>
                </div>

                <button
                  onClick={() => openCreate()}
                  className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  type="button"
                >
                  + New Event
                </button>
              </div>
            </div>
          )}

          {/* AI Assistant */}
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">AI Calendar Assistant</div>
                <div className="text-xs text-slate-600">
                  Type something like:{" "}
                  <span className="font-medium">“6th year maths test next Friday at 9:30”</span>
                </div>
              </div>
              <button
                onClick={runAIParse}
                disabled={aiBusy || !aiText.trim()}
                className="rounded-full border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                type="button"
              >
                {aiBusy ? "Generating…" : "Generate"}
              </button>
            </div>

            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={2}
              className="mt-3 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="e.g. “Staff meeting tomorrow at 3pm”"
            />

            {aiPreview && (
              <div className="mt-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Draft preview</div>
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
                    onClick={createFromPreview}
                  >
                    Create event
                  </button>
                </div>

                <div className="mt-2 text-sm">
                  <div className="font-semibold">{aiPreview.draft.title}</div>
                  <div className="mt-1 text-xs text-slate-700">
                    {toISODate(aiPreview.draft.event_date)}
                    {aiPreview.draft.all_day
                      ? " • All day"
                      : ` • ${toLocalTimeHHMM(aiPreview.draft.event_date)}`}
                    {aiPreview.draft.end_date
                      ? `–${toLocalTimeHHMM(aiPreview.draft.end_date)}`
                      : ""}
                    {" • "}
                    {aiPreview.draft.event_type}
                  </div>

                  {aiPreview.warnings?.length > 0 && (
                    <div className="mt-2 text-xs text-amber-700">
                      {aiPreview.warnings.join(" • ")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        {err && (
          <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {loading && <div className="mt-4 text-sm text-slate-600">Loading…</div>}

        {/* Month view */}
        <div className="mt-6 rounded-[32px] border border-slate-200 bg-white/95 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.06)] backdrop-blur md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Month View
              </div>
              <div className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                {monthLabel}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                }
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                ← Previous
              </button>

              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                  )
                }
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                }
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="mt-5 hidden grid-cols-7 gap-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-500 lg:grid">
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
                className="hidden min-h-[170px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 lg:block"
              />
            ))}

            {Array.from({ length: daysInMonth }).map((__, dayIndex) => {
              const day = dayIndex + 1;
              const dateISO = `${visibleYear}-${String(visibleMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDay.get(dateISO) || [];
              const isToday = dateISO === todayISO;

              return (
                <button
                  key={dateISO}
                  type="button"
                  onClick={() => openCreate(dateISO)}
                  className={`min-h-[170px] rounded-[24px] border p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
                    isToday
                      ? "border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-200"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900">{day}</span>

                    {dayEvents.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={`h-2 w-2 rounded-full ${typeDotClass(e.event_type)}`}
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
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                      >
                        <div className="line-clamp-2 text-xs font-bold text-slate-900">
                          {e.title}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {e.all_day ? "All day" : toLocalTimeHHMM(e.event_date)}
                          {e.class_id ? ` • ${classLabel(e.class_id)}` : ""}
                        </div>
                      </div>
                    ))}

                    {dayEvents.length === 0 && (
                      <div className="pt-8 text-sm font-medium text-slate-400">
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingEventId ? "Edit Event" : "Create Event"}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">Event visibility</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftScope("global")}
                    disabled={hasRouteClass}
                    className={`rounded-full border-2 px-4 py-2 text-sm ${
                      draftScope === "global"
                        ? "border-emerald-700 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    } ${hasRouteClass ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    Global
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftScope("class")}
                    className={`rounded-full border-2 px-4 py-2 text-sm ${
                      draftScope === "class"
                        ? "border-emerald-700 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    Class
                  </button>
                </div>
              </div>

              {draftScope === "class" && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-600">Class</div>
                  <select
                    value={draftClassId}
                    onChange={(e) => setDraftClassId(Number(e.target.value))}
                    disabled={hasRouteClass}
                    className={`w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm ${
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

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Event title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />

              <textarea
                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                rows={2}
                placeholder="Description (optional)"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-600">Date</div>
                  <input
                    type="date"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-600">Type</div>
                  <select
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
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

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draftAllDay}
                    onChange={(e) => setDraftAllDay(e.target.checked)}
                  />
                  All day
                </label>

                {!draftAllDay && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">Start</span>
                      <input
                        type="time"
                        value={draftTime}
                        onChange={(e) => setDraftTime(e.target.value)}
                        className="rounded-xl border-2 border-slate-200 bg-white px-2 py-1 text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">End</span>
                      <input
                        type="time"
                        value={draftEndTime}
                        onChange={(e) => setDraftEndTime(e.target.value)}
                        className="rounded-xl border-2 border-slate-200 bg-white px-2 py-1 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  {editingEventId && (
                    <button
                      onClick={deleteEvent}
                      className="rounded-full border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      type="button"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50"
                    type="button"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={saveEvent}
                    className="rounded-full border-2 border-emerald-700 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    type="button"
                  >
                    Save
                  </button>
                </div>
              </div>

              {draftDate && (eventsByDay.get(draftDate) || []).length > 0 && (
                <div className="mt-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-700">
                    Events on {draftDate}
                  </div>

                  <div className="grid gap-1">
                    {(eventsByDay.get(draftDate) || []).slice(0, 6).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => openEdit(e)}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 h-2 w-2 rounded-full ${typeDotClass(e.event_type)}`} />
                          <div>
                            <div className="text-sm font-semibold">{e.title}</div>

                            {e.class_id && (
                              <div className="text-xs text-slate-500">
                                {classLabel(e.class_id)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-xs text-slate-500">
                            {e.all_day ? "All day" : toLocalTimeHHMM(e.event_date)}
                          </div>

                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              deleteEventById(e.id);
                            }}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            title="Delete event"
                            aria-label="Delete event"
                          >
                            🗑
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}