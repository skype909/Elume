import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

// If you have a specific ELUME logo file, update this import path.
// If not, you can delete the <img> below and keep the text logo.
import ELogo2 from "./assets/ELogo2.png";

const API_BASE = "/api";

type StudentPost = {
  id: number;
  author?: string;
  content?: string;

  // backend might return any of these shapes
  links?: any; // array OR JSON string OR string
  files?: any; // array of files with url/path
  created_at?: string;
};

type StudentNote = {
  id: number;
  filename?: string;
  file_url?: string;
  url?: string;
  topic_name?: string;
};

type StudentTest = {
  id: number;
  title?: string;
  file_url?: string;
  url?: string;
  description?: string;
};

type StudentPayload = {
  class_name?: string;
  subject?: string;
  posts?: StudentPost[];
  notes?: StudentNote[];
  tests?: StudentTest[];
};

type View = "home" | "resources" | "tests";

function resolveFileUrl(u: string) {
  if (!u) return u;

  // Already absolute
  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  // Handle common variants:
  // "/uploads/x.png"  -> "/api/uploads/x.png"
  // "uploads/x.png"   -> "/api/uploads/x.png"
  // "api/uploads/x"   -> "/api/uploads/x"
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  if (u.startsWith("api/")) return `/${u}`;
  if (u.startsWith("uploads/")) return `${API_BASE}/${u}`;
  return `${API_BASE}/${u}`;
}

function normalizeLinks(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    // Try JSON array first
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {}
    // Otherwise split by newlines / commas
    return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  }

  return [];
}

function extractLinksFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  // http(s) links
  (text.match(/https?:\/\/[^\s)]+/gi) || []).forEach((m) => found.add(m));

  // uploads links (with or without a leading slash)
  (text.match(/\/?uploads\/[^\s)]+/gi) || []).forEach((m) => found.add(m));

  // Trim trailing punctuation that breaks URLs
  return Array.from(found).map((u) => u.replace(/[),.]+$/g, ""));
}

function extractLinksFromFiles(files: any): string[] {
  if (!Array.isArray(files)) return [];
  const urls: string[] = [];
  for (const f of files) {
    if (!f) continue;
    // common fields
    const u =
      (typeof f.file_url === "string" && f.file_url) ||
      (typeof f.url === "string" && f.url) ||
      (typeof f.path === "string" && f.path) ||
      (typeof f.location === "string" && f.location) ||
      "";
    if (u) urls.push(String(u));
  }
  return urls;
}

export default function StudentClassPage() {
  const { token } = useParams();
  const [data, setData] = useState<StudentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [view, setView] = useState<View>("home");

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    setLoading(true);
    setErr(null);

    fetch(`/api/student/${token}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Student page failed (${r.status})`);
        return (await r.json()) as StudentPayload;
      })
      .then((j) => setData(j ?? null))
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setErr(e?.message || "Failed to load student page");
        setData(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [token]);

  const className = data?.class_name || "Class";
  const subject = data?.subject || "";

  const posts = useMemo(() => (Array.isArray(data?.posts) ? data!.posts! : []), [data]);
  const notes = useMemo(() => (Array.isArray(data?.notes) ? data!.notes! : []), [data]);
  const tests = useMemo(() => (Array.isArray(data?.tests) ? data!.tests! : []), [data]);

  const notesByTopic = useMemo(() => {
    const map = new Map<string, StudentNote[]>();
    notes.forEach((n) => {
      const topic = (n.topic_name || "Resources").trim() || "Resources";
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic)!.push(n);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const pageWrap = "min-h-screen bg-gradient-to-b from-[#E9FFF0] via-white to-white";
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const softCard = "rounded-3xl bg-white/70 backdrop-blur border-2 border-slate-200";
  const btnBase =
    "w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-left shadow-sm active:translate-y-[1px]";
  const pill =
    "rounded-full border-2 border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700";
  const backBtn =
    "rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:translate-y-[1px]";
  const linkChip =
    "inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:translate-y-[1px] cursor-pointer";

  function TopBar() {
    return (
      <div className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {/* Logo (optional) */}
              <div className="grid h-10 w-10 place-items-center rounded-2xl border-2 border-slate-200 bg-white">
                <img src={ELogo2} alt="ELUME" className="h-8 w-8 object-contain" />
              </div>
              <div className="leading-tight">
                <div className="text-base font-extrabold tracking-tight text-slate-900">
                  ELUME
                </div>
                <div className="text-[11px] font-semibold text-emerald-700">
                  Learn, Grow, Succeed.
                </div>
              </div>
            </div>

            <div className="flex-1" />

            {view !== "home" && (
              <button type="button" className={backBtn} onClick={() => setView("home")}>
                ← Back
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function Hero() {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-5">
        <div className={`${softCard} overflow-hidden`}>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <div className="truncate text-xl font-extrabold tracking-tight text-slate-900">
                  {className}
                </div>
                <div className="truncate text-sm font-semibold text-slate-600">{subject}</div>
              </div>
              <div className="flex-1" />
              <div className={pill}>Student View</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`${btnBase} border-emerald-200 bg-emerald-50`}
                onClick={() => setView("resources")}
              >
                <div className="text-sm font-extrabold text-emerald-900">Resources</div>
                <div className="mt-1 text-xs font-semibold text-emerald-800/80">
                  PDFs, notes, cheat sheets
                </div>
              </button>

              <button
                type="button"
                className={`${btnBase} border-sky-200 bg-sky-50`}
                onClick={() => setView("tests")}
              >
                <div className="text-sm font-extrabold text-sky-900">Tests & Papers</div>
                <div className="mt-1 text-xs font-semibold text-sky-800/80">
                  Class tests and exam papers
                </div>
              </button>
            </div>
          </div>

          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500" />
        </div>
      </div>
    );
  }

  function EmptyState({ title, hint }: { title: string; hint: string }) {
    return (
      <div className={`${card} p-5`}>
        <div className="text-base font-extrabold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-600">{hint}</div>
      </div>
    );
  }

  function FileRow({ label, href }: { label: string; href: string }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 active:translate-y-[1px]"
        title="Open file"
      >
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl border-2 border-slate-200 bg-white text-sm font-extrabold">
          PDF
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-900">{label}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Tap to open</div>
        </div>
        <div className="shrink-0 text-xs font-extrabold text-slate-500">Open</div>
      </a>
    );
  }

  function Announcements() {
    if (!posts.length) {
      return <EmptyState title="Announcements" hint="No announcements yet. Check back soon." />;
    }

    return (
      <div className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-extrabold text-slate-900">Announcements</div>
          <div className="text-xs font-semibold text-slate-500">{posts.length}</div>
        </div>

        <div className="space-y-3">
          {posts.map((p) => {
            const text = String(p?.content || "");

            // Collect links from all possible places
            const fromLinksField = normalizeLinks((p as any)?.links);
            const fromFiles = extractLinksFromFiles((p as any)?.files);
            const fromText = extractLinksFromText(text);

            const allLinks = Array.from(
              new Set([...fromLinksField, ...fromFiles, ...fromText].filter(Boolean))
            );

            return (
              <div key={p.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                <div className="text-xs font-bold text-slate-600">{p.author || "Teacher"}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{text}</div>

                {/* Clickable links (whiteboard saved lives here) */}
                {allLinks.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {allLinks.map((l, i) => {
                      const href = resolveFileUrl(l);

                      // Use an explicit click handler for mobile reliability
                      return (
                        <button
                          key={`${p.id}-link-${i}`}
                          type="button"
                          className={linkChip}
                          onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                        >
                          🔗 Open
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function ResourcesView() {
    if (!notes.length) return <EmptyState title="Resources" hint="No resources uploaded yet." />;

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-extrabold text-slate-900">Resources</div>
          <div className="mt-1 text-sm text-slate-600">Tap any item to open.</div>
        </div>

        {notesByTopic.map(([topic, items]) => (
          <div key={topic} className={`${card} p-5`}>
            <div className="mb-3 text-sm font-extrabold text-slate-900">{topic}</div>
            <div className="space-y-2">
              {items.map((n) => {
                const label = n.filename || "Resource";
                const url = resolveFileUrl(n.file_url || n.url || "");
                return <FileRow key={`${n.id}-${label}`} label={label} href={url} />;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function TestsView() {
    if (!tests.length) return <EmptyState title="Tests & Papers" hint="No tests uploaded yet." />;

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-extrabold text-slate-900">Tests & Papers</div>
          <div className="mt-1 text-sm text-slate-600">Tap a test to open.</div>
        </div>

        <div className={`${card} p-5`}>
          <div className="space-y-2">
            {tests.map((t) => {
              const label = t.title || "Test";
              const url = resolveFileUrl(t.file_url || t.url || "");
              return <FileRow key={`${t.id}-${label}`} label={label} href={url} />;
            })}
          </div>
        </div>
      </div>
    );
  }

  function Content() {
    if (loading) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className={`${card} p-5`}>
            <div className="text-sm font-semibold text-slate-700">Loading…</div>
          </div>
        </div>
      );
    }

    if (err) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-3xl border-2 border-red-200 bg-white p-5">
            <div className="text-base font-extrabold text-red-800">Couldn’t load page</div>
            <div className="mt-2 text-sm text-red-700">{err}</div>
          </div>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <EmptyState title="Not found" hint="This student link may be invalid or expired." />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl px-4 pb-10">
        {view === "home" && (
          <div className="mt-5 space-y-4">
            <Announcements />
          </div>
        )}
        {view === "resources" && <div className="mt-5"><ResourcesView /></div>}
        {view === "tests" && <div className="mt-5"><TestsView /></div>}
      </div>
    );
  }

  return (
    <div className={pageWrap}>
      <TopBar />
      <Hero />
      <Content />
    </div>
  );
}