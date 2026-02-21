// frontend/src/ExamPapersPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
  file_url: string; // backend returns "/uploads/..."
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
  return `${API_BASE}${fileUrl}`; // for "/uploads/..."
}

export default function ExamPapersPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

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
      const [tRes, nRes] = await Promise.all([
        fetch(`${API_BASE}/topics/${classId}?kind=exam`),
        fetch(`${API_BASE}/notes/${classId}?kind=exam`),
      ]);

      if (!tRes.ok) {
        const j = await safeJson(tRes);
        throw new Error(j?.detail || "Failed to load exam topics");
      }
      if (!nRes.ok) {
        const j = await safeJson(nRes);
        throw new Error(j?.detail || "Failed to load exam papers");
      }

      const tData = (await tRes.json()) as Topic[];
      const nData = (await nRes.json()) as Paper[];

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

  function groupedPapers(): [string, Paper[]][] {
  const map = new Map<string, Paper[]>();

  for (const p of papers) {
    const key = p.topic_name || "Unsorted";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  // sort inside each group newest first (no iterator / no for..of on map.entries)
  Array.from(map.keys()).forEach((k) => {
    const arr = map.get(k) || [];
    arr.sort((a: Paper, b: Paper) => b.id - a.id);
    map.set(k, arr);
  });

  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}


  async function ensureTopic(): Promise<number> {
    if (selectedTopicId !== "new") return Number(selectedTopicId);

    const name = newTopicName.trim();
    if (!name) throw new Error("Please enter a topic name");

    const res = await fetch(`${API_BASE}/topics?kind=exam`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: classId, name }),
    });

    if (!res.ok) {
      const j = await safeJson(res);
      throw new Error(j?.detail || "Failed to create topic");
    }

    const created: Topic = await res.json();
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

      // IMPORTANT:
      // backend route is /notes/upload (single file).
      // So for multi-upload we just loop and upload each file.
      for (const f of files) {
        const form = new FormData();
        form.append("class_id", String(classId));
        form.append("topic_id", String(topicId));
        form.append("file", f); // key is "file"

        const res = await fetch(`${API_BASE}/notes/upload`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const j = await safeJson(res);
          throw new Error(j?.detail || `Upload failed for ${f.name}`);
        }
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
    const ok = window.confirm("Delete this exam paper? This cannot be undone.");
    if (!ok) return;

    setError(null);
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to delete exam paper");
      }
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  }

  return (
    <div className="min-h-screen bg-[#dff3df]">
      {/* Top bar */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowUpload(true)}
            className="h-10 w-10 rounded-xl border-2 border-slate-200 bg-white text-xl font-semibold hover:bg-slate-50"
            title="Upload exam paper"
            type="button"
          >
            +
          </button>

          <div className="flex-1">
            <div className="text-2xl font-semibold">Exam Papers</div>
            <div className="text-sm text-slate-600">Class ID: {classId}</div>
          </div>

          <button
            onClick={() => navigate(`/class/${classId}`)}
            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            type="button"
          >
            Back to Class
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="mt-6 rounded-2xl border-2 border-slate-200 bg-white p-4">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : papers.length === 0 ? (
            <div className="text-sm text-slate-600">
              No exam papers uploaded yet. Click <b>+</b> to upload your first PDF.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedPapers().map(([topicName, items]) => (
                <div key={topicName}>
                  <h3 className="mb-2 text-2xl font-bold text-green-700">{topicName}</h3>

                  <div className="space-y-2">
                    {items.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <a
                          href={resolveFileUrl(p.file_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 hover:underline"
                          title="Open PDF"
                        >
                          <div className="truncate font-medium">{p.filename}</div>
                          <div className="text-xs text-slate-600">
                            Uploaded: {p.uploaded_at ? new Date(p.uploaded_at).toLocaleString() : "—"}
                          </div>
                        </a>

                        <button
                          type="button"
                          onClick={() => deletePaper(p.id)}
                          className="shrink-0 rounded-xl border-2 border-red-200 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                          title="Delete exam paper"
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

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="mb-3 text-lg font-semibold">Upload Exam Paper</div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Topic</label>
                <select
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
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
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    New topic name
                  </label>
                  <input
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="e.g. Mechanics, Electricity, Modern Physics…"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  PDF file (required)
                </label>
                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <div className="mt-1 text-xs text-slate-500">
                  You can select multiple PDFs — they’ll upload one-by-one.
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => setShowUpload(false)}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="rounded-xl border-2 border-slate-200 bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
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
