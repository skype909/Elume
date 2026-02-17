import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type LinkItem = {
  id: string;        // unique id
  url: string;
  title: string;     // short label
  note: string;      // why it's here
  addedAt: number;
};

type LinkCategory = {
  id: string;        // unique id
  name: string;
  description: string;
  createdAt: number;
  links: LinkItem[];
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalizeUrl(input: string) {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function getDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Reliable small "thumbnail" = site favicon (fast, no backend needed)
function faviconUrl(url: string) {
  const domain = getDomain(url);
  if (!domain) return "";
  // Google S2 favicon service (works well for most sites)
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function LinkIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LinksPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);
  const storageKey = `elume:links:class:${classId}`;

  const [categories, setCategories] = useState<LinkCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LinkCategory | null>(null);
  const [editingLink, setEditingLink] = useState<{ catId: string; link: LinkItem } | null>(null);

  // Category draft
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");

  // Link draft (used for both add/edit)
  const [targetCatId, setTargetCatId] = useState<string>("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNote, setLinkNote] = useState("");

  // Load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setCategories([]);
        return;
      }
      const parsed = JSON.parse(raw) as LinkCategory[];
      setCategories(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCategories([]);
    }
  }, [storageKey]);

  // Save
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(categories));
    } catch {}
  }, [categories, storageKey]);

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  function resetError() {
    setError(null);
  }

  function resetCategoryDraft() {
    setCatName("");
    setCatDesc("");
    setError(null);
  }

  function resetLinkDraft() {
    setTargetCatId(categoriesSorted[0]?.id ?? "");
    setLinkUrl("");
    setLinkTitle("");
    setLinkNote("");
    setError(null);
  }

  // -------- Category actions --------
  function openCreateCategory() {
    resetCategoryDraft();
    setShowNewCategory(true);
  }

  function openEditCategory(cat: LinkCategory) {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatDesc(cat.description);
    setError(null);
    setShowNewCategory(true);
  }

  function saveCategory() {
    resetError();
    const name = catName.trim();
    if (!name) return setError("Category name can’t be empty.");

    const description = catDesc.trim();

    if (editingCategory) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingCategory.id ? { ...c, name, description } : c
        )
      );
    } else {
      const newCat: LinkCategory = {
        id: uid("cat"),
        name,
        description,
        createdAt: Date.now(),
        links: [],
      };
      setCategories((prev) => [newCat, ...prev]);
      setTargetCatId(newCat.id);
    }

    setShowNewCategory(false);
    setEditingCategory(null);
    resetCategoryDraft();
  }

  function deleteCategory(catId: string) {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (targetCatId === catId) setTargetCatId("");
  }

  // -------- Link actions --------
  function openAddLinkModal(defaultCatId?: string) {
    resetLinkDraft();
    if (defaultCatId) setTargetCatId(defaultCatId);
    setShowAddLink(true);
  }

  function openEditLink(catId: string, link: LinkItem) {
    setEditingLink({ catId, link });
    setTargetCatId(catId);
    setLinkUrl(link.url);
    setLinkTitle(link.title);
    setLinkNote(link.note);
    setError(null);
    setShowAddLink(true);
  }

  function saveLink() {
    resetError();

    const catId = targetCatId || categoriesSorted[0]?.id;
    if (!catId) return setError("Create a category first.");

    const url = normalizeUrl(linkUrl);
    if (!url) return setError("Paste a link first.");

    // Validate URL
    try {
      new URL(url);
    } catch {
      return setError("That link doesn’t look valid.");
    }

    const title = (linkTitle.trim() || getDomain(url) || "Link").trim();
    const note = linkNote.trim();

    if (editingLink) {
      // Move categories if changed
      const fromCatId = editingLink.catId;
      const linkId = editingLink.link.id;

      setCategories((prev) => {
        const next = prev.map((c) => ({ ...c, links: [...c.links] }));

        // remove from original
        const from = next.find((c) => c.id === fromCatId);
        if (from) from.links = from.links.filter((l) => l.id !== linkId);

        // add/update in target
        const to = next.find((c) => c.id === catId);
        if (to) {
          to.links = [
            { id: linkId, url, title, note, addedAt: editingLink.link.addedAt },
            ...to.links,
          ];
        }
        return next;
      });
    } else {
      const newLink: LinkItem = {
        id: uid("lnk"),
        url,
        title,
        note,
        addedAt: Date.now(),
      };
      setCategories((prev) =>
        prev.map((c) =>
          c.id === catId ? { ...c, links: [newLink, ...c.links] } : c
        )
      );
    }

    setShowAddLink(false);
    setEditingLink(null);
    resetLinkDraft();
  }

  function deleteLink(catId: string, linkId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, links: c.links.filter((l) => l.id !== linkId) } : c
      )
    );
  }

  // ------- Styling (match your ELume style) -------
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
              <LinkIcon className="h-6 w-6" />
            </span>
            <div>
              <div className="text-2xl font-extrabold tracking-tight">Links</div>
              <div className="text-sm text-slate-600">
                Create categories and save useful websites with short notes for students.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={pill}
              type="button"
              onClick={() => navigate(`/class/${classId}`)}
              title="Back to class"
            >
              Back to Class
            </button>

            <button className={pill} type="button" onClick={() => openAddLinkModal()}>
              + Add Link
            </button>

            <button className={btnPrimary} type="button" onClick={openCreateCategory}>
              + New Category
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-6 space-y-6">
          {categoriesSorted.length === 0 ? (
            <div className={`${card} p-6 text-sm text-slate-700`}>
              No categories yet. Click <b>+ New Category</b> to get started.
            </div>
          ) : (
            categoriesSorted.map((cat) => (
              <section key={cat.id} className={`${card} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-extrabold">{cat.name}</h2>
                    {cat.description && (
                      <div className="mt-1 text-sm text-slate-600">{cat.description}</div>
                    )}
                    <div className="mt-2 text-xs text-slate-500">
                      {cat.links.length} link{cat.links.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className={pill} type="button" onClick={() => openAddLinkModal(cat.id)}>
                      Add link to this
                    </button>
                    <button className={pill} type="button" onClick={() => openEditCategory(cat)}>
                      Edit
                    </button>
                    <button
                      className="rounded-full border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      type="button"
                      onClick={() => deleteCategory(cat.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Links list */}
                {cat.links.length === 0 ? (
                  <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    No links in this category yet. Click <b>Add link to this</b>.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.links
                      .slice()
                      .sort((a, b) => b.addedAt - a.addedAt)
                      .map((l) => (
                        <div
                          key={l.id}
                          className="rounded-2xl border-2 border-slate-200 bg-white p-3 hover:bg-slate-50"
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
                              {faviconUrl(l.url) ? (
                                <img
                                  src={faviconUrl(l.url)}
                                  alt=""
                                  className="h-6 w-6"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-xs text-slate-500">🔗</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-sm font-semibold text-emerald-700 hover:underline truncate"
                                title={l.url}
                              >
                                {l.title}
                              </a>

                              {l.note && (
                                <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                                  {l.note}
                                </div>
                              )}

                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-slate-500 truncate">
                                  {getDomain(l.url) || "Website"}
                                </span>

                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEditLink(cat.id, l)}
                                    className="text-[11px] font-semibold text-emerald-700 hover:underline"
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteLink(cat.id, l.id)}
                                    className="text-[11px] font-semibold text-red-700 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>

      {/* Category Modal (Create/Edit) */}
      {showNewCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="text-xl font-semibold">
              {editingCategory ? "Edit category" : "New category"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Add a short description so students know what this section is for.
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Category name (e.g. Simulations, Revision, Homework)"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                autoFocus
              />

              <textarea
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Short description (optional)"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                rows={3}
              />

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
                    setShowNewCategory(false);
                    setEditingCategory(null);
                    resetCategoryDraft();
                  }}
                >
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={saveCategory}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Modal (Add/Edit) */}
      {showAddLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="text-xl font-semibold">
              {editingLink ? "Edit link" : "Add link"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Choose a category, paste the link, and add a short note for students.
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  value={targetCatId}
                  onChange={(e) => setTargetCatId(e.target.value)}
                >
                  {categoriesSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <input
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Short title (optional)"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
              </div>

              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Paste link (e.g. phet.colorado.edu / youtube.com / desmos.com)"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                autoFocus={!editingLink}
              />

              <textarea
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Short description (why it's here / what to do) (optional)"
                value={linkNote}
                onChange={(e) => setLinkNote(e.target.value)}
                rows={3}
              />

              {/* Preview */}
              {linkUrl.trim() && (
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl border border-slate-200 bg-white grid place-items-center overflow-hidden">
                      {faviconUrl(normalizeUrl(linkUrl)) ? (
                        <img
                          src={faviconUrl(normalizeUrl(linkUrl))}
                          alt=""
                          className="h-6 w-6"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">🔗</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {linkTitle.trim() || getDomain(normalizeUrl(linkUrl)) || "Link"}
                      </div>
                      <div className="text-xs text-slate-600 truncate">
                        {normalizeUrl(linkUrl)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                    setShowAddLink(false);
                    setEditingLink(null);
                    resetLinkDraft();
                  }}
                >
                  Cancel
                </button>

                <button className={btnPrimary} type="button" onClick={saveLink}>
                  {editingLink ? "Save changes" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
