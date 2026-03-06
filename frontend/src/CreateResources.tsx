// src/frontend/CreateResources.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

type ClassItem = { id: number; name: string; subject: string };

type ScopeMode = "general" | "single" | "group";
type Scope = {
    mode: ScopeMode;
    // single
    classId?: number;
    // group
    classIds?: number[];
    groupName?: string;
};

type ResourceFolder =
    | "Curriculum"
    | "Department"
    | "Lesson Plans"
    | "Worksheets"
    | "Slides"
    | "Assessments"
    | "Admin"
    | "Other";

type ResourceType = "link" | "note" | "file" | "file_placeholder";

type ResourceItem = {
    id: string;
    folder: ResourceFolder;
    type: ResourceType;
    title: string;
    url?: string; // for link
    note?: string; // for note
    createdAt: string; // ISO
    pinned?: boolean;
};

type Snippet = {
    id: string;
    title: string;
    fromResourceId?: string;
    fromResourceTitle?: string;
    pages?: string; // "12-15"
    text: string;
    createdAt: string; // ISO
    pinned?: boolean;
};

type GeneratedDoc = {
    id: string;
    kind: "lesson_plan" | "scheme" | "dept_plan" | "worksheet" | "ideas" | "other";
    title: string;
    scopeLabel: string;
    sources: { snippetId: string; snippetTitle: string }[];
    prompt: string;
    content: string;
    createdAt: string; // ISO
};

function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function getEmailFromToken(): string | null {
    const t = localStorage.getItem("elume_token");
    if (!t) return null;
    try {
        const payload = JSON.parse(atob(t.split(".")[1]));
        return payload?.email ?? payload?.sub ?? payload?.username ?? null;
    } catch {
        return null;
    }
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function scopeToKey(scope: Scope): string {
    if (scope.mode === "general") return "general";
    if (scope.mode === "single") return `class:${scope.classId ?? "unknown"}`;
    const ids = (scope.classIds ?? []).slice().sort((a, b) => a - b);
    return `group:${ids.join(",")}:${(scope.groupName || "").trim() || "Unnamed"}`;
}

function prettyFolderIcon(folder: ResourceFolder) {
    switch (folder) {
        case "Curriculum":
            return "📘";
        case "Department":
            return "🏛️";
        case "Lesson Plans":
            return "🗂️";
        case "Worksheets":
            return "📝";
        case "Slides":
            return "🖥️";
        case "Assessments":
            return "✅";
        case "Admin":
            return "⚙️";
        default:
            return "📁";
    }
}

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

function RenderDoc({ text }: { text: string }) {
    const lines = (text || "").replace(/\r\n/g, "\n").split("\n");

    const blocks: Array<
        | { type: "h1" | "h2" | "h3"; text: string }
        | { type: "p"; text: string }
        | { type: "ul"; items: string[] }
        | { type: "hr" }
        | { type: "spacer" }
    > = [];

    let paraBuf: string[] = [];
    let listBuf: string[] = [];

    const flushPara = () => {
        const t = paraBuf.join(" ").trim();
        if (t) blocks.push({ type: "p", text: t });
        paraBuf = [];
    };

    const flushList = () => {
        if (listBuf.length) blocks.push({ type: "ul", items: listBuf });
        listBuf = [];
    };

    const pushSpacer = () => {
        // avoid multiple spacers in a row
        const last = blocks[blocks.length - 1];
        if (!last || last.type !== "spacer") blocks.push({ type: "spacer" });
    };

    for (const raw of lines) {
        const line = raw.trim();

        // blank line → end current paragraph/list
        if (!line) {
            flushPara();
            flushList();
            pushSpacer();
            continue;
        }

        // horizontal rule
        if (line === "---") {
            flushPara();
            flushList();
            blocks.push({ type: "hr" });
            continue;
        }

        // headings
        if (line.startsWith("### ")) {
            flushPara();
            flushList();
            blocks.push({ type: "h3", text: line.slice(4).trim() });
            continue;
        }
        if (line.startsWith("## ")) {
            flushPara();
            flushList();
            blocks.push({ type: "h2", text: line.slice(3).trim() });
            continue;
        }
        if (line.startsWith("# ")) {
            flushPara();
            flushList();
            blocks.push({ type: "h1", text: line.slice(2).trim() });
            continue;
        }

        // bullets
        if (line.startsWith("- ")) {
            flushPara();
            listBuf.push(line.slice(2).trim());
            continue;
        }

        // default: paragraph line
        flushList();
        paraBuf.push(line);
    }

    flushPara();
    flushList();

    return (
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="prose prose-slate max-w-none">
                {blocks.map((b, idx) => {
                    if (b.type === "spacer") return <div key={idx} className="h-2" />;
                    if (b.type === "hr") return <hr key={idx} className="my-3 border-slate-200" />;

                    if (b.type === "h1")
                        return (
                            <div key={idx} className="mt-1 mb-2 text-lg font-extrabold text-slate-900">
                                {b.text}
                            </div>
                        );

                    if (b.type === "h2")
                        return (
                            <div key={idx} className="mt-3 mb-2 text-base font-extrabold text-slate-900">
                                {b.text}
                            </div>
                        );

                    if (b.type === "h3")
                        return (
                            <div key={idx} className="mt-3 mb-1 text-sm font-extrabold text-slate-800">
                                {b.text}
                            </div>
                        );

                    if (b.type === "ul")
                        return (
                            <ul key={idx} className="my-2 list-disc pl-6 text-sm text-slate-800">
                                {b.items.map((it, j) => (
                                    <li key={j} className="my-1 leading-relaxed">
                                        {it}
                                    </li>
                                ))}
                            </ul>
                        );

                    // paragraph
                    return (
                        <p key={idx} className="my-2 text-sm leading-relaxed text-slate-800">
                            {b.text}
                        </p>
                    );
                })}
            </div>
        </div>
    );
}

export default function CreateResources() {
    const navigate = useNavigate();

    // -------- data --------
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [loadingClasses, setLoadingClasses] = useState(true);

    // -------- scope modal --------
    const [scopeOpen, setScopeOpen] = useState(true);
    const [scopeMode, setScopeMode] = useState<ScopeMode>("single");
    const [scopeClassId, setScopeClassId] = useState<number>(1);
    const [scopeGroupIds, setScopeGroupIds] = useState<number[]>([]);
    const [scopeGroupName, setScopeGroupName] = useState<string>("");

    const userEmail = useMemo(() => getEmailFromToken() ?? "anon", []);
    const scopeStoreKey = useMemo(() => `elume_resources_scope__${userEmail}`, [userEmail]);

    const [scope, setScope] = useState<Scope>(() => {
        const saved = safeJsonParse<Scope>(localStorage.getItem(scopeStoreKey), { mode: "single", classId: 1 });
        return saved;
    });

    // -------- persistent store (localStorage v1) --------
    const storeBaseKey = useMemo(() => `elume_resources_v1__${userEmail}`, [userEmail]);
    const scopeKey = useMemo(() => scopeToKey(scope), [scope]);

    function storeKey(kind: "resources" | "snippets" | "generated") {
        return `${storeBaseKey}__${kind}__${scopeKey}`;
    }

    const [resources, setResources] = useState<ResourceItem[]>(() =>
        safeJsonParse<ResourceItem[]>(localStorage.getItem(storeKey("resources")), [])
    );
    const [snippets, setSnippets] = useState<Snippet[]>(() =>
        safeJsonParse<Snippet[]>(localStorage.getItem(storeKey("snippets")), [])
    );
    const [generated, setGenerated] = useState<GeneratedDoc[]>(() =>
        safeJsonParse<GeneratedDoc[]>(localStorage.getItem(storeKey("generated")), [])
    );

    // when scope changes, load its store
    useEffect(() => {
        setResources(safeJsonParse<ResourceItem[]>(localStorage.getItem(storeKey("resources")), []));
        setSnippets(safeJsonParse<Snippet[]>(localStorage.getItem(storeKey("snippets")), []));
        setGenerated(safeJsonParse<GeneratedDoc[]>(localStorage.getItem(storeKey("generated")), []));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeBaseKey, scopeKey]);

    // persist whenever arrays change
    useEffect(() => {
        localStorage.setItem(storeKey("resources"), JSON.stringify(resources));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resources, scopeKey]);

    useEffect(() => {
        localStorage.setItem(storeKey("snippets"), JSON.stringify(snippets));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snippets, scopeKey]);

    useEffect(() => {
        localStorage.setItem(storeKey("generated"), JSON.stringify(generated));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [generated, scopeKey]);

    // -------- load classes --------

    useEffect(() => {
        // Always show scope modal on first arrival to the page
        setScopeOpen(true);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoadingClasses(true);
        apiFetch("/classes")
            .then((data) => {
                if (cancelled) return;
                const arr = Array.isArray(data) ? (data as ClassItem[]) : [];
                setClasses(arr);
                const firstId = arr?.[0]?.id ?? 1;

                // If saved scope is nonsense, gently fix it
                setScope((prev) => {
                    if (prev.mode === "single") {
                        const ok = arr.some((c) => c.id === (prev.classId ?? -1));
                        return ok ? prev : { mode: "single", classId: firstId };
                    }
                    if (prev.mode === "group") {
                        const ids = (prev.classIds ?? []).filter((id) => arr.some((c) => c.id === id));
                        return ids.length ? { ...prev, classIds: ids } : { mode: "single", classId: firstId };
                    }
                    return prev;
                });

                setScopeClassId(firstId);
                setScopeGroupIds([firstId]);
            })
            .catch(() => {
                if (cancelled) return;
                setClasses([]);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingClasses(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const classById = useMemo(() => {
        const m = new Map<number, ClassItem>();
        for (const c of classes) m.set(c.id, c);
        return m;
    }, [classes]);

    const scopeLabel = useMemo(() => {
        if (scope.mode === "general") return "General resources";
        if (scope.mode === "single") {
            const c = classById.get(scope.classId ?? -1);
            return c ? `${c.name} • ${c.subject}` : `Class ${scope.classId}`;
        }
        const ids = scope.classIds ?? [];
        const name = (scope.groupName || "").trim();
        if (name) return `${name} (${ids.length} classes)`;
        return `Group (${ids.length} classes)`;
    }, [scope, classById]);

    // -------- UI tokens (match your style) --------
    const card =
        "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
    const pill =
        "rounded-full border-2 border-slate-200 bg-slate-50 px-4 py-2 text-sm hover:bg-slate-100 active:translate-y-[1px]";
    const btn =
        "rounded-2xl border-2 border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 active:translate-y-[1px]";
    const btnPrimary =
        "rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:translate-y-[1px] disabled:opacity-50";

    // -------- left: library --------
    const FOLDERS: ResourceFolder[] = [
        "Curriculum",
        "Department",
        "Lesson Plans",
        "Worksheets",
        "Slides",
        "Assessments",
        "Admin",
        "Other",
    ];

    const [folder, setFolder] = useState<ResourceFolder>("Curriculum");
    const [q, setQ] = useState("");
    const [showAdd, setShowAdd] = useState(false);

    const filteredResources = useMemo(() => {
        const query = q.trim().toLowerCase();
        return resources
            .filter((r) => r.folder === folder)
            .filter((r) => {
                if (!query) return true;
                return (
                    r.title.toLowerCase().includes(query) ||
                    (r.url || "").toLowerCase().includes(query) ||
                    (r.note || "").toLowerCase().includes(query)
                );
            })
            .sort((a, b) => {
                const ap = a.pinned ? 1 : 0;
                const bp = b.pinned ? 1 : 0;
                if (ap !== bp) return bp - ap;
                return (b.createdAt || "").localeCompare(a.createdAt || "");
            });
    }, [resources, folder, q]);

    // add resource modal
    const [newFolder, setNewFolder] = useState<ResourceFolder>("Curriculum");
    const [newType, setNewType] = useState<ResourceType>("link");
    const [newTitle, setNewTitle] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [newNote, setNewNote] = useState("");
    const [newFile, setNewFile] = useState<File | null>(null);

    function resetAdd() {
        setNewFolder(folder);
        setNewType("link");
        setNewTitle("");
        setNewUrl("");
        setNewNote("");
        setNewFile(null);
    }

    async function ensureResourcesTopicId(classId: number): Promise<number> {
        // 1) list topics
        const topics = await apiFetch(`/topics/${classId}?kind=notes`);
        const existing = (topics as any[]).find((t) => (t?.name || "").toLowerCase() === "resources");
        if (existing?.id) return existing.id;

        // 2) create topic "Resources"
        const created = await apiFetch(`/topics?kind=notes`, {
            method: "POST",
            body: JSON.stringify({ class_id: classId, name: "Resources" }),
        });
        return (created as any).id;
    }

    async function uploadResourceFile(classId: number, file: File): Promise<{ file_url: string; filename: string }> {
        const topicId = await ensureResourcesTopicId(classId);

        const fd = new FormData();
        fd.append("class_id", String(classId));
        fd.append("topic_id", String(topicId));
        fd.append("file", file);

        // IMPORTANT: do NOT set Content-Type manually for FormData
        const token = localStorage.getItem("elume_token") || "";

        const resp = await fetch(`/api/notes/upload`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: fd,
        });

        if (!resp.ok) {
            const txt = await resp.text().catch(() => "");
            throw new Error(txt || `Upload failed (${resp.status})`);
        }

        const data = await resp.json();
        return { file_url: data.file_url, filename: data.filename };
    }

    async function addResource() {
        const title = newTitle.trim();
        if (!title) return;

        // If file upload: only allow single-class scope (for now)
        if (newType === "file") {
            if (scope.mode !== "single" || !scope.classId) {
                alert("File upload currently supports Single class scope only. Choose one class in the modal first.");
                return;
            }
            if (!newFile) {
                alert("Choose a file first.");
                return;
            }

            try {
                setAiErr(null);
                const { file_url, filename } = await uploadResourceFile(scope.classId, newFile);

                const item: ResourceItem = {
                    id: uid("res"),
                    folder: newFolder,
                    type: "link",          // store as link so viewer can open it
                    title: title || filename,
                    url: file_url,
                    note: newNote.trim() || undefined,
                    createdAt: new Date().toISOString(),
                    pinned: false,
                };

                setResources((prev) => [item, ...prev]);
                setShowAdd(false);
                resetAdd();
                return;
            } catch (e: any) {
                setAiErr(e?.message || "Upload failed.");
                return;
            }
        }

        // Existing behaviours (link/note/file_placeholder)
        const item: ResourceItem = {
            id: uid("res"),
            folder: newFolder,
            type: newType,
            title,
            createdAt: new Date().toISOString(),
            pinned: false,
        };

        if (newType === "link") item.url = (newUrl || "").trim();
        if (newType === "note") item.note = (newNote || "").trim();
        if (newType === "file_placeholder") {
            item.note =
                (newNote || "").trim() ||
                "File upload placeholder (backend storage coming soon). Add a link for now, or paste key text into snippets.";
        }

        setResources((prev) => [item, ...prev]);
        setShowAdd(false);
        resetAdd();
    }

    function togglePinResource(id: string) {
        setResources((prev) => prev.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)));
    }

    function deleteResource(id: string) {
        const ok = window.confirm("Delete this resource? This cannot be undone.");
        if (!ok) return;
        setResources((prev) => prev.filter((r) => r.id !== id));
        // if selected, clear selection
        if (selectedResourceId === id) setSelectedResourceId(null);
    }

    // -------- middle: viewer + snippets --------
    const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
    const selectedResource = useMemo(
        () => resources.find((r) => r.id === selectedResourceId) ?? null,
        [resources, selectedResourceId]
    );

    const [snippetTitle, setSnippetTitle] = useState("");
    const [snippetPages, setSnippetPages] = useState("");
    const [snippetText, setSnippetText] = useState("");

    function startSnippetFromResource(res?: ResourceItem | null) {
        const r = res ?? selectedResource;
        if (!r) return;
        setSnippetTitle(`${r.title} – key section`);
        setSnippetPages("");
        setSnippetText("");
    }

    function saveSnippet() {
        const title = snippetTitle.trim();
        const text = snippetText.trim();
        if (!title || !text) return;

        const s: Snippet = {
            id: uid("snip"),
            title,
            pages: snippetPages.trim() || undefined,
            text,
            createdAt: new Date().toISOString(),
            pinned: false,
            fromResourceId: selectedResource?.id,
            fromResourceTitle: selectedResource?.title,
        };

        setSnippets((prev) => [s, ...prev]);
        setSnippetTitle("");
        setSnippetPages("");
        setSnippetText("");
    }

    function togglePinSnippet(id: string) {
        setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
    }

    function deleteSnippet(id: string) {
        const ok = window.confirm("Delete this snippet? This cannot be undone.");
        if (!ok) return;
        setSnippets((prev) => prev.filter((s) => s.id !== id));
        setSelectedSnippetIds((prev) => prev.filter((x) => x !== id));
    }

    const snippetsSorted = useMemo(() => {
        return [...snippets].sort((a, b) => {
            const ap = a.pinned ? 1 : 0;
            const bp = b.pinned ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
    }, [snippets]);

    // -------- right: AI Studio --------
    type AITab = "plan" | "ideas" | "history";
    const [aiTab, setAiTab] = useState<AITab>("plan");

    type PlanTemplate = "lesson_plan" | "scheme" | "dept_plan" | "worksheet";
    const [template, setTemplate] = useState<PlanTemplate>("lesson_plan");
    const [tone, setTone] = useState<"Concise" | "Detailed">("Concise");
    const [level, setLevel] = useState<"Junior Cycle" | "Leaving Cert" | "Common Level">("Junior Cycle");

    const [selectedSnippetIds, setSelectedSnippetIds] = useState<string[]>([]);
    const selectedSnippetObjects = useMemo(() => {
        const map = new Map(snippets.map((s) => [s.id, s]));
        return selectedSnippetIds.map((id) => map.get(id)).filter(Boolean) as Snippet[];
    }, [selectedSnippetIds, snippets]);

    const [aiPrompt, setAiPrompt] = useState("");
    const [aiBusy, setAiBusy] = useState(false);
    const [aiErr, setAiErr] = useState<string | null>(null);
    const [aiPreview, setAiPreview] = useState<GeneratedDoc | null>(null);

    const [ideasTopic, setIdeasTopic] = useState("");

    function templateLabel(t: PlanTemplate) {
        switch (t) {
            case "lesson_plan":
                return "Lesson plan";
            case "scheme":
                return "Scheme of work";
            case "dept_plan":
                return "Department plan";
            case "worksheet":
                return "Worksheet questions";
            default:
                return "Plan";
        }
    }

    function localGenerate(kind: GeneratedDoc["kind"], prompt: string): GeneratedDoc {
        const sources = selectedSnippetObjects.map((s) => ({ snippetId: s.id, snippetTitle: s.title }));
        const sourcesText = selectedSnippetObjects.length
            ? selectedSnippetObjects
                .map((s, i) => `SOURCE ${i + 1}: ${s.title}${s.pages ? ` (pages ${s.pages})` : ""}\n${s.text}`)
                .join("\n\n")
            : "";

        const header = `ELume • ${templateLabel(template)} • ${level} • ${tone}\nScope: ${scopeLabel}\nCreated: ${new Date().toLocaleString("en-IE")}\n`;
        const citation = sources.length
            ? `\nSources used:\n${sources.map((s) => `• ${s.snippetTitle}`).join("\n")}\n`
            : `\nSources used: (none selected)\n`;

        let body = "";
        if (kind === "lesson_plan") {
            body =
                `\nLesson Title:\n${prompt || "(enter topic)"}\n\n` +
                `Learning Intentions:\n- ...\n\nSuccess Criteria:\n- ...\n\n` +
                `Starter (5 mins):\n- Hook question / mini-whiteboard check\n\n` +
                `Main Teaching (20–25 mins):\n- Teacher explanation + worked examples\n- Guided practice\n\n` +
                `Active Learning (10–15 mins):\n- Pair task / mini stations / challenge\n\n` +
                `Assessment for Learning:\n- Exit ticket / hinge question\n\n` +
                `Differentiation:\n- Support: ...\n- Extension: ...\n\nHomework:\n- ...\n\n` +
                (sourcesText ? `\n\n---\n\nReferenced content:\n${sourcesText}\n` : "");
        } else if (kind === "scheme") {
            body =
                `\nScheme of Work (${prompt || "Topic"})\n\n` +
                `Week 1:\n- Lesson 1: ...\n- Lesson 2: ...\n\n` +
                `Week 2:\n- Lesson 3: ...\n- Lesson 4: ...\n\n` +
                `Assessment points:\n- ...\n\nResources:\n- ...\n\n` +
                (sourcesText ? `\n\n---\n\nReferenced content:\n${sourcesText}\n` : "");
        } else if (kind === "dept_plan") {
            body =
                `\nDepartment Plan (${prompt || "Subject / Term"})\n\n` +
                `Aims:\n- ...\n\nTeaching & Learning:\n- ...\n\nAssessment:\n- ...\n\nConsistency & Templates:\n- ...\n\n` +
                (sourcesText ? `\n\n---\n\nReferenced content:\n${sourcesText}\n` : "");
        } else if (kind === "worksheet") {
            body =
                `\nWorksheet: ${prompt || "Topic"}\n\n` +
                `Q1 (easy): ...\nQ2 (easy): ...\nQ3 (medium): ...\nQ4 (medium): ...\nQ5 (challenge): ...\n\n` +
                `Answer Key:\n1) ...\n2) ...\n3) ...\n4) ...\n5) ...\n\n` +
                (sourcesText ? `\n\n---\n\nReferenced content:\n${sourcesText}\n` : "");
        } else if (kind === "ideas") {
            body =
                `\nNext-class ideas: ${prompt || "Topic"}\n\n` +
                `Idea 1 (Starter): ...\n- Curriculum link: ...\n- AFL: ...\n\n` +
                `Idea 2 (Main): ...\n- Curriculum link: ...\n- AFL: ...\n\n` +
                `Idea 3 (Plenary): ...\n- Curriculum link: ...\n- AFL: ...\n\n` +
                (sourcesText ? `\n\n---\n\nReferenced content:\n${sourcesText}\n` : "");
        } else {
            body = `\n${prompt}\n`;
        }

        const content = `${header}${citation}\n${body}`.trim();

        return {
            id: uid("gen"),
            kind,
            title: `${templateLabel(template)} • ${prompt || "Untitled"}`.slice(0, 80),
            scopeLabel,
            sources,
            prompt,
            content,
            createdAt: new Date().toISOString(),
        };
    }

    async function runAIGenerate(kind: GeneratedDoc["kind"], prompt: string) {
        const p = (prompt || "").trim();
        if (!p) return;

        setAiBusy(true);
        setAiErr(null);
        setAiPreview(null);

        // payload mirrors your Calendar AI pattern (draft first), just for a future endpoint.
        const payload = {
            kind,
            template,
            tone,
            level,
            scope,
            prompt: p,
            sources: selectedSnippetObjects.map((s) => ({
                id: s.id,
                title: s.title,
                pages: s.pages || null,
                text: s.text,
            })),
            timezone: "Europe/Dublin",
        };

        try {
            // If/when you add this backend route, it will just start working:
            // POST /ai/create-resources
            const data = await apiFetch(`/ai/create-resources`, {
                method: "POST",
                body: JSON.stringify(payload),
            });

            // Expected shape:
            // { title, content } or { draft: { title, content } }
            const title =
                (data as any)?.title ??
                (data as any)?.draft?.title ??
                `${templateLabel(template)} • ${p}`.slice(0, 80);

            const content = (data as any)?.content ?? (data as any)?.draft?.content ?? "";

            if (!content) {
                // if backend returns something unexpected, fallback
                const fallback = localGenerate(kind, p);
                setAiPreview(fallback);
            } else {
                const doc: GeneratedDoc = {
                    id: uid("gen"),
                    kind,
                    title,
                    scopeLabel,
                    sources: selectedSnippetObjects.map((s) => ({ snippetId: s.id, snippetTitle: s.title })),
                    prompt: p,
                    content,
                    createdAt: new Date().toISOString(),
                };
                setAiPreview(doc);
            }
        } catch (e: any) {
            // No backend yet — keep UX nice and just generate locally.
            const fallback = localGenerate(kind, p);
            setAiPreview(fallback);
            setAiErr(
                "AI backend endpoint not enabled yet — generated a local draft instead. (When you add POST /ai/create-resources, this will switch to real AI.)"
            );
        } finally {
            setAiBusy(false);
        }
    }

    function saveGeneratedToLibrary() {
        if (!aiPreview) return;
        setGenerated((prev) => [aiPreview, ...prev]);
        setAiTab("history");
    }

    function copyPreview() {
        if (!aiPreview?.content) return;
        navigator.clipboard.writeText(aiPreview.content).catch(() => { });
    }

    async function exportPreviewDocx() {
        if (!aiPreview) return;

        const token = localStorage.getItem("elume_token") || "";
        const body = {
            title: aiPreview.title,
            content: aiPreview.content,
            teacher: getEmailFromToken(), // already in file
            meta: {
                template,
                level,
                tone,
                scopeLabel: aiPreview.scopeLabel,
                createdAt: aiPreview.createdAt,
            },
        };

        const resp = await fetch("/api/exports/docx", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const txt = await resp.text().catch(() => "");
            alert(txt || "Export failed");
            return;
        }

        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${(aiPreview.title || "ELume_Resource").replace(/[^\w\- ]+/g, "").trim() || "ELume_Resource"}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
    }

    // -------- scope modal actions --------
    function openScopeModal() {
        // preload modal fields from current scope
        setScopeMode(scope.mode);
        if (scope.mode === "single") setScopeClassId(scope.classId ?? classes?.[0]?.id ?? 1);
        if (scope.mode === "group") {
            setScopeGroupIds(scope.classIds ?? []);
            setScopeGroupName(scope.groupName ?? "");
        }
        setScopeOpen(true);
    }

    function confirmScope() {
        let next: Scope = { mode: scopeMode };

        if (scopeMode === "general") {
            next = { mode: "general" };
        } else if (scopeMode === "single") {
            next = { mode: "single", classId: scopeClassId };
        } else {
            const ids = (scopeGroupIds || []).slice().sort((a, b) => a - b);
            if (!ids.length) {
                alert("Please select at least one class for a group.");
                return;
            }
            next = { mode: "group", classIds: ids, groupName: scopeGroupName.trim() };
        }

        setScope(next);
        localStorage.setItem(scopeStoreKey, JSON.stringify(next));
        setScopeOpen(false);
    }

    // -------- tiny UX helpers --------
    const pinnedResources = useMemo(() => resources.filter((r) => r.pinned), [resources]);
    const pinnedSnippets = useMemo(() => snippets.filter((s) => s.pinned), [snippets]);

    const snippetSelectAllRef = useRef<HTMLInputElement | null>(null);
    const allSnipSelected = snippets.length > 0 && selectedSnippetIds.length === snippets.length;
    const someSnipSelected = selectedSnippetIds.length > 0 && selectedSnippetIds.length < snippets.length;

    useEffect(() => {
        if (!snippetSelectAllRef.current) return;
        snippetSelectAllRef.current.indeterminate = someSnipSelected;
    }, [someSnipSelected]);

    // ======= RENDER =======
    return (
        <div className="min-h-screen bg-[#dff3df]">
            <div className="mx-auto max-w-7xl px-4 pt-6 pb-10">
                {/* Top bar */}
                <div className="flex items-center justify-between gap-4">

                    {/* Left side – Title */}
                    <div className="min-w-0">
                        <div className="text-2xl font-extrabold tracking-tight text-slate-800">
                            Create Resources
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <span className="truncate">
                                Working on: <span className="font-semibold text-slate-800">{scopeLabel}</span>
                            </span>

                            <span className="hidden sm:inline text-slate-400">•</span>

                            <span className="text-xs text-slate-500">
                                Library + Snippets + AI Studio (saved per scope)
                            </span>
                        </div>
                    </div>

                    {/* Right side – Actions */}
                    <div className="flex items-center gap-2">

                        <button
                            onClick={() => navigate(`/`)}
                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                            type="button"
                        >
                            ← Back
                        </button>

                        <button
                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                            type="button"
                            onClick={openScopeModal}
                        >
                            Change class
                        </button>

                    </div>

                </div>

                {/* 3-panel layout */}
                <div className="mt-5 grid gap-4 lg:grid-cols-12">
                    {/* LEFT: Library */}
                    <div className={`${card} p-4 lg:col-span-3`}>
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-extrabold tracking-tight text-slate-800">Library</div>
                                <div className="text-xs text-slate-600">Folders • pinned • search</div>
                            </div>
                            <button
                                className={btnPrimary}
                                type="button"
                                onClick={() => {
                                    resetAdd();
                                    setShowAdd(true);
                                }}
                            >
                                + Add
                            </button>
                        </div>

                        <div className="mt-3">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search this folder…"
                                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                            />
                        </div>

                        {/* folders */}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {FOLDERS.map((f) => {
                                const active = f === folder;
                                return (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFolder(f)}
                                        className={`rounded-2xl border-2 px-3 py-2 text-left text-xs font-semibold ${active ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                            }`}
                                        title={f}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{prettyFolderIcon(f)}</span>
                                            <span className="truncate">{f}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* pinned */}
                        {pinnedResources.length > 0 && (
                            <div className="mt-4">
                                <div className="text-xs font-bold text-slate-700 mb-2">Pinned</div>
                                <div className="space-y-2">
                                    {pinnedResources.slice(0, 5).map((r) => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
                                            onClick={() => {
                                                setFolder(r.folder);
                                                setSelectedResourceId(r.id);
                                            }}
                                            title={r.title}
                                        >
                                            <div className="text-xs font-semibold text-slate-800 truncate">📌 {r.title}</div>
                                            <div className="text-[11px] text-slate-500 truncate">{r.folder}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* list */}
                        <div className="mt-4">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-slate-700">
                                    {folder} <span className="text-slate-400">({filteredResources.length})</span>
                                </div>
                            </div>

                            <div className="mt-2 space-y-2 max-h-[46vh] overflow-auto pr-1">
                                {filteredResources.length === 0 && (
                                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                        No items in this folder yet. Click <span className="font-semibold">Add</span>.
                                    </div>
                                )}

                                {filteredResources.map((r) => {
                                    const active = r.id === selectedResourceId;
                                    return (
                                        <div
                                            key={r.id}
                                            className={`rounded-2xl border-2 p-3 ${active ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white"
                                                }`}
                                        >
                                            <button
                                                type="button"
                                                className="w-full text-left"
                                                onClick={() => setSelectedResourceId(r.id)}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-extrabold tracking-tight text-slate-800 truncate">
                                                            {r.title}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500">
                                                            {r.type === "link" && "Link"}
                                                            {r.type === "note" && "Note"}
                                                            {r.type === "file_placeholder" && "File"}
                                                            <span className="mx-1 text-slate-300">•</span>
                                                            {new Date(r.createdAt).toLocaleDateString("en-IE")}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                togglePinResource(r.id);
                                                            }}
                                                            className="text-sm opacity-70 hover:opacity-100"
                                                            title={r.pinned ? "Unpin" : "Pin"}
                                                        >
                                                            {r.pinned ? "📌" : "📍"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteResource(r.id);
                                                            }}
                                                            className="text-sm opacity-70 hover:opacity-100"
                                                            title="Delete"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>

                                                {r.type === "link" && r.url && (
                                                    <div className="mt-2 text-xs text-slate-600 truncate">{r.url}</div>
                                                )}
                                                {r.type === "note" && r.note && (
                                                    <div className="mt-2 text-xs text-slate-600 line-clamp-2">{r.note}</div>
                                                )}
                                                {r.type === "file_placeholder" && (
                                                    <div className="mt-2 text-xs text-slate-600">
                                                        File placeholder (backend upload coming soon)
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* MIDDLE: Viewer + Snippets */}
                    <div className={`${card} p-4 lg:col-span-5`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-extrabold tracking-tight text-slate-800">Workspace</div>
                                <div className="text-xs text-slate-600">Preview + Snippets (AI-safe sources)</div>
                            </div>
                            <button
                                className={btn}
                                type="button"
                                onClick={() => {
                                    if (!selectedResource) {
                                        alert("Select a resource in the Library first.");
                                        return;
                                    }
                                    startSnippetFromResource(selectedResource);
                                }}
                            >
                                + New snippet
                            </button>
                        </div>

                        {/* Preview */}
                        <div className="mt-3 rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                            {!selectedResource && (
                                <div className="text-sm text-slate-600">
                                    Select a resource on the left to preview it, then create snippets from the key sections.
                                </div>
                            )}

                            {selectedResource && (
                                <>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-lg font-extrabold tracking-tight text-slate-800 truncate">
                                                {selectedResource.title}
                                            </div>
                                            <div className="text-xs text-slate-600">
                                                {selectedResource.folder} •{" "}
                                                {selectedResource.type === "link" ? "Link" : selectedResource.type === "note" ? "Note" : "File"}
                                            </div>
                                        </div>

                                        {selectedResource.type === "link" && selectedResource.url && (
                                            <a
                                                href={selectedResource.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                                            >
                                                Open ↗
                                            </a>
                                        )}
                                    </div>

                                    {selectedResource.type === "note" && (
                                        <div className="mt-3 whitespace-pre-wrap rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm text-slate-700">
                                            {selectedResource.note || "No note content."}
                                        </div>
                                    )}

                                    {selectedResource.type === "link" && selectedResource.url && (
                                        <div className="mt-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm text-slate-700">
                                            <div className="text-xs font-semibold text-slate-600 mb-1">Link</div>
                                            <div className="break-all">{selectedResource.url}</div>
                                        </div>
                                    )}

                                    {selectedResource.type === "file_placeholder" && (
                                        <div className="mt-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm text-slate-700">
                                            <div className="text-xs font-semibold text-slate-600 mb-1">File upload (coming soon)</div>
                                            <div className="text-sm text-slate-700">
                                                For V1, add a link to the file or paste the key text into a snippet so AI can use it safely.
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Snippet creator */}
                        <div className="mt-4">
                            <div className="grid gap-2 md:grid-cols-3">
                                <div className="md:col-span-2">
                                    <div className="text-xs font-bold text-slate-700 mb-1">Snippet title</div>
                                    <input
                                        value={snippetTitle}
                                        onChange={(e) => setSnippetTitle(e.target.value)}
                                        placeholder={selectedResource ? `${selectedResource.title} – key section` : "e.g. Learning outcomes section"}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                    />
                                </div>

                                <div>
                                    <div className="text-xs font-bold text-slate-700 mb-1">Pages (optional)</div>
                                    <input
                                        value={snippetPages}
                                        onChange={(e) => setSnippetPages(e.target.value)}
                                        placeholder="e.g. 12–15"
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="mt-2">
                                <div className="text-xs font-bold text-slate-700 mb-1">Snippet text (what AI is allowed to use)</div>
                                <textarea
                                    value={snippetText}
                                    onChange={(e) => setSnippetText(e.target.value)}
                                    rows={5}
                                    className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                    placeholder="Paste the exact section you want AI to use…"
                                />
                            </div>

                            <div className="mt-2 flex items-center justify-end gap-2">
                                <button className={btn} type="button" onClick={() => startSnippetFromResource(selectedResource)}>
                                    Reset
                                </button>
                                <button className={btnPrimary} type="button" onClick={saveSnippet} disabled={!snippetTitle.trim() || !snippetText.trim()}>
                                    Save snippet
                                </button>
                            </div>
                        </div>

                        {/* Snippets list */}
                        <div className="mt-5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-extrabold text-slate-800">
                                    Snippets{" "}
                                    <span className="text-slate-400">
                                        ({snippetsSorted.length})
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                        <input
                                            ref={snippetSelectAllRef}
                                            type="checkbox"
                                            checked={allSnipSelected}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedSnippetIds(snippets.map((s) => s.id));
                                                else setSelectedSnippetIds([]);
                                            }}
                                        />
                                        Use all
                                    </label>
                                </div>
                            </div>

                            <div className="mt-2 space-y-2 max-h-[30vh] overflow-auto pr-1">
                                {snippetsSorted.length === 0 && (
                                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                        No snippets yet — create one above. Snippets are what make AI outputs trustworthy.
                                    </div>
                                )}

                                {snippetsSorted.map((s) => {
                                    const checked = selectedSnippetIds.includes(s.id);
                                    return (
                                        <div key={s.id} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <label className="flex items-start gap-3 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedSnippetIds((prev) => [...prev, s.id]);
                                                            else setSelectedSnippetIds((prev) => prev.filter((x) => x !== s.id));
                                                        }}
                                                        className="mt-1"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-extrabold tracking-tight text-slate-800 truncate">
                                                            {s.pinned ? "📌 " : ""}
                                                            {s.title}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500">
                                                            {s.fromResourceTitle ? `From: ${s.fromResourceTitle}` : "Manual snippet"}
                                                            {s.pages ? ` • pages ${s.pages}` : ""}
                                                        </div>
                                                        <div className="mt-2 text-xs text-slate-700 line-clamp-2 whitespace-pre-wrap">
                                                            {s.text}
                                                        </div>
                                                    </div>
                                                </label>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => togglePinSnippet(s.id)}
                                                        className="text-sm opacity-70 hover:opacity-100"
                                                        title={s.pinned ? "Unpin" : "Pin"}
                                                    >
                                                        {s.pinned ? "📌" : "📍"}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => deleteSnippet(s.id)}
                                                        className="text-sm opacity-70 hover:opacity-100"
                                                        title="Delete"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {pinnedSnippets.length > 0 && (
                                <div className="mt-2 text-[11px] text-slate-500">
                                    Tip: pin your curriculum learning outcomes snippets so they’re always near the top.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: AI Studio */}
                    <div className={`${card} p-4 lg:col-span-4`}>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <div className="text-sm font-extrabold tracking-tight text-slate-800">AI Studio</div>
                                <div className="text-xs text-slate-600">Uses only the snippets you tick</div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAiTab("plan")}
                                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold ${aiTab === "plan" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                >
                                    Plans
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAiTab("ideas")}
                                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold ${aiTab === "ideas" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                >
                                    Ideas
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAiTab("history")}
                                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold ${aiTab === "history" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                >
                                    History
                                </button>
                            </div>
                        </div>

                        {aiErr && (
                            <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                {aiErr}
                            </div>
                        )}

                        {aiTab === "plan" && (
                            <div className="mt-3 space-y-3">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div>
                                        <div className="text-xs font-bold text-slate-700 mb-1">Template</div>
                                        <select
                                            value={template}
                                            onChange={(e) => setTemplate(e.target.value as PlanTemplate)}
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        >
                                            <option value="lesson_plan">Lesson plan</option>
                                            <option value="scheme">Scheme of work</option>
                                            <option value="dept_plan">Department plan</option>
                                            <option value="worksheet">Worksheet questions</option>
                                        </select>
                                    </div>

                                    <div>
                                        <div className="text-xs font-bold text-slate-700 mb-1">Level</div>
                                        <select
                                            value={level}
                                            onChange={(e) => setLevel(e.target.value as any)}
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        >
                                            <option value="Junior Cycle">Junior Cycle</option>
                                            <option value="Leaving Cert">Leaving Cert</option>
                                            <option value="Common Level">Common Level</option>
                                        </select>
                                    </div>

                                    <div>
                                        <div className="text-xs font-bold text-slate-700 mb-1">Detail</div>
                                        <select
                                            value={tone}
                                            onChange={(e) => setTone(e.target.value as any)}
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        >
                                            <option value="Concise">Concise</option>
                                            <option value="Detailed">Detailed</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-bold text-slate-700 mb-1">
                                        Prompt <span className="text-slate-400">(e.g. “Start Algebra 2 – expanding brackets”)</span>
                                    </div>
                                    <input
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        placeholder="What do you want to create?"
                                    />
                                </div>

                                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-bold text-slate-700 mb-2">
                                        Allowed sources{" "}
                                        <span className="text-slate-500 font-normal">
                                            (selected: {selectedSnippetIds.length})
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-600">
                                        AI should only use what you tick. If none are selected, it will still draft — but it won’t be curriculum-grounded.
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        className={btn}
                                        type="button"
                                        onClick={() => {
                                            setAiPreview(null);
                                            setAiErr(null);
                                        }}
                                    >
                                        Clear
                                    </button>
                                    <button
                                        className={btnPrimary}
                                        type="button"
                                        disabled={aiBusy || !aiPrompt.trim()}
                                        onClick={() => {
                                            const kind =
                                                template === "lesson_plan"
                                                    ? "lesson_plan"
                                                    : template === "scheme"
                                                        ? "scheme"
                                                        : template === "dept_plan"
                                                            ? "dept_plan"
                                                            : "worksheet";
                                            runAIGenerate(kind, aiPrompt);
                                        }}
                                    >
                                        {aiBusy ? "Generating…" : "Generate"}
                                    </button>
                                </div>

                                {aiPreview && (
                                    <div className="mt-2 rounded-3xl border-2 border-slate-200 bg-white p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-extrabold text-slate-800 truncate">{aiPreview.title}</div>
                                                <div className="text-[11px] text-slate-500">
                                                    {new Date(aiPreview.createdAt).toLocaleString("en-IE")}
                                                    {aiPreview.sources.length ? ` • Sources: ${aiPreview.sources.length}` : " • No sources"}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button className={btn} type="button" onClick={copyPreview}>
                                                    Copy
                                                </button>
                                                <button className={btnPrimary} type="button" onClick={saveGeneratedToLibrary}>
                                                    Save
                                                </button>
                                                <button className={pill} type="button" onClick={exportPreviewDocx}>
                                                    Export DOCX
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-3 max-h-[42vh] overflow-auto">
                                            <RenderDoc text={aiPreview.content} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {aiTab === "ideas" && (
                            <div className="mt-3 space-y-3">
                                <div>
                                    <div className="text-xs font-bold text-slate-700 mb-1">
                                        Topic <span className="text-slate-400">(e.g. “Phases of the Moon”)</span>
                                    </div>
                                    <input
                                        value={ideasTopic}
                                        onChange={(e) => setIdeasTopic(e.target.value)}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        placeholder="What’s the next class topic?"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        className={btnPrimary}
                                        type="button"
                                        disabled={aiBusy || !ideasTopic.trim()}
                                        onClick={() => runAIGenerate("ideas", ideasTopic)}
                                    >
                                        {aiBusy ? "Generating…" : "Generate 3 ideas"}
                                    </button>
                                </div>

                                {aiPreview && (
                                    <div className="mt-2 rounded-3xl border-2 border-slate-200 bg-white p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-extrabold text-slate-800 truncate">{aiPreview.title}</div>
                                                <div className="text-[11px] text-slate-500">
                                                    {new Date(aiPreview.createdAt).toLocaleString("en-IE")}
                                                    {aiPreview.sources.length ? ` • Sources: ${aiPreview.sources.length}` : " • No sources"}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button className={btn} type="button" onClick={copyPreview}>
                                                    Copy
                                                </button>
                                                <button className={btnPrimary} type="button" onClick={saveGeneratedToLibrary}>
                                                    Save
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-3 max-h-[42vh] overflow-auto">
                                            <RenderDoc text={aiPreview.content} />
                                        </div>

                                        <div className="mt-3 text-xs text-slate-600">
                                            Tip: Select curriculum snippets first so the ideas are properly linked to learning outcomes.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {aiTab === "history" && (
                            <div className="mt-3">
                                <div className="text-xs text-slate-600 mb-2">
                                    Saved outputs for <span className="font-semibold text-slate-800">{scopeLabel}</span>
                                </div>

                                <div className="space-y-2 max-h-[72vh] overflow-auto pr-1">
                                    {generated.length === 0 && (
                                        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                            Nothing saved yet. Generate something in Plans/Ideas and click <span className="font-semibold">Save</span>.
                                        </div>
                                    )}

                                    {generated.map((g) => (
                                        <details key={g.id} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                                            <summary className="cursor-pointer list-none">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-extrabold text-slate-800 truncate">{g.title}</div>
                                                        <div className="text-[11px] text-slate-500">
                                                            {new Date(g.createdAt).toLocaleString("en-IE")}
                                                            {g.sources.length ? ` • Sources: ${g.sources.length}` : " • No sources"}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-semibold text-slate-600">{g.kind}</div>
                                                </div>
                                            </summary>

                                            <div className="mt-3 flex items-center justify-end gap-2">
                                                <button
                                                    className={btn}
                                                    type="button"
                                                    onClick={() => navigator.clipboard.writeText(g.content).catch(() => { })}
                                                >
                                                    Copy
                                                </button>
                                                <button
                                                    className={btn}
                                                    type="button"
                                                    onClick={() => {
                                                        const ok = window.confirm("Delete this saved output?");
                                                        if (!ok) return;
                                                        setGenerated((prev) => prev.filter((x) => x.id !== g.id));
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </div>

                                            <div className="mt-2 max-h-[40vh] overflow-auto">
                                                <RenderDoc text={g.content} />
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 text-xs text-slate-500">© 2026 ELume Beta. P Fitzgerald</div>
            </div>

            {/* SCOPE MODAL */}
            {scopeOpen && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
                    <div className="w-full max-w-2xl rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
                        <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xl font-extrabold tracking-tight">Create Resources</div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        Choose what you’re working on — a single class, a group, or general resources.
                                    </div>
                                </div>

                                <button className={pill} type="button" onClick={() => setScopeOpen(false)}>
                                    Close
                                </button>
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-3">
                                <button
                                    type="button"
                                    className={`rounded-3xl border-2 p-4 text-left ${scopeMode === "single" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                    onClick={() => setScopeMode("single")}
                                >
                                    <div className="text-sm font-extrabold">Single class</div>
                                    <div className="text-xs text-slate-600 mt-1">Loads resources for one class.</div>
                                </button>

                                <button
                                    type="button"
                                    className={`rounded-3xl border-2 p-4 text-left ${scopeMode === "group" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                    onClick={() => setScopeMode("group")}
                                >
                                    <div className="text-sm font-extrabold">Group</div>
                                    <div className="text-xs text-slate-600 mt-1">Create schemes across multiple classes.</div>
                                </button>

                                <button
                                    type="button"
                                    className={`rounded-3xl border-2 p-4 text-left ${scopeMode === "general" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                                        }`}
                                    onClick={() => setScopeMode("general")}
                                >
                                    <div className="text-sm font-extrabold">General</div>
                                    <div className="text-xs text-slate-600 mt-1">Not tied to a class.</div>
                                </button>
                            </div>

                            {scopeMode === "single" && (
                                <div className="mt-5">
                                    <div className="text-sm font-bold text-slate-700 mb-2">Select class</div>
                                    <select
                                        value={scopeClassId}
                                        onChange={(e) => setScopeClassId(Number(e.target.value))}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        disabled={!classes.length}
                                    >
                                        {classes.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} • {c.subject}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {scopeMode === "group" && (
                                <div className="mt-5">
                                    <div className="text-sm font-bold text-slate-700 mb-2">Select classes</div>

                                    <div className="grid gap-2 md:grid-cols-2 max-h-56 overflow-auto pr-1">
                                        {classes.map((c) => {
                                            const checked = scopeGroupIds.includes(c.id);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setScopeGroupIds((prev) => [...prev, c.id]);
                                                            else setScopeGroupIds((prev) => prev.filter((x) => x !== c.id));
                                                        }}
                                                    />
                                                    <span className="font-semibold text-slate-800">{c.name}</span>
                                                    <span className="text-slate-500">• {c.subject}</span>
                                                </label>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-3">
                                        <div className="text-xs font-bold text-slate-700 mb-1">Group name (optional)</div>
                                        <input
                                            value={scopeGroupName}
                                            onChange={(e) => setScopeGroupName(e.target.value)}
                                            placeholder="e.g. Junior Science (1st–3rd)"
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        />
                                    </div>

                                    <div className="mt-2 text-xs text-slate-600">
                                        Tip: This is ideal for building a 6-week scheme or common assessments across year groups.
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex items-center justify-end gap-3">
                                <button className={pill} type="button" onClick={() => setScopeOpen(false)}>
                                    Cancel
                                </button>
                                <button className={btnPrimary} type="button" onClick={confirmScope}>
                                    Continue
                                </button>
                            </div>

                            {loadingClasses && (
                                <div className="mt-3 text-xs text-slate-500">Loading classes…</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ADD RESOURCE MODAL */}
            {showAdd && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
                    <div className="w-full max-w-2xl rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
                        <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xl font-extrabold tracking-tight">Add resource</div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        V1 stores links/notes locally; file uploads become backend storage later.
                                    </div>
                                </div>

                                <button className={pill} type="button" onClick={() => setShowAdd(false)}>
                                    Close
                                </button>
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                                <div>
                                    <div className="mb-1 text-sm font-bold text-slate-700">Folder</div>
                                    <select
                                        value={newFolder}
                                        onChange={(e) => setNewFolder(e.target.value as ResourceFolder)}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                    >
                                        {FOLDERS.map((f) => (
                                            <option key={f} value={f}>
                                                {f}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <div className="mb-1 text-sm font-bold text-slate-700">Type</div>
                                    <select
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value as ResourceType)}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                    >
                                        <option value="link">Link</option>
                                        <option value="note">Note</option>
                                        <option value="file">File upload (PDF / PPT / DOCX)</option>
                                        <option value="file_placeholder">File (placeholder)</option>
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <div className="mb-1 text-sm font-bold text-slate-700">Title</div>
                                    <input
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. JC Maths Curriculum Specification"
                                    />
                                </div>

                                {newType === "link" && (
                                    <div className="md:col-span-2">
                                        <div className="mb-1 text-sm font-bold text-slate-700">URL</div>
                                        <input
                                            value={newUrl}
                                            onChange={(e) => setNewUrl(e.target.value)}
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                            placeholder="https://..."
                                        />
                                    </div>
                                )}

                                {newType === "file" && (
                                    <div className="md:col-span-2">
                                        <div className="mb-1 text-sm font-bold text-slate-700">Upload file</div>
                                        <input
                                            type="file"
                                            accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
                                            onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                        />
                                        <div className="mt-2 text-xs text-slate-500">
                                            Tip: for now, uploads attach to the selected class only (Single-class scope). We’ll add “general” uploads next.
                                        </div>
                                    </div>
                                )}

                                {(newType === "note" || newType === "file_placeholder") && (
                                    <div className="md:col-span-2">
                                        <div className="mb-1 text-sm font-bold text-slate-700">
                                            {newType === "note" ? "Note content" : "Notes (optional)"}
                                        </div>
                                        <textarea
                                            value={newNote}
                                            onChange={(e) => setNewNote(e.target.value)}
                                            rows={5}
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                            placeholder={
                                                newType === "note"
                                                    ? "Paste the content here…"
                                                    : "If you can, paste key text into a Snippet so AI can use it."
                                            }
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-end gap-3">
                                <button
                                    className={pill}
                                    type="button"
                                    onClick={() => {
                                        setShowAdd(false);
                                        resetAdd();
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={btnPrimary}
                                    type="button"
                                    onClick={addResource}
                                    disabled={!newTitle.trim() || (newType === "file" && !newFile)}
                                >
                                    Add
                                </button>
                            </div>

                            <div className="mt-3 text-xs text-slate-500">
                                Next step: when you add backend file upload + parsing, snippets can be created by page range automatically.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}