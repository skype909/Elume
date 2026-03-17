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
import { apiFetch } from "./api";



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

function teacherAdminKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v2__${email}`;
}

function metaKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_class_layout_v1__${email}`;
}

function loadTeacherDisplayName(): string {
  try {
    const raw = localStorage.getItem(teacherAdminKeyForUser());
    if (!raw) return "";

    const parsed = JSON.parse(raw);
    const p = parsed?.profile;
    if (!p) return "";

    const title = String(p.title ?? "").trim();
    const surname = String(p.surname ?? "").trim();

    if (!title || !surname) return "";
    return `${title} ${surname}`;
  } catch {
    return "";
  }
}

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

type StudentRow = {
  id: number;
  class_id: number;
  first_name: string;
  notes?: string | null;
  active: boolean;
};

type ClassAccessDetails = {
  class_id: number;
  class_code: string;
  class_pin: string;
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

function resolveFileUrl(u: string) {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return `${API_BASE}/${u}`;
}

async function openProtectedAttachmentInNewTab(link: string) {
  // External links should still open normally
  if (link.startsWith("http://") || link.startsWith("https://")) {
    window.open(link, "_blank", "noopener,noreferrer");
    return;
  }

  const url = resolveFileUrl(link);

  const res = await apiFetch(url, {
    method: "GET",
    // pass-through for fetch init if your helper supports it
  });

  // If apiFetch returns a Response
  if (res instanceof Response) {
    if (!res.ok) {
      throw new Error(`Failed to open attachment (${res.status})`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return;
  }

  throw new Error("Unexpected attachment response");
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

            {/* Hidden file picker */}
            <input
              id="postFilePicker"
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />

            <button
              className={btn}
              type="button"
              onClick={() => document.getElementById("postFilePicker")?.click()}
              title="Attach files"
            >
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

        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <button
                key={f.name + i}
                type="button"
                className={`${chip} hover:bg-slate-100`}
                onClick={() => removeFile(i)}
                title="Remove file"
              >
                📎 {f.name} ✕
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
  const [classCode, setClassCode] = useState<string | null>(null);
  const [classPin, setClassPin] = useState<string | null>(null);
  const [loadingClassAccess, setLoadingClassAccess] = useState(false);

  const [classInfo, setClassInfo] = useState<ClassItem | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState(() => loadTeacherDisplayName() || "Teacher");
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
  const [teacherName, setTeacherName] = useState(() => loadTeacherDisplayName() || "Teacher");
  const [displayId, setDisplayId] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editDisplayId, setEditDisplayId] = useState("");
  const [roomLabel, setRoomLabel] = useState("Lab");
  const [editRoom, setEditRoom] = useState("");
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContentDraft, setEditContentDraft] = useState("");
  const [editLinksDraft, setEditLinksDraft] = useState<string[]>([]);
  const [editLinkDraft, setEditLinkDraft] = useState("");

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);


  const [activeTab, setActiveTab] = useState<"announce" | "notes" | "whiteboard">(
    "announce"
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<number | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  // UI-only: mock "group" like your PDF
  const [groupLabel, setGroupLabel] = useState("1E");
  const navigate = useNavigate();


  useEffect(() => {
    if (!validClassId) {
      setStudents([]);
      setLoadingStudents(false);
      return;
    }

    const controller = new AbortController();
    setLoadingStudents(true);

    apiFetch(`${API_BASE}/classes/${classId}/students`, { signal: controller.signal })
      .then((studs) => setStudents(Array.isArray(studs) ? studs : []))
      .catch((e) => {
        if (e?.name === "AbortError") return;
        console.error("Students load error:", e);
        setStudents([]);
      })
      .finally(() => setLoadingStudents(false));

    return () => controller.abort();
  }, [classId, validClassId]);

  useEffect(() => {
    if (!validClassId) {
      setClassCode(null);
      setClassPin(null);
      setLoadingClassAccess(false);
      return;
    }

    const controller = new AbortController();
    setLoadingClassAccess(true);

    apiFetch(`${API_BASE}/classes/${classId}/student-access-code`, {
      signal: controller.signal,
    })
      .then((data) => {
        const access = data as Partial<ClassAccessDetails> | null;
        setClassCode(typeof access?.class_code === "string" ? access.class_code : null);
        setClassPin(typeof access?.class_pin === "string" ? access.class_pin : null);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        console.error("Class access details error:", e);
        setClassCode(null);
        setClassPin(null);
      })
      .finally(() => setLoadingClassAccess(false));

    return () => controller.abort();
  }, [classId, validClassId]);

  async function copyText(value: string, successLabel: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      alert(successLabel);
    }
  }

  async function regenerateClassPin() {
    if (!validClassId) return;
    const data = (await apiFetch(`${API_BASE}/classes/${classId}/regenerate-student-access-pin`, {
      method: "POST",
    })) as ClassAccessDetails;
    setClassCode(data.class_code);
    setClassPin(data.class_pin);
  }

  async function openProtectedLinkInNewTab(link: string) {
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("access_token");

    if (!token) {
      throw new Error("Missing login token");
    }

    const res = await fetch(resolveFileUrl(link), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to open file (${res.status})`);
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    window.open(objectUrl, "_blank", "noopener,noreferrer");

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60000);
  }

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

    apiFetch(`${API_BASE}/classes/${classId}`, { signal: controller.signal })
      .catch(async () => {
        const list = (await apiFetch(`${API_BASE}/classes`, {
          signal: controller.signal,
        })) as ClassItem[];
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
        let data: any;
        try {
          data = await apiFetch(`${API_BASE}/student-access/${classId}`, {
            method: "GET",
            signal: controller.signal,
          });
        } catch {
          data = await apiFetch(`${API_BASE}/student-access/${classId}`, {
            method: "POST",
            signal: controller.signal,
          });
        }
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
      const raw = localStorage.getItem(metaKeyForUser());
      if (!raw) return;

      const meta = JSON.parse(raw);
      const entry = meta?.[String(classId)] || {};

      if (entry?.color) setClassColour(entry.color);

      const adminTeacherName = loadTeacherDisplayName();
      if (adminTeacherName) {
        setTeacherName(adminTeacherName);
        setAuthor(adminTeacherName);
      } else if (typeof entry?.teacher === "string" && entry.teacher.trim()) {
        // fallback for any older saved class data
        setTeacherName(entry.teacher);
        setAuthor(entry.teacher);
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
    const refreshTeacher = () => {
      const adminTeacherName = loadTeacherDisplayName();
      if (adminTeacherName) {
        setTeacherName(adminTeacherName);
        setAuthor(adminTeacherName);
      }
    };

    window.addEventListener("storage", refreshTeacher);
    window.addEventListener("focus", refreshTeacher);

    return () => {
      window.removeEventListener("storage", refreshTeacher);
      window.removeEventListener("focus", refreshTeacher);
    };
  }, []);


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

  async function saveEditPost(postId: number) {
    try {
      setError(null);

      const updated = normalizePost(
        await apiFetch(`${API_BASE}/posts/${postId}`, {
          method: "PUT",
          body: JSON.stringify({
            content: editContentDraft,
            links: editLinksDraft,
          }),
        })
      );

      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
      cancelEditPost();
    } catch (e: any) {
      setError(e?.message || "Failed to update post");
    }
  }

  // Random Name Generator (right panel)
  const [nameGenOpen, setNameGenOpen] = useState(false);
  const [nameResult, setNameResult] = useState<string | null>(null);
  const [namePicking, setNamePicking] = useState(false);


  const studentNames = useMemo(() => {
    const names = students
      .filter((s) => s.active)
      .map((s) => (s.first_name || "").trim())
      .filter(Boolean);

    // de-dupe while preserving order
    return Array.from(new Set(names));
  }, [students]);

  const nameCount = studentNames.length;
  const nameValid = nameCount >= 1;

  function pickRandomName() {
    if (!nameValid || namePicking) return;

    setNamePicking(true);
    setNameResult(null);

    const previewNames = studentNames.slice();
    let count = 0;

    const flicker = window.setInterval(() => {
      const idx = Math.floor(Math.random() * previewNames.length);
      setNameResult(previewNames[idx]);
      count += 1;

      if (count >= 14) {
        window.clearInterval(flicker);
        const finalIdx = Math.floor(Math.random() * previewNames.length);
        setNameResult(previewNames[finalIdx]);
        setNamePicking(false);
      }
    }, 90);
  }


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

        const data = await apiFetch(`${API_BASE}/calendar-events?class_id=${classId}`, {
          signal: controller.signal,
        });
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
      const data = await apiFetch(`${API_BASE}/classes/${classId}/posts`);
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

    apiFetch(`${API_BASE}/classes/${classId}/posts`, { signal: controller.signal })
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

    const trimmedContent = content.trim();
    const hasLinks = links.length > 0;
    const hasFiles = files.length > 0;

    if (!trimmedContent && !hasLinks && !hasFiles) return;

    setPosting(true);
    setError(null);

    const fd = new FormData();
    fd.append("author", author || "Teacher");
    fd.append("content", trimmedContent);
    fd.append("links", JSON.stringify(links || []));

    for (const f of files) {
      fd.append("files", f);
    }

    apiFetch(`${API_BASE}/classes/${classId}/posts`, {
      method: "POST",
      body: fd,
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

      await apiFetch(`${API_BASE}/posts/${postId}`, {
        method: "DELETE",
      });

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

  function startEditPost(p: Post) {
    setEditingPostId(p.id);
    setEditContentDraft(p.content || "");
    setEditLinksDraft(p.links || []);
    setEditLinkDraft("");
  }

  function cancelEditPost() {
    setEditingPostId(null);
    setEditContentDraft("");
    setEditLinksDraft([]);
    setEditLinkDraft("");
  }

  function addEditLink() {
    const v = editLinkDraft.trim();
    if (!v) return;
    const url = v.startsWith("http://") || v.startsWith("https://") ? v : `https://${v}`;
    setEditLinksDraft((prev) => [url, ...prev]);
    setEditLinkDraft("");
  }

  function removeEditLink(i: number) {
    setEditLinksDraft((prev) => prev.filter((_, idx) => idx !== i));
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

  // Live clock (updates every 30s so minutes stay accurate, no seconds shown)
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const dayName = now.toLocaleDateString("en-IE", { weekday: "long" });
  const dayNumber = now.getDate();
  const monthName = now.toLocaleDateString("en-IE", { month: "long" });
  const timeNow = now.toLocaleTimeString("en-IE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // IMPORTANT: keep using `today` below for calendar logic, but base it on `now`
  const today = now;
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

  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const end3 = new Date(start);
  end3.setDate(start.getDate() + 3);

  const end7 = new Date(start);
  end7.setDate(start.getDate() + 7);

  const eventsToday = classEvents.filter((e: any) =>
    normYMD(getEventDate(e)) === todayYMD
  );

  const eventsNext3 = classEvents.filter((e: any) => {
    const d = new Date(normYMD(getEventDate(e)) + "T00:00:00");
    return d > start && d <= end3;
  });

  const next7 = classEvents
    .filter((e: any) => {
      const d = new Date(normYMD(getEventDate(e)) + "T00:00:00");
      return d >= start && d < end7;
    })
    .slice()
    .sort((a: any, b: any) =>
      normYMD(getEventDate(a)).localeCompare(normYMD(getEventDate(b)))
    );

  const bellMode: "none" | "soon" | "today" | "both" =
    eventsToday.length && eventsNext3.length
      ? "both"
      : eventsToday.length
        ? "today"
        : eventsNext3.length
          ? "soon"
          : "none";

  const bellColor =
    bellMode === "both"
      ? "ring-4 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.65)]"
      : bellMode === "today"
        ? "ring-4 ring-red-400 shadow-[0_0_18px_rgba(248,113,113,0.65)]"
        : bellMode === "soon"
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
            { label: "Dashboard", to: `/` },
            { label: "Whiteboard", to: `/whiteboard/${classId}` },
            { label: "Collaborate", to: `/class/${classId}/collaboration` },
            { label: "eBooks", to: null },
            { label: "Class Admin", to: `/class/${classId}/admin` },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (!item.to) {
                  alert("Coming soon 🙂");
                  return;
                }

                navigate(item.to);
              }}
              className={
                item.label === "Dashboard"
                  ? "w-full rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100"
                  : "w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
              }
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
                onClick={() => copyText(studentUrl, "Student link copied")}
                className="mt-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50"
              >
                Copy link
              </button>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white/90 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Class code
                </div>
                <div className="mt-1 text-lg font-black tracking-[0.18em] text-slate-900">
                  {loadingClassAccess ? "Loading..." : classCode || "—"}
                </div>
              </div>

              {classCode ? (
                <button
                  type="button"
                  onClick={() => copyText(classCode, "Class code copied")}
                  className="rounded-xl border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                >
                  Copy
                </button>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-slate-500">
              Students use this with the class PIN in Student Hub.
            </div>
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
          <div className="relative rounded-3xl border-2 border-slate-200 bg-white p-3 text-center shadow-[0_2px_0_rgba(15,23,42,0.06)] text-slate-900">
            <div className="text-sm text-slate-600 font-semibold">{dayName}</div>
            <div className="text-4xl font-extrabold leading-tight">{dayNumber}</div>
            <div className="text-sm text-slate-600 font-semibold">{monthName}</div>
            <div className="text-xs text-slate-700 tracking-tight">
              <span className="font-semibold">{timeNow.split(" ")[0]}</span>
              <span className="text-[0.6rem] align-top ml-0.5 opacity-70">
                {timeNow.split(" ")[1]}
              </span>
            </div>
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
                  onClick={() => startEditPost(p)}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  title="Edit post"
                >
                  Edit
                </button>

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
              {editingPostId === p.id ? (
                <div className="mt-4 grid gap-3">
                  <textarea
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    rows={4}
                    value={editContentDraft}
                    onChange={(e) => setEditContentDraft(e.target.value)}
                  />

                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <input
                      className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                      value={editLinkDraft}
                      onChange={(e) => setEditLinkDraft(e.target.value)}
                      placeholder="Paste a link…"
                    />
                    <button className={btn} type="button" onClick={addEditLink}>
                      Add link
                    </button>
                  </div>

                  {editLinksDraft.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editLinksDraft.map((l, i) => (
                        <button
                          key={l + i}
                          type="button"
                          className={`${chip} hover:bg-slate-100`}
                          onClick={() => removeEditLink(i)}
                          title="Remove link"
                        >
                          🔗 {l} ✕
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button className={btn} type="button" onClick={cancelEditPost}>
                      Cancel
                    </button>
                    <button
                      className={btnPrimary}
                      type="button"
                      onClick={() => saveEditPost(p.id)}
                      disabled={!editContentDraft.trim()}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                  {p.content}
                </div>
              )}

              {/* Attachments ✅ SAFE because p.links is always an array after normalise */}
              {(p.links?.length || p.files?.length) && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {p.files?.map((f, i) => (
                    <span key={i} className={chip}>
                      📄 {f.name}
                    </span>
                  ))}

                  {p.links?.map((l, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={async () => {
                        try {
                          await openProtectedLinkInNewTab(l);
                        } catch (err) {
                          console.error(err);
                          alert("Could not open attachment.");
                        }
                      }}
                      className={`${chip} hover:bg-slate-100`}
                    >
                      📎 Click here
                    </button>
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

        {/* Resources */}
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

        {/* Classroom Tools */}
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
                    onClick={() => setNameGenOpen(true)}
                  >
                    <div className={toolIcon}>🙋</div>
                    <div className={toolLabel}>
                      Random
                      <br />
                      Name
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
        </div>

        {/* Generate Links */}
        <div className={`mt-6 rounded-3xl border-2 border-slate-200 ${soft} p-4`}>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl border-2 border-slate-200 bg-white">
              <Icon name="spark" />
            </span>
            <div className="text-lg font-extrabold tracking-tight">Generate Links</div>
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

      </div>
    </aside>
  );


  return (
    <div className="min-h-screen bg-emerald-100 p-6">
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

                  {bellMode === "soon" && (
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

          {nameGenOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold text-slate-900">Random Name Generator</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Picks from active students in Class Admin.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setNameGenOpen(false)}
                    className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-5 rounded-3xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 text-center shadow-sm">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-white/80 bg-white shadow-md text-2xl">
                    🙋
                  </div>

                  <div className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                    Selected Student
                  </div>

                  <div
                    className={[
                      "mt-3 rounded-3xl border-2 px-4 py-6 text-3xl font-extrabold tracking-tight shadow-sm transition-all",
                      namePicking
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 animate-pulse"
                        : "border-slate-200 bg-white text-slate-900",
                    ].join(" ")}
                  >
                    {loadingStudents ? "Loading..." : nameResult ?? "—"}
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    {loadingStudents
                      ? "Loading students..."
                      : `${nameCount} active student${nameCount === 1 ? "" : "s"} available`}
                  </div>
                </div>

                {!loadingStudents && !nameValid && (
                  <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No active students found. Add students in Class Admin.
                  </div>
                )}

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    onClick={pickRandomName}
                    disabled={!nameValid || namePicking || loadingStudents}
                  >
                    {loadingStudents ? "Loading..." : namePicking ? "Picking..." : "Pick Name"}
                  </button>

                  <button
                    type="button"
                    className={pill}
                    onClick={() => setNameResult(null)}
                    disabled={namePicking}
                  >
                    Reset
                  </button>
                </div>

                {nameValid && (
                  <div className="mt-3 text-[11px] text-slate-500">
                    Loaded: {nameCount} active student{nameCount === 1 ? "" : "s"}.
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

                  <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
                    <div className="text-sm font-extrabold text-slate-900">Student access details</div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      Use this with the class code on Student Hub.
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Class code
                        </div>
                        <div className="mt-2 text-xl font-black tracking-[0.14em] text-slate-900">
                          {loadingClassAccess ? "Loading..." : classCode || "—"}
                        </div>
                        {classCode ? (
                          <button
                            type="button"
                            onClick={() => copyText(classCode, "Class code copied")}
                            className="mt-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                          >
                            Copy code
                          </button>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Class PIN
                        </div>
                        <div className="mt-2 text-xl font-black tracking-[0.18em] text-slate-900">
                          {loadingClassAccess ? "Loading..." : classPin || "—"}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {classPin ? (
                            <button
                              type="button"
                              onClick={() => copyText(classPin, "Class PIN copied")}
                              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                            >
                              Copy PIN
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={regenerateClassPin}
                            className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            Regenerate PIN
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

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

                        const updated = await apiFetch(`${API_BASE}/classes/${classInfo.id}`, {
                          method: "PUT",
                          body: JSON.stringify(payload),
                        });
                        setClassInfo(updated);

                        // Persist UI-only fields (teacher/group/room) per class
                        try {
                          const raw = localStorage.getItem(metaKeyForUser());
                          const meta = raw ? JSON.parse(raw) : {};
                          const prev = meta[String(classId)] || {};

                          meta[String(classId)] = {
                            ...prev,
                            teacher: editTeacher.trim(),
                            group: editGroup.trim(),
                            room: editRoom.trim(),
                          };

                          localStorage.setItem(metaKeyForUser(), JSON.stringify(meta));
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
