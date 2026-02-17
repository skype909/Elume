// VideosPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type VideoItem = {
  id: string;          // YouTube video id
  url: string;         // original pasted url
  title: string;       // user title
  category: string;    // grouping
  addedAt: number;
};

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());

    // youtu.be/<id>
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "").trim();
      return id || null;
    }

    // youtube.com/watch?v=<id>
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;

      // youtube.com/embed/<id>
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIndex = parts.indexOf("embed");
      if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];

      // youtube.com/shorts/<id>
      const shortsIndex = parts.indexOf("shorts");
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];
    }

    return null;
  } catch {
    return null;
  }
}

function thumbUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function embedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

function MovieIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16v12H4V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M4 7l4 4M8 7l4 4M12 7l4 4M16 7l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M8 19v-4M16 19v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function VideosPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);

  const storageKey = `elume:videos:class:${classId}`;

  const [items, setItems] = useState<VideoItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<VideoItem | null>(null);

  // shared drafts for add/edit
  const [draftUrl, setDraftUrl] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState("General");

  // Player modal
  const [playing, setPlaying] = useState<VideoItem | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as VideoItem[];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, storageKey]);

  const grouped = useMemo(() => {
    const map = new Map<string, VideoItem[]>();
    for (const v of items) {
      const cat = (v.category || "General").trim() || "General";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(v);
    }
    const cats = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return cats.map((cat) => ({
      category: cat,
      videos: (map.get(cat) || []).sort((a, b) => b.addedAt - a.addedAt),
    }));
  }, [items]);

  function resetDraft() {
    setDraftUrl("");
    setDraftTitle("");
    setDraftCategory("General");
    setError(null);
  }

  function openAdd() {
    resetDraft();
    setShowAdd(true);
  }

  function openEdit(v: VideoItem) {
    setError(null);
    setEditing(v);
    setDraftUrl(v.url);
    setDraftTitle(v.title);
    setDraftCategory(v.category || "General");
    setShowEdit(true);
  }

  function addVideo() {
    setError(null);

    const url = draftUrl.trim();
    if (!url) return setError("Paste a YouTube link first.");

    const ytId = extractYouTubeId(url);
    if (!ytId) return setError("That doesn’t look like a valid YouTube link.");

    const title = (draftTitle.trim() || "Untitled Video").trim();
    const category = (draftCategory.trim() || "General").trim();

    if (items.some((x) => x.id === ytId)) return setError("That video is already in your list.");

    const newItem: VideoItem = { id: ytId, url, title, category, addedAt: Date.now() };

    setItems((prev) => [newItem, ...prev]);
    setShowAdd(false);
    resetDraft();
  }

  function saveEdit() {
    if (!editing) return;

    setError(null);

    const url = draftUrl.trim();
    if (!url) return setError("Paste a YouTube link first.");

    const ytId = extractYouTubeId(url);
    if (!ytId) return setError("That doesn’t look like a valid YouTube link.");

    if (ytId !== editing.id && items.some((x) => x.id === ytId)) {
      return setError("That video is already in your list.");
    }

    const title = (draftTitle.trim() || "Untitled Video").trim();
    const category = (draftCategory.trim() || "General").trim();

    setItems((prev) =>
      prev.map((v) =>
        v.id === editing.id ? { ...v, id: ytId, url, title, category } : v
      )
    );

    // If the edited video is currently playing, update that reference too
    setPlaying((p) => (p && p.id === editing.id ? { ...p, id: ytId, url, title, category } : p));

    setShowEdit(false);
    setEditing(null);
    resetDraft();
  }

  function deleteVideo(videoId: string) {
    setItems((prev) => prev.filter((v) => v.id !== videoId));
    if (playing?.id === videoId) setPlaying(null);
    if (editing?.id === videoId) {
      setShowEdit(false);
      setEditing(null);
      resetDraft();
    }
  }

  // Tailwind tokens (match your ELume vibe)
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const pill =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary =
    "rounded-full border-2 border-emerald-700 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";

  return (
    <div className="min-h-screen bg-emerald-100 p-6">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className={`${card} p-5 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border-2 border-slate-200 bg-slate-50">
              <MovieIcon className="h-6 w-6" />
            </span>

            <div>
              <div className="text-2xl font-extrabold tracking-tight">Videos</div>
              <div className="text-sm text-slate-600">
                Paste a YouTube link to add a thumbnail. Click to play.
              </div>
            </div>
          </div>

          {/* Top-right actions */}
          <div className="flex items-center gap-2">
            <button
              className={pill}
              type="button"
              onClick={() => navigate(`/class/${classId}`)}
              title="Back to class"
            >
              Back to Class
            </button>

            <button className={btnPrimary} type="button" onClick={openAdd}>
              + Add Video
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-6 space-y-6">
          {items.length === 0 ? (
            <div className={`${card} p-6 text-sm text-slate-700`}>
              No videos yet. Click <b>+ Add Video</b> and paste a YouTube link.
            </div>
          ) : (
            grouped.map(({ category, videos }) => (
              <section key={category} className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-extrabold">{category}</h2>
                  <div className="text-xs text-slate-500">
                    {videos.length} video{videos.length === 1 ? "" : "s"}
                  </div>
                </div>

                {/* ~12 thumbnails visible: 6 cols on large screens */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {videos.map((v) => (
                    <div key={v.id} className="group">
                      <button
                        type="button"
                        onClick={() => setPlaying(v)}
                        className="w-full overflow-hidden rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50"
                        title="Click to play"
                      >
                        <div className="relative">
                          <img
                            src={thumbUrl(v.id)}
                            alt={v.title}
                            className="h-28 w-full object-cover sm:h-32"
                            loading="lazy"
                          />

                          <div className="absolute inset-0 grid place-items-center">
                            <div className="rounded-full bg-black/55 px-3 py-2 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition">
                              ▶ Play
                            </div>
                          </div>
                        </div>

                        <div className="p-2 text-left">
                          <div className="line-clamp-2 text-xs font-semibold text-slate-800">
                            {v.title}
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500">YouTube</span>

                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(v);
                                }}
                                className="text-[11px] font-semibold text-emerald-700 hover:underline"
                                title="Edit title/category/link"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteVideo(v.id);
                                }}
                                className="text-[11px] font-semibold text-red-700 hover:underline"
                                title="Remove video"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {/* Add Video Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="text-xl font-semibold">Add a YouTube Video</div>
            <div className="mt-1 text-sm text-slate-600">
              Paste a link (youtube.com, youtu.be, shorts).
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="YouTube link (e.g. https://www.youtube.com/watch?v=...)"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                autoFocus
              />

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Title (e.g. Standing Waves)"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />

                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Category (e.g. Waves, Mechanics)"
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className={pill}
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    resetDraft();
                  }}
                >
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={addVideo}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Video Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="text-xl font-semibold">Edit Video</div>
            <div className="mt-1 text-sm text-slate-600">
              Update the title, category, or link.
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="YouTube link"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                autoFocus
              />

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />

                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Category"
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className={pill}
                  type="button"
                  onClick={() => {
                    setShowEdit(false);
                    setEditing(null);
                    resetDraft();
                  }}
                >
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={saveEdit}>
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player Modal */}
      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border-2 border-slate-200 bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{playing.title}</div>
                <div className="text-sm text-slate-600 truncate">{playing.category}</div>
              </div>
              <button className={pill} type="button" onClick={() => setPlaying(null)}>
                Close
              </button>
            </div>

            <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-black">
              <iframe
                title={playing.title}
                src={embedUrl(playing.id)}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <a
                href={playing.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Open on YouTube
              </a>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                  onClick={() => {
                    openEdit(playing);
                    setPlaying(null);
                  }}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="text-sm font-semibold text-red-700 hover:underline"
                  onClick={() => deleteVideo(playing.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
