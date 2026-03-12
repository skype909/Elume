import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ELogo2 from "./assets/ELogo2.png";

const API_BASE = "/api";

type StudentPost = {
  id: number;
  author?: string;
  content?: string;
  links?: any;
  files?: any;
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

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function resolveFileUrl(u: string) {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
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
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch { }
    return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  }

  return [];
}

function extractLinksFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  (text.match(/https?:\/\/[^\s)]+/gi) || []).forEach((m) => found.add(m));
  (text.match(/\/?uploads\/[^\s)]+/gi) || []).forEach((m) => found.add(m));

  return Array.from(found).map((u) => u.replace(/[),.]+$/g, ""));
}

function extractLinksFromFiles(files: any): string[] {
  if (!Array.isArray(files)) return [];
  const urls: string[] = [];
  for (const f of files) {
    if (!f) continue;
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

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true;
}

function cleanSessionCode(s: string) {
  return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase().trim();
}

export default function StudentClassPage() {
  const { token } = useParams();

  const [data, setData] = useState<StudentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [view, setView] = useState<View>("home");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const [quizCode, setQuizCode] = useState("");
  const [quizJoinError, setQuizJoinError] = useState<string | null>(null);
  const [collabCode, setCollabCode] = useState("");
  const [collabJoinError, setCollabJoinError] = useState<string | null>(null);

  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showSaveBanner, setShowSaveBanner] = useState(false);
  const [saveBannerDismissed, setSaveBannerDismissed] = useState(false);

  const dismissKey = useMemo(() => `elume:student:save-banner:dismissed:${token || "unknown"}`, [token]);

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

  useEffect(() => {
    const dismissed = localStorage.getItem(dismissKey) === "1";
    setSaveBannerDismissed(dismissed);

    if (!dismissed && !isInStandaloneMode()) {
      setShowSaveBanner(true);
    }
  }, [dismissKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      if (!saveBannerDismissed && !isInStandaloneMode()) {
        setShowSaveBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, [saveBannerDismissed]);

  const className = data?.class_name || "Class";
  const subject = data?.subject || "";

  const posts = useMemo<StudentPost[]>(() => (
    Array.isArray(data?.posts) ? data?.posts ?? [] : []
  ), [data]);

  const notes = useMemo<StudentNote[]>(() => (
    Array.isArray(data?.notes) ? data?.notes ?? [] : []
  ), [data]);

  const tests = useMemo<StudentTest[]>(() => (
    Array.isArray(data?.tests) ? data?.tests ?? [] : []
  ), [data]);

  const notesByTopic = useMemo(() => {
    const map = new Map<string, StudentNote[]>();
    notes.forEach((n) => {
      const topic = (n.topic_name || "Resources").trim() || "Resources";
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic)!.push(n);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const pageWrap =
    "min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50";
  const card =
    "rounded-[28px] border border-white/70 bg-white/85 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl";
  const softCard =
    "rounded-[28px] border border-white/70 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl";
  const btnBase =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition active:scale-[0.99]";
  const pill =
    "rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700";
  const backBtn =
    "rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50 active:scale-[0.99]";
  const linkChip =
    "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.99] cursor-pointer";

  function dismissSaveBanner() {
    localStorage.setItem(dismissKey, "1");
    setSaveBannerDismissed(true);
    setShowSaveBanner(false);
  }

  async function handleInstallClick() {
    if (!installPromptEvent) return;
    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
    } catch { }
    dismissSaveBanner();
    setInstallPromptEvent(null);
  }

  function goToQuizJoin() {
    const code = cleanSessionCode(quizCode);
    if (!code) {
      setQuizJoinError("Enter your session code first.");
      return;
    }
    setQuizJoinError(null);
    window.location.href = `${window.location.origin}/#/join/${code}`;
  }

  function goToCollabJoin() {
    const code = cleanSessionCode(collabCode);
    if (!code) {
      setCollabJoinError("Enter your collaboration code first.");
      return;
    }
    setCollabJoinError(null);
    window.location.href = `${window.location.origin}/#/collab/join/${code}`;
  }

  function TopBar() {
    return (
      <div className="sticky top-0 z-30 border-b border-slate-100/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white shadow-md">
                <img src={ELogo2} alt="ELUME" className="h-8 w-8 object-contain" />
              </div>

              <div className="min-w-0 leading-tight">
                <div className="truncate text-base font-black tracking-tight text-slate-900">
                  Elume
                </div>
                <div className="truncate text-[11px] font-bold text-emerald-700">
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

  function SaveBanner() {
    if (!showSaveBanner || loading || err || !data) return null;

    return (
      <div className="mx-auto max-w-3xl px-3 pt-4 sm:px-4">
        <div className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-[0_12px_35px_rgba(16,185,129,0.12)]">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white shadow-sm">
              <img src={ELogo2} alt="Elume" className="h-8 w-8 object-contain" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                Save this page
              </div>
              <div className="mt-1 text-lg font-black tracking-tight text-slate-900">
                Keep your class page one tap away
              </div>

              {installPromptEvent ? (
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  Add this page to your phone’s home screen so you can open notes, tests and live quizzes faster.
                </div>
              ) : isIos() ? (
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  On iPhone: tap <span className="font-black text-slate-900">Share</span> then
                  <span className="font-black text-slate-900"> Add to Home Screen</span>.
                </div>
              ) : (
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  Save this page as a bookmark or add it to your home screen for quicker access next time.
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {installPromptEvent ? (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-lg active:scale-[0.99]"
                  >
                    Add to Home Screen
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={dismissSaveBanner}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm active:scale-[0.99]"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Hero() {
    return (
      <div className="mx-auto max-w-3xl px-3 pt-4 sm:px-4 sm:pt-5">
        <div className={`${softCard} overflow-hidden`}>
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl border border-white/70 bg-white shadow-md">
                <img src={ELogo2} alt="Elume" className="h-10 w-10 object-contain" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={pill}>Student View</div>
                  {subject ? <div className={pill}>{subject}</div> : null}
                </div>

                <div className="mt-3 truncate text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  {className}
                </div>

                <div className="mt-2 text-sm leading-6 text-slate-600">
                  Announcements, resources, tests, and live quiz access in one mobile-friendly page.
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                className={`${btnBase} border-emerald-200 bg-emerald-50 hover:bg-emerald-100`}
                onClick={() => {
                  setSelectedTopic(null);
                  setView("resources");
                }}
              >
                <div className="text-sm font-black text-emerald-900">Resources</div>
                <div className="mt-1 text-xs font-semibold text-emerald-800/80">
                  PDFs, notes, worksheets
                </div>
              </button>

              <button
                type="button"
                className={`${btnBase} border-sky-200 bg-sky-50 hover:bg-sky-100`}
                onClick={() => setView("tests")}
              >
                <div className="text-sm font-black text-sky-900">Tests & Papers</div>
                <div className="mt-1 text-xs font-semibold text-sky-800/80">
                  Class tests and exam papers
                </div>
              </button>

              <button
                type="button"
                className={`${btnBase} border-violet-200 bg-violet-50 hover:bg-violet-100`}
                onClick={() => {
                  const el = document.getElementById("live-quiz-card");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <div className="text-sm font-black text-violet-900">Join Live Quiz</div>
                <div className="mt-1 text-xs font-semibold text-violet-800/80">
                  Enter a session code
                </div>
              </button>
            </div>
          </div>
          <button
            type="button"
            className={`${btnBase} border-cyan-200 bg-cyan-50 hover:bg-cyan-100`}
            onClick={() => {
              const el = document.getElementById("live-collab-card");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <div className="text-sm font-black text-cyan-900">Join Collab Board</div>
            <div className="mt-1 text-xs font-semibold text-cyan-800/80">
              Enter a session code
            </div>
          </button>

          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500" />
        </div>
      </div>
    );
  }

  function EmptyState({ title, hint }: { title: string; hint: string }) {
    return (
      <div className={`${card} p-5`}>
        <div className="text-base font-black text-slate-900">{title}</div>
        <div className="mt-2 text-sm leading-6 text-slate-600">{hint}</div>
      </div>
    );
  }

  function FileRow({ label, href }: { label: string; href: string }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm active:scale-[0.99]"
        title="Open file"
      >
        <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700">
          PDF
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-900">{label}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Tap to open</div>
        </div>
        <div className="shrink-0 text-xs font-black text-slate-500">Open</div>
      </a>
    );
  }

  function LiveQuizCard() {
    return (
      <div id="live-quiz-card" className={`${card} p-5`}>
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
            <span className="text-xl">🎯</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-black uppercase tracking-[0.16em] text-violet-700">
              Live Quiz
            </div>
            <div className="mt-1 text-xl font-black tracking-tight text-slate-900">
              Join with session code
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Your teacher will give you a code. Type it below to jump straight into the live quiz.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={quizCode}
            onChange={(e) => setQuizCode(cleanSessionCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Enter session code"
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-black uppercase tracking-[0.12em] text-slate-900 shadow-sm outline-none placeholder:normal-case placeholder:tracking-normal placeholder:font-semibold placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />

          <button
            type="button"
            onClick={goToQuizJoin}
            className="rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 px-5 py-4 text-sm font-black text-white shadow-lg active:scale-[0.99] sm:min-w-[150px]"
          >
            Join Quiz
          </button>
        </div>

        {quizJoinError ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {quizJoinError}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs leading-5 text-violet-900">
          Tip: if you save this page to your phone’s home screen, you’ll only need to enter the code next time.
        </div>
      </div>
    );
  }

  function Announcements() {
    if (!posts.length) {
      return <EmptyState title="Announcements" hint="No announcements yet. Check back soon." />;
    }

    return (
      <div className={`${card} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-base font-black text-slate-900">Announcements</div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
            {posts.length}
          </div>
        </div>

        <div className="space-y-3">
          {posts.map((p) => {
            const text = String(p?.content || "");
            const fromLinksField = normalizeLinks((p as any)?.links);
            const fromFiles = extractLinksFromFiles((p as any)?.files);
            const fromText = extractLinksFromText(text);

            const allLinks = Array.from(
              new Set([...fromLinksField, ...fromFiles, ...fromText].filter(Boolean))
            );

            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    {p.author || "Teacher"}
                  </div>
                  {p.created_at ? (
                    <div className="text-[11px] font-semibold text-slate-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-900">{text}</div>

                {allLinks.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {allLinks.map((l, i) => {
                      const href = resolveFileUrl(l);
                      return (
                        <button
                          key={`${p.id}-link-${i}`}
                          type="button"
                          className={linkChip}
                          onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                        >
                          🔗 Open attachment
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

  function LiveCollabCard() {
    return (
      <div id="live-collab-card" className={`${card} p-5`}>
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 shadow-sm">
            <span className="text-xl">🧑‍🤝‍🧑</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-black uppercase tracking-[0.16em] text-cyan-700">
              Collaboration Board
            </div>
            <div className="mt-1 text-xl font-black tracking-tight text-slate-900">
              Join with session code
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Your teacher will give you a collaboration code. Enter it below to join the live whiteboard.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={collabCode}
            onChange={(e) => setCollabCode(cleanSessionCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Enter collaboration code"
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-black uppercase tracking-[0.12em] text-slate-900 shadow-sm outline-none placeholder:normal-case placeholder:tracking-normal placeholder:font-semibold placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
          />

          <button
            type="button"
            onClick={goToCollabJoin}
            className="rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-500 px-5 py-4 text-sm font-black text-white shadow-lg active:scale-[0.99] sm:min-w-[150px]"
          >
            Join Board
          </button>
        </div>

        {collabJoinError ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {collabJoinError}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-xs leading-5 text-cyan-900">
          Tip: use the collaboration code from your teacher’s board screen or QR join panel.
        </div>
      </div>
    );
  }

  function ResourcesView() {
    if (!notes.length) return <EmptyState title="Resources" hint="No resources uploaded yet." />;

    if (selectedTopic) {
      const items =
        notesByTopic.find(([topic]) => topic === selectedTopic)?.[1] ?? [];

      return (
        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-900">{selectedTopic}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {items.length} file{items.length === 1 ? "" : "s"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTopic(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm active:scale-[0.99]"
              >
                ← Categories
              </button>
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="space-y-2">
              {items.map((n) => {
                const label = n.filename || "Resource";
                const url = resolveFileUrl(n.file_url || n.url || "");
                return <FileRow key={`${n.id}-${label}`} label={label} href={url} />;
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-black text-slate-900">Resources</div>
          <div className="mt-1 text-sm text-slate-600">Tap a category to open its files.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notesByTopic.map(([topic, items], idx) => {
            const accents = [
              "from-yellow-300 to-yellow-400",
              "from-purple-500 to-violet-600",
              "from-lime-400 to-emerald-500",
              "from-pink-400 to-fuchsia-500",
            ];
            const accent = accents[idx % accents.length];

            return (
              <button
                key={topic}
                type="button"
                onClick={() => setSelectedTopic(topic)}
                className="overflow-hidden rounded-[28px] border-2 border-slate-900 bg-white text-left shadow-[0_8px_0_rgba(0,0,0,0.25)] active:translate-y-[2px]"
              >
                <div className={`p-5 bg-gradient-to-br ${accent}`}>
                  <div className="text-2xl font-black tracking-tight text-white">
                    {topic}
                  </div>
                  <div className="mt-3 text-sm font-bold text-white/90">
                    {items.length} file{items.length === 1 ? "" : "s"}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    Tap to open
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function TestsView() {
    if (!tests.length) return <EmptyState title="Tests & Papers" hint="No tests uploaded yet." />;

    return (
      <div className="space-y-4">
        <div className={`${card} p-5`}>
          <div className="text-base font-black text-slate-900">Tests & Papers</div>
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
        <div className="mx-auto max-w-3xl px-3 py-8 sm:px-4">
          <div className={`${card} p-5`}>
            <div className="text-sm font-semibold text-slate-700">Loading…</div>
          </div>
        </div>
      );
    }

    if (err) {
      return (
        <div className="mx-auto max-w-3xl px-3 py-8 sm:px-4">
          <div className="rounded-[28px] border border-red-200 bg-white p-5 shadow-sm">
            <div className="text-base font-black text-red-800">Couldn’t load page</div>
            <div className="mt-2 text-sm leading-6 text-red-700">{err}</div>
          </div>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="mx-auto max-w-3xl px-3 py-8 sm:px-4">
          <EmptyState title="Not found" hint="This student link may be invalid or expired." />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl px-3 pb-10 sm:px-4">
        {view === "home" && (
          <div className="mt-5 space-y-4">
            <LiveQuizCard />
            <LiveCollabCard />
            <Announcements />
          </div>
        )}

        {view === "resources" && (
          <div className="mt-5">
            <ResourcesView />
          </div>
        )}

        {view === "tests" && (
          <div className="mt-5">
            <TestsView />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={pageWrap}>
      <TopBar />
      <SaveBanner />
      <Hero />
      <Content />
    </div>
  );
}