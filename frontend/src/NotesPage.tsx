import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "./api";

const API_BASE = "/api";
const META_KEY = "elume_class_layout_v1";

type ClassItem = {
  id: number;
  name: string;
  subject: string;
};

type TopicItem = {
  id: number;
  class_id: number;
  name: string;
};

type NoteItem = {
  id: number;
  class_id: number;
  topic_id: number;
  filename: string;
  file_url: string;
  whiteboard_state_id?: number | null;
  uploaded_at: string;
  topic_name: string;
};

function resolveFileUrl(u: string) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/api/")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return `${API_BASE}/${u}`;
}

function formatStamp(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";

  const day = d.getDate();
  const month = d.toLocaleString("en-IE", { month: "short" });
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;

  return `${day} ${month}, ${h}:${m}${ampm}`;
}

function getTileCols(count: number) {
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  return 5;
}

function pickTileTone(index: number) {
  const tones = [
    "bg-amber-300 text-slate-900",
    "bg-violet-600 text-white",
    "bg-lime-500 text-white",
    "bg-fuchsia-600 text-white",
    "bg-orange-600 text-white",
    "bg-slate-800 text-white",
    "bg-emerald-600 text-white",
    "bg-blue-600 text-white",
    "bg-rose-600 text-white",
    "bg-cyan-600 text-white",
  ];
  return tones[index % tones.length];
}

export default function NotesPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const classId = useMemo(() => Number(id), [id]);
  const validClassId = Number.isFinite(classId) && classId > 0;

  const [classInfo, setClassInfo] = useState<ClassItem | null>(null);
  const [classColour, setClassColour] = useState("bg-emerald-500");

  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  const [loadingClass, setLoadingClass] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<"existing" | "new">("existing");
  const [uploadTopicId, setUploadTopicId] = useState<number | "">("");
  const [newTopicName, setNewTopicName] = useState("");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return;
      const meta = JSON.parse(raw);
      const entry = meta?.[String(classId)] || {};
      if (typeof entry?.color === "string" && entry.color.trim()) {
        setClassColour(entry.color);
      }
    } catch {
      // ignore local meta problems
    }
  }, [classId]);

  useEffect(() => {
    if (!validClassId) {
      setLoadingClass(false);
      setClassInfo(null);
      return;
    }

    const controller = new AbortController();
    setLoadingClass(true);

    apiFetch(`${API_BASE}/classes/${classId}`, { signal: controller.signal })
      .then((data) => setClassInfo(data ?? null))
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load class");
        setClassInfo(null);
      })
      .finally(() => setLoadingClass(false));

    return () => controller.abort();
  }, [classId, validClassId]);

  async function loadTopics() {
    if (!validClassId) return;
    setLoadingTopics(true);
    try {
      const data = await apiFetch(`${API_BASE}/topics/${classId}?kind=notes`);
      setTopics(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load categories");
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  }

  async function loadNotes() {
    if (!validClassId) return;
    setLoadingNotes(true);
    try {
      const data = await apiFetch(`${API_BASE}/notes/${classId}?kind=notes`);
      setNotes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load files");
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }

  useEffect(() => {
    if (!validClassId) {
      setLoadingTopics(false);
      setLoadingNotes(false);
      setTopics([]);
      setNotes([]);
      return;
    }

    setError(null);
    void loadTopics();
    void loadNotes();
  }, [classId, validClassId]);

  const notesByTopic = useMemo(() => {
    const map = new Map<number, NoteItem[]>();
    for (const n of notes) {
      const arr = map.get(n.topic_id) || [];
      arr.push(n);
      map.set(n.topic_id, arr);
    }
    return map;
  }, [notes]);

  const topicCards = useMemo(() => {
    const q = search.trim().toLowerCase();

    return topics
      .map((t) => {
        const files = notesByTopic.get(t.id) || [];
        const latest = files[0]?.uploaded_at || "";
        const haystack = `${t.name} ${files.map((f) => f.filename).join(" ")}`.toLowerCase();

        return {
          ...t,
          fileCount: files.length,
          latest,
          files,
          matches: !q || haystack.includes(q),
        };
      })
      .filter((t) => t.matches);
  }, [topics, notesByTopic, search]);

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || null,
    [topics, selectedTopicId]
  );

  const selectedNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = selectedTopicId ? notes.filter((n) => n.topic_id === selectedTopicId) : [];
    if (!q) return base;
    return base.filter((n) => `${n.filename} ${n.topic_name}`.toLowerCase().includes(q));
  }, [notes, selectedTopicId, search]);

  const cols = getTileCols(topicCards.length || 1);

  async function createTopicIfNeeded(): Promise<number> {
    if (uploadMode === "existing") {
      if (!uploadTopicId) throw new Error("Choose a category first");
      return Number(uploadTopicId);
    }

    const title = newTopicName.trim();
    if (!title) throw new Error("Enter a category name");

    const created = (await apiFetch(`${API_BASE}/topics?kind=notes`, {
      method: "POST",
      body: JSON.stringify({
        class_id: classId,
        name: title,
      }),
    })) as TopicItem;
    setTopics((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created.id;
  }

  async function handleUpload() {
    if (!validClassId) return;
    if (pickedFiles.length === 0) {
      setError("Pick at least one file");
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const topicId = await createTopicIfNeeded();

      for (const file of pickedFiles) {
        const fd = new FormData();
        fd.append("class_id", String(classId));
        fd.append("topic_id", String(topicId));
        fd.append("file", file);

        await apiFetch(`${API_BASE}/notes/upload`, {
          method: "POST",
          body: fd,
        });
      }

      await Promise.all([loadTopics(), loadNotes()]);

      setSelectedTopicId(topicId);
      setShowUploadModal(false);
      setUploadMode("existing");
      setUploadTopicId("");
      setNewTopicName("");
      setPickedFiles([]);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteNote(noteId: number) {
    const ok = window.confirm("Delete this file?");
    if (!ok) return;

    try {
      setBusy(true);
      setError(null);

      await apiFetch(`${API_BASE}/notes/${noteId}`, {
        method: "DELETE",
      });

      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e: any) {
      setError(e?.message || "Failed to delete file");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTopic(topicId: number) {
    const ok = window.confirm("Delete this category and all files inside it?");
    if (!ok) return;

    try {
      setBusy(true);
      setError(null);

      await apiFetch(`${API_BASE}/topics/${topicId}`, {
        method: "DELETE",
      });

      setTopics((prev) => prev.filter((t) => t.id !== topicId));
      setNotes((prev) => prev.filter((n) => n.topic_id !== topicId));
      if (selectedTopicId === topicId) setSelectedTopicId(null);
    } catch (e: any) {
      setError(e?.message || "Failed to delete category");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenNote(note: NoteItem) {
    try {
      setBusy(true);
      setError(null);

      const blob = await apiFetchBlob(resolveFileUrl(note.file_url), {
        method: "GET",
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 60_000);
    } catch (e: any) {
      setError(e?.message || "Failed to open file");
    } finally {
      setBusy(false);
    }
  }

  function handleReopenWhiteboard(note: NoteItem) {
    if (!note.whiteboard_state_id) return;
    navigate(`/whiteboard/${classId}?whiteboardId=${note.whiteboard_state_id}`);
  }

  function openUploadForTopic(topicId?: number) {
    setShowUploadModal(true);
    setUploadMode(topicId ? "existing" : topics.length ? "existing" : "new");
    setUploadTopicId(topicId ?? (topics[0]?.id ?? ""));
    setNewTopicName("");
    setPickedFiles([]);
  }

  const pageTitle = loadingClass
    ? "Notes"
    : classInfo?.name
      ? `${classInfo.name} Notes`
      : "Notes";

  return (
    <div className="min-h-screen bg-[#dff3df] px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl">
        {error && (
          <div className="mb-4 rounded-3xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="rounded-[1.6rem] border border-slate-200 bg-white/95 px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full bg-emerald-600 px-6 py-2 text-3xl font-bold tracking-wide text-white">
                <span style={{ textShadow: "0 2px 4px rgba(0,0,0,0.35)" }}>
                  Notes
                </span>
              </div>

              <div className="mt-1 text-sm text-slate-500">
                Organise PDFs, slides, worksheets, audio and classroom files.
              </div>

              <div className="mt-2 text-xs font-medium text-slate-400">
                {pageTitle}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedTopic ? (
                <button
                  type="button"
                  onClick={() => setSelectedTopicId(null)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  All Categories
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/class/${classId}`)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back to Class
                </button>
              )}

              <button
                type="button"
                onClick={() => openUploadForTopic(selectedTopicId ?? undefined)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Upload
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                selectedTopic
                  ? `Search inside ${selectedTopic.name}...`
                  : "Search categories or files..."
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-200 lg:max-w-xl"
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {selectedTopic
                ? `${selectedNotes.length} file${selectedNotes.length === 1 ? "" : "s"} in ${selectedTopic.name}`
                : `${topicCards.length} categor${topicCards.length === 1 ? "y" : "ies"} • ${notes.length} total files`}
            </div>
          </div>
        </div>

        {!selectedTopic && (
          <div className="mt-6 rounded-[2rem] border-2 border-slate-200 bg-white/90 p-5 shadow-[0_6px_0_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black tracking-tight text-slate-900">
                  Categories
                </div>
                <div className="text-sm text-slate-500">
                  Dashboard-style topic tiles for fast classroom access
                </div>
              </div>

              <button
                type="button"
                onClick={() => openUploadForTopic()}
                className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + Add Category / Upload
              </button>
            </div>

            {loadingTopics || loadingNotes ? (
              <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-600">
                Loading notes workspace...
              </div>
            ) : topicCards.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
                <div className="text-xl font-bold text-slate-800">No categories yet</div>
                <div className="mt-2 text-sm text-slate-600">
                  Create your first category and upload files into it.
                </div>
                <button
                  type="button"
                  onClick={() => openUploadForTopic()}
                  className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Start Notes Library
                </button>
              </div>
            ) : (
              <div
                className="grid gap-5"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {topicCards.map((topic, idx) => {
                  const tone = pickTileTone(idx);

                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={[
                        "group relative min-h-[150px] rounded-[1.7rem] border-[4px] border-black px-5 py-4 text-left shadow-[0_8px_0_rgba(0,0,0,0.25)] transition",
                        "hover:-translate-y-[2px] hover:shadow-[0_12px_0_rgba(0,0,0,0.22)]",
                        tone,
                      ].join(" ")}
                      title={`Open ${topic.name}`}
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <div className="text-3xl font-black tracking-tight leading-tight">
                            {topic.name}
                          </div>
                          <div className="mt-3 text-lg font-semibold opacity-90">
                            {topic.fileCount} file{topic.fileCount === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div className="flex items-end justify-between">
                          <div className="text-sm font-semibold opacity-80">
                            {topic.latest ? `Updated ${formatStamp(topic.latest)}` : "Ready to fill"}
                          </div>
                          <div className="text-xl opacity-70">▣</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedTopic && (
          <div className="mt-6 rounded-[2rem] border-2 border-slate-200 bg-white/90 p-5 shadow-[0_6px_0_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Category
                </div>
                <div className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                  {selectedTopic.name}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openUploadForTopic(selectedTopic.id)}
                  className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Add files
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteTopic(selectedTopic.id)}
                  className="rounded-2xl border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Delete category
                </button>
              </div>
            </div>

            {loadingNotes ? (
              <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-600">
                Loading files...
              </div>
            ) : selectedNotes.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <div className="text-lg font-bold text-slate-800">No files in this category yet</div>
                <div className="mt-2 text-sm text-slate-600">
                  Upload files into {selectedTopic.name} to start building the set.
                </div>
                <button
                  type="button"
                  onClick={() => openUploadForTopic(selectedTopic.id)}
                  className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Upload files
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedNotes.map((n) => (
                  <div
                    key={n.id}
                    className="flex flex-col gap-3 rounded-3xl border-2 border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xl font-bold text-slate-900">
                        {n.filename}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        Uploaded: {formatStamp(n.uploaded_at)}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleOpenNote(n)}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        Open
                      </button>

                      {n.whiteboard_state_id ? (
                        <button
                          type="button"
                          onClick={() => handleReopenWhiteboard(n)}
                          className="rounded-2xl border-2 border-emerald-200 bg-white px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Reopen in Whiteboard
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleDeleteNote(n.id)}
                        className="rounded-2xl border-2 border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] border-2 border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black tracking-tight text-slate-900">
                  Upload notes
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Choose an existing category or create a new one before uploading.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setPickedFiles([]);
                  setNewTopicName("");
                }}
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setUploadMode("existing")}
                  className={
                    uploadMode === "existing"
                      ? "rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  }
                >
                  Existing category
                </button>

                <button
                  type="button"
                  onClick={() => setUploadMode("new")}
                  className={
                    uploadMode === "new"
                      ? "rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  }
                >
                  Create new category
                </button>
              </div>

              {uploadMode === "existing" ? (
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Category
                  </label>
                  <select
                    value={uploadTopicId}
                    onChange={(e) => setUploadTopicId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="">Choose a category...</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    New category name
                  </label>
                  <input
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="e.g. Algebra, Biology, Revision, Experiments"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Files
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setPickedFiles(Array.from(e.target.files || []))}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Choose files
                </button>

                {pickedFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pickedFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        📎 {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  disabled={busy}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleUpload}
                  className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
