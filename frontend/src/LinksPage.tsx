import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackToClassButton, ClassPageActionBar } from "./ClassPageActions";

type LinkItem = {
  id: string;
  url: string;
  title: string;
  note: string;
  addedAt: number;
};

type LinkCategory = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  links: LinkItem[];
};

const DEFAULT_RESOURCE_SECTIONS = [
  {
    name: "Lesson Plans",
    description: "Teacher-facing lesson plans and planning notes for this class.",
    accent: "from-cyan-500 via-sky-500 to-indigo-500",
    border: "border-cyan-200",
    tint: "bg-cyan-50/80",
    ring: "ring-cyan-100",
  },
  {
    name: "Worksheets",
    description: "Printable class worksheets and student handouts for this class.",
    accent: "from-violet-500 via-fuchsia-500 to-pink-500",
    border: "border-violet-200",
    tint: "bg-violet-50/80",
    ring: "ring-violet-100",
  },
] as const;

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

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase();
}

function faviconUrl(url: string) {
  const domain = getDomain(url);
  if (!domain) return "";
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

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LinkCategory | null>(null);
  const [editingLink, setEditingLink] = useState<{ catId: string; link: LinkItem } | null>(null);

  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");

  const [targetCatId, setTargetCatId] = useState<string>("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNote, setLinkNote] = useState("");

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

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(categories));
    } catch {}
  }, [categories, storageKey]);

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, LinkCategory>();
    for (const category of categories) {
      map.set(normalizeCategoryName(category.name), category);
    }
    return map;
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
    if (!name) return setError("Category name can't be empty.");

    const description = catDesc.trim();

    if (editingCategory) {
      setCategories((prev) =>
        prev.map((c) => (c.id === editingCategory.id ? { ...c, name, description } : c))
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

  function createPresetCategory(name: string, description: string) {
    const existing = categoryLookup.get(normalizeCategoryName(name));
    if (existing) return existing.id;
    const newCat: LinkCategory = {
      id: uid("cat"),
      name,
      description,
      createdAt: Date.now(),
      links: [],
    };
    setCategories((prev) => [newCat, ...prev]);
    setTargetCatId(newCat.id);
    return newCat.id;
  }

  function deleteCategory(catId: string) {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (targetCatId === catId) setTargetCatId("");
  }

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

    try {
      new URL(url);
    } catch {
      return setError("That link doesn't look valid.");
    }

    const title = (linkTitle.trim() || getDomain(url) || "Link").trim();
    const note = linkNote.trim();

    if (editingLink) {
      const fromCatId = editingLink.catId;
      const linkId = editingLink.link.id;

      setCategories((prev) => {
        const next = prev.map((c) => ({ ...c, links: [...c.links] }));
        const from = next.find((c) => c.id === fromCatId);
        if (from) from.links = from.links.filter((l) => l.id !== linkId);

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
        prev.map((c) => (c.id === catId ? { ...c, links: [newLink, ...c.links] } : c))
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

  const card =
    "rounded-[30px] border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl";
  const pill =
    "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary =
    "rounded-full border border-emerald-700 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50";
  const btnCreateResources =
    "inline-flex items-center gap-3 rounded-full border border-emerald-700 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(16,185,129,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(6,182,212,0.26)]";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_24%),linear-gradient(180deg,_#f5fffb_0%,_#effaf7_42%,_#eef7ff_100%)] p-6">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ClassPageActionBar>
          <BackToClassButton classId={classId} />
        </ClassPageActionBar>

        <div className={`${card} overflow-hidden`}>
          <div className="bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(34,211,238,0.10),rgba(99,102,241,0.10))] p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                  <LinkIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Class Resources
                  </div>
                  <div className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                    Resources
                  </div>
                  <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Keep useful websites, lesson planning folders and printable resource sections together in one tidy teacher-facing space.
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
                      Lesson Plans
                    </span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-800">
                      Worksheets
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">
                      Websites and shared links
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={btnCreateResources}
                  type="button"
                  onClick={() => navigate("/create-resources")}
                >
                  <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                    <span className="absolute inline-flex h-5 w-5 rounded-full bg-white/25 opacity-70 animate-[ping_2.2s_ease-out_infinite]" />
                    <span className="relative text-base leading-none">+</span>
                  </span>
                  <span>Create Resources</span>
                  <span className="rounded-full border border-white/35 bg-white/15 px-2 py-[2px] text-[10px] font-black uppercase tracking-[0.18em] text-white">
                    AI
                  </span>
                </button>

                <button className={pill} type="button" onClick={() => openAddLinkModal()}>
                  + Add Resource
                </button>

                <button className={btnPrimary} type="button" onClick={openCreateCategory}>
                  + New Resource Category
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <section className={`${card} p-5 sm:p-6`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Suggested folders
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                  Lesson Plans and Worksheets
                </h2>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  These are the natural home sections for generated teaching resources. They are shown here now, but automatic saving from Create Resources is not wired into this page yet.
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Current Resources stays truthful to saved categories only.
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {DEFAULT_RESOURCE_SECTIONS.map((section) => {
                const existing = categoryLookup.get(normalizeCategoryName(section.name));
                const count = existing?.links.length ?? 0;
                return (
                  <div
                    key={section.name}
                    className={`rounded-[26px] border ${section.border} ${section.tint} p-4 shadow-sm ring-1 ${section.ring}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className={`inline-flex rounded-full bg-gradient-to-r ${section.accent} px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-sm`}
                        >
                          {existing ? "Ready" : "Suggested"}
                        </div>
                        <div className="mt-3 text-xl font-black tracking-tight text-slate-900">
                          {section.name}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">
                          {existing?.description || section.description}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-2 text-right shadow-sm">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Saved here
                        </div>
                        <div className="mt-1 text-lg font-black text-slate-900">{count}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {existing ? (
                        <>
                          <button className={pill} type="button" onClick={() => openAddLinkModal(existing.id)}>
                            Add resource to this
                          </button>
                          <button className={pill} type="button" onClick={() => openEditCategory(existing)}>
                            Edit section
                          </button>
                        </>
                      ) : (
                        <button
                          className={pill}
                          type="button"
                          onClick={() => createPresetCategory(section.name, section.description)}
                        >
                          Create {section.name}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {categoriesSorted.length === 0 ? (
            <div className={`${card} p-6 sm:p-8`}>
              <div className="rounded-[28px] border border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 text-sm text-slate-700">
                <div className="text-lg font-black tracking-tight text-slate-900">
                  No resource categories yet
                </div>
                <div className="mt-2 max-w-2xl leading-6 text-slate-600">
                  Create a category for useful websites, or start with Lesson Plans and Worksheets above to prepare this class for generated resources.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={btnPrimary} type="button" onClick={openCreateCategory}>
                    + New Resource Category
                  </button>
                  <button className={pill} type="button" onClick={() => navigate("/create-resources")}>
                    Open Create Resources
                  </button>
                </div>
              </div>
            </div>
          ) : (
            categoriesSorted.map((cat) => (
              <section key={cat.id} className={`${card} p-5 sm:p-6`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{cat.name}</h2>
                    {cat.description && (
                      <div className="mt-2 text-sm leading-6 text-slate-600">{cat.description}</div>
                    )}
                    <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {cat.links.length} resource{cat.links.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className={pill} type="button" onClick={() => openAddLinkModal(cat.id)}>
                      Add resource to this
                    </button>
                    <button className={pill} type="button" onClick={() => openEditCategory(cat)}>
                      Edit
                    </button>
                    <button
                      className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
                      type="button"
                      onClick={() => deleteCategory(cat.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {cat.links.length === 0 ? (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700">
                    No resources in this category yet. Click <b>Add resource to this</b>.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.links
                      .slice()
                      .sort((a, b) => b.addedAt - a.addedAt)
                      .map((l) => (
                        <div
                          key={l.id}
                          className="rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                        >
                          <div className="flex items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                              {faviconUrl(l.url) ? (
                                <img
                                  src={faviconUrl(l.url)}
                                  alt=""
                                  className="h-6 w-6"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-xs text-slate-500">Link</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate text-sm font-semibold text-emerald-700 hover:underline"
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
                                <span className="truncate text-[11px] text-slate-500">
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

      {showNewCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="text-xl font-semibold">
              {editingCategory ? "Edit category" : "New category"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Add a short description so teachers know what this section is for.
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Category name (e.g. Simulations, Revision, Homework)"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                autoFocus
              />

              <textarea
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Short description (optional)"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                rows={3}
              />

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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

      {showAddLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="text-xl font-semibold">{editingLink ? "Edit link" : "Add link"}</div>
            <div className="mt-1 text-sm text-slate-600">
              Choose a category, paste the link, and add a short note for teachers.
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Short title (optional)"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
              </div>

              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Paste link (e.g. phet.colorado.edu / youtube.com / desmos.com)"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                autoFocus={!editingLink}
              />

              <textarea
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Short description (why it's here / what to do) (optional)"
                value={linkNote}
                onChange={(e) => setLinkNote(e.target.value)}
                rows={3}
              />

              {linkUrl.trim() && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {faviconUrl(normalizeUrl(linkUrl)) ? (
                        <img src={faviconUrl(normalizeUrl(linkUrl))} alt="" className="h-6 w-6" />
                      ) : (
                        <span className="text-xs text-slate-500">Link</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {linkTitle.trim() || getDomain(normalizeUrl(linkUrl)) || "Link"}
                      </div>
                      <div className="truncate text-xs text-slate-600">{normalizeUrl(linkUrl)}</div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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
