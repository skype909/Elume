import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ConfirmModal from "./Components/ConfirmModal";
import elumeLogo from "./assets/elume-logo.png";
import { useNavigate } from "react-router-dom";
import kahootLogo from "./assets/kahoot-logo.jpg";
import blooketLogo from "./assets/blooket-logo.png";
import googleFormsLogo from "./assets/googleforms-logo.png";
import canvaLogo from "./assets/canva-logo.jpeg";
import QRCode from "react-qr-code";
import ELogo from "./assets/ELogo.png";
import ELogo2 from "./assets/ELogo2.png";
import { Settings, Timer, Bell, Play, Pause, RotateCcw } from "lucide-react";



const META_KEY = "elume_class_layout_v1";

type ClassItem = { id: number; name: string; subject: string };
type Post = {
  id: number;
  author: string;
  content: string;
  createdAt?: string;

  // UI-only for now:
  links?: string[];
  files?: { name: string; size: number }[];
};

type CalendarEvent = {
  id: number;
  class_id: number;
  title: string;
  description?: string;
  event_date: string; // "YYYY-MM-DD"
  event_type: string;
};


const API_BASE = "/api";

function getJwt(): string | null {
  return localStorage.getItem("elume_token");
}

/** ✅ Defensive: backend/DB may return links as a JSON string or a comma-separated string */
function normalizeLinks(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    // Try JSON list first
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch { }
    // Fallback: comma/newline separated
    const parts = s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts : [s];
  }
  return [];
}

/** ✅ Ensure a post always has correct shapes for rendering */
function normalizePost(p: any): Post {
  return {
    id: Number(p?.id),
    author: typeof p?.author === "string" ? p.author : "Teacher",
    content: typeof p?.content === "string" ? p.content : "",
    createdAt:
      typeof p?.createdAt === "string"
        ? p.createdAt
        : typeof p?.created_at === "string"
          ? p.created_at
          : undefined,
    links: normalizeLinks(p?.links),
    files: Array.isArray(p?.files) ? p.files : [],
  };
}

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatPostStamp(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });

  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;

  return `${day} ${month} ${h}:${m}${ampm}`;
}


function formatPrettyDate(d: Date) {
  const day = ordinal(d.getDate());
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * UI-only fallback: makes the feed look like real dated posts
 * If backend doesn't send dates yet, we "stage" them by index.
 */
function uiPostDateLabel(p: { createdAt?: string }, index: number) {
  if (p.createdAt) {
    const parsed = new Date(p.createdAt);
    if (!Number.isNaN(parsed.getTime())) return formatPrettyDate(parsed);
  }

  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() - Math.min(index, 14)); // spread first 15 posts over last 2 weeks
  return formatPrettyDate(base);
}

type PostComposerProps = {
  card: string;
  cardPad: string;
  btn: string;
  btnPrimary: string;
  posting: boolean;
  chip: string;

  author: string;
  setAuthor: (v: string) => void;

  content: string;
  setContent: (v: string) => void;

  submitPost: () => void;

  // links (UI-only)
  links: string[];
  linkDraft: string;
  setLinkDraft: (v: string) => void;
  addLink: () => void;
  removeLink: (i: number) => void;

  // files (UI-only)
  files: File[];
  onPickFiles: (fl: FileList | null) => void;
  removeFile: (i: number) => void;
};

function PostComposer({
  card,
  cardPad,
  btn,
  btnPrimary,
  posting,
  author,
  setAuthor,
  content,
  setContent,
  submitPost,
  links,
  linkDraft,
  setLinkDraft,
  addLink,
  removeLink,
  files,
  onPickFiles,
  removeFile,
  chip,
}: PostComposerProps) {
  return (
    <div className={`${card} ${cardPad} mt-4`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-extrabold">New Announcement</div>
        <div className="text-xs text-slate-500">{posting ? "Posting…" : " "}</div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="md:col-span-2 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author"
          />
          <div className="md:col-span-3 flex items-center justify-end gap-2">
            <button className={btn} type="button">
              Attach
            </button>
          </div>
        </div>

        <textarea
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write an announcement..."
        />

        {/* Add a link */}
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            placeholder="Paste a link… (e.g. youtube.com/...)"
          />
          <button className={btn} type="button" onClick={addLink}>
            Add link
          </button>
        </div>

        {/* Show chosen links */}
        {links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l, i) => (
              <button
                key={l + i}
                type="button"
                className={`${chip} hover:bg-slate-100`}
                onClick={() => removeLink(i)}
                title="Remove link"
              >
                🔗 {l} ✕
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Tip: short paragraphs read best for students.
          </div>

          <button
            onClick={submitPost}
            disabled={posting || !content.trim()}
            className={btnPrimary}
            type="button"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClassPage() {
  const { id } = useParams<{ id: string }>();
  const classId = useMemo(() => Number(id), [id]);
  const validClassId = Number.isFinite(classId) && classId > 0;
  const [classColour, setClassColour] = useState<string>("bg-blue-500");
  const [studentToken, setStudentToken] = useState<string | null>(null);
  const [studentUrl, setStudentUrl] = useState<string | null>(null);

  const [classInfo, setClassInfo] = useState<ClassItem | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("Mr Fitzgerald");
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loadingClass, setLoadingClass] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClassSettings, setShowClassSettings] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [teacherName, setTeacherName] = useState("Mr Fitzgerald");
  const [displayId, setDisplayId] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editDisplayId, setEditDisplayId] = useState("");
  const [roomLabel, setRoomLabel] = useState("Lab");
  const [editRoom, setEditRoom] = useState("");
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);


  const [activeTab, setActiveTab] = useState<"announce" | "notes" | "whiteboard">(
    "announce"
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<number | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  // Random Number Generator (RNG) widget (right panel)
  const [rngOpen, setRngOpen] = useState(false);
  const [rngMin, setRngMin] = useState(1);
  const [rngMax, setRngMax] = useState(20);
  const [rngResult, setRngResult] = useState<number | null>(null);
  const [rngSpinning, setRngSpinning] = useState(false);
  const [rngRotation, setRngRotation] = useState(0);


  const navigate = useNavigate();

  // UI-only: mock "group" like your PDF
  const [groupLabel, setGroupLabel] = useState("1E");

  const rngCount = Math.max(1, Math.min(40, rngMax - rngMin + 1)); // cap to keep wheel sane
  const rngValid = Number.isFinite(rngMin) && Number.isFinite(rngMax) && rngMin < rngMax && rngCount <= 40;

  const buildWheelBackground = (n: number) => {
    const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4"]; // bright classroom
    const stops: string[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 360;
      const a1 = ((i + 1) / n) * 360;
      const c = colors[i % colors.length];
      stops.push(`${c} ${a0}deg ${a1}deg`);
    }
    return `conic-gradient(${stops.join(",")})`;
  };

  const spinRng = () => {
    if (!rngValid || rngSpinning) return;

    const n = rngMax - rngMin + 1;
    const idx = Math.floor(Math.random() * n); // 0..n-1
    const value = rngMin + idx;

    const anglePer = 360 / n;
    const spins = 6;

    // Land the pointer at the center of the chosen slice.
    const targetDelta = spins * 360 + (360 - (idx + 0.5) * anglePer);

    setRngResult(null);

    // IMPORTANT:
    // 1) Turn OFF transition briefly
    // 2) Normalize current rotation so we don't jump across 0
    // 3) Next frame, turn ON transition and apply the new rotation
    setRngSpinning(false);

    setRngRotation((prev) => {
      const normalized = ((prev % 360) + 360) % 360;

      requestAnimationFrame(() => {
        setRngSpinning(true);
        setRngRotation(normalized + targetDelta);

        window.setTimeout(() => {
          setRngResult(value);
          setRngSpinning(false);
        }, 2400);
      });

      return normalized;
    });
  };


  // --- fetch class ---
  useEffect(() => {
    if (!validClassId) {
      setLoadingClass(false);
      setClassInfo(null);
      return;
    }


    const controller = new AbortController();
    setLoadingClass(true);
    setError(null);

    fetch(`${API_BASE}/classes/${classId}`, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return (await r.json()) as ClassItem;

        // fallback: fetch list and find class
        const fallback = await fetch(`${API_BASE}/classes`, { signal: controller.signal });
        if (!fallback.ok) throw new Error(`Classes fetch failed (${fallback.status})`);

        const list = (await fallback.json()) as ClassItem[];
        const found = list.find((c) => c.id === classId);

        if (!found) throw new Error(`Class fetch failed (404)`);
        return found;
      })
      .then((data) => setClassInfo(data ?? null))
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load class info");
        setClassInfo(null);
      })
      .finally(() => setLoadingClass(false));

    return () => controller.abort();
  }, [classId, validClassId]);

  useEffect(() => {
    if (!validClassId) return;

    const jwt = getJwt();
    if (!jwt) {
      setStudentToken(null);
      setStudentUrl(null);
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        // Try GET first (if your backend supports it)
        let r = await fetch(`${API_BASE}/student-access/${classId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${getJwt()}` },
          signal: controller.signal,
        });

        // If GET not available / fails, create via POST
        if (!r.ok) {
          r = await fetch(`${API_BASE}/student-access/${classId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getJwt()}` },
            signal: controller.signal,
          });
        }

        if (!r.ok) throw new Error(`Student token request failed (${r.status})`);

        const data = await r.json();
        const tok = data?.token ?? null;

        if (!tok) throw new Error("No token in response");

        setStudentToken(tok);

        // HashRouter route -> /#/s/<token>
        setStudentUrl(`${window.location.origin}/#/s/${tok}`);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("Student token error:", e);
        setStudentToken(null);
        setStudentUrl(null);
      }
    })();

    return () => controller.abort();
  }, [classId, validClassId]);


  // Header Colour
  useEffect(() => {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return;

      const meta = JSON.parse(raw);
      const entry = meta?.[String(classId)] || {};

      if (entry?.color) setClassColour(entry.color);

      if (typeof entry?.teacher === "string" && entry.teacher.trim()) {
        setTeacherName(entry.teacher);
        setAuthor(entry.teacher); // also updates post composer default author
      }

      if (typeof entry?.group === "string" && entry.group.trim()) {
        setGroupLabel(entry.group);
      }

      if (typeof entry?.displayId === "string") {
        setDisplayId(entry.displayId);
      }

      if (typeof entry?.room === "string" && entry.room.trim()) {
        setRoomLabel(entry.room);
      }

    } catch {
      // fail silently
    }
  }, [classId]);


  useEffect(() => {
    if (!classInfo) return;
    setEditName(classInfo.name ?? "");
    setEditSubject(classInfo.subject ?? "");
  }, [classInfo]);

  useEffect(() => {
    if (!showClassSettings) return;
    setEditTeacher(teacherName);
    setEditGroup(groupLabel);
    setEditDisplayId(displayId);
    setEditRoom(roomLabel);
  }, [showClassSettings, teacherName, groupLabel, displayId, roomLabel]);



  // --- fetch calendar events (for bell alerts) ---
  // --- fetch calendar events (GLOBAL: same calendar across all ClassPages) ---
  // --- fetch calendar events (GLOBAL, with safe fallback to per-class endpoint) ---
  // --- fetch calendar events (for bell alerts) ---
  // Canonical behaviour: backend returns (global + this class) when class_id is provided
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        if (!validClassId) {
          setCalendarEvents([]);
          return;
        }

        const r = await fetch(`${API_BASE}/calendar-events?class_id=${classId}`, {
          signal: controller.signal,
        });

        if (!r.ok) throw new Error(`Calendar events failed (${r.status})`);

        const data = await r.json();
        const arr = Array.isArray(data) ? data : [];
        setCalendarEvents(arr);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("Calendar events load error:", e);
        setCalendarEvents([]);
      }
    }

    load();
    return () => controller.abort();
  }, [classId, validClassId]);



  // --- fetch posts ---
  async function fetchPosts() {
    try {
      const r = await fetch(`${API_BASE}/classes/${classId}/posts`);
      if (!r.ok) throw new Error(`Posts fetch failed (${r.status})`);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [];
      setPosts(arr.map(normalizePost));
    } catch (e: any) {
      setError(e.message || "Failed to load posts");
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }

  useEffect(() => {
    if (!validClassId) {
      setLoadingPosts(false);
      setPosts([]);
      return;
    }

    const controller = new AbortController();
    setLoadingPosts(true);
    setError(null);

    fetch(`${API_BASE}/classes/${classId}/posts`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Posts fetch failed (${r.status})`);
        return r.json();
      })
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : [];
        setPosts(arr.map(normalizePost));
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load posts");
        setPosts([]);
      })
      .finally(() => setLoadingPosts(false));

    return () => controller.abort();
  }, [classId, validClassId]);

  function submitPost() {
    if (!validClassId) return;
    if (!content.trim()) return;

    setPosting(true);
    setError(null);

    fetch(`${API_BASE}/classes/${classId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, content, links }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Post failed (${r.status})`);
        return r.json();
      })
      .then((created: any) => {
        setPosts((prev) => [normalizePost(created), ...prev]);
        setContent("");
        setLinks([]);
        setLinkDraft("");
        setFiles([]);
      })
      .catch((e) => setError(e?.message || "Failed to create post"))
      .finally(() => setPosting(false));
  }

  async function deletePost(postId: number) {
    try {
      setError(null);

      const r = await fetch(`${API_BASE}/posts/${postId}`, {
        method: "DELETE",
      });

      if (!r.ok) throw new Error(`Delete failed (${r.status})`);

      // remove from UI immediately
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e: any) {
      setError(e?.message || "Failed to delete post");
    }
  }

  function requestDelete(postId: number) {
    setPostToDelete(postId);
    setConfirmOpen(true);
  }
  function clampInt(n: number, min: number, max: number) {
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  function formatMMSS(totalSec: number) {
    const s = Math.max(0, totalSec);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  useEffect(() => {
    if (!timerRunning) return;

    const t = window.setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          // hit zero
          setTimerRunning(false);
          setTimerFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(t);
  }, [timerRunning]);


  function addLink() {
    const v = linkDraft.trim();
    if (!v) return;
    const url = v.startsWith("http://") || v.startsWith("https://") ? v : `https://${v}`;
    setLinks((prev) => [url, ...prev]);
    setLinkDraft("");
  }

  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onPickFiles(fileList: FileList | null) {
    if (!fileList) return;
    const picked = Array.from(fileList);
    setFiles((prev) => [...picked, ...prev]);
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  const pageSubtitle =
    loadingClass ? "Please wait" : classInfo ? classInfo.subject : "Class details not found";

  const today = new Date();
  const dayName = today.toLocaleDateString("en-IE", { weekday: "long" });
  const dayNumber = today.getDate();
  const monthName = today.toLocaleDateString("en-IE", { month: "long" });

  function toYMD(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function normYMD(s: string) {
    return (s || "").slice(0, 10);
  }

  const todayYMD = toYMD(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowYMD = toYMD(tomorrow);


  // Calendar events already come back as: (global + this class)
  const getEventDate = (e: any) => String(e?.event_date ?? e?.eventDate ?? e?.date ?? "");

  const classEvents = calendarEvents;

  const eventsToday = classEvents.filter((e: any) => normYMD(getEventDate(e)) === todayYMD);
  const eventsTomorrow = classEvents.filter((e: any) => normYMD(getEventDate(e)) === tomorrowYMD);

  const next7 = (() => {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    return classEvents
      .filter((e: any) => {
        const d = new Date(normYMD(getEventDate(e)) + "T00:00:00");
        return d >= start && d < end;
      })
      .slice()
      .sort((a: any, b: any) =>
        normYMD(getEventDate(a)).localeCompare(normYMD(getEventDate(b)))
      );
  })();

  const bellMode: "none" | "tomorrow" | "today" | "both" =
    eventsToday.length && eventsTomorrow.length
      ? "both"
      : eventsToday.length
        ? "today"
        : eventsTomorrow.length
          ? "tomorrow"
          : "none";

  const bellColor =
    bellMode === "both"
      ? "ring-4 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.65)]"
      : bellMode === "today"
        ? "ring-4 ring-red-400 shadow-[0_0_18px_rgba(248,113,113,0.65)]"
        : bellMode === "tomorrow"
          ? "ring-4 ring-yellow-300 shadow-[0_0_18px_rgba(253,224,71,0.75)]"
          : "";



  // ---------- Tailwind "design tokens" ----------
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const cardPad = "p-4 md:p-5";
  const soft = "bg-slate-50";
  const btn =
    "rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 active:translate-y-[1px] active:shadow-none";
  const btnPrimary =
    "rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_0_rgba(5,46,22,0.25)] hover:bg-emerald-700 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50";
  const pill =
    "rounded-full border-2 border-slate-200 bg-slate-50 px-4 py-2 text-sm hover:bg-slate-100 active:translate-y-[1px]";
  const chip =
    "inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700";

  // ---------- tiny icons ----------
  const Icon = ({ name }: { name: "class" | "board" | "book" | "admin" | "spark" }) => {
    const common = "h-4 w-4";
    switch (name) {
      case "class":
        return (
          <svg className={common} viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7.5h16M7 4h10M6 11h12v8H6v-8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        );
      case "board":
        return (
          <svg className={common} viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6h16v10H4V6Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );
      case "book":
        return (
          <svg className={common} viewBox="0 0 24 24" fill="none">
            <path
              d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 0-2 2V4Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M6 18h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );
      case "admin":
        return (
          <svg className={common} viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7l8-4Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "spark":
      default:
        return (
          <svg className={common} viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2l1.5 6L20 10l-6.5 2L12 20l-1.5-8L4 10l6.5-2L12 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        );
    }
  };

  const textClass =
    classColour.includes("yellow") || classColour.includes("amber")
      ? "text-slate-900"
      : "text-white";

  // ---------- UI blocks ----------
  const LeftSidebar = () => (
    <aside className="col-span-12 md:col-span-3 lg:col-span-2">
      <div className={`${card} ${cardPad}`}>
        <div className="mb-4">
          <div className="flex items-center gap-4">
            <img
              src={ELogo2}
              alt="ELume Logo"
              className="h-16 w-16 rounded-2xl object-cover shadow-sm"
            />

            <div className="leading-tight">
              <div className="text-sm text-slate-500">Learn, Grow, Succeed</div>
            </div>
          </div>
        </div>

        <div className="my-4 border-t border-slate-200" />

        <nav className="space-y-2">
          {[
            { label: "Classroom", to: `/` },
            { label: "Whiteboard", to: `/whiteboard/${classId}` },
            { label: "Collaborate", to: null },
            { label: "eBooks", to: null },
            { label: "Admin", to: `/class/${classId}/admin` },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (item.to) navigate(item.to);
                else alert("Coming soon 🙂");
              }}
              className="w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-extrabold tracking-tight">Student access</div>
          <div className="mt-1 text-xs text-slate-500">Scan to open read-only view.</div>

          <div className="mt-3 flex flex-col items-center">
            <div className="bg-white p-2 rounded-xl border border-slate-200">
              {studentUrl ? (
                <QRCode value={studentUrl} size={120} />
              ) : (
                <div className="h-[120px] w-[120px] grid place-items-center text-xs text-slate-500">
                  Loading…
                </div>
              )}
            </div>

            {studentUrl && (
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(studentUrl)}
                className="mt-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50"
              >
                Copy link
              </button>
            )}
          </div>
        </div>

      </div>
    </aside>
  );

  const ClassHeader = () => {
    const classLabel = classInfo?.name || `Class ${id ?? ""}`;
    return (
      <div className={`relative rounded-3xl border-2 border-slate-200 ${classColour} p-4 md:p-5 shadow-[0_2px_0_rgba(15,23,42,0.06)] ${textClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-block rounded-2xl bg-white/10 px-5 py-3 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
              <div className="text-3xl font-extrabold tracking-tight drop-shadow-md">
                {classLabel}
              </div>
              <div className="mt-1 text-lg font-semibold tracking-tight drop-shadow-sm">
                {pageSubtitle}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-700">
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-extrabold">Teacher:</span> {teacherName}
              </div>

              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-extrabold">Group:</span> {groupLabel}
              </div>
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2">
                <span>
                  <span className="font-extrabold">Room:</span> {roomLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Date badge */}
          {/* Date badge + Bell */}
          <div className="relative rounded-3xl border-2 border-slate-200 bg-white p-4 text-center shadow-[0_2px_0_rgba(15,23,42,0.06)] text-slate-900">
            <div className="text-sm text-slate-600 font-semibold">{dayName}</div>
            <div className="text-4xl font-extrabold leading-tight">{dayNumber}</div>
            <div className="text-sm text-slate-600 font-semibold">{monthName}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowClassSettings(true)}
            className="absolute bottom-4 right-4 grid h-5 w- place-items-center rounded-2xl border-2 border-slate-200 bg-white/80 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
            title="Class settings"
          >
            <Settings size={16} />
          </button>

        </div>
      </div>
    );
  };

  const Feed = () => {
    return (
      <div className="mt-4 space-y-4">
        {loadingPosts && (
          <div className={`${card} ${cardPad} text-sm text-slate-600`}>Loading announcements…</div>
        )}

        {!loadingPosts && posts.length === 0 && (
          <div className={`${card} ${cardPad} text-sm text-slate-600`}>
            No announcements yet for this class.
          </div>
        )}

        {!loadingPosts &&
          posts.map((p, idx) => (
            <article
              key={p.id}
              className={`${card} ${cardPad} transition-all duration-200 hover:-translate-y-[2px] hover:shadow-lg hover:border-emerald-200`}
            >
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  {formatPostStamp(p.createdAt)}
                </div>
                <button
                  type="button"
                  onClick={() => requestDelete(p.id)}
                  className="rounded-2xl border-2 border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  title="Delete post"
                >
                  Delete
                </button>
              </div>

              {/* Content */}
              <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                {p.content}
              </div>

              {/* Attachments ✅ SAFE because p.links is always an array after normalise */}
              {(p.links?.length || p.files?.length) && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {p.files?.map((f, i) => (
                    <span key={i} className={chip}>
                      📄 {f.name}
                    </span>
                  ))}

                  {p.links?.map((l, i) => (
                    <a
                      key={i}
                      href={l}
                      target="_blank"
                      rel="noreferrer"
                      className={`${chip} hover:bg-slate-100`}
                    >
                      🔗 {l}
                    </a>
                  ))}


                </div>
              )}
            </article>
          ))}
      </div>
    );
  };



  const RightPanel = () => (
    <aside className="col-span-12 md:col-span-3 lg:col-span-3">
      <div className={`${card} ${cardPad}`}>
        <div className="flex items-center justify-between">
          <div className="text-lg font-extrabold tracking-tight">Resources</div>
          <div className="grid h-10 w-10 place-items-center rounded-2xl border-2 border-slate-200 bg-slate-50">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { name: "Notes", colour: "bg-blue-500 border-blue-600 text-white" },
            { name: "Tests", colour: "bg-red-500 border-red-600 text-white" },
            { name: "Quizzes", colour: "bg-yellow-400 border-yellow-500 text-black" },
            { name: "Exam Papers", colour: "bg-green-500 border-green-600 text-white" },
            { name: "Videos", colour: "bg-orange-500 border-orange-600 text-white" },
            { name: "Links", colour: "bg-white border-slate-300 text-slate-800" },
          ].map((x) => (
            <button
              key={x.name}
              className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold shadow-sm hover:brightness-110 active:translate-y-[1px] ${x.colour}`}
              type="button"
              onClick={() => {
                if (x.name === "Notes") navigate(`/class/${classId}/notes`);
                else if (x.name === "Tests") navigate(`/class/${classId}/tests`);
                else if (x.name === "Quizzes") navigate(`/class/${classId}/quizzes`);
                else if (x.name === "Exam Papers") navigate(`/class/${classId}/exam-papers`);
                else if (x.name === "Videos") navigate(`/class/${classId}/videos`);
                else if (x.name === "Links") navigate(`/class/${classId}/links`);
              }}
            >
              {x.name}
            </button>
          ))}
        </div>


        <div className={`mt-6 rounded-3xl border-2 border-slate-200 ${soft} p-4`}>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl border-2 border-slate-200 bg-white">
              <Icon name="spark" />
            </span>
            <div className="text-lg font-extrabold tracking-tight">Generate</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              { name: "Blooket", url: "https://www.blooket.com", logo: blooketLogo },
              { name: "Kahoot", url: "https://www.kahoot.com", logo: kahootLogo },
              { name: "Google Forms", url: "https://forms.google.com", logo: googleFormsLogo },
              { name: "Canva", url: "https://www.canva.com", logo: canvaLogo },
            ].map((tool) => (
              <button
                key={tool.name}
                title={tool.name}
                onClick={() => window.open(tool.url, "_blank")}
                className="rounded-3xl border-2 border-slate-200 bg-white h-28 flex items-center justify-center hover:bg-slate-50"
                type="button"
              >
                <img
                  src={tool.logo}
                  alt={tool.name}
                  className="max-h-full max-w-full object-contain p-2"
                />
              </button>
            ))}
          </div>
        </div>
        {/* Classroom Tools (new box) */}
        <div className="mt-6 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 shadow-md">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl border-2 border-slate-200 bg-white">
              🎯
            </span>
            <div className="text-lg font-extrabold tracking-tight">Classroom Tools</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {(() => {
              const toolTile =
                "aspect-square w-full rounded-full border-2 border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:scale-[0.99] transition flex flex-col items-center justify-center text-center";
              const toolIcon = "text-2xl";
              const toolLabel = "mt-2 text-sm font-semibold leading-tight text-slate-900";

              return (
                <>
                  <button
                    type="button"
                    className={toolTile}
                    onClick={() => setRngOpen((v) => !v)}
                  >
                    <div className={toolIcon}>🎲</div>
                    <div className={toolLabel}>
                      Random
                      <br />
                      Number
                    </div>
                  </button>

                  <button
                    type="button"
                    className={toolTile}
                    onClick={() => navigate(`/class/${classId}/seating-plan`)}
                  >
                    <div className={toolIcon}>🪑</div>
                    <div className={toolLabel}>
                      Seating
                      <br />
                      Plan
                    </div>
                  </button>

                  <button
                    type="button"
                    className={toolTile}
                    onClick={() => {
                      setTimerFinished(false);
                      setTimerRunning(false);
                      setTimerRemaining(timerMinutes * 60 + timerSeconds);
                      setTimerOpen(true);
                    }}
                  >
                    <div className={toolIcon}>
                      <Timer size={22} />
                    </div>
                    <div className={toolLabel}>Timer</div>
                  </button>

                  <button
                    type="button"
                    className={toolTile}
                    onClick={() => navigate(`/class/${classId}/live-quiz`)}
                  >
                    <div className={toolIcon}>🧠</div>
                    <div className={toolLabel}>
                      Live
                      <br />
                      Quiz
                    </div>
                  </button>
                </>
              );
            })()}
          </div>

          {/* RNG Widget (inline pop-up card) */}
          {rngOpen && (
            <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-extrabold">Random Number Generator</div>
                <button className={pill} type="button" onClick={() => setRngOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Min
                  <input
                    type="number"
                    className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
                    value={rngMin}
                    onChange={(e) => setRngMin(Number(e.target.value))}
                  />
                </label>

                <label className="text-sm">
                  Max
                  <input
                    type="number"
                    className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
                    value={rngMax}
                    onChange={(e) => setRngMax(Number(e.target.value))}
                  />
                </label>
              </div>

              {!rngValid && (
                <div className="mt-2 text-xs text-red-600">
                  Please enter a valid range (min &lt; max). Max range size is 40.
                </div>
              )}

              <div className="mt-4 flex items-center justify-center">
                <div className="relative">
                  {/* pointer */}
                  <div className="absolute left-1/2 top-[-10px] z-10 h-0 w-0 -translate-x-1/2 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-slate-900" />
                  {/* wheel */}
                  <div
                    className="grid h-44 w-44 place-items-center rounded-full border-4 border-slate-900"
                    style={{
                      background: buildWheelBackground(rngMax - rngMin + 1),
                      transform: `rotate(${rngRotation}deg)`,
                      transition: rngSpinning ? "transform 2.4s cubic-bezier(0.2, 0.9, 0.2, 1)" : "none",
                    }}
                  >
                    <div
                      className="grid h-16 w-16 place-items-center rounded-full border-4 border-slate-900 bg-white text-xl font-extrabold"
                      style={{ transform: `rotate(${-rngRotation}deg)` }}
                    >
                      {rngResult ?? "?"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  onClick={spinRng}
                  disabled={!rngValid || rngSpinning}
                >
                  {rngSpinning ? "Spinning..." : "Generate"}
                </button>

                <button
                  type="button"
                  className={pill}
                  onClick={() => setRngResult(null)}
                  disabled={rngSpinning}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-emerald-100 p-6">
      <div className="h-10 border-b-2 border-slate-200 bg-white" />

      <div className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-3xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          <LeftSidebar />

          <main className="col-span-12 md:col-span-6 lg:col-span-7">
            <ClassHeader />

            {/* Action row */}
            <div className="mt-4 flex items-center gap-3">

              {/* Left side buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setActiveTab("announce")}
                  className={
                    activeTab === "announce"
                      ? "rounded-full border-2 border-emerald-600 bg-emerald-50 px-5 py-2 text-sm font-semibold"
                      : "rounded-full border-2 border-slate-200 bg-white px-5 py-2 text-sm hover:bg-slate-50"
                  }
                  type="button"
                >
                  New Announcement
                </button>

                <button
                  onClick={() => setActiveTab("notes")}
                  className={
                    activeTab === "notes"
                      ? "rounded-full border-2 border-emerald-600 bg-emerald-50 px-5 py-2 text-sm font-semibold"
                      : "rounded-full border-2 border-slate-200 bg-white px-5 py-2 text-sm hover:bg-slate-50"
                  }
                  type="button"
                >
                  Notes
                </button>

                <button
                  type="button"
                  onClick={() => navigate(`/class/${classId}/calendar`)}
                  className="rounded-full border-2 border-slate-200 bg-white px-5 py-2 text-sm hover:bg-slate-50"
                >
                  Calendar
                </button>
              </div>

              {/* 🔔 Bell aligned right */}

              <div
                className="ml-auto relative"
                onMouseEnter={() => setBellOpen(true)}
                onMouseLeave={() => setBellOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/class/${classId}/calendar`)}
                  className={`relative grid h-10 w-10 place-items-center rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50 ${bellColor}`}
                  title="Calendar alerts"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <path
                      d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z"
                      fill="currentColor"
                    />
                    <path
                      d="M18 16H6c1.2-1.4 2-3 2-5.5V9a4 4 0 0 1 8 0v1.5c0 2.5.8 4.1 2 5.5Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>

                  {/* Indicators */}
                  {bellMode === "today" && (
                    <span className="absolute -bottom-1 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full bg-red-500" />
                  )}

                  {bellMode === "tomorrow" && (
                    <span className="absolute -bottom-1 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full bg-yellow-400" />
                  )}

                  {bellMode === "both" && (
                    <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-1">
                      <span className="h-1.5 w-3 rounded-full bg-red-500" />
                      <span className="h-1.5 w-3 rounded-full bg-yellow-400" />
                    </div>
                  )}
                </button>


                {/* Hover preview */}
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-2xl border-2 border-slate-200 bg-white p-3 text-left shadow-xl z-50">
                    <div className="text-sm font-semibold text-slate-800">Next 7 days</div>
                    <div className="mt-2 space-y-2 max-h-64 overflow-auto">
                      {next7.length === 0 ? (
                        <div className="text-sm text-slate-600">No events coming up.</div>
                      ) : (
                        next7.map((e) => (
                          <div
                            key={e.id}
                            className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                            onClick={() => navigate(`/class/${classId}/calendar`)}
                          >
                            <div className="font-semibold">{e.title}</div>
                            <div className="text-xs text-slate-600">
                              {e.event_date} • {e.event_type}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>


            {activeTab === "announce" && (
              <>
                <PostComposer
                  card={card}
                  cardPad={cardPad}
                  btn={btn}
                  btnPrimary={btnPrimary}
                  posting={posting}
                  author={author}
                  setAuthor={setAuthor}
                  content={content}
                  setContent={setContent}
                  submitPost={submitPost}
                  chip={chip}
                  links={links}
                  linkDraft={linkDraft}
                  setLinkDraft={setLinkDraft}
                  addLink={addLink}
                  removeLink={removeLink}
                  files={files}
                  onPickFiles={onPickFiles}
                  removeFile={removeFile}
                />

                <Feed />
              </>
            )}

            {activeTab === "notes" && (
              <div className={`${card} ${cardPad} mt-4 text-sm text-slate-700`}>
                Notes panel coming soon ✏️
              </div>
            )}

            {activeTab === "whiteboard" && (
              <div className={`${card} ${cardPad} mt-4 text-sm text-slate-700`}>
                Whiteboard coming soon 🧠
              </div>
            )}

            <div className="mt-8 border-t-2 border-slate-200 pt-4 text-xs text-slate-500">
              © 2026 ELume Beta. All rights reserved. P Fitzgerald
            </div>
          </main>
          {timerOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
              <div className={`w-full max-w-lg rounded-3xl border-2 bg-white p-5 shadow-xl ${timerFinished ? "border-red-300" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                    {timerFinished ? <Bell size={18} className="text-red-600" /> : <Timer size={18} />}
                    {timerFinished ? "Time is up!" : "Timer"}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTimerOpen(false);
                      setTimerRunning(false);
                      setTimerFinished(false);
                    }}
                    className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>

                {/* BIG countdown display */}
                <div
                  className={[
                    "mt-4 rounded-3xl border-2 p-6 text-center",
                    timerFinished ? "border-red-300 bg-red-50 animate-pulse" : "border-slate-200 bg-slate-50",
                  ].join(" ")}
                >
                  <div className={timerFinished ? "text-red-700" : "text-slate-900"}>
                    <div className="text-5xl font-black tracking-tight">{formatMMSS(timerRemaining)}</div>
                    <div className="mt-1 text-sm font-semibold opacity-70">
                      {timerFinished ? "Alarm!" : timerRunning ? "Counting down…" : "Ready"}
                    </div>
                  </div>
                </div>

                {/* Setup controls */}
                {!timerRunning && !timerFinished && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="text-sm font-semibold text-slate-700">
                      Minutes
                      <input
                        type="number"
                        value={timerMinutes}
                        onChange={(e) => setTimerMinutes(clampInt(Number(e.target.value), 0, 180))}
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm font-semibold text-slate-700">
                      Seconds
                      <input
                        type="number"
                        value={timerSeconds}
                        onChange={(e) => setTimerSeconds(clampInt(Number(e.target.value), 0, 59))}
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      />
                    </label>

                    <div className="col-span-2 flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTimerMinutes(5);
                          setTimerSeconds(0);
                        }}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      >
                        5:00
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const total = clampInt(timerMinutes, 0, 180) * 60 + clampInt(timerSeconds, 0, 59);
                          setTimerRemaining(total);
                          setTimerFinished(false);
                          setTimerRunning(true);
                        }}
                        className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 flex items-center gap-2"
                        disabled={clampInt(timerMinutes, 0, 180) * 60 + clampInt(timerSeconds, 0, 59) <= 0}
                        title="Start timer"
                      >
                        <Play size={16} />
                        Start
                      </button>
                    </div>
                  </div>
                )}

                {/* Running controls */}
                {timerRunning && (
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setTimerRunning(false)}
                      className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Pause size={16} />
                      Pause
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerFinished(false);
                        const total = clampInt(timerMinutes, 0, 180) * 60 + clampInt(timerSeconds, 0, 59);
                        setTimerRemaining(total);
                      }}
                      className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 flex items-center gap-2"
                    >
                      <RotateCcw size={16} />
                      Reset
                    </button>
                  </div>
                )}

                {/* Finished controls */}
                {timerFinished && (
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTimerFinished(false);
                        const total = clampInt(timerMinutes, 0, 180) * 60 + clampInt(timerSeconds, 0, 59);
                        setTimerRemaining(total);
                      }}
                      className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 flex items-center gap-2"
                    >
                      <RotateCcw size={16} />
                      Reset
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTimerFinished(false);
                        setTimerRunning(false);
                        setTimerOpen(false);
                      }}
                      className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {showClassSettings && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-extrabold text-slate-900">Class settings</div>
                  <button
                    type="button"
                    onClick={() => setShowClassSettings(false)}
                    className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Class name
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      placeholder="e.g. 6th Year Physics"
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    Subject
                    <input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      placeholder="e.g. Physics"
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    Teacher
                    <input
                      value={editTeacher}
                      onChange={(e) => setEditTeacher(e.target.value)}
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      placeholder="e.g. Mr Fitzgerald"
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    Group
                    <input
                      value={editGroup}
                      onChange={(e) => setEditGroup(e.target.value)}
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      placeholder="e.g. 1E"
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    Room
                    <input
                      value={editRoom}
                      onChange={(e) => setEditRoom(e.target.value)}
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                      placeholder="e.g. Lab"
                    />
                  </label>

                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowClassSettings(false)}
                      className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!classInfo) return;
                        const payload = { name: editName, subject: editSubject };

                        const r = await fetch(`${API_BASE}/classes/${classInfo.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                        });

                        if (!r.ok) {
                          alert("Could not save class changes.");
                          return;
                        }

                        const updated = await r.json();
                        setClassInfo(updated);

                        // Persist UI-only fields (teacher/group/room) per class
                        try {
                          const raw = localStorage.getItem(META_KEY);
                          const meta = raw ? JSON.parse(raw) : {};
                          const prev = meta[String(classId)] || {};

                          meta[String(classId)] = {
                            ...prev,
                            teacher: editTeacher.trim(),
                            group: editGroup.trim(),
                            room: editRoom.trim(),
                          };

                          localStorage.setItem(META_KEY, JSON.stringify(meta));
                        } catch { }

                        // Apply immediately to header + post composer default
                        const t = editTeacher.trim() || "Mr Fitzgerald";
                        setTeacherName(t);
                        setAuthor(t);
                        setGroupLabel(editGroup.trim() || "1E");
                        setRoomLabel(editRoom.trim() || "Lab");

                        setShowClassSettings(false);

                      }}
                      className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}



          <RightPanel />

          <ConfirmModal
            open={confirmOpen}
            title="Delete post?"
            message="Are you sure you want to permanently delete this post?"
            confirmText="Delete"
            cancelText="Cancel"
            danger
            onCancel={() => {
              setConfirmOpen(false);
              setPostToDelete(null);
            }}
            onConfirm={async () => {
              if (postToDelete == null) return;

              const idToDelete = postToDelete;
              setConfirmOpen(false);
              setPostToDelete(null);

              await deletePost(idToDelete);
            }}
          />
        </div>
      </div>
    </div>
  );
}
