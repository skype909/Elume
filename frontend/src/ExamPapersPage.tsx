import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch, openProtectedFileInNewTab } from "./api";
import { BackToClassButton, ClassPageActionBar } from "./ClassPageActions";
import {
  EXAM_LIBRARY_CYCLES,
  EXAM_LIBRARY_SUBJECTS,
  type ExamLibraryItem,
  type ExamLibrarySubject,
  examLibraryLevelOptions,
  normalizeExamLibrarySubject,
} from "./examLibrary";

const API_BASE = "/api";

type Topic = {
  id: number;
  class_id: number;
  name: string;
};

type Paper = {
  id: number;
  class_id: number;
  topic_id: number;
  filename: string;
  file_url: string;
  uploaded_at: string;
  topic_name: string;
};

type CategoryKey = "state" | "mock";
type DocTypeKey = "papers" | "schemes";

type ClassInfo = {
  name?: string;
  class_name?: string;
  title?: string;
  subject?: string;
  preferred_exam_subject?: string | null;
};

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  state: "State Exam Papers",
  mock: "Mock Exam Papers",
};

const DOCTYPE_LABEL: Record<DocTypeKey, string> = {
  papers: "Papers",
  schemes: "Marking Schemes",
};

function canonicalTopicName(category: CategoryKey, docType: DocTypeKey) {
  if (category === "state" && docType === "papers") return "State Papers";
  if (category === "state" && docType === "schemes") return "State Marking Schemes";
  if (category === "mock" && docType === "papers") return "Mock Papers";
  return "Mock Marking Schemes";
}

function resolveFileUrl(fileUrl: string) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
  if (fileUrl.startsWith("/api/")) return fileUrl;
  if (fileUrl.startsWith("/")) return `${API_BASE}${fileUrl}`;
  return `${API_BASE}/${fileUrl}`;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function classify(topicNameRaw: string, filenameRaw: string): {
  category: CategoryKey;
  docType: DocTypeKey;
  group: string;
} {
  const topicName = (topicNameRaw || "").trim();
  const filename = (filenameRaw || "").trim().toLowerCase();

  const parts = topicName.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const c = parts[0].toLowerCase();
    const t = parts[1].toLowerCase();
    const rest = parts.slice(2).join(" | ").trim();

    const category: CategoryKey = c.includes("mock") ? "mock" : "state";
    const docType: DocTypeKey =
      t.includes("mark") || t.includes("scheme")
        ? "schemes"
        : t.includes("paper")
          ? "papers"
          : filename.includes("mark") || filename.includes("scheme") || filename.includes("ms")
            ? "schemes"
            : "papers";

    return { category, docType, group: rest || topicName || "Unsorted" };
  }

  const lower = topicName.toLowerCase();
  const category: CategoryKey = lower.includes("mock") ? "mock" : "state";

  const docType: DocTypeKey =
    lower.includes("mark") ||
    lower.includes("scheme") ||
    filename.includes("mark") ||
    filename.includes("scheme") ||
    filename.includes("ms")
      ? "schemes"
      : "papers";

  const cleanedGroup = topicName
    .replace(/mock/gi, "")
    .replace(/state/gi, "")
    .replace(/exam/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { category, docType, group: cleanedGroup || topicName || "Unsorted" };
}

function tileBg(type: "yellow" | "purple" | "green" | "orange") {
  switch (type) {
    case "yellow":
      return "bg-[#f0d76a]";
    case "purple":
      return "bg-[#7c4ae6]";
    case "green":
      return "bg-[#97c93d]";
    case "orange":
      return "bg-[#cc6a2d]";
    default:
      return "bg-white";
  }
}

function tileText(type: "yellow" | "purple" | "green" | "orange") {
  return type === "purple" || type === "green" ? "text-white" : "text-slate-900";
}

function StatTile({
  title,
  subtitle,
  count,
  blurb,
  tone,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  count: number;
  blurb: string;
  tone: "yellow" | "purple" | "green" | "orange";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-[24px] border-4 border-black p-6 text-left shadow-[0_10px_0_rgba(0,0,0,0.25)] transition hover:-translate-y-[2px]",
        tileBg(tone),
        active ? "ring-4 ring-black/10" : "",
      ].join(" ")}
    >
      <div className={["text-3xl font-extrabold", tileText(tone)].join(" ")}>{title}</div>
      <div className={["mt-1 text-lg font-bold", tileText(tone)].join(" ")}>{subtitle}</div>
      <div className={["mt-3 text-sm font-semibold", tileText(tone)].join(" ")}>{count} files</div>
      <div className={["mt-2 text-sm opacity-90", tileText(tone)].join(" ")}>{blurb}</div>
    </button>
  );
}

export default function ExamPapersPage() {
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState("");
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);

  const [preferredExamSubject, setPreferredExamSubject] = useState<ExamLibrarySubject>("Maths");
  const [savingPreferredSubject, setSavingPreferredSubject] = useState(false);

  const [libraryItems, setLibraryItems] = useState<ExamLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryCycle, setLibraryCycle] = useState<string>(EXAM_LIBRARY_CYCLES[1]);
  const [librarySubject, setLibrarySubject] = useState<ExamLibrarySubject>("Maths");
  const [libraryLevel, setLibraryLevel] = useState<string>(
    examLibraryLevelOptions(EXAM_LIBRARY_CYCLES[1])[0]
  );

  const [activeCategory, setActiveCategory] = useState<CategoryKey>("mock");
  const [activeDocType, setActiveDocType] = useState<DocTypeKey>("papers");

  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [cRes, tRes, nRes] = await Promise.all([
        apiFetch(`${API_BASE}/classes/${classId}`).catch(() => null),
        apiFetch(`${API_BASE}/topics/${classId}?kind=exam`),
        apiFetch(`${API_BASE}/notes/${classId}?kind=exam`),
      ]);

      if (cRes) {
        const cData = cRes as ClassInfo;
        setClassInfo(cData);
        const name = (cData?.name ?? cData?.class_name ?? cData?.title ?? "").toString().trim();
        setClassName(name);

        const preferred = normalizeExamLibrarySubject(
          cData?.preferred_exam_subject ?? cData?.subject
        );
        setPreferredExamSubject(preferred);
        setLibrarySubject(preferred);
      } else {
        setClassName("");
        setClassInfo(null);
      }

      setTopics(Array.isArray(tRes) ? (tRes as Topic[]) : []);
      setPapers(Array.isArray(nRes) ? (nRes as Paper[]) : []);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) return;
    loadAll();
  }, [classId]);

  useEffect(() => {
    const allowed = examLibraryLevelOptions(libraryCycle);
    if (!allowed.includes(libraryLevel)) {
      setLibraryLevel(allowed[0]);
    }
  }, [libraryCycle, libraryLevel]);

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) return;

    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError(null);

    const params = new URLSearchParams();
    if (librarySubject) params.set("subject", librarySubject);
    if (libraryCycle) params.set("cycle", libraryCycle);
    if (libraryLevel) params.set("level", libraryLevel);

    apiFetch(`${API_BASE}/exam-library/items?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setLibraryItems(Array.isArray(data) ? (data as ExamLibraryItem[]) : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setLibraryError(e?.message ?? "Could not load SEC exam library");
        setLibraryItems([]);
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [classId, librarySubject, libraryCycle, libraryLevel]);

  const classified = useMemo(() => {
    return papers.map((p) => ({ ...p, meta: classify(p.topic_name, p.filename) }));
  }, [papers]);

  const stats = useMemo(() => {
    const counts = {
      state_papers: 0,
      state_schemes: 0,
      mock_papers: 0,
      mock_schemes: 0,
    };

    for (const p of classified) {
      if (p.meta.category === "state" && p.meta.docType === "papers") counts.state_papers += 1;
      if (p.meta.category === "state" && p.meta.docType === "schemes") counts.state_schemes += 1;
      if (p.meta.category === "mock" && p.meta.docType === "papers") counts.mock_papers += 1;
      if (p.meta.category === "mock" && p.meta.docType === "schemes") counts.mock_schemes += 1;
    }

    return {
      ...counts,
      totalFiles: papers.length,
    };
  }, [classified, papers.length]);

  const grouped = useMemo(() => {
    const inView = classified.filter(
      (p) => p.meta.category === activeCategory && p.meta.docType === activeDocType
    );

    const map = new Map<string, typeof inView>();

    for (const p of inView) {
      const key = p.meta.group || "Unsorted";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    Array.from(map.keys()).forEach((k) => {
      const arr = map.get(k) || [];
      arr.sort((a, b) => b.id - a.id);
      map.set(k, arr);
    });

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [classified, activeCategory, activeDocType]);

  const uploadViewTitle = `${CATEGORY_LABEL[activeCategory]} — ${DOCTYPE_LABEL[activeDocType]}`;
  const uploadDestinationLabel = canonicalTopicName(activeCategory, activeDocType);

  async function ensureTopic(): Promise<number> {
    const name = canonicalTopicName(activeCategory, activeDocType);
    const existing = topics.find((topic) => topic.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;

    const created = (await apiFetch(`${API_BASE}/topics?kind=exam`, {
      method: "POST",
      body: JSON.stringify({ class_id: classId, name }),
    })) as Topic;

    return created.id;
  }

  async function upload() {
    setError(null);

    if (!files.length) {
      setError("Please choose one or more PDFs");
      return;
    }

    for (const f of files) {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("PDF files only");
        return;
      }
    }

    try {
      setUploading(true);
      const topicId = await ensureTopic();

      for (const f of files) {
        const form = new FormData();
        form.append("class_id", String(classId));
        form.append("topic_id", String(topicId));
        form.append("file", f);

        await apiFetch(`${API_BASE}/notes/upload`, {
          method: "POST",
          body: form,
        });
      }

      setShowUpload(false);
      setFiles([]);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deletePaper(noteId: number) {
    const ok = window.confirm("Delete this file? This cannot be undone.");
    if (!ok) return;

    setError(null);
    try {
      await apiFetch(`${API_BASE}/notes/${noteId}`, { method: "DELETE" });
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  }

  async function savePreferredExamSubject() {
    if (!Number.isFinite(classId) || classId <= 0) return;

    setSavingPreferredSubject(true);
    setError(null);

    try {
      const updated = (await apiFetch(`${API_BASE}/classes/${classId}`, {
        method: "PUT",
        body: JSON.stringify({
          preferred_exam_subject: preferredExamSubject,
        }),
      })) as ClassInfo;

      setClassInfo((prev) => ({ ...(prev ?? {}), ...updated }));
      const nextPreferred = normalizeExamLibrarySubject(
        updated?.preferred_exam_subject ?? preferredExamSubject
      );
      setPreferredExamSubject(nextPreferred);
      setLibrarySubject(nextPreferred);
    } catch (e: any) {
      setError(e?.message ?? "Could not save preferred exam subject");
    } finally {
      setSavingPreferredSubject(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#dff3df]">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-16">
        <ClassPageActionBar>
          <BackToClassButton classId={classId} />
        </ClassPageActionBar>

        {/* Compact page header */}
        <div className="rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-[24px] bg-[#4a8a63] px-5 py-2.5">
                <div className="text-3xl font-extrabold tracking-tight text-white">Exam Papers</div>
              </div>

              <div className="mt-3 text-sm text-slate-600">
                {className ? `Class: ${className}` : `Class ID: ${classId}`}
              </div>
            </div>

            <button
              onClick={() => setShowUpload(true)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
            >
              Upload
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* SEC Exam Library first */}
        <div className="mt-8 rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                SEC Exam Library
              </div>
              <div className="mt-2 max-w-3xl text-sm text-slate-600">
                Quick &amp; convenient access to the State Exam Papers. These can be imported
                through your Whiteboard Import PDF Panel also.
              </div>
            </div>

            <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 lg:min-w-[360px]">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600">
                Class preferred exam subject
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  value={preferredExamSubject}
                  onChange={(e) => setPreferredExamSubject(normalizeExamLibrarySubject(e.target.value))}
                >
                  {EXAM_LIBRARY_SUBJECTS.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => void savePreferredExamSubject()}
                  disabled={savingPreferredSubject}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingPreferredSubject ? "Saving…" : "Save subject"}
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                SEC library filters default to this subject here and in Whiteboard import.
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
                Subject
              </label>
              <select
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                value={librarySubject}
                onChange={(e) => setLibrarySubject(normalizeExamLibrarySubject(e.target.value))}
              >
                {EXAM_LIBRARY_SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
                Cycle
              </label>
              <select
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                value={libraryCycle}
                onChange={(e) => setLibraryCycle(e.target.value)}
              >
                {EXAM_LIBRARY_CYCLES.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {cycle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
                Level
              </label>
              <select
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                value={libraryLevel}
                onChange={(e) => setLibraryLevel(e.target.value)}
              >
                {examLibraryLevelOptions(libraryCycle).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {libraryError && (
            <div className="mt-4 rounded-xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">
              {libraryError}
            </div>
          )}

          <div className="mt-5 rounded-2xl border-2 border-slate-200 bg-slate-50">
            {libraryLoading ? (
              <div className="p-4 text-sm text-slate-600">Loading SEC exam papers…</div>
            ) : libraryItems.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">
                No SEC papers match these filters yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {libraryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void openProtectedFileInNewTab(resolveFileUrl(item.file_url))}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white"
                    title="Open SEC PDF"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {item.subject} • {item.cycle} • {item.level} • {item.year}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      Open PDF
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teacher uploads / mocks below */}
        <div className="mt-8 rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">Teacher Uploads</div>
              <div className="text-sm text-slate-600">
                Use this area mainly for mock papers, mock marking schemes, or class-specific extras.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="rounded-xl bg-[#4a8a63] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              + Upload
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile
              title="State"
              subtitle="Papers"
              count={stats.state_papers}
              blurb="Extra state papers added just for this class"
              tone="yellow"
              active={activeCategory === "state" && activeDocType === "papers"}
              onClick={() => {
                setActiveCategory("state");
                setActiveDocType("papers");
              }}
            />

            <StatTile
              title="State"
              subtitle="Marking Schemes"
              count={stats.state_schemes}
              blurb="State solutions and marking breakdowns"
              tone="purple"
              active={activeCategory === "state" && activeDocType === "schemes"}
              onClick={() => {
                setActiveCategory("state");
                setActiveDocType("schemes");
              }}
            />

            <StatTile
              title="Mock"
              subtitle="Papers"
              count={stats.mock_papers}
              blurb="Examcraft / DEB / school mock papers"
              tone="green"
              active={activeCategory === "mock" && activeDocType === "papers"}
              onClick={() => {
                setActiveCategory("mock");
                setActiveDocType("papers");
              }}
            />

            <StatTile
              title="Mock"
              subtitle="Marking Schemes"
              count={stats.mock_schemes}
              blurb="Mock corrections and marking schemes"
              tone="orange"
              active={activeCategory === "mock" && activeDocType === "schemes"}
              onClick={() => {
                setActiveCategory("mock");
                setActiveDocType("schemes");
              }}
            />
          </div>
        </div>

        {/* Uploaded files list */}
        <div className="mt-8 rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-extrabold text-slate-900">{uploadViewTitle}</div>
              <div className="text-sm text-slate-600">
                {grouped.reduce((acc, [, items]) => acc + items.length, 0)} files shown
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Upload
            </button>
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No files found here yet.
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map(([groupName, items]) => (
                  <div key={groupName}>
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <div className="text-2xl font-extrabold text-slate-900">{groupName}</div>
                      <div className="text-sm font-semibold text-slate-500">{items.length} files</div>
                    </div>

                    <div className="space-y-2">
                      {items.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3"
                        >
                          <button
                            type="button"
                            onClick={() => void openProtectedFileInNewTab(resolveFileUrl(p.file_url))}
                            className="min-w-0 flex-1 text-left hover:underline"
                            title="Open PDF"
                          >
                            <div className="truncate font-semibold text-slate-900">{p.filename}</div>
                            <div className="text-xs text-slate-600">Uploaded: {fmtDate(p.uploaded_at)}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => deletePaper(p.id)}
                            className="shrink-0 rounded-xl border-2 border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-slate-900">Upload Exam Paper</div>
                <div className="text-sm text-slate-600">
                  Upload PDFs into the selected built-in destination.
                </div>
              </div>

              <button
                className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                type="button"
                onClick={() => setShowUpload(false)}
                disabled={uploading}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Upload to</label>
                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                  {uploadDestinationLabel}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  This upload will be added to the currently selected category tile.
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">
                  PDF files (required)
                </label>
                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  disabled={uploading}
                />
                <div className="mt-1 text-xs text-slate-500">
                  You can select multiple PDFs — they’ll upload one-by-one.
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                type="button"
                onClick={() => setShowUpload(false)}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                type="button"
                onClick={upload}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
