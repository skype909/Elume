// frontend/src/ExamPapersPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";

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

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { detail: text };
  }
}

function resolveFileUrl(fileUrl: string) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
  return `${API_BASE}${fileUrl}`;
}

type CategoryKey = "state" | "mock";
type DocTypeKey = "papers" | "schemes";

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  state: "State Exam Papers",
  mock: "Mock Exam Papers",
};

const DOCTYPE_LABEL: Record<DocTypeKey, string> = {
  papers: "Papers",
  schemes: "Marking Schemes",
};

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

type ClassInfo = {
  name?: string;
  class_name?: string;
  title?: string;
};

/**
 * Classifier (no backend changes needed).
 * If you use topic names like "State | Papers | Algebra" it will be perfect.
 * Otherwise, it uses heuristics on topic_name + filename.
 */
function classify(topicNameRaw: string, filenameRaw: string): { category: CategoryKey; docType: DocTypeKey; group: string } {
  const topicName = (topicNameRaw || "").trim();
  const filename = (filenameRaw || "").trim().toLowerCase();

  // Pipe format: "State | Papers | Algebra"
  const parts = topicName.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const c = parts[0].toLowerCase();
    const t = parts[1].toLowerCase();
    const rest = parts.slice(2).join(" | ").trim();

    const category: CategoryKey = c.includes("mock") ? "mock" : "state";
    const docType: DocTypeKey =
      t.includes("mark") || t.includes("scheme") ? "schemes" :
        t.includes("paper") ? "papers" :
          (filename.includes("mark") || filename.includes("scheme") || filename.includes("ms")) ? "schemes" : "papers";

    return { category, docType, group: rest || topicName || "Unsorted" };
  }

  // Heuristics
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

  // Keep group as the topic name (clean a tiny bit)
  const cleanedGroup = topicName
    .replace(/mock/ig, "")
    .replace(/state/ig, "")
    .replace(/exam/ig, "")
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
  // Notes tiles use dark text on yellow/orange, white on purple/green is also fine,
  // but keep it readable:
  return type === "purple" ? "text-white" : type === "green" ? "text-white" : "text-slate-900";
}

export default function ExamPapersPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState<string>("");

  // navigation state (tiles drive this)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("state");
  const [activeDocType, setActiveDocType] = useState<DocTypeKey>("papers");
  const [query, setQuery] = useState("");

  // upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("new");
  const [newTopicName, setNewTopicName] = useState("");
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

      // Best-effort: don't break the page if class fetch fails
      if (cRes) {
        const cData = cRes;
        const name =
          (cData?.name ?? cData?.class_name ?? cData?.title ?? "").toString().trim();
        setClassName(name);
      } else {
        setClassName("");
      }
      const tData = tRes as Topic[];
      const nData = nRes as Paper[];

      setTopics(Array.isArray(tData) ? tData : []);
      setPapers(Array.isArray(nData) ? nData : []);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

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

    const totalFiles = papers.length;
    return { ...counts, totalFiles };
  }, [classified, papers.length]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();

    const inView = classified
      .filter((p) => p.meta.category === activeCategory && p.meta.docType === activeDocType)
      .filter((p) => {
        if (!q) return true;
        const hay = `${p.filename} ${p.topic_name} ${p.meta.group}`.toLowerCase();
        return hay.includes(q);
      });

    const map = new Map<string, typeof inView>();

    for (const p of inView) {
      const key = p.meta.group || "Unsorted";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    // sort items newest first within group
    Array.from(map.keys()).forEach((k) => {
      const arr = map.get(k) || [];
      arr.sort((a, b) => b.id - a.id);
      map.set(k, arr);
    });

    // groups A-Z
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [classified, activeCategory, activeDocType, query]);

  const viewTitle = `${CATEGORY_LABEL[activeCategory]} — ${DOCTYPE_LABEL[activeDocType]}`;

  async function ensureTopic(): Promise<number> {
    if (selectedTopicId !== "new") return Number(selectedTopicId);

    const name = newTopicName.trim();
    if (!name) throw new Error("Please enter a topic name");

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
      setNewTopicName("");
      setSelectedTopicId("new");
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

  function setView(c: CategoryKey, t: DocTypeKey) {
    setActiveCategory(c);
    setActiveDocType(t);
    // keep search but you can clear if you prefer:
    // setQuery("");
  }

  return (
    <div className="min-h-screen bg-[#dff3df]">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-16">
        {/* HERO (match Notes page structure) */}
        <div className="rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-[26px] bg-[#4a8a63] px-6 py-3">
                <div className="text-4xl font-extrabold tracking-tight text-white">Exam Papers</div>
              </div>

              <div className="mt-3 text-slate-600">
                Organise <b>State</b> and <b>Mock</b> exam papers and marking schemes for fast classroom access.
              </div>

              <div className="mt-3 text-sm text-slate-500">
                {className ? `Class: ${className}` : `Class ID: ${classId}`}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/class/${classId}`)}
                className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                type="button"
              >
                Back to Class
              </button>

              <button
                onClick={() => setShowUpload(true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                type="button"
              >
                Upload
              </button>
            </div>
          </div>

          {/* Search + Stats row */}
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 md:items-center">
            <div className="md:col-span-2">
              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                placeholder="Search categories or files..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="flex justify-start md:justify-end">
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                {topics.length} categories • {stats.totalFiles} total files
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* CATEGORIES (tile navigation like Notes page) */}
        <div className="mt-8 rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xl font-extrabold text-slate-900">Categories</div>
              <div className="text-sm text-slate-600">
                Quick tiles for fast access — just like Notes.
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

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* State Papers */}
            <button
              type="button"
              onClick={() => setView("state", "papers")}
              className={[
                "rounded-[24px] border-4 border-black p-6 text-left shadow-[0_10px_0_rgba(0,0,0,0.25)] transition",
                tileBg("yellow"),
                activeCategory === "state" && activeDocType === "papers" ? "ring-4 ring-black/10" : "",
              ].join(" ")}
            >
              <div className={["text-3xl font-extrabold", tileText("yellow")].join(" ")}>State</div>
              <div className={["mt-1 text-lg font-bold", tileText("yellow")].join(" ")}>Papers</div>
              <div className={["mt-3 text-sm font-semibold", tileText("yellow")].join(" ")}>
                {stats.state_papers} files
              </div>
              <div className={["mt-2 text-sm opacity-90", tileText("yellow")].join(" ")}>
                Junior & Leaving Cert papers
              </div>
            </button>

            {/* State Marking Schemes */}
            <button
              type="button"
              onClick={() => setView("state", "schemes")}
              className={[
                "rounded-[24px] border-4 border-black p-6 text-left shadow-[0_10px_0_rgba(0,0,0,0.25)] transition",
                tileBg("purple"),
                activeCategory === "state" && activeDocType === "schemes" ? "ring-4 ring-black/10" : "",
              ].join(" ")}
            >
              <div className={["text-3xl font-extrabold", tileText("purple")].join(" ")}>State</div>
              <div className={["mt-1 text-lg font-bold", tileText("purple")].join(" ")}>Marking Schemes</div>
              <div className={["mt-3 text-sm font-semibold", tileText("purple")].join(" ")}>
                {stats.state_schemes} files
              </div>
              <div className={["mt-2 text-sm opacity-90", tileText("purple")].join(" ")}>
                Solutions + marking breakdowns
              </div>
            </button>

            {/* Mock Papers */}
            <button
              type="button"
              onClick={() => setView("mock", "papers")}
              className={[
                "rounded-[24px] border-4 border-black p-6 text-left shadow-[0_10px_0_rgba(0,0,0,0.25)] transition",
                tileBg("green"),
                activeCategory === "mock" && activeDocType === "papers" ? "ring-4 ring-black/10" : "",
              ].join(" ")}
            >
              <div className={["text-3xl font-extrabold", tileText("green")].join(" ")}>Mock</div>
              <div className={["mt-1 text-lg font-bold", tileText("green")].join(" ")}>Papers</div>
              <div className={["mt-3 text-sm font-semibold", tileText("green")].join(" ")}>
                {stats.mock_papers} files
              </div>
              <div className={["mt-2 text-sm opacity-90", tileText("green")].join(" ")}>
                Examcraft / DEB / school mocks
              </div>
            </button>

            {/* Mock Marking Schemes */}
            <button
              type="button"
              onClick={() => setView("mock", "schemes")}
              className={[
                "rounded-[24px] border-4 border-black p-6 text-left shadow-[0_10px_0_rgba(0,0,0,0.25)] transition",
                tileBg("orange"),
                activeCategory === "mock" && activeDocType === "schemes" ? "ring-4 ring-black/10" : "",
              ].join(" ")}
            >
              <div className={["text-3xl font-extrabold", tileText("orange")].join(" ")}>Mock</div>
              <div className={["mt-1 text-lg font-bold", tileText("orange")].join(" ")}>Marking Schemes</div>
              <div className={["mt-3 text-sm font-semibold", tileText("orange")].join(" ")}>
                {stats.mock_schemes} files
              </div>
              <div className={["mt-2 text-sm opacity-90", tileText("orange")].join(" ")}>
                Corrections + solutions
              </div>
            </button>
          </div>
        </div>

        {/* FILES LIST (simple, obvious, easy scanning) */}
        <div className="mt-8 rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-extrabold text-slate-900">{viewTitle}</div>
              <div className="text-sm text-slate-600">
                {grouped.reduce((acc, [, items]) => acc + items.length, 0)} files shown
                {query.trim() ? " (filtered)" : ""}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                disabled={!query.trim()}
              >
                Clear search
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Upload
              </button>
            </div>
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No files found here yet{query.trim() ? " for that search." : "."}
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
                          <a
                            href={resolveFileUrl(p.file_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 hover:underline"
                            title="Open PDF"
                          >
                            <div className="truncate font-semibold text-slate-900">{p.filename}</div>
                            <div className="text-xs text-slate-600">Uploaded: {fmtDate(p.uploaded_at)}</div>
                          </a>

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

      {/* Upload Modal (keep consistent and simple) */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-slate-900">Upload Exam Paper</div>
                <div className="text-sm text-slate-600">
                  Upload PDFs into your chosen topic.
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
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Topic</label>
                <select
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  disabled={uploading}
                >
                  <option value="new">+ Create new topic</option>
                  {topics.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTopicId === "new" && (
                <div>
                  <label className="mb-1 block text-xs font-extrabold text-slate-700">New topic name</label>
                  <input
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="e.g. Trigonometry, Algebra, Probability…"
                    disabled={uploading}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">PDF files (required)</label>
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
