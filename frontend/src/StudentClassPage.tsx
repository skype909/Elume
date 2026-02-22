import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

// Reuse your existing brand assets (these already exist in your project)
import elumeLogo from "./assets/elume-logo.png";
import ELogo from "./assets/ELogo.png";

type StudentPost = {
  id: number;
  author?: string;
  content?: string;
  createdAt?: string;
  created_at?: string;
};

type StudentFile = {
  id: number;
  filename?: string;
  title?: string;
  file_url?: string;
  url?: string;
  kind?: string; // optional ("resource" / "exam" etc.)
  topic_name?: string;
  uploaded_at?: string;
};

type StudentData = {
  class_name?: string;
  subject?: string;
  posts?: StudentPost[];

  // Different backends may return different keys — we support several.
  notes?: StudentFile[]; // resources (and possibly exams too)
  resources?: StudentFile[];
  tests?: StudentFile[];

  papers?: StudentFile[]; // exam papers
  exam_papers?: StudentFile[];
  exam?: StudentFile[];
};

type View = "home" | "resources" | "tests" | "papers";

function safeStr(v: any, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function safeArr<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function resolveFileUrl(u?: string) {
  if (!u) return "";
  // If backend already returns absolute URL, keep it
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  // Otherwise it's typically already usable as "/uploads/..." on same origin via nginx reverse proxy
  // (If your backend serves uploads behind /api, you can adjust this later)
  return u;
}

function formatPostStamp(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${day} ${month} ${h}:${m}${ampm}`;
}

export default function StudentClassPage() {
  const { token } = useParams();
  const [data, setData] = useState<StudentData | null>(null);
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
        return (await r.json()) as StudentData;
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

  const className = safeStr(data?.class_name, "Class");
  const subject = safeStr(data?.subject, "");

  // Posts
  const posts = useMemo(() => {
    const arr = safeArr<StudentPost>(data?.posts);
    return arr.map((p) => ({
      id: Number(p?.id),
      author: safeStr(p?.author, "Teacher"),
      content: safeStr(p?.content, ""),
      stamp: formatPostStamp(p?.createdAt || p?.created_at),
    }));
  }, [data]);

  // Resources / Papers / Tests (defensive)
  const rawNotes = useMemo(() => {
    // prefer explicit resources, fallback to notes
    return safeArr<StudentFile>(data?.resources).length
      ? safeArr<StudentFile>(data?.resources)
      : safeArr<StudentFile>(data?.notes);
  }, [data]);

  const rawPapers = useMemo(() => {
    const direct =
      safeArr<StudentFile>(data?.papers).length
        ? safeArr<StudentFile>(data?.papers)
        : safeArr<StudentFile>(data?.exam_papers).length
          ? safeArr<StudentFile>(data?.exam_papers)
          : safeArr<StudentFile>(data?.exam);
    if (direct.length) return direct;

    // fallback: if notes include "kind", treat kind==="exam" as papers
    return rawNotes.filter((n) => safeStr(n?.kind).toLowerCase() === "exam");
  }, [data, rawNotes]);

  const resources = useMemo(() => {
    // if notes include kind, exclude exam
    const hasKind = rawNotes.some((n) => typeof n?.kind === "string" && n.kind);
    if (hasKind) return rawNotes.filter((n) => safeStr(n?.kind).toLowerCase() !== "exam");
    // otherwise treat notes as resources (and papers will just be empty unless backend provides them separately)
    return rawNotes;
  }, [rawNotes]);

  const tests = useMemo(() => safeArr<StudentFile>(data?.tests), [data]);

  // Simple grouping helper (topic_name if provided)
  function groupByTopic(items: StudentFile[]) {
    const map = new Map<string, StudentFile[]>();
    items.forEach((it) => {
      const key = safeStr(it?.topic_name, "General");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });

    // sort items by id desc if present
    Array.from(map.keys()).forEach((k) => {
      const arr = map.get(k) || [];
      arr.sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
      map.set(k, arr);
    });

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  const resourcesGrouped = useMemo(() => groupByTopic(resources), [resources]);
  const papersGrouped = useMemo(() => groupByTopic(rawPapers), [rawPapers]);

  // UI tokens (mobile-first)
  const pageWrap = "min-h-screen bg-gradient-to-b from-[#E9FFF0] via-white to-white";
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const softCard = "rounded-3xl bg-white/70 backdrop-blur border-2 border-slate-200";
  const btnBase =
    "w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-left shadow-sm active:translate-y-[1px]";
  const tinyPill =
    "rounded-full border-2 border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700";
  const backBtn =
    "rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:translate-y-[1px]";

  function TopBar() {
    return (
      <div className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <img
                src={ELogo}
                alt="ELUME"
                className="h-10 w-10 rounded-2xl border-2 border-slate-200 bg-white object-contain p-1"
              />
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

            {/* View-aware back button */}
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
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                <img src={elumeLogo} alt="ELUME" className="h-8 w-8 object-contain" />
              </div>

              <div className="min-w-0">
                <div className="truncate text-xl font-extrabold tracking-tight text-slate-900">
                  {className}
                </div>
                <div className="truncate text-sm font-semibold text-slate-600">
                  {subject}
                </div>
              </div>

              <div className="flex-1" />
              <div className={tinyPill}>Student View</div>
            </div>

            {/* big action buttons */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                <div className="text-sm font-extrabold text-sky-900">Tests</div>
                <div className="mt-1 text-xs font-semibold text-sky-800/80">
                  Class tests & worksheets
                </div>
              </button>

              <button
                type="button"
                className={`${btnBase} border-violet-200 bg-violet-50`}
                onClick={() => setView("papers")}
              >
                <div className="text-sm font-extrabold text-violet-900">Papers</div>
                <div className="mt-1 text-xs font-semibold text-violet-800/80">
                  Exam papers by topic
                </div>
              </button>
            </div>
          </div>

          {/* accent strip */}
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

  function FileRow({
    label,
    url,
    meta,
  }: {
    label: string;
    url: string;
    meta?: string;
  }) {
    return (
      <a
        href={url}
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
          {meta ? <div className="mt-0.5 text-xs text-slate-600">{meta}</div> : null}
        </div>

        <div className="shrink-0 text-xs font-extrabold text-slate-500">Open</div>
      </a>
    );
  }

  function Announcements() {
    if (!posts.length) {
      return (
        <EmptyState
          title="Announcements"
          hint="No announcements yet. Check back soon."
        />
      );
    }

    return (
      <div className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-extrabold text-slate-900">Announcements</div>
          <div className="text-xs font-semibold text-slate-500">{posts.length}</div>
        </div>

        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-bold text-slate-600">{p.author}</div>
                {p.stamp ? (
                  <div className="text-[11px] font-semibold text-slate-400">{p.stamp}</div>
                ) : null}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                {p.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ResourcesView() {
    if (!resources.length) {
      return (
        <EmptyState
          title="Resources"
          hint="No resources uploaded yet."
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-extrabold text-slate-900">Resources</div>
          <div className="mt-1 text-sm text-slate-600">
            Tap any item to open.
          </div>
        </div>

        {resourcesGrouped.map(([topic, items]) => (
          <div key={topic} className={`${card} p-5`}>
            <div className="mb-3 text-sm font-extrabold text-slate-900">{topic}</div>
            <div className="space-y-2">
              {items.map((n) => {
                const label = safeStr(n?.filename, safeStr(n?.title, "Resource"));
                const url = resolveFileUrl(n?.file_url || n?.url);
                const meta = n?.uploaded_at
                  ? `Uploaded: ${new Date(n.uploaded_at).toLocaleString()}`
                  : undefined;

                return <FileRow key={String(n?.id) + label} label={label} url={url} meta={meta} />;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function TestsView() {
    if (!tests.length) {
      return (
        <EmptyState
          title="Tests"
          hint="No tests uploaded yet."
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-extrabold text-slate-900">Tests</div>
          <div className="mt-1 text-sm text-slate-600">
            Tap a test to open.
          </div>
        </div>

        <div className={`${card} p-5`}>
          <div className="space-y-2">
            {tests.map((t) => {
              const label = safeStr(t?.title, safeStr(t?.filename, "Test"));
              const url = resolveFileUrl(t?.file_url || t?.url);
              const meta = t?.uploaded_at
                ? `Uploaded: ${new Date(t.uploaded_at).toLocaleString()}`
                : undefined;

              return <FileRow key={String(t?.id) + label} label={label} url={url} meta={meta} />;
            })}
          </div>
        </div>
      </div>
    );
  }

  function PapersView() {
    if (!rawPapers.length) {
      return (
        <EmptyState
          title="Papers"
          hint="No exam papers found yet. (If your backend doesn’t return papers separately, we can add it.)"
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-extrabold text-slate-900">Papers</div>
          <div className="mt-1 text-sm text-slate-600">
            Exam papers by topic. Tap to open.
          </div>
        </div>

        {papersGrouped.map(([topic, items]) => (
          <div key={topic} className={`${card} p-5`}>
            <div className="mb-3 text-sm font-extrabold text-slate-900">{topic}</div>
            <div className="space-y-2">
              {items.map((n) => {
                const label = safeStr(n?.filename, safeStr(n?.title, "Paper"));
                const url = resolveFileUrl(n?.file_url || n?.url);
                const meta = n?.uploaded_at
                  ? `Uploaded: ${new Date(n.uploaded_at).toLocaleString()}`
                  : undefined;

                return <FileRow key={String(n?.id) + label} label={label} url={url} meta={meta} />;
              })}
            </div>
          </div>
        ))}
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
        {/* Home view always shows announcements + action buttons in Hero */}
        {view === "home" && (
          <div className="mt-5 space-y-4">
            <Announcements />
          </div>
        )}

        {view === "resources" && <div className="mt-5"><ResourcesView /></div>}
        {view === "tests" && <div className="mt-5"><TestsView /></div>}
        {view === "papers" && <div className="mt-5"><PapersView /></div>}
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