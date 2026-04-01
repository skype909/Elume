import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "./api";

type ClassItem = { id: number; name: string; subject: string; color?: string | null };
type BrandingChoice = "none" | "elume" | "school";

type ScopeMode = "general" | "single" | "group";

type Scope = {
  mode: ScopeMode;
  classId?: number;
  classIds?: number[];
  groupName?: string;
};

type OutputKind = "ideas" | "lesson_plan" | "worksheet" | "scheme" | "dept_plan";
type DetailLevel = "Concise" | "Detailed";
type PhaseLevel = "Junior Cycle" | "Leaving Cert" | "Common Level";
type SaveBucket = "notes" | "tests" | "links";
type SourceBucket = "notes" | "links";

type TeacherProfile = {
  title: string;
  firstName: string;
  surname: string;
  schoolName: string;
  schoolAddress?: string;
  rollNumber?: string;
  schoolBranding?: {
    logoDataUrl: string;
    logoFilename?: string;
    logoMimeType?: string;
    updatedAt?: string | null;
  } | null;
};

type StoredAdminState = {
  profile: TeacherProfile;
  updatedAt?: string | null;
};

type ManualSource = {
  id: string;
  title: string;
  text: string;
  pinned?: boolean;
  createdAt: string;
};

type UploadedManualFile = {
  id: string;
  file: File;
  createdAt: string;
};

type GeneratedDoc = {
  id: string;
  kind: OutputKind;
  title: string;
  prompt: string;
  scopeLabel: string;
  saveBucket: SaveBucket;
  saveFolder?: string;
  createdAt: string;
  manualSources: { id: string; title: string }[];
  teacherDisplayNameShort?: string;
  schoolName?: string;
  brandingChoice?: BrandingChoice;
  worksheetIncludeAnswers?: boolean;
  content: string;
};

type DocumentBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "hr" }
  | { type: "spacer" };

type DestinationOption = {
  bucket: SaveBucket;
  label: string;
  recommended?: boolean;
  folders?: string[];
};

type DestinationChoice = {
  id: string;
  bucket: SaveBucket;
  folder: string;
  label: string;
  recommended?: boolean;
};

type SourceOption = {
  bucket: SourceBucket;
  label: string;
  recommended?: boolean;
  folders?: string[];
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

function teacherAdminStorageKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v3__${email}`;
}

function teacherAdminLegacyKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v2__${email}`;
}

function loadTeacherAdminProfile(): TeacherProfile | null {
  const keys = [teacherAdminStorageKeyForUser(), teacherAdminLegacyKeyForUser()];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredAdminState;
      if (parsed?.profile) return parsed.profile;
    } catch {}
  }
  return null;
}

function teacherDisplayNameShort(profile: TeacherProfile | null): string {
  const title = String(profile?.title ?? "").trim();
  const surname = String(profile?.surname ?? "").trim();
  if (title && surname) return `${title} ${surname}`;
  if (surname) return surname;
  return "Teacher";
}

function toneLabelForOutput(kind: OutputKind) {
  if (kind === "worksheet") return "Student-facing printable worksheet";
  if (kind === "ideas") return "Teacher-facing quick suggestions";
  if (kind === "lesson_plan") return "Teacher-facing lesson planning";
  if (kind === "scheme") return "Teacher-facing sequenced planning";
  return "Department-facing planning";
}

function scopeToKey(scope: Scope): string {
  if (scope.mode === "general") return "general";
  if (scope.mode === "single") return `class:${scope.classId ?? "unknown"}`;
  const ids = (scope.classIds ?? []).slice().sort((a, b) => a - b);
  return `group:${ids.join(",")}:${(scope.groupName || "").trim() || "Unnamed"}`;
}

const CLASS_TILE_COLOURS: { bg: string; ring: string }[] = [
  { bg: "bg-emerald-500", ring: "ring-emerald-200" },
  { bg: "bg-teal-500", ring: "ring-teal-200" },
  { bg: "bg-cyan-500", ring: "ring-cyan-200" },
  { bg: "bg-sky-500", ring: "ring-sky-200" },
  { bg: "bg-blue-500", ring: "ring-blue-200" },
  { bg: "bg-indigo-500", ring: "ring-indigo-200" },
  { bg: "bg-violet-500", ring: "ring-violet-200" },
  { bg: "bg-fuchsia-500", ring: "ring-fuchsia-200" },
  { bg: "bg-rose-500", ring: "ring-rose-200" },
  { bg: "bg-red-500", ring: "ring-red-200" },
  { bg: "bg-orange-500", ring: "ring-orange-200" },
  { bg: "bg-amber-400", ring: "ring-amber-200" },
];

const CLASS_TILE_BG_SET = new Set(CLASS_TILE_COLOURS.map((item) => item.bg));

function isKnownClassColour(value: string | null | undefined): value is string {
  return typeof value === "string" && CLASS_TILE_BG_SET.has(value);
}

function textClassForTile(bgClass: string) {
  if (
    bgClass.includes("bg-yellow") ||
    bgClass.includes("bg-amber") ||
    bgClass.includes("bg-lime") ||
    bgClass.includes("bg-slate-100") ||
    bgClass.includes("bg-slate-200") ||
    bgClass.includes("bg-white")
  ) {
    return "text-slate-900";
  }
  return "text-white";
}

function tileVisualForClass(item: ClassItem) {
  const fallback = CLASS_TILE_COLOURS[item.id % CLASS_TILE_COLOURS.length] ?? CLASS_TILE_COLOURS[0];
  const bg = isKnownClassColour(item.color) ? item.color : fallback.bg;
  const ring = CLASS_TILE_COLOURS.find((entry) => entry.bg === bg)?.ring ?? fallback.ring;
  return { bg, ring, text: textClassForTile(bg) };
}

function labelForOutput(kind: OutputKind) {
  switch (kind) {
    case "ideas":
      return "3 ideas";
    case "lesson_plan":
      return "Lesson plan";
    case "worksheet":
      return "Worksheet";
    case "scheme":
      return "Scheme of work";
    case "dept_plan":
      return "Department plan";
    default:
      return "Resource";
  }
}

function destinationOptionsForOutput(kind: OutputKind): DestinationOption[] {
  if (kind === "worksheet") {
    return [
      { bucket: "tests", label: "Worksheets", recommended: true, folders: ["Worksheets"] },
      { bucket: "notes", label: "Notes", folders: [] },
    ];
  }
  if (kind === "lesson_plan") {
    return [{ bucket: "links", label: "Resources", recommended: true, folders: ["Lesson Plans"] }];
  }
  if (kind === "scheme") {
    return [{ bucket: "links", label: "Resources", recommended: true, folders: ["Schemes of Work"] }];
  }
  if (kind === "dept_plan") {
    return [{ bucket: "links", label: "Resources", recommended: true, folders: ["Department Plans"] }];
  }
  return [
    { bucket: "links", label: "Resources", recommended: true, folders: ["Ideas"] },
    { bucket: "notes", label: "Notes", folders: [] },
  ];
}

function sourceOptionsForOutput(kind: OutputKind): SourceOption[] {
  if (kind === "lesson_plan") {
    return [{ bucket: "notes", label: "Notes", recommended: true, folders: [] }];
  }
  if (kind === "worksheet") {
    return [{ bucket: "notes", label: "Notes", recommended: true, folders: [] }];
  }
  if (kind === "scheme") {
    return [
      { bucket: "notes", label: "Notes", recommended: true, folders: [] },
      { bucket: "links", label: "Resources", folders: ["Lesson Plans", "Schemes of Work"] },
    ];
  }
  if (kind === "dept_plan") {
    return [
      { bucket: "links", label: "Resources", recommended: true, folders: ["Department Plans", "Schemes of Work"] },
      { bucket: "notes", label: "Notes", folders: [] },
    ];
  }
  return [{ bucket: "notes", label: "Notes", recommended: true, folders: [] }];
}

function displayLabelForBucket(bucket: SaveBucket) {
  if (bucket === "tests") return "Worksheets";
  if (bucket === "links") return "Resources";
  return "Notes";
}

function destinationChoiceId(bucket: SaveBucket, folder: string) {
  return `${bucket}::${folder || ""}`;
}

function parseDocumentBlocks(text: string): DocumentBlock[] {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");

  const blocks: DocumentBlock[] = [];

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
    const last = blocks[blocks.length - 1];
    if (!last || last.type !== "spacer") blocks.push({ type: "spacer" });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      pushSpacer();
      continue;
    }
    if (line === "---") {
      flushPara();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }
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
    if (line.startsWith("- ")) {
      flushPara();
      listBuf.push(line.slice(2).trim());
      continue;
    }
    flushList();
    paraBuf.push(line);
  }

  flushPara();
  flushList();

  return blocks;
}

function printableBodyText(text: string) {
  const normalised = (text || "").replace(/\r\n/g, "\n").trim();
  const splitIndex = normalised.indexOf("\n---\n");
  if (splitIndex > 0) {
    return normalised.slice(splitIndex + 5).trim();
  }
  return normalised;
}

function RenderDoc({
  text,
  title,
  subtitle,
  footer,
}: {
  text: string;
  title: string;
  subtitle: string;
  footer: string;
}) {
  const blocks = parseDocumentBlocks(printableBodyText(text));
  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] px-6 py-5">
        <div className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</div>
        <div className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</div>
      </div>
      <div className="max-w-none px-6 py-6">
        {blocks.map((b, idx) => {
          if (b.type === "spacer") return <div key={idx} className="h-2" />;
          if (b.type === "hr") return <hr key={idx} className="my-3 border-slate-200" />;
          if (b.type === "h1") return <div key={idx} className="mb-2 mt-1 text-lg font-extrabold text-slate-900">{b.text}</div>;
          if (b.type === "h2") return <div key={idx} className="mb-2 mt-3 text-base font-extrabold text-slate-900">{b.text}</div>;
          if (b.type === "h3") return <div key={idx} className="mb-1 mt-3 text-sm font-extrabold text-slate-800">{b.text}</div>;
          if (b.type === "ul") {
            return (
              <ul key={idx} className="my-2 list-disc pl-6 text-sm text-slate-800">
                {b.items.map((item, j) => (
                  <li key={j} className="my-1 leading-relaxed">{item}</li>
                ))}
              </ul>
            );
          }
          return <p key={idx} className="my-2 text-sm leading-relaxed text-slate-800">{b.text}</p>;
        })}
      </div>
      <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-3 text-xs text-slate-500">{footer}</div>
    </div>
  );
}

export default function CreateResources() {
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const userEmail = useMemo(() => getEmailFromToken() ?? "anon", []);
  const scopeStoreKey = useMemo(() => `elume_create_resources_scope_v2__${userEmail}`, [userEmail]);
  const sourceStoreBase = useMemo(() => `elume_create_resources_sources_v2__${userEmail}`, [userEmail]);
  const historyStoreBase = useMemo(() => `elume_create_resources_history_v2__${userEmail}`, [userEmail]);

  const [scopeOpen, setScopeOpen] = useState(true);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("single");
  const [scopeClassId, setScopeClassId] = useState<number>(1);
  const [scopeGroupIds, setScopeGroupIds] = useState<number[]>([]);
  const [scopeGroupName, setScopeGroupName] = useState("");

  const [scope, setScope] = useState<Scope>(() => {
    return safeJsonParse<Scope>(localStorage.getItem(scopeStoreKey), { mode: "single", classId: 1 });
  });

  const classById = useMemo(() => {
    const map = new Map<number, ClassItem>();
    for (const item of classes) map.set(item.id, item);
    return map;
  }, [classes]);

  const scopeLabel = useMemo(() => {
    if (scope.mode === "general") return "General workspace";
    if (scope.mode === "single") {
      const current = classById.get(scope.classId ?? -1);
      return current ? `${current.name} • ${current.subject}` : "Selected class";
    }
    const ids = scope.classIds ?? [];
    const named = (scope.groupName || "").trim();
    if (named) return `${named} (${ids.length} classes)`;
    return `Group (${ids.length} classes)`;
  }, [classById, scope]);

  const scopeKey = useMemo(() => scopeToKey(scope), [scope]);

  function storeKey(kind: "sources" | "history") {
    const base = kind === "sources" ? sourceStoreBase : historyStoreBase;
    return `${base}__${scopeKey}`;
  }

  const [manualSources, setManualSources] = useState<ManualSource[]>(() =>
    safeJsonParse<ManualSource[]>(localStorage.getItem(storeKey("sources")), [])
  );
  const [history, setHistory] = useState<GeneratedDoc[]>(() =>
    safeJsonParse<GeneratedDoc[]>(localStorage.getItem(storeKey("history")), [])
  );

  const [outputKind, setOutputKind] = useState<OutputKind>("ideas");
  const [prompt, setPrompt] = useState("");
  const [level, setLevel] = useState<PhaseLevel>("Junior Cycle");
  const [detail, setDetail] = useState<DetailLevel>("Concise");
  const [sourceBucket, setSourceBucket] = useState<SourceBucket>("notes");
  const [sourceFolder, setSourceFolder] = useState("");
  const [saveBucket, setSaveBucket] = useState<SaveBucket>("links");
  const [saveFolder, setSaveFolder] = useState("");
  const [brandingChoice, setBrandingChoice] = useState<BrandingChoice>("elume");
  const [worksheetIncludeAnswers, setWorksheetIncludeAnswers] = useState(true);
  const [availableSourceFolders, setAvailableSourceFolders] = useState<string[]>([]);
  const [loadingSourceFolders, setLoadingSourceFolders] = useState(false);
  const [availableDestinationFolders, setAvailableDestinationFolders] = useState<string[]>([]);
  const [loadingDestinationFolders, setLoadingDestinationFolders] = useState(false);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceText, setNewSourceText] = useState("");
  const [uploadedManualFiles, setUploadedManualFiles] = useState<UploadedManualFile[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedDoc | null>(null);

  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const manualFileRef = useRef<HTMLInputElement | null>(null);

  const card = "rounded-[32px] border border-white/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur";
  const soft = "rounded-[28px] border-2 border-slate-200 bg-slate-50/90";
  const btn = "rounded-2xl border-2 border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary = "rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:translate-y-[1px] disabled:opacity-50";
  const chipBase = "rounded-full border-2 px-4 py-2 text-sm font-semibold transition";
  const teacherProfile = useMemo(() => loadTeacherAdminProfile(), []);
  const teacherNameShort = useMemo(() => teacherDisplayNameShort(teacherProfile), [teacherProfile]);
  const teacherSchoolName = useMemo(() => String(teacherProfile?.schoolName ?? "").trim(), [teacherProfile]);
  const hasSchoolLogoOption = useMemo(() => Boolean(teacherProfile?.schoolBranding?.logoDataUrl), [teacherProfile]);
  const destinationOptions = useMemo(() => destinationOptionsForOutput(outputKind), [outputKind]);
  const sourceOptions = useMemo(() => sourceOptionsForOutput(outputKind), [outputKind]);
  const destinationChoices = useMemo<DestinationChoice[]>(() => {
    const choices: DestinationChoice[] = [];
    const seen = new Set<string>();

    for (const option of destinationOptions) {
      const optionFolders =
        option.bucket === "links"
          ? option.folders ?? []
          : option.bucket === saveBucket
            ? availableDestinationFolders
            : [];

      const pushChoice = (bucket: SaveBucket, folder: string, label: string, recommended = false) => {
        const id = destinationChoiceId(bucket, folder);
        if (seen.has(id)) return;
        seen.add(id);
        choices.push({ id, bucket, folder, label, recommended });
      };

      if (optionFolders.length) {
        for (const folder of optionFolders) {
          pushChoice(option.bucket, folder, `${option.label} / ${folder}`, Boolean(option.recommended));
        }
      } else {
        pushChoice(option.bucket, "", option.label, Boolean(option.recommended));
      }
    }

    return choices;
  }, [availableDestinationFolders, destinationOptions, saveBucket]);
  const selectedDestinationChoiceId = useMemo(() => {
    const current = destinationChoiceId(saveBucket, saveFolder);
    if (destinationChoices.some((choice) => choice.id === current)) return current;
    return destinationChoices[0]?.id ?? destinationChoiceId(saveBucket, saveFolder);
  }, [destinationChoices, saveBucket, saveFolder]);
  const recommendedDestinationLabel = useMemo(() => {
    return (
      destinationChoices.find((choice) => choice.recommended)?.label ||
      destinationChoices[0]?.label ||
      "Resources"
    );
  }, [destinationChoices]);

  useEffect(() => {
    let cancelled = false;
    setLoadingClasses(true);

    apiFetch("/classes")
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? (data as ClassItem[]) : [];
        setClasses(arr);
        const firstId = arr?.[0]?.id ?? 1;

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

  useEffect(() => {
    setManualSources(safeJsonParse<ManualSource[]>(localStorage.getItem(storeKey("sources")), []));
    setHistory(safeJsonParse<GeneratedDoc[]>(localStorage.getItem(storeKey("history")), []));
  }, [scopeKey]);

  useEffect(() => {
    localStorage.setItem(storeKey("sources"), JSON.stringify(manualSources));
  }, [manualSources, scopeKey]);

  useEffect(() => {
    localStorage.setItem(storeKey("history"), JSON.stringify(history));
  }, [history, scopeKey]);

  useEffect(() => {
    setUploadedManualFiles([]);
    setNoteComposerOpen(false);
  }, [scopeKey]);

  useEffect(() => {
    setScopeOpen(true);
  }, []);

  useEffect(() => {
    const allowed = sourceOptions.map((item) => item.bucket);
    const fallbackBucket = sourceOptions[0]?.bucket ?? "notes";
    if (!allowed.includes(sourceBucket)) {
      setSourceBucket(fallbackBucket);
      return;
    }
    const staticFolders = sourceOptions.find((item) => item.bucket === sourceBucket)?.folders ?? [];
    if (staticFolders.length && !sourceFolder) {
      setSourceFolder(staticFolders[0] ?? "");
    }
  }, [sourceBucket, sourceFolder, sourceOptions]);

  useEffect(() => {
    const allowed = destinationOptions.map((item) => item.bucket);
    const fallbackBucket = destinationOptions[0]?.bucket ?? "links";
    if (!allowed.includes(saveBucket)) {
      setSaveBucket(fallbackBucket);
      return;
    }
    const staticFolders = destinationOptions.find((item) => item.bucket === saveBucket)?.folders ?? [];
    if (staticFolders.length && !saveFolder) {
      setSaveFolder(staticFolders[0] ?? "");
    }
  }, [destinationOptions, outputKind, saveBucket, saveFolder]);

  useEffect(() => {
    const classIdForFolders = scope.mode === "single" ? scope.classId ?? scopeClassId : null;
    if (sourceBucket === "links") {
      const staticFolders = sourceOptions.find((item) => item.bucket === "links")?.folders ?? [];
      setAvailableSourceFolders(staticFolders);
      setLoadingSourceFolders(false);
      setSourceFolder((prev) => (prev && staticFolders.includes(prev) ? prev : staticFolders[0] ?? ""));
      return;
    }
    if (!classIdForFolders) {
      setAvailableSourceFolders([]);
      setLoadingSourceFolders(false);
      setSourceFolder("");
      return;
    }

    let cancelled = false;
    setLoadingSourceFolders(true);

    (async () => {
      try {
        const topics = await apiFetch(`/topics/${classIdForFolders}?kind=notes`);
        const nextFolders = Array.isArray(topics)
          ? topics
              .map((item: any) => String(item?.name ?? "").trim())
              .filter(Boolean)
          : [];

        if (cancelled) return;

        const uniqueSorted = Array.from(new Set(nextFolders)).sort((a, b) => a.localeCompare(b));
        setAvailableSourceFolders(uniqueSorted);
        setSourceFolder((prev) => (prev && uniqueSorted.includes(prev) ? prev : ""));
      } catch {
        if (cancelled) return;
        setAvailableSourceFolders([]);
        setSourceFolder("");
      } finally {
        if (cancelled) return;
        setLoadingSourceFolders(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, scopeClassId, sourceBucket, sourceOptions]);

  useEffect(() => {
    const classIdForFolders = scope.mode === "single" ? scope.classId ?? scopeClassId : null;
    if (saveBucket === "links") {
      const staticFolders = destinationOptions.find((item) => item.bucket === "links")?.folders ?? [];
      setAvailableDestinationFolders(staticFolders);
      setLoadingDestinationFolders(false);
      setSaveFolder((prev) => (prev && staticFolders.includes(prev) ? prev : staticFolders[0] ?? ""));
      return;
    }
    if (!classIdForFolders) {
      setAvailableDestinationFolders([]);
      setLoadingDestinationFolders(false);
      setSaveFolder("");
      return;
    }

    let cancelled = false;
    setLoadingDestinationFolders(true);

    (async () => {
      try {
        let nextFolders: string[] = [];

        if (saveBucket === "notes") {
          const topics = await apiFetch(`/topics/${classIdForFolders}?kind=notes`);
          nextFolders = Array.isArray(topics)
            ? topics
                .map((item: any) => String(item?.name ?? "").trim())
                .filter(Boolean)
            : [];
        } else {
          const categories = await apiFetch(`/classes/${classIdForFolders}/test-categories`);
          nextFolders = Array.isArray(categories)
            ? categories
                .map((item: any) => String(item?.title ?? "").trim())
                .filter(Boolean)
            : [];
        }

        if (cancelled) return;

        const uniqueSorted = Array.from(new Set(nextFolders)).sort((a, b) => a.localeCompare(b));
        setAvailableDestinationFolders(uniqueSorted);
        setSaveFolder((prev) => (prev && uniqueSorted.includes(prev) ? prev : ""));
      } catch {
        if (cancelled) return;
        setAvailableDestinationFolders([]);
        setSaveFolder("");
      } finally {
        if (cancelled) return;
        setLoadingDestinationFolders(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [destinationOptions, saveBucket, scope, scopeClassId]);

  const selectedClassNames = useMemo(() => {
    if (scope.mode !== "group") return [] as string[];
    return (scope.classIds ?? []).map((id) => classById.get(id)?.name || `Class ${id}`);
  }, [classById, scope]);

  function openScopeModal() {
    setScopeMode(scope.mode);
    if (scope.mode === "single") setScopeClassId(scope.classId ?? classes?.[0]?.id ?? 1);
    if (scope.mode === "group") {
      setScopeGroupIds(scope.classIds ?? []);
      setScopeGroupName(scope.groupName ?? "");
    }
    setScopeOpen(true);
  }

  function confirmScope() {
    let next: Scope;

    if (scopeMode === "general") {
      next = { mode: "general" };
    } else if (scopeMode === "single") {
      next = { mode: "single", classId: scopeClassId };
    } else {
      const ids = Array.from(new Set(scopeGroupIds)).slice(0, 3).sort((a, b) => a - b);
      if (ids.length < 2) {
        alert("Please select 2 to 3 classes for a group.");
        return;
      }
      next = { mode: "group", classIds: ids, groupName: scopeGroupName.trim() };
    }

    setScope(next);
    localStorage.setItem(scopeStoreKey, JSON.stringify(next));
    setPreview(null);
    setAiErr(null);
    setScopeOpen(false);
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  function addManualSource() {
    const title = newSourceTitle.trim();
    const text = newSourceText.trim();
    if (!title || !text) return;

    const next: ManualSource = {
      id: uid("source"),
      title,
      text,
      createdAt: new Date().toISOString(),
      pinned: false,
    };

    setManualSources((prev) => [next, ...prev]);
    setNewSourceTitle("");
    setNewSourceText("");
    setNoteComposerOpen(false);
  }

  function togglePinSource(id: string) {
    setManualSources((prev) => prev.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)));
  }

  function deleteSource(id: string) {
    const ok = window.confirm("Delete this manual source?");
    if (!ok) return;
    setManualSources((prev) => prev.filter((item) => item.id !== id));
  }

  function addUploadedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const accepted = Array.from(fileList).filter((file) =>
      /\.(pdf|doc|docx|ppt|pptx|txt)$/i.test(file.name)
    );
    if (!accepted.length) return;

    const next = accepted.map((file) => ({
      id: uid("upload"),
      file,
      createdAt: new Date().toISOString(),
    }));

    setUploadedManualFiles((prev) => [...next, ...prev]);
  }

  function removeUploadedFile(id: string) {
    setUploadedManualFiles((prev) => prev.filter((item) => item.id !== id));
  }

  const sortedSources = useMemo(() => {
    return [...manualSources].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [manualSources]);

  const manualSourceSummary = useMemo(() => {
    return [
      ...uploadedManualFiles.map((item) => ({ id: item.id, title: item.file.name })),
      ...sortedSources.map((item) => ({ id: item.id, title: item.title })),
    ];
  }, [sortedSources, uploadedManualFiles]);

  function localGenerate(kind: OutputKind, teacherPrompt: string): GeneratedDoc {
    const sourcesText = sortedSources.length
      ? sortedSources.map((s, i) => `SOURCE ${i + 1}: ${s.title}\n${s.text}`).join("\n\n")
      : "";

    const scopeSection =
      scope.mode === "single"
        ? `Selected class: ${scopeLabel}`
        : scope.mode === "group"
          ? `Selected group: ${scopeLabel}\nClasses: ${selectedClassNames.join(", ")}`
          : "Workspace: General repository";

    let body = "";
    const footerLines = [
      `Teacher: ${teacherNameShort}`,
      teacherSchoolName ? `School: ${teacherSchoolName}` : "",
      `Branding: ${
        brandingChoice === "none"
          ? "No branding"
          : brandingChoice === "school"
            ? hasSchoolLogoOption
              ? "School logo"
              : "Elume logo (school logo unavailable)"
            : "Elume logo"
      }`,
    ]
      .filter(Boolean)
      .join("\n");

    if (kind === "ideas") {
      body = [
        `# 3 Ideas to Start a Class`,
        ``,
        `Topic: ${teacherPrompt}`,
        ``,
        `## Idea 1`,
        `- Quick retrieval starter`,
        `- 3 to 5 minutes`,
        `- Use mini-whiteboards or pair talk`,
        ``,
        `## Idea 2`,
        `- Main activity hook`,
        `- Connect to prior learning`,
        `- Build in one clear check for understanding`,
        ``,
        `## Idea 3`,
        `- Strong finish or exit task`,
        `- Gather evidence of understanding`,
      ].join("\n");
    }

    if (kind === "lesson_plan") {
      body = [
        `# Lesson Plan`,
        ``,
        `## Lesson Title, Class, Duration, Topic`,
        `- Lesson Title: ${teacherPrompt || "Lesson title"}`,
        `- Class: ${scopeLabel}`,
        `- Duration: 40 to 60 minutes`,
        `- Topic: ${teacherPrompt || "Lesson topic"}`,
        ``,
        `## Prior Knowledge`,
        `- Identify the key knowledge or skills students should already have before starting this lesson.`,
        ``,
        `## Learning Intentions`,
        `- We are learning to understand the core ideas in ${teacherPrompt || "this topic"}.`,
        `- We are learning to apply the topic using clear subject-specific language.`,
        ``,
        `## Learning Outcomes`,
        `- Explain the main concept in simple, accurate terms.`,
        `- Use relevant key terms correctly during discussion or written work.`,
        `- Apply the learning to a classroom task or example.`,
        `- Show understanding through questioning, discussion, or written response.`,
        ``,
        `## Success Criteria`,
        `- I can explain the main idea clearly.`,
        `- I can use the correct keywords in my answer.`,
        `- I can complete the class task using what I have learned.`,
        ``,
        `## Lesson Flow`,
        `### Starter`,
        `- Use a short retrieval or discussion task to connect to prior learning.`,
        `### Teaching / Development`,
        `- Model the new learning clearly using examples and teacher explanation.`,
        `### Activity / Application`,
        `- Students apply the learning through a focused classroom task.`,
        `### Plenary / Closure`,
        `- Finish with a quick check for understanding or exit prompt.`,
        ``,
        `## Assessment`,
        `- Observe student responses, questioning, and completed work during the lesson.`,
        ``,
        `## Resources`,
        `- Whiteboard, teacher explanation, and any class materials relevant to the topic.`,
        ``,
        `## Differentiation`,
        `- Support: Provide prompts, guided examples, or reduced task load where needed.`,
        `- Extension: Add challenge questions or deeper application tasks.`,
        ``,
        `## Homework`,
        `- Optional short follow-up task linked to the lesson focus.`,
      ].join("\n");
    }

    if (kind === "worksheet") {
      body = [
        `# Worksheet`,
        ``,
        `Topic: ${teacherPrompt}`,
        `Level: ${level}`,
        ``,
        `## Instructions`,
        `- Read each question carefully.`,
        `- Show your working where appropriate.`,
        `- Use clear subject-specific vocabulary.`,
        ``,
        `## Questions`,
        `1. Short-answer starter question`,
        `2. Retrieval question linked to prior learning`,
        `3. Applied question using the topic in context`,
        `4. Extension question for deeper thinking`,
        ``,
        worksheetIncludeAnswers ? `## Answer key\n- Add concise model answers and marking guidance.` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (kind === "scheme") {
      body = [
        `# Scheme of Work`,
        ``,
        `Theme: ${teacherPrompt}`,
        ``,
        `## Week 1`,
        `- Lesson 1`,
        `- Lesson 2`,
        ``,
        `## Week 2`,
        `- Lesson 3`,
        `- Lesson 4`,
        ``,
        `## Assessment points`,
        `- ...`,
        ``,
        `## Resources`,
        `- ...`,
      ].join("\n");
    }

    if (kind === "dept_plan") {
      body = [
        `# Department Plan`,
        ``,
        `Focus: ${teacherPrompt}`,
        ``,
        `## Priorities`,
        `- ...`,
        ``,
        `## Teaching and learning actions`,
        `- ...`,
        ``,
        `## Assessment and review`,
        `- ...`,
        ``,
        `## Shared resources`,
        `- ...`,
      ].join("\n");
    }

    const header = [
      `ELume • ${labelForOutput(kind)}`,
      `${scopeSection}`,
      `Audience: ${toneLabelForOutput(kind)}`,
      `Context: Irish secondary school / post-primary`,
      `Language: British English`,
      `Level: ${level}`,
      `Detail: ${detail}`,
      kind === "worksheet" ? `Include answer key: ${worksheetIncludeAnswers ? "Yes" : "No"}` : "",
      `Source: ${displayLabelForBucket(sourceBucket as SaveBucket)}${sourceFolder.trim() ? ` / ${sourceFolder.trim()}` : ""}`,
      `Save to: ${displayLabelForBucket(saveBucket)}${saveFolder.trim() ? ` / ${saveFolder.trim()}` : ""}`,
      `Created: ${new Date().toLocaleString("en-IE")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const content = [
      header,
      ``,
      `---`,
      ``,
      body,
      footerLines ? `\n---\n\n## Footer metadata\n\n${footerLines}` : "",
      sourcesText ? `\n---\n\n## Manual notes supplied\n\n${sourcesText}` : "",
    ]
      .join("\n")
      .trim();

    return {
      id: uid("gen"),
      kind,
      title: `${labelForOutput(kind)} • ${teacherPrompt || "Untitled"}`.slice(0, 90),
      prompt: teacherPrompt,
      scopeLabel,
      saveBucket,
      saveFolder: saveFolder.trim() || undefined,
      createdAt: new Date().toISOString(),
      manualSources: manualSourceSummary,
      teacherDisplayNameShort: teacherNameShort,
      schoolName: teacherSchoolName,
      brandingChoice,
      worksheetIncludeAnswers: kind === "worksheet" ? worksheetIncludeAnswers : undefined,
      content,
    };
  }

  async function runGenerate() {
    const teacherPrompt = prompt.trim();
    if (!teacherPrompt) return;

    setAiBusy(true);
    setAiErr(null);
    setPreview(null);

    const payload = {
      kind: outputKind,
      output_intent: labelForOutput(outputKind),
      audience: toneLabelForOutput(outputKind),
      prompt: teacherPrompt,
      scope,
      level,
      detail,
      british_english_required: true,
      curriculum_context: {
        country: "Ireland",
        phase: "secondary school / post-primary",
        localisation_rule: "Prioritise Irish secondary school terminology, curriculum assumptions, and classroom practice. Avoid US or non-Irish framing unless the teacher explicitly asks for it.",
      },
      save_target: {
        bucket: saveBucket,
        folder: saveFolder || null,
      },
      source_context: {
        selected_scope_mode: scope.mode,
        selected_class_id: scope.mode === "single" ? scope.classId ?? scopeClassId : null,
        selected_class_label: scope.mode === "single" ? classById.get(scope.classId ?? scopeClassId)?.name ?? null : null,
        selected_group_label: scope.mode === "group" ? scopeLabel : null,
        selected_bucket: saveBucket,
        selected_folder: saveFolder || null,
        selected_source_bucket: sourceBucket,
        selected_source_folder: sourceFolder || null,
        search_selected_folder_first: Boolean(sourceFolder) && scope.mode === "single",
      },
      worksheet_options: outputKind === "worksheet" ? { include_answer_key: worksheetIncludeAnswers } : null,
      manual_file_sources: uploadedManualFiles.map((item) => ({
        id: item.id,
        filename: item.file.name,
        mime_type: item.file.type || null,
        size_bytes: item.file.size,
      })),
      manual_sources: sortedSources.map((s) => ({
        id: s.id,
        title: s.title,
        text: s.text,
      })),
      branding: {
        brandingChoice,
        defaultBranding: "elume",
        schoolLogoAvailable: hasSchoolLogoOption,
        teacherDisplayNameShort: teacherNameShort,
        schoolName: teacherSchoolName || null,
      },
      generation_rules: {
        teacher_name_format: "Use title plus surname only for printable footer metadata. Never use the teacher's first name.",
        spelling: "Use British English spelling and terminology throughout.",
        worksheet_tone: "Student-facing printable resource",
      },
      use_class_context: scope.mode !== "general",
      timezone: "Europe/Dublin",
    };

    try {
      const data = await apiFetch("/ai/create-resources", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const title =
        (data as any)?.title ??
        (data as any)?.draft?.title ??
        `${labelForOutput(outputKind)} • ${teacherPrompt}`.slice(0, 90);
      const content = (data as any)?.content ?? (data as any)?.draft?.content ?? "";

      if (!content) {
        const fallback = localGenerate(outputKind, teacherPrompt);
        setPreview(fallback);
        setAiErr("AI draft endpoint returned no content, so a local draft preview was created instead.");
      } else {
        setPreview({
          id: uid("gen"),
          kind: outputKind,
          title,
          prompt: teacherPrompt,
          scopeLabel,
          saveBucket,
          saveFolder: saveFolder.trim() || undefined,
          createdAt: new Date().toISOString(),
          manualSources: manualSourceSummary,
          teacherDisplayNameShort: teacherNameShort,
          schoolName: teacherSchoolName,
          brandingChoice,
          worksheetIncludeAnswers: outputKind === "worksheet" ? worksheetIncludeAnswers : undefined,
          content,
        });
      }
    } catch {
      const fallback = localGenerate(outputKind, teacherPrompt);
      setPreview(fallback);
      setAiErr("Preview generated locally while AI connection is being finalised.");
    } finally {
      setAiBusy(false);
    }
  }

  function savePreview() {
    if (!preview) return;
    setHistory((prev) => [preview, ...prev]);
  }

  async function exportPreviewDocx() {
    if (!preview) return;

    const body = {
      title: preview.title,
      content: preview.content,
      teacher: getEmailFromToken(),
      meta: {
        kind: preview.kind,
        outputKind: preview.kind,
        scopeLabel: preview.scopeLabel,
        level,
        detail,
        saveBucket: preview.saveBucket,
        saveFolder: preview.saveFolder || null,
        createdAt: preview.createdAt,
        teacherDisplayNameShort: preview.teacherDisplayNameShort || teacherNameShort,
        schoolName: preview.schoolName || teacherSchoolName || null,
        brandingChoice: preview.brandingChoice || brandingChoice,
        schoolLogoAvailable: hasSchoolLogoOption,
        schoolLogoDataUrl: teacherProfile?.schoolBranding?.logoDataUrl || null,
        worksheetIncludeAnswers: preview.worksheetIncludeAnswers ?? null,
      },
    };

    const blob = await apiFetchBlob("/exports/docx", {
      method: "POST",
      body,
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(preview.title || "ELume_Resource").replace(/[^\w\- ]+/g, "").trim() || "ELume_Resource"}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  function exportPreviewPdf() {
    if (!preview) return;

    const blocks = parseDocumentBlocks(printableBodyText(preview.content));
    const blockHtml = blocks
      .map((b) => {
        if (b.type === "spacer") return `<div style="height:8px"></div>`;
        if (b.type === "hr") return `<hr style="margin:16px 0;border:0;border-top:1px solid #cbd5e1" />`;
        if (b.type === "h1") return `<h1 style="font-size:24px;line-height:1.2;margin:0 0 12px;font-weight:800;color:#0f172a">${b.text}</h1>`;
        if (b.type === "h2") return `<h2 style="font-size:18px;line-height:1.3;margin:18px 0 10px;font-weight:800;color:#0f172a">${b.text}</h2>`;
        if (b.type === "h3") return `<h3 style="font-size:15px;line-height:1.3;margin:16px 0 8px;font-weight:800;color:#1e293b">${b.text}</h3>`;
        if (b.type === "ul") {
          return `<ul style="margin:10px 0 10px 20px;color:#1e293b;font-size:14px;line-height:1.7">${b.items
            .map((item) => `<li style="margin:6px 0">${item}</li>`)
            .join("")}</ul>`;
        }
        return `<p style="margin:10px 0;color:#1e293b;font-size:14px;line-height:1.75">${b.text}</p>`;
      })
      .join("");

    const subtitle = [
      preview.scopeLabel,
      `${level} • ${detail}`,
      `${displayLabelForBucket(preview.saveBucket)}${preview.saveFolder ? ` / ${preview.saveFolder}` : ""}`,
      new Date(preview.createdAt).toLocaleString("en-IE"),
    ].join(" • ");

    const footer = `${preview.teacherDisplayNameShort || teacherNameShort}${
      preview.schoolName || teacherSchoolName ? ` • ${preview.schoolName || teacherSchoolName}` : ""
    } • ${
      preview.brandingChoice === "none"
        ? "No branding"
        : preview.brandingChoice === "school" && hasSchoolLogoOption
          ? "School logo"
          : "Elume logo"
    }`;

    const win = window.open("", "_blank", "noopener,noreferrer,width=960,height=1200");
    if (!win) return;

    win.document.write(`<!doctype html>
<html>
  <head>
    <title>${preview.title}</title>
    <style>
      body { margin: 0; background: #e2e8f0; font-family: Georgia, "Times New Roman", serif; color: #0f172a; }
      .page { width: 210mm; min-height: 297mm; margin: 16px auto; background: white; box-shadow: 0 18px 44px rgba(15,23,42,0.12); }
      .head { padding: 24mm 20mm 10mm; border-bottom: 1px solid #e2e8f0; }
      .title { font-size: 28px; line-height: 1.1; font-weight: 800; margin: 0; }
      .sub { margin-top: 10px; font: 14px/1.6 system-ui, sans-serif; color: #475569; }
      .body { padding: 14mm 20mm 16mm; }
      .foot { border-top: 1px solid #e2e8f0; padding: 8mm 20mm 12mm; font: 12px/1.5 system-ui, sans-serif; color: #64748b; }
      @media print { body { background: white; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="head">
        <h1 class="title">${preview.title}</h1>
        <div class="sub">${subtitle}</div>
      </div>
      <div class="body">${blockHtml}</div>
      <div class="foot">${footer}</div>
    </div>
    <script>window.onload = function () { window.print(); };</script>
  </body>
  </html>`);
    win.document.close();
  }

  async function exportPreviewPdfFile() {
    if (!preview) return;

    const body = {
      title: preview.title,
      content: preview.content,
      teacher: getEmailFromToken(),
      meta: {
        kind: preview.kind,
        outputKind: preview.kind,
        scopeLabel: preview.scopeLabel,
        level,
        detail,
        saveBucket: preview.saveBucket,
        saveFolder: preview.saveFolder || null,
        createdAt: preview.createdAt,
        teacherDisplayNameShort: preview.teacherDisplayNameShort || teacherNameShort,
        schoolName: preview.schoolName || teacherSchoolName || null,
        brandingChoice: preview.brandingChoice || brandingChoice,
        schoolLogoAvailable: hasSchoolLogoOption,
        schoolLogoDataUrl: teacherProfile?.schoolBranding?.logoDataUrl || null,
        worksheetIncludeAnswers: preview.worksheetIncludeAnswers ?? null,
      },
    };

    const blob = await apiFetchBlob("/exports/pdf", {
      method: "POST",
      body,
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(preview.title || "ELume_Resource").replace(/[^\w\- ]+/g, "").trim() || "ELume_Resource"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  const saveDestinationLabel = useMemo(() => {
    const base = displayLabelForBucket(saveBucket);
    return saveFolder.trim() ? `${base} / ${saveFolder.trim()}` : base;
  }, [saveBucket, saveFolder]);

  const promptHint = useMemo(() => {
    if (outputKind === "ideas") return "e.g. Give me 3 starter ideas for respiration for a mixed-ability third year class";
    if (outputKind === "lesson_plan") return "e.g. Create a lesson plan on photosynthesis with a practical starter and exit ticket";
    if (outputKind === "worksheet") return "e.g. Create a printable worksheet on photosynthesis for second year, with short questions and an answer key";
    if (outputKind === "scheme") return "e.g. Build a 4-week scheme of work on fractions for two first-year groups";
    return "e.g. Create a department plan for common assessment and revision before Christmas";
  }, [outputKind]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eefbf0,_#def3e4_45%,_#d8eef1_100%)]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-3xl font-extrabold tracking-tight text-slate-900">Create Resources</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 shadow-sm">
                Working on <span className="font-semibold text-slate-900">{scopeLabel}</span>
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800 shadow-sm">
                Prompt-first workflow
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate("/")} className={btn}>
              ← Back
            </button>
            <button type="button" onClick={openScopeModal} className={btn}>
              Change class
            </button>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-5xl space-y-6">
            <section className={`${card} p-5 md:p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
                    Step 1
                    <span className="text-[10px] text-emerald-600">Choose output</span>
                  </div>
                  <div className="mt-4 text-xl font-extrabold tracking-tight text-slate-900">What do you want to create?</div>
                  <div className="mt-1 text-sm text-slate-600">
                    The class or group you selected is the default source context. Keep this fast and teacher-first.
                  </div>
                </div>

              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {([
                  ["ideas", "3 Ideas", "Quick starter ideas for the next class"],
                  ["lesson_plan", "Lesson Plan", "A full lesson flow teachers can use quickly"],
                  ["worksheet", "Worksheet", "A student-facing printable resource with optional answers"],
                  ["scheme", "Scheme of Work", "Multi-lesson planning across a topic"],
                  ["dept_plan", "Department Plan", "Shared direction for teams and departments"],
                ] as Array<[OutputKind, string, string]>).map(([kind, title, description]) => {
                  const active = outputKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setOutputKind(kind)}
                      className={`rounded-[28px] border-2 p-4 text-left transition ${active ? "border-emerald-700 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <div className="text-base font-extrabold tracking-tight text-slate-900">{title}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={`${card} p-5 md:p-6`}>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-800">
                Step 2
                <span className="text-[10px] text-sky-600">Prompt</span>
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-[1.35fr_0.8fr]">
                <div>
                  <div className="text-xl font-extrabold tracking-tight text-slate-900">Ask for the resource in plain language</div>
                  <div className="mt-1 text-sm text-slate-600">
                    This should feel like a normal AI prompt, but grounded in the selected class context.
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-bold text-slate-700">Prompt</label>
                    <textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={7}
                      className="w-full rounded-[28px] border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                      placeholder={promptHint}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Level</label>
                      <select value={level} onChange={(e) => setLevel(e.target.value as PhaseLevel)} className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                        <option value="Junior Cycle">Junior Cycle</option>
                        <option value="Leaving Cert">Leaving Cert</option>
                        <option value="Common Level">Common Level</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Detail</label>
                      <select value={detail} onChange={(e) => setDetail(e.target.value as DetailLevel)} className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                        <option value="Concise">Concise</option>
                        <option value="Detailed">Detailed</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Source area</label>
                      <select value={sourceBucket} onChange={(e) => setSourceBucket(e.target.value as SourceBucket)} className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                        {sourceOptions.map((option) => (
                          <option key={option.bucket} value={option.bucket}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs text-slate-500">
                        Recommended: {sourceOptions.find((item) => item.recommended)?.label || sourceOptions[0]?.label || "Notes"}
                      </div>
                      <div className="mt-3">
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Source folder</label>
                        <select
                          value={sourceFolder}
                          onChange={(e) => setSourceFolder(e.target.value)}
                          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                        >
                          <option value="">Top level</option>
                          {!loadingSourceFolders && availableSourceFolders.length === 0 && (
                            <option value="" disabled>
                              {sourceBucket === "links" ? "No resource folders suggested yet" : scope.mode === "single" ? "No source folders found" : "No single class source folders"}
                            </option>
                          )}
                          {availableSourceFolders.map((folder) => (
                            <option key={folder} value={folder}>
                              {folder}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 text-xs text-slate-500">
                          {loadingSourceFolders
                            ? "Loading source folders..."
                            : sourceBucket === "links"
                            ? "AI will search the selected resource folder first when relevant."
                            : scope.mode === "single"
                            ? "AI will search this Notes folder first for relevant content."
                            : "Source folders are only specific when working from a single class."}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 xl:col-span-2">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Destination folder</label>
                      <select
                        value={selectedDestinationChoiceId}
                        onChange={(e) => {
                          const nextChoice = destinationChoices.find((choice) => choice.id === e.target.value);
                          if (!nextChoice) return;
                          setSaveBucket(nextChoice.bucket);
                          setSaveFolder(nextChoice.folder);
                        }}
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                      >
                        {destinationChoices.map((choice) => (
                          <option key={choice.id} value={choice.id}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {loadingDestinationFolders
                            ? "Loading destination folders..."
                            : saveBucket === "links"
                            ? "Teacher-facing resource folders are prepared here."
                            : saveBucket === "tests"
                            ? "Worksheet destinations stay ready for printing and reuse."
                            : scope.mode === "single"
                            ? "This controls where the generated resource is saved."
                            : "Destination folders are only specific when working from a single class."}
                        </span>
                        <span>Recommended: {recommendedDestinationLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        AI reads from <span className="font-semibold text-slate-900">{displayLabelForBucket(sourceBucket as SaveBucket)}{sourceFolder ? ` / ${sourceFolder}` : ""}</span> and saves to <span className="font-semibold text-slate-900">{saveDestinationLabel}</span>.
                      </div>
                    </div>
                    <div className="self-end rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
                      Destination: {saveDestinationLabel}
                    </div>
                  </div>

                  {outputKind === "worksheet" && (
                    <div className="mt-4 rounded-[24px] border-2 border-slate-200 bg-slate-50 p-4">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Worksheet</label>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900">Include answer key</div>
                          <div className="mt-1 text-xs text-slate-500">Add model answers for printing and export.</div>
                        </div>
                        <select
                          value={worksheetIncludeAnswers ? "yes" : "no"}
                          onChange={(e) => setWorksheetIncludeAnswers(e.target.value === "yes")}
                          className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className={`${soft} p-4`}>
                    <div className="text-sm font-extrabold text-slate-900">Printable branding</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Footer identity: {teacherNameShort}
                      {teacherSchoolName ? ` • ${teacherSchoolName}` : ""}
                    </div>
                    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <div className="text-sm font-bold text-slate-900">Branding choice</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Irish post-primary formatting and British English still apply regardless of branding.
                          </div>
                        </div>
                        <select
                          value={brandingChoice}
                          onChange={(e) => setBrandingChoice(e.target.value as BrandingChoice)}
                          className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        >
                          <option value="none">No branding</option>
                          <option value="elume">Elume logo</option>
                          <option value="school">School logo</option>
                        </select>
                      </div>
                      {brandingChoice === "school" && !hasSchoolLogoOption && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          No school logo is uploaded yet. Go to Teacher Admin page to upload your school logo.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`${soft} p-4`}>
                    <input
                      ref={manualFileRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        addUploadedFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />

                    <div>
                      <div className="text-sm font-extrabold text-slate-900">Optional manual sources</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Add uploaded files or pasted text notes if you want to guide the AI beyond the class and folder context.
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button type="button" className={btnPrimary} onClick={() => manualFileRef.current?.click()}>
                        Upload file
                      </button>
                      <button type="button" className={btn} onClick={() => setNoteComposerOpen((prev) => !prev)}>
                        Paste note
                      </button>
                    </div>

                    {noteComposerOpen && (
                      <div className="mt-4 rounded-[24px] border-2 border-slate-200 bg-white p-4">
                        <div>
                          <label className="mb-2 block text-sm font-bold text-slate-700">Note title</label>
                          <input value={newSourceTitle} onChange={(e) => setNewSourceTitle(e.target.value)} placeholder="e.g. Exam technique reminders" className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
                        </div>
                        <div className="mt-3">
                          <label className="mb-2 block text-sm font-bold text-slate-700">Paste note</label>
                          <textarea value={newSourceText} onChange={(e) => setNewSourceText(e.target.value)} rows={6} placeholder="Paste the exact note you want the AI to use as extra guidance." className="w-full rounded-[24px] border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-800" />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button type="button" className={btnPrimary} onClick={addManualSource} disabled={!newSourceTitle.trim() || !newSourceText.trim()}>
                            Add pasted note
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      {manualSourceSummary.length === 0 ? "No manual sources added yet" : `${manualSourceSummary.length} manual source${manualSourceSummary.length === 1 ? "" : "s"} ready`}
                    </div>

                    <div className="mt-4 max-h-[340px] space-y-3 overflow-auto pr-1">
                      {uploadedManualFiles.map((item) => {
                        const ext = item.file.name.includes(".") ? item.file.name.split(".").pop()?.toUpperCase() : "FILE";
                        return (
                          <div key={item.id} className="rounded-[24px] border-2 border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-extrabold text-slate-900">{item.file.name}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Uploaded file • {ext || "FILE"} • {(item.file.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                              <button type="button" className="text-sm opacity-70 hover:opacity-100" onClick={() => removeUploadedFile(item.id)} title="Remove file">
                                🗑️
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {sortedSources.map((source) => (
                        <div key={source.id} className="rounded-[24px] border-2 border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-extrabold text-slate-900">{source.pinned ? "📌 " : ""}{source.title}</div>
                              <div className="mt-1 text-xs text-slate-500">Pasted note • {new Date(source.createdAt).toLocaleString("en-IE")}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" className="text-sm opacity-70 hover:opacity-100" onClick={() => togglePinSource(source.id)} title={source.pinned ? "Unpin" : "Pin"}>
                                {source.pinned ? "📌" : "📍"}
                              </button>
                              <button type="button" className="text-sm opacity-70 hover:opacity-100" onClick={() => deleteSource(source.id)} title="Delete note">
                                🗑️
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                            {source.text}
                          </div>
                        </div>
                      ))}

                      {manualSourceSummary.length === 0 && (
                        <div className="rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                          Add a file or paste a note if you want to give the AI extra guidance beyond the class and folder context.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`${card} p-5 md:p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
                    Step 3
                    <span className="text-[10px] text-emerald-600">Generate</span>
                  </div>
                  <div className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">Preview before you save or export</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btn} onClick={() => { setPrompt(""); setAiErr(null); setPreview(null); }}>
                    Clear
                  </button>
                  <button type="button" className={btnPrimary} onClick={runGenerate} disabled={aiBusy || !prompt.trim()}>
                    {aiBusy ? "Generating…" : `Generate ${labelForOutput(outputKind)}`}
                  </button>
                </div>
              </div>

              {aiErr && (
                <div className="mt-4 rounded-[24px] border-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {aiErr}
                </div>
              )}

              {!preview && (
                <div className="mt-4 rounded-[28px] border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-600">
                  Generate a draft to preview it here. The intent is simple: Irish post-primary context first, selected class and folder next, optional manual sources after that, then save the finished resource to the right class location.
                </div>
              )}

              {preview && (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-[28px] border-2 border-slate-200 bg-slate-50 p-4">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-extrabold tracking-tight text-slate-900">{preview.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{new Date(preview.createdAt).toLocaleString("en-IE")}</span>
                        <span>•</span>
                        <span>{preview.scopeLabel}</span>
                        <span>•</span>
                        <span>{preview.manualSources.length} manual source{preview.manualSources.length === 1 ? "" : "s"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={btn} onClick={() => navigator.clipboard.writeText(preview.content).catch(() => {})}>
                        Copy
                      </button>
                      <button type="button" className={btnPrimary} onClick={savePreview}>
                        Save draft
                      </button>
                      <button type="button" className={btn} onClick={exportPreviewPdfFile}>
                        Export PDF
                      </button>
                      <button type="button" className={btn} onClick={exportPreviewDocx}>
                        Export DOCX
                      </button>
                    </div>
                  </div>

                  <RenderDoc
                    text={preview.content}
                    title={preview.title}
                    subtitle={[
                      preview.scopeLabel,
                      `${level} • ${detail}`,
                      `${displayLabelForBucket(preview.saveBucket)}${preview.saveFolder ? ` / ${preview.saveFolder}` : ""}`,
                      new Date(preview.createdAt).toLocaleString("en-IE"),
                    ].join(" • ")}
                    footer={`${preview.teacherDisplayNameShort || teacherNameShort}${
                      preview.schoolName || teacherSchoolName ? ` • ${preview.schoolName || teacherSchoolName}` : ""
                    } • ${
                      preview.brandingChoice === "none"
                        ? "No branding"
                        : preview.brandingChoice === "school" && hasSchoolLogoOption
                          ? "School logo"
                          : "Elume logo"
                    }`}
                  />

                  <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                    Footer for print/export: {preview.teacherDisplayNameShort || teacherNameShort}
                    {preview.schoolName || teacherSchoolName ? ` • ${preview.schoolName || teacherSchoolName}` : ""}
                    {` • ${
                      preview.brandingChoice === "none"
                        ? "No branding"
                        : preview.brandingChoice === "school" && hasSchoolLogoOption
                          ? "School logo"
                          : "Elume logo"
                    }`}
                  </div>
                </div>
              )}
            </section>
          
        </div>

        <div className="mt-8 text-xs text-slate-500">© 2026 Elume Beta. P Fitzgerald</div>
      </div>

      {scopeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-[0_30px_90px_rgba(15,23,42,0.20)]">
            <div className="overflow-y-auto p-4 sm:p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                  Create Resources
                </div>
                <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
                  What class or group are we working on?
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Pick the classroom context first, then choose how you want Elume to work with it.
                </div>
              </div>
              <button type="button" className={btn} onClick={() => setScopeOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-6 rounded-[32px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.78),rgba(236,254,255,0.82),rgba(245,243,255,0.80))] p-5 shadow-[0_16px_40px_rgba(16,185,129,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Step 1</div>
                  <div className="mt-1 text-lg font-extrabold text-slate-900">Available classes</div>
                </div>
                <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {loadingClasses ? "Loading..." : `${classes.length} ready`}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {classes.map((item) => {
                  const visual = tileVisualForClass(item);
                  const active = scopeClassId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScopeClassId(item.id)}
                      className={[
                        "group relative min-h-[148px] rounded-[30px] border-[4px] border-black p-5 text-left shadow-[0_6px_0_rgba(15,23,42,0.16)] transition-all duration-200",
                        visual.bg,
                        visual.text,
                        active
                          ? `-translate-y-[2px] ring-4 ring-white/70 ${visual.ring} shadow-[0_18px_34px_rgba(15,23,42,0.20)]`
                          : "hover:-translate-y-[2px] hover:shadow-[0_14px_26px_rgba(15,23,42,0.18)]",
                      ].join(" ")}
                    >
                      <div className="absolute right-4 top-4">
                        <div className="grid h-9 w-9 place-items-center rounded-2xl border border-white/65 bg-white/15 text-sm font-black backdrop-blur-sm">
                          {active ? "✓" : "+"}
                        </div>
                      </div>

                      <div className="pr-10">
                        <div className="text-2xl font-extrabold tracking-tight leading-tight" style={{ textShadow: "0 3px 6px rgba(0,0,0,0.28)" }}>
                          {item.name}
                        </div>
                        <div className="mt-2 text-sm font-semibold opacity-95">{item.subject}</div>
                      </div>

                      <div className="mt-6 inline-flex rounded-full border border-white/65 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] backdrop-blur-sm">
                        {active ? "Selected" : "Choose"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {!classes.length && !loadingClasses && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
                  No classes available yet.
                </div>
              )}

              {classes.length > 0 && (
                <div className="mt-4 text-sm text-slate-700">
                  Selected class: <span className="font-semibold text-slate-900">{classById.get(scopeClassId)?.name || "Choose a class"}</span>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-[32px] border border-cyan-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,246,255,0.96),rgba(245,243,255,0.96))] p-5 shadow-[0_16px_40px_rgba(14,165,233,0.08)]">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Step 2</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">How do you want to work?</div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {([
                  ["single", "Single class", "Work from one selected class.", "from-emerald-50 via-white to-cyan-50", "border-emerald-200"],
                  ["group", "Group", "Choose 2 to 3 classes together.", "from-cyan-50 via-white to-violet-50", "border-cyan-200"],
                  ["general", "General", "Use a shared repository not tied to one class.", "from-violet-50 via-white to-emerald-50", "border-violet-200"],
                ] as Array<[ScopeMode, string, string, string, string]>).map(([mode, title, description, gradient, border]) => {
                  const active = scopeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScopeMode(mode)}
                      className={[
                        "rounded-[28px] border-2 p-4 text-left transition",
                        `bg-gradient-to-br ${gradient}`,
                        active
                          ? "border-slate-900 shadow-[0_16px_36px_rgba(15,23,42,0.14)] ring-2 ring-slate-200"
                          : `${border} shadow-sm hover:-translate-y-[1px] hover:shadow-md`,
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-extrabold text-slate-900">{title}</div>
                          <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div>
                        </div>
                        <div
                          className={[
                            "mt-0.5 grid h-8 w-8 place-items-center rounded-full border text-xs font-black",
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-white/80 bg-white/90 text-slate-500",
                          ].join(" ")}
                        >
                          {active ? "✓" : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {scopeMode === "single" && (
                <div className="mt-4 text-sm text-slate-600">
                  Elume will use <span className="font-semibold text-slate-900">{classById.get(scopeClassId)?.name || "the selected class"}</span> as the active class.
                </div>
              )}
            </div>

            {scopeMode === "group" && (
              <div className="mt-5 rounded-[30px] border border-violet-100 bg-[linear-gradient(135deg,rgba(250,245,255,0.92),rgba(255,255,255,0.96),rgba(236,254,255,0.92))] p-5 shadow-[0_16px_36px_rgba(139,92,246,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Choose 2 to 3 classes</div>
                    <div className="mt-1 text-xs text-slate-500">Select up to three classes for a shared group plan.</div>
                  </div>
                  <div className="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-xs font-semibold text-violet-700 shadow-sm">
                    {scopeGroupIds.length}/3 selected
                  </div>
                </div>

                <div className="mt-4 grid max-h-[420px] gap-4 overflow-auto pr-1 sm:grid-cols-2">
                  {classes.map((item) => {
                    const visual = tileVisualForClass(item);
                    const checked = scopeGroupIds.includes(item.id);
                    const disableNewSelection = !checked && scopeGroupIds.length >= 3;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={disableNewSelection}
                        onClick={() => {
                          if (checked) {
                            setScopeGroupIds((prev) => prev.filter((id) => id !== item.id));
                            return;
                          }
                          if (scopeGroupIds.length >= 3) return;
                          setScopeGroupIds((prev) => [...prev, item.id]);
                        }}
                        className={[
                          "relative min-h-[132px] rounded-[28px] border-[4px] border-black p-4 text-left shadow-[0_5px_0_rgba(15,23,42,0.14)] transition-all duration-200",
                          visual.bg,
                          visual.text,
                          checked
                            ? `-translate-y-[2px] ring-4 ring-white/70 ${visual.ring} shadow-[0_16px_28px_rgba(15,23,42,0.20)]`
                            : "hover:-translate-y-[1px] hover:shadow-[0_12px_22px_rgba(15,23,42,0.18)]",
                          disableNewSelection ? "cursor-not-allowed opacity-50" : "",
                        ].join(" ")}
                      >
                        <div className="absolute right-4 top-4">
                          <div className="grid h-9 w-9 place-items-center rounded-2xl border border-white/65 bg-white/15 text-sm font-black backdrop-blur-sm">
                            {checked ? "✓" : disableNewSelection ? "!" : "+"}
                          </div>
                        </div>

                        <div className="pr-10">
                          <div className="text-xl font-extrabold tracking-tight leading-tight" style={{ textShadow: "0 3px 6px rgba(0,0,0,0.28)" }}>
                            {item.name}
                          </div>
                          <div className="mt-2 text-sm font-semibold opacity-95">{item.subject}</div>
                        </div>

                        <div className="mt-5 inline-flex rounded-full border border-white/65 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] backdrop-blur-sm">
                          {checked ? "In group" : "Add to group"}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-bold text-slate-700">Group name (optional)</label>
                  <input value={scopeGroupName} onChange={(e) => setScopeGroupName(e.target.value)} placeholder="e.g. 3rd Year Science Common Plan" className="w-full rounded-2xl border-2 border-white/80 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-violet-300 focus:outline-none" />
                </div>
              </div>
            )}

            {scopeMode === "general" && (
              <div className="mt-4 text-sm text-slate-600">
                General will use the shared repository rather than a class-specific workspace.
              </div>
            )}

            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/80 bg-white/85 px-4 py-4 backdrop-blur sm:px-5 md:px-6">
              <div className="text-xs text-slate-500">{loadingClasses ? "Loading classes…" : `${classes.length} classes available`}</div>
              <div className="flex items-center gap-2">
                <button type="button" className={btn} onClick={() => setScopeOpen(false)}>
                  Cancel
                </button>
                <button type="button" className={btnPrimary} onClick={confirmScope}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
