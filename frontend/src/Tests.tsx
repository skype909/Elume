import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

const API_BASE = "/api";

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
  file_url?: string | null; // backend returns "/uploads/..."
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm font-medium hover:bg-gray-100"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
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
  // backend returns "/uploads/..." (relative to API host)
  return `${API_BASE}${fileUrl}`;
}

function EditableText({
  value,
  placeholder,
  className,
  onSave,
}: {
  value: string;
  placeholder: string;
  className?: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next !== value) onSave(next);
  };

  if (!editing) {
    return (
      <button
        className={`text-left hover:underline ${className ?? ""}`}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {value ? value : <span className="text-gray-400">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        className="w-full rounded-lg border px-3 py-2 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
      />
      <button
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        onClick={commit}
      >
        Save
      </button>
    </div>
  );
}

export default function Tests() {
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);

  // modals
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // new category form
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  // upload test form
  const [testTitle, setTestTitle] = useState("");
  const [testDesc, setTestDesc] = useState("");
  const [testCategoryId, setTestCategoryId] = useState<number | "none">("none");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [catRes, testRes] = await Promise.all([
        fetch(`${API_BASE}/classes/${classId}/test-categories`),
        fetch(`${API_BASE}/classes/${classId}/tests`),
      ]);

      if (!catRes.ok) {
        const j = await safeJson(catRes);
        throw new Error(j?.detail || "Failed to load categories");
      }
      if (!testRes.ok) {
        const j = await safeJson(testRes);
        throw new Error(j?.detail || "Failed to load tests");
      }

      const catData = (await catRes.json()) as TestCategory[];
      const testData = (await testRes.json()) as TestItem[];

      setCategories(Array.isArray(catData) ? catData : []);
      setTests(Array.isArray(testData) ? testData : []);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // derived views
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

  // category CRUD
  const createCategory = async () => {
    const title = newCatTitle.trim();
    if (!title) return;

    try {
      setErr(null);
      const res = await fetch(`${API_BASE}/classes/${classId}/test-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: newCatDesc.trim() || null,
        }),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to create category");
      }

      const created = (await res.json()) as TestCategory;
      setCategories((prev) => [created, ...prev]);
      setNewCatTitle("");
      setNewCatDesc("");
      setNewCatOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to create category");
    }
  };

  const updateCategory = async (catId: number, patch: Partial<TestCategory>) => {
    try {
      setErr(null);
      const res = await fetch(`${API_BASE}/test-categories/${catId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to update category");
      }

      const updated = (await res.json()) as TestCategory;
      setCategories((prev) => prev.map((c) => (c.id === catId ? updated : c)));
    } catch (e: any) {
      setErr(e?.message || "Failed to update category");
    }
  };

  const deleteCategory = async (catId: number) => {
    if (!window.confirm("Delete this category? Any tests inside will become uncategorised.")) return;

    try {
      setErr(null);
      const res = await fetch(`${API_BASE}/test-categories/${catId}`, { method: "DELETE" });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to delete category");
      }

      setCategories((prev) => prev.filter((c) => c.id !== catId));
      setTests((prev) =>
        prev.map((t) => (t.category_id === catId ? { ...t, category_id: null } : t))
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to delete category");
    }
  };

  // tests CRUD
  const openUpload = (categoryId?: number | null) => {
    setTestTitle("");
    setTestDesc("");
    setTestCategoryId(categoryId ? categoryId : "none");
    if (fileRef.current) fileRef.current.value = "";
    setUploadOpen(true);
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

      const fd = new FormData();
      fd.append("class_id", String(classId));
      fd.append("title", title);
      fd.append("description", testDesc.trim());

      // IMPORTANT: do NOT send empty string for Optional[int] Form field
      if (testCategoryId !== "none") {
        fd.append("category_id", String(testCategoryId));
      }

      fd.append("file", file);

      const res = await fetch(`${API_BASE}/tests`, { method: "POST", body: fd });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to upload test");
      }

      const created = (await res.json()) as TestItem;
      setTests((prev) => [created, ...prev]);
      setUploadOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to upload test");
    }
  };

  const updateTest = async (testId: number, patch: Partial<TestItem>) => {
    try {
      setErr(null);
      const res = await fetch(`${API_BASE}/tests/${testId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to update test");
      }

      const updated = (await res.json()) as TestItem;
      setTests((prev) => prev.map((t) => (t.id === testId ? updated : t)));
    } catch (e: any) {
      setErr(e?.message || "Failed to update test");
    }
  };

  const deleteTest = async (testId: number) => {
    if (!window.confirm("Delete this test?")) return;

    try {
      setErr(null);
      const res = await fetch(`${API_BASE}/tests/${testId}`, { method: "DELETE" });

      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.detail || "Failed to delete test");
      }

      setTests((prev) => prev.filter((t) => t.id !== testId));
    } catch (e: any) {
      setErr(e?.message || "Failed to delete test");
    }
  };

  const TestCard = ({ t }: { t: TestItem }) => {
    const fileHref = resolveFileUrl(t.file_url);

    return (
      <div className="rounded-xl border bg-gray-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <EditableText
              value={t.title}
              placeholder="Untitled test"
              className="text-base font-semibold"
              onSave={(next) => updateTest(t.id, { title: next })}
            />

            <div className="mt-2">
              <EditableText
                value={t.description || ""}
                placeholder="Click to add a description"
                className="text-sm text-gray-700"
                onSave={(next) => updateTest(t.id, { description: next })}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border bg-white px-3 py-2 text-sm"
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

              {fileHref ? (
                <a
                  href={fileHref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow hover:bg-gray-50"
                >
                  Open File
                </a>
              ) : (
                <span className="text-sm text-gray-500">No file</span>
              )}

              {t.filename ? (
                <span className="text-xs text-gray-500">({t.filename})</span>
              ) : null}
            </div>
          </div>

          <button
            onClick={() => deleteTest(t.id)}
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow hover:bg-gray-50"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tests</h1>
            <p className="text-sm text-gray-600">
              Upload tests and organise them into categories. Click any title/description to edit.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setNewCatOpen(true)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-gray-50"
            >
              + New Category
            </button>
            <button
              onClick={() => openUpload(null)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
            >
              + Upload Test
            </button>
            <button
              onClick={refresh}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow">Loading…</div>
        ) : (
          <>
            {/* Uncategorised */}
            <div className="mb-6 rounded-2xl bg-white p-5 shadow">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Uncategorised</h2>
                <button
                  onClick={() => openUpload(null)}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  + Add
                </button>
              </div>

              {uncategorised.length === 0 ? (
                <p className="text-sm text-gray-500">No uncategorised tests yet.</p>
              ) : (
                <div className="space-y-3">
                  {uncategorised.map((t) => (
                    <TestCard key={t.id} t={t} />
                  ))}
                </div>
              )}
            </div>

            {/* Categories */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {categories.map((cat) => {
                const catTests = testsByCategory.get(cat.id) ?? [];
                return (
                  <div key={cat.id} className="rounded-2xl bg-white p-5 shadow">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <EditableText
                          value={cat.title}
                          placeholder="Category title"
                          className="text-lg font-semibold"
                          onSave={(next) => updateCategory(cat.id, { title: next })}
                        />
                        <div className="mt-2">
                          <EditableText
                            value={cat.description || ""}
                            placeholder="Click to add a description"
                            className="text-sm text-gray-700"
                            onSave={(next) => updateCategory(cat.id, { description: next })}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openUpload(cat.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          + Add
                        </button>
                        <button
                          onClick={() => deleteCategory(cat.id)}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow hover:bg-gray-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {catTests.length === 0 ? (
                      <p className="text-sm text-gray-500">No tests in this category yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {catTests.map((t) => (
                          <TestCard key={t.id} t={t} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {categories.length === 0 && (
              <div className="mt-6 rounded-2xl bg-white p-6 shadow">
                <p className="text-sm text-gray-600">
                  No categories yet. Click <b>New Category</b> to get started.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* New Category Modal */}
      <Modal open={newCatOpen} title="New Test Category" onClose={() => setNewCatOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold">Title</label>
            <input
              value={newCatTitle}
              onChange={(e) => setNewCatTitle(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="e.g. Mock Exams"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Description (optional)</label>
            <textarea
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              rows={4}
              placeholder="Short description..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setNewCatOpen(false)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={createCategory}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      {/* Upload Test Modal */}
      <Modal open={uploadOpen} title="Upload Test" onClose={() => setUploadOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold">Title</label>
            <input
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="e.g. Chapter 7 Class Test"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Description (optional)</label>
            <textarea
              value={testDesc}
              onChange={(e) => setTestDesc(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              rows={4}
              placeholder="Instructions, timing, etc..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Category</label>
            <select
              className="w-full rounded-xl border bg-white px-4 py-3 text-sm"
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

          <div>
            <label className="mb-1 block text-sm font-semibold">File</label>
            <input
              ref={fileRef}
              type="file"
              className="w-full rounded-xl border bg-white px-4 py-3 text-sm"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
            />
            <p className="mt-1 text-xs text-gray-500">PDF is ideal. Word/PPT accepted too.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setUploadOpen(false)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={uploadTest}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
            >
              Upload
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
