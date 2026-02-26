import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE = "/api";

type Topic = {
  id: number;
  class_id: number;
  name: string;
};

type Note = {
  id: number;
  class_id: number;
  topic_id: number;
  filename: string;
  file_url: string;
  uploaded_at: string;
  topic_name: string;
};

function resolveFileUrl(u: string) {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`; // "/uploads/.." -> "/api/uploads/.."
  return `${API_BASE}/${u}`;
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isAudio(nameOrUrl: string) {
  const ext = extOf((nameOrUrl || "").split("?")[0] || "");
  return ["mp3", "wav", "m4a", "ogg"].includes(ext);
}

function prettyBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export default function NotesPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("new");
  const [newTopicName, setNewTopicName] = useState("");

  // ✅ multi-file
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ✅ search
  const [query, setQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadAll() {
    if (!Number.isFinite(classId)) return;
    setLoading(true);
    setError(null);

    try {
      const [tRes, nRes] = await Promise.all([
        fetch(`${API_BASE}/topics/${classId}`),
        fetch(`${API_BASE}/notes/${classId}`),
      ]);

      if (!tRes.ok) throw new Error("Failed to load topics");
      if (!nRes.ok) throw new Error("Failed to load notes");

      const tData = await tRes.json();
      const nData = await nRes.json();

      setTopics(Array.isArray(tData) ? tData : []);
      setNotes(Array.isArray(nData) ? nData : []);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const a = (n.filename || "").toLowerCase();
      const b = (n.topic_name || "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [notes, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of filteredNotes) {
      const key = (note.topic_name || "Unsorted").trim() || "Unsorted";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(note);
    }

    // sort topics A-Z; within topic newest first
    const out = Array.from(map.entries()).map(([k, items]) => {
      const sorted = [...items].sort((a, b) => {
        const ta = new Date(a.uploaded_at).getTime();
        const tb = new Date(b.uploaded_at).getTime();
        return tb - ta;
      });
      return [k, sorted] as const;
    });

    out.sort((a, b) => a[0].localeCompare(b[0]));
    return out;
  }, [filteredNotes]);

  async function ensureTopic(): Promise<number> {
    if (selectedTopicId !== "new") return Number(selectedTopicId);

    const name = newTopicName.trim();
    if (!name) throw new Error("Please enter a topic name");

    const res = await fetch(`${API_BASE}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: classId, name }),
    });

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(t || "Failed to create topic");
    }

    const created = await res.json();
    return created.id;
  }

  function onPickFiles(fl: FileList | null) {
    if (!fl) return;
    const incoming = Array.from(fl);

    // de-dupe by name+size+lastModified
    const key = (f: File) => `${f.name}__${f.size}__${f.lastModified}`;
    const existing = new Set(files.map(key));
    const merged = [...files];

    for (const f of incoming) {
      if (!existing.has(key(f))) merged.push(f);
    }

    setFiles(merged);
  }

  function removePicked(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function resetUploadModal() {
    setSelectedTopicId("new");
    setNewTopicName("");
    setFiles([]);
    setError(null);
    try {
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {}
  }

  async function uploadAll() {
    setError(null);

    if (files.length === 0) {
      setError("Please choose one or more files.");
      return;
    }

    try {
      setUploading(true);
      const topicId = await ensureTopic();

      // ✅ sequential uploads (safe + simple)
      for (const f of files) {
        const form = new FormData();
        form.append("class_id", String(classId));
        form.append("topic_id", String(topicId));
        form.append("file", f);

        const res = await fetch(`${API_BASE}/notes/upload`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const t = await safeText(res);
          throw new Error(t || `Upload failed for ${f.name}`);
        }
      }

      setShowUpload(false);
      resetUploadModal();
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteNote(noteId: number) {
    const ok = window.confirm("Delete this resource? This cannot be undone.");
    if (!ok) return;

    setError(null);
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        const t = await safeText(res);
        throw new Error(t || "Failed to delete");
      }
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  }

  // UI styles
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const soft = "bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-100";
  const pill =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50";
  const btn =
    "rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60";
  const btnDark =
    "rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60";

  return (
    <div className={`min-h-screen ${soft}`}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Page header (NOT global header) */}
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 drop-shadow-[0_6px_14px_rgba(16,185,129,0.25)]">
                Notes
              </div>
              <div className="mt-2 h-1 w-24 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-200" />
              <div className="mt-2 text-sm text-slate-600">
                PDFs, slides, worksheets, audio, and anything else you use in class.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className={pill} type="button" onClick={() => navigate(`/class/${classId}`)}>
                Back to Class
              </button>
              <button className={btnDark} type="button" onClick={() => setShowUpload(true)}>
                Upload
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-2xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Search */}
          <div className="mt-4">
            <input
              className="w-full md:w-[420px] rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="Search by filename or topic…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        <div className="mt-5">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : notes.length === 0 ? (
            <div className={`${card} p-6`}>
              <div className="text-lg font-extrabold text-slate-900">No resources yet</div>
              <div className="mt-2 text-sm text-slate-600">
                Upload notes, worksheets, slides, or audio files. Keep everything organised by topic.
              </div>
              <div className="mt-4">
                <button className={btnDark} type="button" onClick={() => setShowUpload(true)}>
                  Upload your first files
                </button>
              </div>
            </div>
          ) : grouped.length === 0 ? (
            <div className={`${card} p-6`}>
              <div className="text-lg font-extrabold text-slate-900">No results</div>
              <div className="mt-2 text-sm text-slate-600">
                Try a different search term, or clear the search box.
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {grouped.map(([topicName, items]) => (
                <div key={topicName} className={`${card} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{topicName}</div>
                      <div className="mt-1 text-xs text-slate-500">{items.length} file(s)</div>
                    </div>
                    <button className={btn} type="button" onClick={() => setShowUpload(true)}>
                      Add files
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {items.map((n) => {
                      const url = resolveFileUrl(n.file_url);
                      const audio = isAudio(n.filename) || isAudio(n.file_url);

                      return (
                        <div
                          key={n.id}
                          className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 hover:bg-white transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="block min-w-0 hover:underline"
                                title="Open resource"
                              >
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {n.filename}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Uploaded: {new Date(n.uploaded_at).toLocaleString()}
                                </div>
                              </a>

                              {audio && (
                                <div className="mt-2">
                                  <audio controls className="w-full">
                                    <source src={url} />
                                  </audio>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <a className={btn} href={url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                              <button
                                type="button"
                                onClick={() => deleteNote(n.id)}
                                className="rounded-2xl border-2 border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">
                  Upload Resources
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Upload PDFs, slides, worksheets, and audio for language classes.
                </div>
              </div>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setShowUpload(false);
                  resetUploadModal();
                }}
                disabled={uploading}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {/* Topic */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Topic</label>
                <select
                  className="w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
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

                {selectedTopicId === "new" && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      New topic name
                    </label>
                    <input
                      className="w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      placeholder="e.g. Poetry, Oral Irish, Electricity…"
                      disabled={uploading}
                    />
                  </div>
                )}
              </div>

              {/* Drop zone */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Files</label>

                <div
                  className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPickFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="text-sm font-semibold text-slate-900">Drag & drop files here</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Or click to browse. Supports PDF, DOCX, PPTX, MP3, WAV, M4A, OGG.
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      className={btnDark}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      Choose files
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.mp3,.wav,.m4a,.ogg,audio/*"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </div>

                {/* picked list */}
                {files.length > 0 && (
                  <div className="mt-3 rounded-2xl border-2 border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-600">
                      Selected ({files.length})
                    </div>
                    <div className="max-h-40 space-y-2 overflow-auto pr-1">
                      {files.map((f, i) => (
                        <div
                          key={`${f.name}_${f.size}_${f.lastModified}`}
                          className="flex items-center justify-between gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{f.name}</div>
                            <div className="text-xs text-slate-500">{prettyBytes(f.size)}</div>
                          </div>
                          <button
                            type="button"
                            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50"
                            onClick={() => removePicked(i)}
                            disabled={uploading}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className={btn}
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  resetUploadModal();
                }}
                disabled={uploading}
              >
                Cancel
              </button>
              <button className={btnDark} type="button" onClick={uploadAll} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload files"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}