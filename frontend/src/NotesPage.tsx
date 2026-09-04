import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiFetch, apiFetchBlob } from "./api";
import { BackToClassButton, ClassPageActionBar } from "./ClassPageActions";
import InlineNotice from "./Components/InlineNotice";
import { useUiLanguage } from "./i18n/UiLanguageContext";
import { userFacingError } from "./userFacingError";

const API_BASE = "/api";
const META_KEY = "elume_class_layout_v1";
const AUDIO_TOPIC_NAME = "Audio";
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/x-pn-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "application/ogg",
]);
const OFFICE_CONVERSION_EXTENSIONS = new Set([".doc", ".docx", ".ppt", ".pptx"]);
const POWERPOINT_CONVERSION_EXTENSIONS = new Set([".ppt", ".pptx"]);
const SLIDESHOW_MAX_SLIDES = 30;
const SLIDESHOW_LIMIT_TITLE = "That slideshow is a little too large";
const SLIDESHOW_LIMIT_MESSAGE = "Elume supports slideshow presentations with up to 30 slides. Try splitting this file into two smaller presentations and uploading them separately.";

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

const MAX_NOTES_UPLOAD_FILES = 5;

function getFileExtension(name: string) {
  const trimmed = String(name || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) return "";
  return trimmed.slice(dot).toLowerCase();
}

function isAudioTopicName(name: string) {
  return name.trim().toLocaleLowerCase() === AUDIO_TOPIC_NAME.toLocaleLowerCase();
}

function isSupportedAudioFile(file: File) {
  return AUDIO_EXTENSIONS.has(getFileExtension(file.name)) && AUDIO_MIME_TYPES.has((file.type || "").toLowerCase());
}

function isConvertibleOfficeFile(file: File) {
  return OFFICE_CONVERSION_EXTENSIONS.has(getFileExtension(file.name));
}

function buildNotesUploadWarning(files: File[]) {
  if (!files.length) return null;

  const exts = new Set(files.map((file) => getFileExtension(file.name)));
  const hasDocx = exts.has(".docx") || exts.has(".doc");
  const hasPptx = exts.has(".pptx") || exts.has(".ppt");
  const hasOtherNonPdf = Array.from(exts).some((ext) => ext && ext !== ".pdf" && !OFFICE_CONVERSION_EXTENSIONS.has(ext));

  if (!hasDocx && !hasPptx && !hasOtherNonPdf) return null;
  if (hasPptx) {
    return "Choose Convert & Upload to make presentations available to Elume's PDF-based teaching tools.";
  }
  if (hasDocx && !hasOtherNonPdf) {
    return "Choose Convert & Upload to make documents available to Elume's PDF-based teaching tools.";
  }
  return "You can store these files in Notes, but quiz generation currently works with PDF files only. Please export documents or presentations as PDF if you want to use them for quiz generation.";
}

type SlideshowLimitDetails = {
  actualSlides?: number;
};

function slideshowLimitDetails(error: unknown): SlideshowLimitDetails | null {
  const response = error instanceof ApiError ? error.response : null;
  const detail = response && typeof response === "object" && "detail" in response
    ? (response as { detail?: unknown }).detail
    : response;

  if (detail && typeof detail === "object") {
    const value = detail as { code?: unknown; maximum_slides?: unknown; actual_slides?: unknown };
    if (value.code === "slideshow_slide_limit_exceeded" && Number(value.maximum_slides) === SLIDESHOW_MAX_SLIDES) {
      const actualSlides = Number(value.actual_slides);
      return Number.isFinite(actualSlides) ? { actualSlides } : {};
    }
  }

  const legacyMessage = error instanceof Error ? error.message : "";
  if (/presentation has more than\s+30\s+slides/i.test(legacyMessage)) return {};
  return null;
}

function resolveFileUrl(u: string) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/api/")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return `${API_BASE}/${u}`;
}

function formatStamp(ts: string | undefined, language: "en" | "ga") {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString(language === "ga" ? "ga-IE" : "en-IE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
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
  const { t, language } = useUiLanguage();
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
  const [convertOfficeFiles, setConvertOfficeFiles] = useState(false);
  const [pendingOfficeFiles, setPendingOfficeFiles] = useState<File[] | null>(null);
  const [uploadFileLimitWarning, setUploadFileLimitWarning] = useState<string | null>(null);
  const [slideshowLimitError, setSlideshowLimitError] = useState<SlideshowLimitDetails | null>(null);

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
        setError(userFacingError(e, "We couldn’t load your resources just yet. Give it another try."));
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
      setError(userFacingError(e, "We couldn’t load your resources just yet. Give it another try."));
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
      setError(userFacingError(e, "We couldn’t load your resources just yet. Give it another try."));
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
  const uploadWarning = useMemo(() => buildNotesUploadWarning(pickedFiles), [pickedFiles]);
  const uploadTopic = useMemo(
    () => (uploadMode === "existing" ? topics.find((topic) => topic.id === uploadTopicId) || null : null),
    [topics, uploadMode, uploadTopicId]
  );
  const isAudioUpload = uploadMode === "existing"
    ? Boolean(uploadTopic && isAudioTopicName(uploadTopic.name))
    : isAudioTopicName(newTopicName.trim());

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

  async function uploadFiles(filesToUpload: File[], shouldConvertOfficeFiles: boolean) {
    if (!validClassId) return;
    if (filesToUpload.length === 0) {
      setError("Pick at least one file");
      return;
    }
    if (filesToUpload.length > MAX_NOTES_UPLOAD_FILES) {
      setError(`You can upload up to ${MAX_NOTES_UPLOAD_FILES} files at a time.`);
      return;
    }
    if (isAudioUpload && filesToUpload.some((file) => !isSupportedAudioFile(file))) {
      setError("Audio accepts MP3, WAV, M4A, AAC, and OGG files with a matching audio type.");
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const topicId = await createTopicIfNeeded();

      for (const file of filesToUpload) {
        const fd = new FormData();
        fd.append("class_id", String(classId));
        fd.append("topic_id", String(topicId));
        fd.append("file", file);
        if (isAudioUpload) fd.append("media_type", "audio");
        if (shouldConvertOfficeFiles && isConvertibleOfficeFile(file)) fd.append("convert_to_pdf", "true");

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
      setConvertOfficeFiles(false);
    } catch (e: any) {
      const slideshowLimit = slideshowLimitDetails(e);
      if (slideshowLimit) {
        setSlideshowLimitError(slideshowLimit);
        setPickedFiles([]);
        setConvertOfficeFiles(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setError(userFacingError(e, "We couldn’t upload that file just now. Please try again."));
      if (shouldConvertOfficeFiles && filesToUpload.some(isConvertibleOfficeFile)) {
        setPendingOfficeFiles(filesToUpload);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    await uploadFiles(pickedFiles, convertOfficeFiles);
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
      setError(userFacingError(e, "We couldn’t delete that resource just now. Please try again."));
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
      setError(userFacingError(e, "We couldn’t delete that category just now. Please try again."));
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
      setError(userFacingError(e, "We couldn’t open that file just now. Please try again."));
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
    setConvertOfficeFiles(false);
    setPendingOfficeFiles(null);
    setUploadFileLimitWarning(null);
    setSlideshowLimitError(null);
  }

  async function openAudioLibrary() {
    if (!validClassId) return;
    const existing = topics.find((topic) => isAudioTopicName(topic.name));
    if (existing) {
      setSelectedTopicId(existing.id);
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const created = (await apiFetch(`${API_BASE}/topics?kind=notes`, {
        method: "POST",
        body: { class_id: classId, name: AUDIO_TOPIC_NAME },
      })) as TopicItem;
      setTopics((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTopicId(created.id);
    } catch (e: any) {
      setError(userFacingError(e, "We couldn’t open the Audio library just now. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function handlePickedFilesChange(nextFiles: File[]) {
    setSlideshowLimitError(null);
    const limitedFiles = nextFiles.slice(0, MAX_NOTES_UPLOAD_FILES);
    if (nextFiles.length > MAX_NOTES_UPLOAD_FILES) {
      setUploadFileLimitWarning(`You can upload up to ${MAX_NOTES_UPLOAD_FILES} files at a time. Only the first ${MAX_NOTES_UPLOAD_FILES} files have been selected.`);
    }
    if (isAudioUpload && limitedFiles.some((file) => !isSupportedAudioFile(file))) {
      setPickedFiles([]);
      setConvertOfficeFiles(false);
      setUploadFileLimitWarning("Audio accepts MP3, WAV, M4A, AAC, and OGG files with a matching audio type.");
      return;
    }
    if (limitedFiles.some(isConvertibleOfficeFile)) {
      setPendingOfficeFiles(limitedFiles);
      if (nextFiles.length <= MAX_NOTES_UPLOAD_FILES) setUploadFileLimitWarning(null);
      return;
    }
    setPickedFiles(limitedFiles);
    setConvertOfficeFiles(false);
    if (nextFiles.length <= MAX_NOTES_UPLOAD_FILES) setUploadFileLimitWarning(null);
  }

  async function chooseOfficeUploadMode(shouldConvert: boolean) {
    const filesToUpload = pendingOfficeFiles;
    if (!filesToUpload?.length) return;
    setPendingOfficeFiles(null);
    setPickedFiles(filesToUpload);
    setConvertOfficeFiles(shouldConvert);
    await uploadFiles(filesToUpload, shouldConvert);
  }

  function chooseAnotherFile() {
    setSlideshowLimitError(null);
    setPickedFiles([]);
    setConvertOfficeFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  }

  const pageTitle = loadingClass
    ? t("notes.title")
    : classInfo?.name
      ? `${classInfo.name} ${t("notes.title")}`
      : t("notes.title");

  return (
    <div className="min-h-screen bg-[#dff3df] px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl">
        <ClassPageActionBar>
          <BackToClassButton classId={classId} />
        </ClassPageActionBar>

        {error && (
          <InlineNotice
            variant="error"
            title="That didn’t quite work"
            message={error}
            className="mb-4"
          />
        )}

        <div className="rounded-[1.6rem] border border-slate-200 bg-white/95 px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full bg-emerald-600 px-6 py-2 text-3xl font-bold tracking-wide text-white">
                <span style={{ textShadow: "0 2px 4px rgba(0,0,0,0.35)" }}>
                  {t("notes.title")}
                </span>
              </div>

              <div className="mt-1 text-sm text-slate-500">
                {t("notes.description")}
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
                  {t("notes.allCategories")}
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={() => void openAudioLibrary()}
                className="rounded-xl border-2 border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100 disabled:opacity-60"
                disabled={busy}
              >
                {t("notes.audioLibrary")}
              </button>

              <button
                type="button"
                onClick={() => openUploadForTopic(selectedTopicId ?? undefined)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {t("notes.upload")}
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
                  : t("notes.search")
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
                  {t("notes.categories")}
                </div>
                <div className="text-sm text-slate-500">
                  {t("notes.categoryHelp")}
                </div>
              </div>

              <button
                type="button"
                onClick={() => openUploadForTopic()}
                className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t("notes.addCategoryUpload")}
              </button>
            </div>

            {loadingTopics || loadingNotes ? (
              <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-600">
                {t("notes.loadingWorkspace")}
              </div>
            ) : topicCards.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
                <div className="text-xl font-bold text-slate-800">{t("notes.noCategories")}</div>
                <div className="mt-2 text-sm text-slate-600">
                  Create your first category and upload files into it.
                </div>
                <button
                  type="button"
                  onClick={() => openUploadForTopic()}
                  className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {t("notes.startLibrary")}
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
                            {topic.latest ? `Updated ${formatStamp(topic.latest, language)}` : "Ready to fill"}
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
                  {t("notes.category")}
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
                  {t("notes.addFiles")}
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteTopic(selectedTopic.id)}
                  className="rounded-2xl border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  {t("notes.deleteCategory")}
                </button>
              </div>
            </div>

            {loadingNotes ? (
              <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-600">
                {t("notes.loadingFiles")}
              </div>
            ) : selectedNotes.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <div className="text-lg font-bold text-slate-800">{t("notes.noFiles")}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {isAudioTopicName(selectedTopic.name)
                    ? "Upload MP3, WAV, M4A, AAC, or OGG files for Whiteboard playback."
                    : `Upload files into ${selectedTopic.name} to start building the set.`}
                </div>
                <button
                  type="button"
                  onClick={() => openUploadForTopic(selectedTopic.id)}
                  className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {isAudioTopicName(selectedTopic.name) ? t("notes.uploadAudio") : t("notes.uploadFiles")}
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
                        {t("notes.uploaded")} {formatStamp(n.uploaded_at, language)}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleOpenNote(n)}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        {t("common.open")}
                      </button>

                      {n.whiteboard_state_id ? (
                        <button
                          type="button"
                          onClick={() => handleReopenWhiteboard(n)}
                          className="rounded-2xl border-2 border-emerald-200 bg-white px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          {t("notes.reopenWhiteboard")}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleDeleteNote(n.id)}
                        className="rounded-2xl border-2 border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        {t("common.delete")}
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
                  {t("notes.uploadNotes")}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {t("notes.uploadHelp")}
                </div>
              </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setPickedFiles([]);
                    setNewTopicName("");
                    setUploadFileLimitWarning(null);
                  }}
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {t("common.close")}
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
                  {t("notes.existingCategory")}
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
                  {t("notes.createNewCategory")}
                </button>
              </div>

              {uploadMode === "existing" ? (
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {t("notes.category")}
                  </label>
                  <select
                    value={uploadTopicId}
                    onChange={(e) => setUploadTopicId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="">{t("notes.chooseCategory")}</option>
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
                    {t("notes.newCategoryName")}
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
                  {isAudioUpload ? t("notes.audioFiles") : t("notes.files")}
                </label>

                {isAudioUpload && (
                  <div className="mb-2 text-sm text-slate-600">
                    MP3, WAV, M4A, AAC, and OGG only. Files are stored in this class&apos;s protected Audio category.
                  </div>
                )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={isAudioUpload ? "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg" : undefined}
                    onChange={(e) => handlePickedFilesChange(Array.from(e.target.files || []))}
                  />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  {isAudioUpload ? t("notes.chooseAudioFiles") : t("notes.chooseFiles")}
                </button>

                {!isAudioUpload && (
                  <p className="mt-2 text-sm font-medium text-slate-600">
                    Slideshow presentations can contain up to 30 slides.
                  </p>
                )}

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

                {uploadWarning && (
                  <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {uploadWarning}
                  </div>
                )}

                {uploadFileLimitWarning && (
                  <div className="mt-3 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                    {uploadFileLimitWarning}
                  </div>
                )}

                {slideshowLimitError && (
                  <InlineNotice
                    variant="error"
                    title={SLIDESHOW_LIMIT_TITLE}
                    message={
                      <>
                        <p>{SLIDESHOW_LIMIT_MESSAGE}</p>
                        {slideshowLimitError.actualSlides != null && (
                          <p className="mt-1 font-semibold">This slideshow contains {slideshowLimitError.actualSlides} slides.</p>
                        )}
                      </>
                    }
                    actionLabel="Choose another file"
                    onAction={chooseAnotherFile}
                    className="mt-3"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  disabled={busy}
                >
                  {t("common.cancel")}
                </button>

                <button
                  type="button"
                  onClick={handleUpload}
                  className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? t("notes.uploading") : t("notes.upload")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingOfficeFiles?.length ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="office-conversion-title">
          <div className="w-full max-w-xl rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-2xl md:p-7">
            <div className="inline-flex rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
              {t("notes.resourcePreparation")}
            </div>
            <h2 id="office-conversion-title" className="mt-4 text-2xl font-black tracking-tight text-slate-900">
              {t("notes.prepareResource")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Elume can convert this file to PDF so it can be used with Whiteboard, quizzes and other teaching tools.
            </p>
            {pendingOfficeFiles.some((file) => POWERPOINT_CONVERSION_EXTENSIONS.has(getFileExtension(file.name))) ? (
              <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900">
                Slides will be converted as static pages. Animations and transitions will not be included.
              </div>
            ) : null}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              {pendingOfficeFiles.map((file) => file.name).join(", ")}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingOfficeFiles(null)}
                className="min-h-11 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void chooseOfficeUploadMode(false)}
                className="min-h-11 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                {t("notes.uploadOriginal")}
              </button>
              <button
                type="button"
                onClick={() => void chooseOfficeUploadMode(true)}
                className="min-h-11 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
              >
                {t("notes.convertAndUpload")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
