import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";

const API_BASE = "/api";

type ClassItem = {
  id: number;
  name: string;
  subject: string;
};

type TestCategory = {
  id: number;
  class_id: number;
  title: string;
  description?: string | null;
};

type TestItem = {
  id: number;
  class_id: number;
  category_id?: number | null;
  title: string;
  description?: string | null;
  filename?: string | null;
  file_url?: string | null;
  uploaded_at?: string | null;
};

type ModalProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
};

function Modal({ open, title, children, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-2xl rounded-[2rem] border-2 border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">{title}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { detail: text };
  }
}

function resolveFileUrl(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
  return `${API_BASE}${fileUrl}`;
}

function formatStamp(ts?: string | null) {
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

export default function TestsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);
  const validClassId = Number.isFinite(classId) && classId > 0;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [classInfo, setClassInfo] = useState<ClassItem | null>(null);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);

  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "uncategorised" | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  const [uploadMode, setUploadMode] = useState<"existing" | "new">("existing");
  const [testTitle, setTestTitle] = useState("");
  const [testDesc, setTestDesc] = useState("");
  const [testCategoryId, setTestCategoryId] = useState<number | "none">("none");
  const [newUploadCategoryTitle, setNewUploadCategoryTitle] = useState("");
  const [newUploadCategoryDesc, setNewUploadCategoryDesc] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);

    try {
      const [classRes, catRes, testRes] = await Promise.all([
        apiFetch(`${API_BASE}/classes/${classId}`),
        apiFetch(`${API_BASE}/classes/${classId}/test-categories`),
        apiFetch(`${API_BASE}/classes/${classId}/tests`),
      ]);

      if (classRes) {
        const cls = classRes as ClassItem;
        setClassInfo(cls ?? null);
      } else {
        setClassInfo(null);
      }

      const catData = catRes as TestCategory[];
      const testData = testRes as TestItem[];

      setCategories(Array.isArray(catData) ? catData : []);
      setTests(Array.isArray(testData) ? testData : []);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!validClassId) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, validClassId]);

  const uncategorised = useMemo(
    () => tests.filter((t) => !t.category_id).sort((a, b) => b.id - a.id),
    [tests]
  );

  const testsByCategory = useMemo(() => {
    const map = new Map<number, TestItem[]>();

    for (const c of categories) map.set(c.id, []);
    for (const t of tests) {
      if (t.category_id && map.has(t.category_id)) {
        map.get(t.category_id)!.push(t);
      }
    }

    map.forEach((arr, k) => {
      arr.sort((a, b) => b.id - a.id);
      map.set(k, arr);
    });

    return map;
  }, [categories, tests]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();

    const base: Array<{
      id: number | "uncategorised";
      title: string;
      description: string;
      testCount: number;
      latest: string | null;
      matches: boolean;
    }> = categories.map((c) => {
      const catTests = testsByCategory.get(c.id) ?? [];
      const latest = catTests[0]?.uploaded_at ?? null;
      const haystack = `${c.title} ${c.description || ""} ${catTests
        .map((t) => `${t.title} ${t.filename || ""}`)
        .join(" ")}`.toLowerCase();

      return {
        id: c.id,
        title: c.title,
        description: c.description || "",
        testCount: catTests.length,
        latest,
        matches: !q || haystack.includes(q),
      };
    });

    const filtered = base.filter((x) => x.matches);

    if (
      uncategorised.length > 0 &&
      (!q ||
        `uncategorised ${uncategorised.map((t) => `${t.title} ${t.filename || ""}`).join(" ")}`
          .toLowerCase()
          .includes(q))
    ) {
      filtered.unshift({
        id: "uncategorised" as const,
        title: "Uncategorised",
        description: "Tests not yet placed into a category",
        testCount: uncategorised.length,
        latest: uncategorised[0]?.uploaded_at ?? null,
        matches: true,
      });
    }

    return filtered;
  }, [categories, testsByCategory, uncategorised, search]);

  const selectedCategory = useMemo(() => {
    if (selectedCategoryId === "uncategorised") {
      return {
        title: "Uncategorised",
        description: "Tests not yet placed into a category",
      };
    }
    return categories.find((c) => c.id === selectedCategoryId) ?? null;
  }, [categories, selectedCategoryId]);

  const selectedTests = useMemo(() => {
    const q = search.trim().toLowerCase();

    let base: TestItem[] = [];

    if (selectedCategoryId === "uncategorised") {
      base = uncategorised;
    } else if (typeof selectedCategoryId === "number") {
      base = testsByCategory.get(selectedCategoryId) ?? [];
    }

    if (!q) return base;

    return base.filter((t) =>
      `${t.title} ${t.description || ""} ${t.filename || ""}`.toLowerCase().includes(q)
    );
  }, [selectedCategoryId, uncategorised, testsByCategory, search]);

  const tileCols = getTileCols(filteredCards.length || 1);

  const pageTitle = classInfo?.name ? `${classInfo.name} Tests` : "Tests";

  const openUpload = (categoryId?: number | null | "uncategorised") => {
    setErr(null);
    setTestTitle("");
    setTestDesc("");
    setNewUploadCategoryTitle("");
    setNewUploadCategoryDesc("");

    if (fileRef.current) fileRef.current.value = "";

    if (typeof categoryId === "number") {
      setUploadMode("existing");
      setTestCategoryId(categoryId);
    } else if (categoryId === "uncategorised") {
      setUploadMode("existing");
      setTestCategoryId("none");
    } else if (categories.length > 0) {
      setUploadMode("existing");
      setTestCategoryId("none");
    } else {
      setUploadMode("new");
      setTestCategoryId("none");
    }

    setUploadOpen(true);
  };

  const createCategory = async () => {
    const title = newCatTitle.trim();
    if (!title) {
      setErr("Please enter a category title.");
      return;
    }

    try {
      setErr(null);

      const created = (await apiFetch(`${API_BASE}/classes/${classId}/test-categories`, {
        method: "POST",
        body: JSON.stringify({
          title,
          description: newCatDesc.trim() || null,
        }),
      })) as TestCategory;
      setCategories((prev) => [created, ...prev]);
      setNewCatTitle("");
      setNewCatDesc("");
      setCreateOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to create category");
    }
  };

  const createCategoryForUpload = async () => {
    const title = newUploadCategoryTitle.trim();
    if (!title) throw new Error("Please enter a category title.");

    const created = (await apiFetch(`${API_BASE}/classes/${classId}/test-categories`, {
      method: "POST",
      body: JSON.stringify({
        title,
        description: newUploadCategoryDesc.trim() || null,
      }),
    })) as TestCategory;
    setCategories((prev) => [created, ...prev]);
    return created.id;
  };

  const uploadTest = async () => {
    const title = testTitle.trim();
    const file = fileRef.current?.files?.[0] ?? null;

    if (!title) {
      setErr("Please enter a title.");
      return;
    }

    if (!file) {
      setErr("Please choose a file to upload.");
      return;
    }

    try {
      setErr(null);

      let categoryIdToUse: number | "none" = testCategoryId;

      if (uploadMode === "new") {
        categoryIdToUse = await createCategoryForUpload();
      }

      const fd = new FormData();
      fd.append("class_id", String(classId));
      fd.append("title", title);
      fd.append("description", testDesc.trim());

      if (categoryIdToUse !== "none") {
        fd.append("category_id", String(categoryIdToUse));
      }

      fd.append("file", file);

      const created = (await apiFetch(`${API_BASE}/tests`, {
        method: "POST",
        body: fd,
      })) as TestItem;
      setTests((prev) => [created, ...prev]);
      setUploadOpen(false);

      if (categoryIdToUse === "none") {
        setSelectedCategoryId("uncategorised");
      } else {
        setSelectedCategoryId(categoryIdToUse);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to upload test");
    }
  };

  const updateTest = async (testId: number, patch: Partial<TestItem>) => {
    try {
      setErr(null);

      const updated = (await apiFetch(`${API_BASE}/tests/${testId}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      })) as TestItem;
      setTests((prev) => prev.map((t) => (t.id === testId ? updated : t)));
    } catch (e: any) {
      setErr(e?.message || "Failed to update test");
    }
  };

  const deleteTest = async (testId: number) => {
    if (!window.confirm("Delete this test?")) return;

    try {
      setErr(null);

      await apiFetch(`${API_BASE}/tests/${testId}`, { method: "DELETE" });

      setTests((prev) => prev.filter((t) => t.id !== testId));
    } catch (e: any) {
      setErr(e?.message || "Failed to delete test");
    }
  };

  const deleteCategory = async (catId: number) => {
    if (!window.confirm("Delete this category? Any tests inside will become uncategorised.")) return;

    try {
      setErr(null);

      await apiFetch(`${API_BASE}/test-categories/${catId}`, {
        method: "DELETE",
      });

      setCategories((prev) => prev.filter((c) => c.id !== catId));
      setTests((prev) =>
        prev.map((t) => (t.category_id === catId ? { ...t, category_id: null } : t))
      );

      if (selectedCategoryId === catId) {
        setSelectedCategoryId(null);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to delete category");
    }
  };

  const TestRow = ({ t }: { t: TestItem }) => {
    const href = resolveFileUrl(t.file_url);

    return (
      <div className="flex flex-col gap-3 rounded-3xl border-2 border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="truncate text-xl font-bold text-slate-900">{t.title}</div>

          <div className="mt-1 text-sm text-slate-500">
            {t.description?.trim()
              ? t.description
              : `Uploaded: ${formatStamp(t.uploaded_at)}`}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              value={t.category_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                updateTest(t.id, { category_id: v ? Number(v) : null });
              }}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            {t.filename ? (
              <span className="text-xs font-medium text-slate-400">{t.filename}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Open
            </a>
          ) : (
            <span className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2 text-sm text-slate-500">
              No file
            </span>
          )}

          <button
            type="button"
            onClick={() => deleteTest(t.id)}
            className="rounded-2xl border-2 border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#dff3df] px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl">
        {err && (
          <div className="mb-4 rounded-3xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        <div className="rounded-[1.6rem] border border-slate-200 bg-white/95 px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full bg-emerald-600 px-6 py-2 text-3xl font-bold tracking-wide text-white">
                <span style={{ textShadow: "0 2px 4px rgba(0,0,0,0.35)" }}>
                  Tests
                </span>
              </div>

              <div className="mt-1 text-sm text-slate-500">
                Organise class tests, assessments and exam papers by category.
              </div>

              <div className="mt-2 text-xs font-medium text-slate-400">{pageTitle}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCategoryId !== null ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
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
                onClick={() => openUpload(selectedCategoryId)}
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
                selectedCategory
                  ? `Search inside ${selectedCategory.title}...`
                  : "Search categories or tests..."
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-200 lg:max-w-xl"
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {selectedCategory
                ? `${selectedTests.length} test${selectedTests.length === 1 ? "" : "s"} in ${selectedCategory.title}`
                : `${filteredCards.length} categor${filteredCards.length === 1 ? "y" : "ies"} • ${tests.length} total tests`}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-[1.7rem] border border-slate-200 bg-white/95 px-6 py-10 text-sm text-slate-600 shadow-sm">
            Loading tests...
          </div>
        ) : selectedCategoryId === null ? (
          <div className="mt-6 rounded-[1.7rem] border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black tracking-tight text-slate-900">Categories</div>
                <div className="text-sm text-slate-500">
                  Dashboard-style topic tiles for fast classroom access
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  + New Category
                </button>

                <button
                  type="button"
                  onClick={() => openUpload(null)}
                  className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  + Add Category / Upload
                </button>
              </div>
            </div>

            {filteredCards.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
                <div className="text-xl font-bold text-slate-800">No test categories yet</div>
                <div className="mt-2 text-sm text-slate-600">
                  Create your first category and upload tests into it.
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Start Tests Library
                </button>
              </div>
            ) : (
              <div
                className="grid gap-5"
                style={{
                  gridTemplateColumns: `repeat(${tileCols}, minmax(0, 1fr))`,
                }}
              >
                {filteredCards.map((card, idx) => {
                  const tone = pickTileTone(idx);

                  return (
                    <button
                      key={String(card.id)}
                      type="button"
                      onClick={() => setSelectedCategoryId(card.id)}
                      className={[
                        "group relative min-h-[150px] rounded-[1.7rem] border-[4px] border-black px-5 py-4 text-left shadow-[0_8px_0_rgba(0,0,0,0.25)] transition",
                        "hover:-translate-y-[2px] hover:shadow-[0_12px_0_rgba(0,0,0,0.22)]",
                        tone,
                      ].join(" ")}
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <div className="text-3xl font-black tracking-tight leading-tight">
                            {card.title}
                          </div>
                          <div className="mt-3 text-lg font-semibold opacity-90">
                            {card.testCount} test{card.testCount === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div className="flex items-end justify-between">
                          <div className="text-sm font-semibold opacity-80">
                            {card.latest ? `Updated ${formatStamp(card.latest)}` : "Ready to fill"}
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
        ) : (
          <div className="mt-6 rounded-[1.7rem] border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Category
                </div>
                <div className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                  {selectedCategory?.title}
                </div>
                {selectedCategory?.description ? (
                  <div className="mt-2 text-sm text-slate-500">{selectedCategory.description}</div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openUpload(selectedCategoryId)}
                  className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Add files
                </button>

                {typeof selectedCategoryId === "number" && (
                  <button
                    type="button"
                    onClick={() => deleteCategory(selectedCategoryId)}
                    className="rounded-2xl border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Delete category
                  </button>
                )}
              </div>
            </div>

            {selectedTests.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <div className="text-lg font-bold text-slate-800">No tests in this category yet</div>
                <div className="mt-2 text-sm text-slate-600">
                  Upload files into {selectedCategory?.title} to get started.
                </div>
                <button
                  type="button"
                  onClick={() => openUpload(selectedCategoryId)}
                  className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Upload test
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedTests.map((t) => (
                  <TestRow key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={createOpen} title="New Test Category" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Category title</label>
            <input
              value={newCatTitle}
              onChange={(e) => setNewCatTitle(e.target.value)}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="e.g. Class Tests, Mocks, Revision Papers"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Description (optional)
            </label>
            <textarea
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              rows={4}
              placeholder="Short description..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={createCategory}
              className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={uploadOpen} title="Upload Test" onClose={() => setUploadOpen(false)}>
        <div className="space-y-4">
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

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Test title</label>
            <input
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="e.g. Chapter 7 Class Test"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Description (optional)
            </label>
            <textarea
              value={testDesc}
              onChange={(e) => setTestDesc(e.target.value)}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              rows={4}
              placeholder="Instructions, timing, notes..."
            />
          </div>

          {uploadMode === "existing" ? (
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">Category</label>
              <select
                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm"
                value={testCategoryId === "none" ? "" : String(testCategoryId)}
                onChange={(e) => setTestCategoryId(e.target.value ? Number(e.target.value) : "none")}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  New category title
                </label>
                <input
                  value={newUploadCategoryTitle}
                  onChange={(e) => setNewUploadCategoryTitle(e.target.value)}
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="e.g. Christmas Tests, Mocks, Unit Assessments"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  New category description (optional)
                </label>
                <textarea
                  value={newUploadCategoryDesc}
                  onChange={(e) => setNewUploadCategoryDesc(e.target.value)}
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  rows={3}
                  placeholder="Short description..."
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">File</label>
            <input
              ref={fileRef}
              type="file"
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
            />
            <p className="mt-1 text-xs text-slate-500">PDF is ideal. Word/PPT accepted too.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={uploadTest}
              className="rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Upload
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
