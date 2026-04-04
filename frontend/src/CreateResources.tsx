import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "./api";

type ClassItem = { id: number; name: string; subject: string; color?: string | null };
type BrandingChoice = "none" | "elume" | "school";

type ScopeMode = "general" | "single" | "group";
type CreateResourcesLocationState = { classId?: number };

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

type SavedGeneratedResource = {
  id: string;
  kind: "lesson_plan" | "worksheet";
  title: string;
  content: string;
  createdAt: string;
  destinationFolder: "Lesson Plans" | "Worksheets";
  scopeLabel: string;
  savedFrom: "create_resources";
};

type DocumentBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "hr" }
  | { type: "spacer" };

type IdeaPreviewBlock = {
  id: string;
  heading: string;
  sections: Array<{ heading: string; lines: string[] }>;
};

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

type OutputTileStyle = {
  shell: string;
  active: string;
  inactive: string;
  badge: string;
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

function generatedResourcesStorageKey(classId: number) {
  return `elume:generated-resources:class:${classId}`;
}

function readGeneratedResourcesForClass(classId: number) {
  try {
    const raw = localStorage.getItem(generatedResourcesStorageKey(classId));
    if (!raw) return [] as SavedGeneratedResource[];
    const parsed = JSON.parse(raw) as SavedGeneratedResource[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as SavedGeneratedResource[];
  }
}

function saveGeneratedResourcesForClass(classId: number, items: SavedGeneratedResource[]) {
  try {
    localStorage.setItem(generatedResourcesStorageKey(classId), JSON.stringify(items));
  } catch {}
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

const META_SEPARATOR = " | ";

const OUTPUT_TILE_STYLES: Record<OutputKind, OutputTileStyle> = {
  ideas: {
    shell: "from-emerald-500 via-emerald-500 to-teal-500",
    active: "border-slate-950 ring-4 ring-emerald-200/80 shadow-[0_22px_40px_rgba(16,185,129,0.28)]",
    inactive: "border-emerald-700/80 shadow-[0_14px_28px_rgba(16,185,129,0.18)] hover:-translate-y-[1px] hover:border-emerald-900 hover:shadow-[0_18px_32px_rgba(16,185,129,0.24)]",
    badge: "border-white/35 bg-white/16 text-white",
  },
  lesson_plan: {
    shell: "from-blue-500 via-sky-500 to-indigo-500",
    active: "border-slate-950 ring-4 ring-sky-200/80 shadow-[0_22px_40px_rgba(59,130,246,0.28)]",
    inactive: "border-blue-700/80 shadow-[0_14px_28px_rgba(59,130,246,0.18)] hover:-translate-y-[1px] hover:border-indigo-900 hover:shadow-[0_18px_32px_rgba(59,130,246,0.24)]",
    badge: "border-white/35 bg-white/16 text-white",
  },
  worksheet: {
    shell: "from-violet-500 via-violet-500 to-fuchsia-500",
    active: "border-slate-950 ring-4 ring-violet-200/80 shadow-[0_22px_40px_rgba(139,92,246,0.28)]",
    inactive: "border-violet-700/80 shadow-[0_14px_28px_rgba(139,92,246,0.18)] hover:-translate-y-[1px] hover:border-fuchsia-900 hover:shadow-[0_18px_32px_rgba(139,92,246,0.24)]",
    badge: "border-white/35 bg-white/16 text-white",
  },
  scheme: {
    shell: "from-orange-500 via-orange-500 to-amber-400",
    active: "border-slate-950 ring-4 ring-amber-200/80 shadow-[0_22px_40px_rgba(249,115,22,0.28)]",
    inactive: "border-orange-700/80 shadow-[0_14px_28px_rgba(249,115,22,0.18)] hover:-translate-y-[1px] hover:border-amber-900 hover:shadow-[0_18px_32px_rgba(249,115,22,0.24)]",
    badge: "border-white/35 bg-white/18 text-white",
  },
  dept_plan: {
    shell: "from-cyan-500 via-cyan-500 to-teal-500",
    active: "border-slate-950 ring-4 ring-cyan-200/80 shadow-[0_22px_40px_rgba(6,182,212,0.28)]",
    inactive: "border-cyan-700/80 shadow-[0_14px_28px_rgba(6,182,212,0.18)] hover:-translate-y-[1px] hover:border-teal-900 hover:shadow-[0_18px_32px_rgba(6,182,212,0.24)]",
    badge: "border-white/35 bg-white/16 text-white",
  },
};

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

function normaliseIdeaSectionHeading(text: string) {
  const key = (text || "").trim().toLowerCase();
  if (!key) return "";
  if (key === "title") return "Title";
  if (key === "the hook" || key === "hook") return "The Hook";
  if (key === "the task" || key === "task") return "The Task";
  if (key.includes("board") || key.includes("collaboration")) return "Board / Collaboration integration";
  if (key === "why it works" || key === "key discussion angle") return "Why it works";
  return text.trim();
}

function parseIdeaPreviewBlocks(text: string): IdeaPreviewBlock[] {
  const lines = printableBodyText(text).split("\n");
  const ideas: IdeaPreviewBlock[] = [];
  let currentIdea: IdeaPreviewBlock | null = null;
  let currentSection: { heading: string; lines: string[] } | null = null;
  let ideaIndex = 0;

  const pushSection = () => {
    if (!currentIdea || !currentSection) return;
    if (currentSection.lines.length) currentIdea.sections.push(currentSection);
    currentSection = null;
  };

  const pushIdea = () => {
    if (!currentIdea) return;
    pushSection();
    if (currentIdea.sections.length) ideas.push(currentIdea);
    currentIdea = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const headingMatch = line.match(/^(?:##\s*)?(Idea\s*[1-3]\s*:\s*.+)$/i);
    if (headingMatch) {
      pushIdea();
      ideaIndex += 1;
      currentIdea = { id: `idea_${ideaIndex}`, heading: headingMatch[1].trim(), sections: [] };
      continue;
    }
    if (!currentIdea) continue;
    if (line.startsWith("### ")) {
      pushSection();
      currentSection = { heading: normaliseIdeaSectionHeading(line.replace(/^###\s*/, "").trim()), lines: [] };
      continue;
    }

    const cleanLine = line.replace(/^[-*]\s*/, "").trim();
    const labelledLineMatch = cleanLine.match(/^(Title|The Hook|Hook|The Task|Task|Board\s*\/\s*Collaboration integration|Board integration|Collaboration integration|Why it works|Key discussion angle)\s*:\s*(.+)$/i);
    if (labelledLineMatch) {
      pushSection();
      currentSection = {
        heading: normaliseIdeaSectionHeading(labelledLineMatch[1]),
        lines: [labelledLineMatch[2].trim()],
      };
      continue;
    }

    if (!currentSection) {
      currentSection = { heading: "Body", lines: [] };
    }
    if (cleanLine) currentSection.lines.push(cleanLine);
  }

  pushIdea();
  return ideas;
}

function toSecondPersonTimelineText(text: string) {
  let next = (text || "").trim();
  if (!next) return "";
  next = next.replace(/^Ask students to\b/i, "You will");
  next = next.replace(/^Invite students to\b/i, "You will");
  next = next.replace(/^Have students\b/i, "You will");
  next = next.replace(/^Students will\b/i, "You will");
  next = next.replace(/^Students\b/i, "You");
  next = next.replace(/^Student groups\b/i, "You will work in groups");
  next = next.replace(/^Begin with\b/i, "You will begin with");
  next = next.replace(/^Open with\b/i, "You will begin with");
  next = next.replace(/^Give students\b/i, "You will receive");
  next = next.replace(/^Use the built-in Elume Collaborative Board to\b/i, "You will use the Elume Collaborative Board to");
  next = next.replace(/^Use the Elume Collaborative Board to\b/i, "You will use the Elume Collaborative Board to");
  next = next.replace(/\bstudents will\b/gi, "you will");
  next = next.replace(/\bask students to\b/gi, "you will");
  next = next.replace(/\binvite students to\b/gi, "you will");
  next = next.replace(/\bhave students\b/gi, "you will");
  next = next.replace(/\bstudents\b/gi, "you");
  return next;
}

function ideaBlockToTimelinePost(idea: IdeaPreviewBlock) {
  const titleSection = idea.sections.find((section) => section.heading.toLowerCase() === "title");
  const hookSection = idea.sections.find((section) => section.heading.toLowerCase() === "the hook");
  const taskSection = idea.sections.find((section) => section.heading.toLowerCase() === "the task");
  const boardSection = idea.sections.find((section) => section.heading.toLowerCase().includes("board") || section.heading.toLowerCase().includes("collaboration"));
  const whySection = idea.sections.find((section) => section.heading.toLowerCase() === "why it works");

  const lines: string[] = [];
  const title = titleSection?.lines[0] || idea.heading;
  if (title) lines.push(title);

  for (const entry of hookSection?.lines || []) {
    lines.push(toSecondPersonTimelineText(entry));
  }
  for (const entry of taskSection?.lines || []) {
    lines.push(toSecondPersonTimelineText(entry));
  }
  for (const entry of boardSection?.lines || []) {
    lines.push(toSecondPersonTimelineText(entry));
  }
  if (whySection?.lines[0]) {
    lines.push(`Be ready to explain your thinking: ${toSecondPersonTimelineText(whySection.lines[0]).replace(/^You will\s+/i, "")}`);
  }

  return lines.filter(Boolean).join("\n\n");
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
  const location = useLocation();

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
      return current ? `${current.name}${META_SEPARATOR}${current.subject}` : "Selected class";
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
  const [worksheetIncludeAnswers, setWorksheetIncludeAnswers] = useState(false);
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
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [postingIdeaId, setPostingIdeaId] = useState<string | null>(null);
  const [ideaPostStatus, setIdeaPostStatus] = useState<string | null>(null);

  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const manualFileRef = useRef<HTMLInputElement | null>(null);

  const card = "rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] shadow-[0_22px_60px_rgba(15,23,42,0.10)] backdrop-blur";
  const soft = "rounded-[28px] border border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(240,253,250,0.88),rgba(245,243,255,0.88))] shadow-[0_12px_32px_rgba(15,23,42,0.06)]";
  const btn = "rounded-2xl border-2 border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary = "rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:translate-y-[1px] disabled:opacity-50";
  const chipBase = "rounded-full border-2 px-4 py-2 text-sm font-semibold transition";
  const teacherProfile = useMemo(() => loadTeacherAdminProfile(), []);
  const teacherNameShort = useMemo(() => teacherDisplayNameShort(teacherProfile), [teacherProfile]);
  const teacherSchoolName = useMemo(() => String(teacherProfile?.schoolName ?? "").trim(), [teacherProfile]);
  const hasSchoolLogoOption = useMemo(() => Boolean(teacherProfile?.schoolBranding?.logoDataUrl), [teacherProfile]);
  const destinationOptions = useMemo(() => destinationOptionsForOutput(outputKind), [outputKind]);
  const sourceOptions = useMemo(() => sourceOptionsForOutput(outputKind), [outputKind]);
  const previewIdeas = useMemo(() => (preview?.kind === "ideas" ? parseIdeaPreviewBlocks(preview.content) : []), [preview]);
  const canPostIdeasToTimeline = useMemo(() => preview?.kind === "ideas" && scope.mode === "single" && Boolean(scope.classId), [preview, scope]);
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
    const incomingClassId = Number((location.state as CreateResourcesLocationState | null)?.classId);
    if (!Number.isFinite(incomingClassId) || !classById.has(incomingClassId)) return;

    const nextScope: Scope = { mode: "single", classId: incomingClassId };
    setScope(nextScope);
    setScopeMode("single");
    setScopeClassId(incomingClassId);
    setScopeGroupIds([incomingClassId]);
    setScopeGroupName("");
    setScopeOpen(false);
    try {
      localStorage.setItem(scopeStoreKey, JSON.stringify(nextScope));
    } catch {}
  }, [classById, location.state, scopeStoreKey]);

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
        `# 3 Ideas`,
        ``,
        `## Idea 1: Thought-provoking question`,
        `### Title`,
        `- Big question on ${teacherPrompt || "the topic"}`,
        ``,
        `### The Hook`,
        `- Open with a question that could divide opinion or invite more than one valid interpretation.`,
        ``,
        `### The Task`,
        `- Students answer individually first, then compare responses in pairs or small groups before a short whole-class share-out.`,
        ``,
        `### Why it works`,
        `- It surfaces prior thinking quickly and gives the teacher a strong discussion starting point.`,
        ``,
        `## Idea 2: Thought-provoking activity`,
        `### Title`,
        `- Short activity based on ${teacherPrompt || "the topic"}`,
        ``,
        `### The Hook`,
        `- Give students a prompt, example, statement, or stimulus that needs interpretation, sorting, or decision-making.`,
        ``,
        `### The Task`,
        `- Students complete a short activity individually or in groups, then justify their thinking to the class.`,
        ``,
        `### Why it works`,
        `- It creates visible thinking, discussion, and a clear reason for students to explain their choices.`,
        ``,
        `## Idea 3: Collaborative Board session`,
        `### Title`,
        `- Collaborative Board challenge on ${teacherPrompt || "the topic"}`,
        ``,
        `### The Hook`,
        `- Open the Elume Collaborative Board with a focused prompt that invites multiple responses or viewpoints.`,
        ``,
        `### The Task`,
        `- Students post ideas, examples, or arguments to the board, then group, compare, or challenge the responses together.`,
        ``,
        `### Board / Collaboration integration`,
        `- Use the built-in Elume Collaborative Board to collect, sort, and discuss student contributions live.`,
        ``,
        `### Why it works`,
        `- It makes every student contribution visible and gives the class a shared space for live discussion.`,
      ].join("\n");
    }

    if (kind === "lesson_plan") {
      body = [
        `# Lesson Plan: ${teacherPrompt || "Lesson topic"}`,
        ``,
        `Subject | ${level} | 60 Minutes`,
        ``,
        `## Learning Overview`,
        `- Topic: ${teacherPrompt || "Lesson topic"}`,
        ``,
        `## Learning Intentions`,
        `- We are learning to explain the key process or concept in ${teacherPrompt || "this topic"} using accurate subject language.`,
        `- We are learning to connect today’s learning to examples, terms, or steps from the class materials.`,
        `- We are learning to apply the learning in a short task and respond clearly to teacher questioning.`,
        ``,
        `## Success Criteria`,
        `- I can explain the main idea using the correct keywords.`,
        `- I can complete the class task accurately and support my answer with evidence from the lesson.`,
        `- I can answer a short question or exit task clearly in my own words.`,
        ``,
        `## Lesson Flow`,
        `### Starter (5 Minutes)`,
        `- Open with a short retrieval question linked to prior learning and use the responses to surface misconceptions quickly.`,
        `### Teaching and Development (35 Minutes)`,
        `- Introduce the key content in small steps, model one example clearly, and use targeted questioning to check understanding as you go.`,
        `### Activity and Application (20 Minutes)`,
        `- Students complete a focused task based on today’s content while the teacher circulates, prompts, and gives short live feedback.`,
        `### Plenary and Closure (5 Minutes)`,
        `- End with a short review question, exit prompt, or mini-check that confirms what students can now explain or do.`,
        ``,
        `## Resources`,
        `- Whiteboard, class notes, teacher slides, and any source material used in the lesson.`,
        ``,
        `## Differentiation`,
        `- Support: Use prompts, guided questioning, and one worked example before independent work.`,
        `- Extension: Add a deeper application question or require students to justify an answer in more detail.`,
        ``,
        `## Assessment`,
        `- Use questioning, circulation, and the completed task or exit response to check understanding during the lesson.`,
        ``,
        `## Suggested Homework`,
        `- Set one short follow-up task that reinforces the key vocabulary, process, or explanation from the lesson.`,
        ``,
        `## Reflection`,
        `- What worked well in the lesson and what needs adjusting next time?`,
      ].join("\n");
    }

    if (kind === "worksheet") {
      body = [
        `# Worksheet: ${teacherPrompt || "Worksheet Title"}`,
        ``,
        `Student Name: ________________________________`,
        `Class: ________________________________`,
        `Date: ________________________________`,
        ``,
        `## Instructions`,
        `- Read each task carefully and answer in clear subject-specific language.`,
        `- Complete each question in order and show your working where needed.`,
        ``,
        `## Task 1`,
        `- Short response on ${teacherPrompt || "the topic"} to check core understanding.`,
        ``,
        `## Task 2`,
        `- Apply the main idea in a short written question or worked example.`,
        ``,
        `## Task 3`,
        `- Explain, compare, or justify an answer using relevant subject vocabulary.`,
        ``,
        `## Extension Challenge`,
        `- Optional challenge: extend your answer with a deeper example, explanation, or comparison.`,
        ``,
        worksheetIncludeAnswers
          ? `## Answer Key\n- Provide concise model answers and brief marking guidance for each task.`
          : "",
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
      `ELume${META_SEPARATOR}${labelForOutput(kind)}`,
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
      title: `${kind === "lesson_plan" ? "Lesson Plan" : labelForOutput(kind)}${META_SEPARATOR}${teacherPrompt || "Untitled"}`.slice(0, 90),
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
    setSaveStatus(null);
    setIdeaPostStatus(null);

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
        lesson_plan_format:
          outputKind === "lesson_plan"
            ? "For lesson plans only: no tables, no raw markdown dump, and use a compact printable school-ready structure for Irish post-primary classrooms in British English. Title the resource as Lesson Plan: {topic/title}. Use one concise metadata line under the title in the form Subject | Level | Duration. Follow this exact section order: Learning Overview, Learning Intentions, Success Criteria, Lesson Flow, Starter, Teaching and Development, Activity and Application, Plenary and Closure, Resources, Differentiation, Assessment, Suggested Homework, Reflection. Keep Learning Overview topic-led and concise. Write Success Criteria as checklist-style 'I can...' statements. Keep lesson flow timed and practical. End with short reflection lines. If manual sources or uploaded files are attached, preserve their facts, vocabulary, framing, and sequence where possible and treat them as the primary grounding."
            : null,
        source_priority:
          outputKind === "lesson_plan" || outputKind === "worksheet"
            ? "If teacher-selected files or manual notes are attached, treat them as the primary truth. Preserve source facts, topic framing, vocabulary, and sequence where possible. Do not drift into generic content if usable source content exists."
            : null,
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
        `${labelForOutput(outputKind)}${META_SEPARATOR}${teacherPrompt}`.slice(0, 90);
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
    setSaveStatus(
      `Saved to ${displayLabelForBucket(preview.saveBucket)}${preview.saveFolder ? ` / ${preview.saveFolder}` : ""}`
    );

    if (
      scope.mode !== "single" ||
      !scope.classId ||
      (preview.kind !== "lesson_plan" && preview.kind !== "worksheet") ||
      preview.saveBucket !== "links" ||
      (preview.saveFolder !== "Lesson Plans" && preview.saveFolder !== "Worksheets") ||
      !preview.title.trim() ||
      !preview.content.trim()
    ) {
      return;
    }

    const nextItem: SavedGeneratedResource = {
      id: preview.id,
      kind: preview.kind,
      title: preview.title.trim(),
      content: preview.content,
      createdAt: preview.createdAt,
      destinationFolder: preview.saveFolder,
      scopeLabel: preview.scopeLabel,
      savedFrom: "create_resources",
    };

    const existing = readGeneratedResourcesForClass(scope.classId);
    if (existing.some((item) => item.id === nextItem.id)) return;
    saveGeneratedResourcesForClass(scope.classId, [nextItem, ...existing]);
  }

  async function postIdeaToClassTimeline(idea: IdeaPreviewBlock) {
    if (scope.mode !== "single" || !scope.classId) return;

    const postText = ideaBlockToTimelinePost(idea).trim();
    if (!postText) return;

    setPostingIdeaId(idea.id);
    setIdeaPostStatus(null);

    const fd = new FormData();
    fd.append("author", preview?.teacherDisplayNameShort || teacherNameShort);
    fd.append("content", postText);
    fd.append("links", JSON.stringify([]));

    try {
      await apiFetch(`/classes/${scope.classId}/posts`, {
        method: "POST",
        body: fd,
      });
      setIdeaPostStatus(`Posted "${idea.heading}" to the class timeline.`);
    } catch (e: any) {
      setIdeaPostStatus(e?.message || "Failed to post idea to class timeline.");
    } finally {
      setPostingIdeaId(null);
    }
  }

  async function exportPreviewDocx() {
    if (!preview) return;

    const body = {
      title: preview.title,
      content: preview.content,
      teacher: preview.teacherDisplayNameShort || teacherNameShort,
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
      `${level}${META_SEPARATOR}${detail}`,
      `${displayLabelForBucket(preview.saveBucket)}${preview.saveFolder ? ` / ${preview.saveFolder}` : ""}`,
      new Date(preview.createdAt).toLocaleString("en-IE"),
    ].join(META_SEPARATOR);

    const footer = `${preview.teacherDisplayNameShort || teacherNameShort}${
      preview.schoolName || teacherSchoolName ? `${META_SEPARATOR}${preview.schoolName || teacherSchoolName}` : ""
    }${META_SEPARATOR}${
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
      teacher: preview.teacherDisplayNameShort || teacherNameShort,
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(207,250,254,0.95),_rgba(236,253,245,0.96)_24%,_rgba(245,243,255,0.96)_56%,_#f8fafc_100%)]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-5">
        <div className="rounded-[36px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.88),rgba(236,254,255,0.88),rgba(245,243,255,0.88))] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                Elume Create Resources
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Create Resources</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="rounded-full border border-emerald-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.92))] px-3 py-1 shadow-sm">
                  Working on <span className="font-semibold text-slate-900">{scopeLabel}</span>
                </span>
                <span className="rounded-full border border-cyan-200/80 bg-[linear-gradient(135deg,rgba(236,254,255,0.95),rgba(245,243,255,0.90))] px-3 py-1 font-medium text-cyan-800 shadow-sm">
                  Prompt-first workflow
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => navigate("/")} className={btn}>
                {"<- Back"}
              </button>
              <button type="button" onClick={openScopeModal} className={btn}>
                Change class
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-5xl space-y-4">
          <section className={`${card} border-emerald-100/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,253,245,0.92),rgba(239,246,255,0.86))] p-4 md:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                  Step 1
                  <span className="text-[10px] text-emerald-600">Choose output</span>
                </div>
                <div className="mt-3 text-lg font-extrabold tracking-tight text-slate-900">Pick the format first</div>
                <div className="mt-1 text-sm text-slate-600">
                  Keep this fast. Select the output, then move straight into the prompt.
                </div>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                {labelForOutput(outputKind)} selected
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
              {([
                ["ideas", "3 Ideas", "Fast classroom use"],
                ["lesson_plan", "Lesson Plan", "Teacher-facing"],
                ["worksheet", "Worksheet", "Student-facing"],
                ["scheme", "Scheme of Work", "Sequenced planning"],
                ["dept_plan", "Department Plan", "Department-facing"],
              ] as Array<[OutputKind, string, string]>).map(([kind, title, shortLabel]) => {
                const active = outputKind === kind;
                const tileStyle = OUTPUT_TILE_STYLES[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setOutputKind(kind)}
                    className={[
                      "group flex min-h-[132px] flex-col rounded-[26px] border p-3 text-left transition duration-200",
                      "shadow-[0_10px_28px_rgba(15,23,42,0.06)]",
                      `bg-gradient-to-br ${tileStyle.shell}`,
                      active
                        ? `${tileStyle.active} -translate-y-[1px] shadow-[0_16px_34px_rgba(15,23,42,0.10)]`
                        : `${tileStyle.inactive} hover:-translate-y-[1px] hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]`,
                    ].join(" ")}
                    >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${tileStyle.badge}`}>
                        {active ? "Selected" : "Choose"}
                      </div>
                      {active && (
                        <div className="rounded-full border border-white/80 bg-slate-950/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                          Active
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex min-h-[56px] items-start text-[1.75rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-white [text-shadow:0_4px_12px_rgba(15,23,42,0.34)]">
                      {title}
                    </div>
                    <div className="mt-auto pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/78">
                      {shortLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${card} border-cyan-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,254,255,0.92),rgba(236,253,245,0.88),rgba(245,243,255,0.90))] p-4 md:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-sky-800 shadow-sm">
                  Step 2
                  <span className="text-[10px] text-sky-600">Prompt and settings</span>
                </div>
                <div className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">Ask for the resource in plain language</div>
                <div className="mt-1 text-sm text-slate-600">
                  The selected class, source folder, and optional manual sources shape what Elume creates.
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.78fr]">
                <div className="space-y-4">
                  <div className="rounded-[30px] border border-cyan-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,254,255,0.94),rgba(236,253,245,0.92))] p-4 shadow-[0_18px_38px_rgba(14,165,233,0.10)]">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-sm font-bold text-slate-700">Prompt</label>
                      <div className="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700 shadow-sm">
                        Main work surface
                      </div>
                    </div>
                    <textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={6}
                      className="w-full rounded-[28px] border-2 border-cyan-100 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                      placeholder={promptHint}
                    />
                  </div>

                  <div className="rounded-[30px] border border-sky-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.93),rgba(245,243,255,0.92))] p-4 shadow-[0_16px_34px_rgba(59,130,246,0.08)]">
                    <div className="grid gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/85 bg-white/88 p-3 shadow-sm">
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Level</label>
                          <select value={level} onChange={(e) => setLevel(e.target.value as PhaseLevel)} className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                            <option value="Junior Cycle">Junior Cycle</option>
                            <option value="Leaving Cert">Leaving Cert</option>
                            <option value="Common Level">Common Level</option>
                          </select>
                        </div>

                        <div className="rounded-2xl border border-white/85 bg-white/88 p-3 shadow-sm">
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Detail</label>
                          <select value={detail} onChange={(e) => setDetail(e.target.value as DetailLevel)} className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                            <option value="Concise">Concise</option>
                            <option value="Detailed">Detailed</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/85 bg-white/88 p-3 shadow-sm">
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
                        </div>

                        <div className="rounded-2xl border border-white/85 bg-white/88 p-3 shadow-sm">
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

                      <div className="rounded-2xl border border-white/85 bg-white/88 p-3 shadow-sm">
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
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="rounded-2xl border border-cyan-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,254,255,0.90))] px-4 py-3 text-sm text-slate-700 shadow-sm">
                      AI reads from <span className="font-semibold text-slate-900">{displayLabelForBucket(sourceBucket as SaveBucket)}{sourceFolder ? ` / ${sourceFolder}` : ""}</span> and saves to <span className="font-semibold text-slate-900">{saveDestinationLabel}</span>.
                    </div>
                    <div className="self-end rounded-2xl border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(236,254,255,0.88))] px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm">
                      Destination: {saveDestinationLabel}
                    </div>
                  </div>

                  {outputKind === "worksheet" && (
                    <div className="rounded-[24px] border border-violet-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,243,255,0.92),rgba(236,254,255,0.88))] p-4 shadow-[0_12px_28px_rgba(139,92,246,0.08)]">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Worksheet</label>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
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

                <div className="space-y-4">
                  <div className={`${soft} border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.86),rgba(236,254,255,0.70),rgba(255,255,255,0.94))] p-4`}>
                    <div className="text-sm font-extrabold text-slate-900">Printable branding</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Footer identity: {teacherNameShort}
                      {teacherSchoolName ? `${META_SEPARATOR}${teacherSchoolName}` : ""}
                    </div>
                    <div className="mt-4 space-y-3 rounded-2xl border border-white/80 bg-white/92 px-4 py-3 shadow-sm">
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

                  <div className={`${soft} border-cyan-100/80 bg-[linear-gradient(135deg,rgba(236,254,255,0.82),rgba(245,243,255,0.72),rgba(255,255,255,0.95))] p-4`}>
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
                      <div className="mt-4 rounded-[24px] border border-white/80 bg-white/92 p-4 shadow-sm">
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

                    <div className="mt-4 rounded-2xl border border-white/80 bg-white/92 px-3 py-2 text-sm text-slate-700 shadow-sm">
                      {manualSourceSummary.length === 0 ? "No manual sources added yet" : `${manualSourceSummary.length} manual source${manualSourceSummary.length === 1 ? "" : "s"} ready`}
                    </div>

                    <div className="mt-4 max-h-[340px] space-y-3 overflow-auto pr-1">
                      {uploadedManualFiles.map((item) => {
                        const ext = item.file.name.includes(".") ? item.file.name.split(".").pop()?.toUpperCase() : "FILE";
                        return (
                          <div key={item.id} className="rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-extrabold text-slate-900">{item.file.name}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Uploaded file{META_SEPARATOR}{ext || "FILE"}{META_SEPARATOR}{(item.file.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                              <button type="button" className="text-xs font-semibold text-slate-500 opacity-80 hover:opacity-100" onClick={() => removeUploadedFile(item.id)} title="Remove file">
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {sortedSources.map((source) => (
                        <div key={source.id} className="rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-extrabold text-slate-900">{source.title}</div>
                              <div className="mt-1 text-xs text-slate-500">Pasted note{META_SEPARATOR}{new Date(source.createdAt).toLocaleString("en-IE")}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" className="text-xs font-semibold text-slate-500 opacity-80 hover:opacity-100" onClick={() => togglePinSource(source.id)} title={source.pinned ? "Unpin" : "Pin"}>
                                {source.pinned ? "Pinned" : "Pin"}
                              </button>
                              <button type="button" className="text-xs font-semibold text-slate-500 opacity-80 hover:opacity-100" onClick={() => deleteSource(source.id)} title="Delete note">
                                Remove
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-cyan-50 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(236,254,255,0.82))] p-3 text-sm leading-relaxed text-slate-700">
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

            <section className={`${card} ${preview ? "border-violet-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.92),rgba(236,254,255,0.84))]" : "border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.96),rgba(241,245,249,0.92))]"} p-4 md:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] shadow-sm ${preview ? "border-violet-200 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700"}`}>
                    Step 3
                    <span className={`text-[10px] ${preview ? "text-violet-600" : "text-slate-500"}`}>Preview and export</span>
                  </div>
                  <div className="mt-3 text-lg font-extrabold tracking-tight text-slate-900">Preview before you save or export</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn} onClick={() => { setPrompt(""); setAiErr(null); setPreview(null); setSaveStatus(null); }}>
                  Clear
                </button>
                  <button type="button" className={btnPrimary} onClick={runGenerate} disabled={aiBusy || !prompt.trim()}>
                    {aiBusy ? "Generating..." : `Generate ${labelForOutput(outputKind)}`}
                  </button>
                </div>
              </div>

              {aiErr && (
                <div className="mt-4 rounded-[24px] border-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {aiErr}
                </div>
              )}

              {!preview && (
                <div className="mt-4 rounded-[28px] border border-slate-200 bg-white/80 p-5 text-sm leading-relaxed text-slate-600 shadow-sm">
                  Generate a draft to preview it here. The intent is simple: Irish post-primary context first, selected class and folder next, optional manual sources after that, then save the finished resource to the right class location.
                </div>
              )}

              {preview && (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-[28px] border border-white/80 bg-white/92 p-4 shadow-sm">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-extrabold tracking-tight text-slate-900">{preview.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{new Date(preview.createdAt).toLocaleString("en-IE")}</span>
                        <span>{META_SEPARATOR}</span>
                        <span>{preview.scopeLabel}</span>
                        <span>{META_SEPARATOR}</span>
                        <span>{preview.manualSources.length} manual source{preview.manualSources.length === 1 ? "" : "s"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={btn} onClick={() => navigator.clipboard.writeText(preview.content).catch(() => {})}>
                        Copy
                      </button>
                      <button type="button" className={btnPrimary} onClick={savePreview}>
                        Save
                      </button>
                      <button type="button" className={btn} onClick={exportPreviewPdfFile}>
                        Export PDF
                      </button>
                      <button type="button" className={btn} onClick={exportPreviewDocx}>
                        Export DOCX
                      </button>
                    </div>
                  </div>

                  {saveStatus && (
                    <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      {saveStatus}
                    </div>
                  )}

                  {preview.kind === "ideas" && (
                    <div className="space-y-3">
                      <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                        <div className="text-sm font-extrabold text-slate-900">Post Individual Ideas</div>
                        <div className="mt-1 text-xs text-slate-600">
                          Post one idea at a time to the class timeline in direct classroom language.
                        </div>
                        {!canPostIdeasToTimeline && (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Posting is available only when working from a single selected class.
                          </div>
                        )}
                        {ideaPostStatus && (
                          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            {ideaPostStatus}
                          </div>
                        )}
                      </div>

                      {previewIdeas.length > 0 ? (
                        <div className="grid gap-3 lg:grid-cols-3">
                          {previewIdeas.map((idea) => {
                            const title = idea.sections.find((section) => section.heading.toLowerCase() === "title")?.lines[0] || idea.heading;
                            const task = idea.sections.find((section) => section.heading.toLowerCase() === "the task")?.lines[0] || "";
                            return (
                              <div key={idea.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-sm font-extrabold text-slate-900">{idea.heading}</div>
                                <div className="mt-2 text-sm font-semibold text-slate-800">{title}</div>
                                {task && <div className="mt-2 text-sm leading-relaxed text-slate-600">{task}</div>}
                                <div className="mt-4">
                                  <button
                                    type="button"
                                    className={btn}
                                    onClick={() => postIdeaToClassTimeline(idea)}
                                    disabled={!canPostIdeasToTimeline || postingIdeaId === idea.id}
                                  >
                                    {postingIdeaId === idea.id ? "Posting..." : "Post to class timeline"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Could not split this draft into individual idea cards yet.
                        </div>
                      )}
                    </div>
                  )}

                  <RenderDoc
                    text={preview.content}
                    title={preview.title}
                    subtitle={[
                      preview.scopeLabel,
                      `${level}${META_SEPARATOR}${detail}`,
                      `${displayLabelForBucket(preview.saveBucket)}${preview.saveFolder ? ` / ${preview.saveFolder}` : ""}`,
                      new Date(preview.createdAt).toLocaleString("en-IE"),
                    ].join(META_SEPARATOR)}
                    footer={`${preview.teacherDisplayNameShort || teacherNameShort}${
                      preview.schoolName || teacherSchoolName ? `${META_SEPARATOR}${preview.schoolName || teacherSchoolName}` : ""
                    }${META_SEPARATOR}${
                      preview.brandingChoice === "none"
                        ? "No branding"
                        : preview.brandingChoice === "school" && hasSchoolLogoOption
                          ? "School logo"
                          : "Elume logo"
                    }`}
                  />

                  <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                    Footer for print/export: {preview.teacherDisplayNameShort || teacherNameShort}
                    {preview.schoolName || teacherSchoolName ? `${META_SEPARATOR}${preview.schoolName || teacherSchoolName}` : ""}
                    {`${META_SEPARATOR}${
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

        <div className="mt-8 text-xs text-slate-500">(c) 2026 Elume Beta. P Fitzgerald</div>
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

            <div className="mt-5 rounded-[32px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.78),rgba(236,254,255,0.82),rgba(245,243,255,0.80))] p-4 shadow-[0_16px_40px_rgba(16,185,129,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Step 1</div>
                  <div className="mt-1 text-lg font-extrabold text-slate-900">Available classes</div>
                </div>
                <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {loadingClasses ? "Loading..." : `${classes.length} ready`}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {classes.map((item) => {
                  const visual = tileVisualForClass(item);
                  const active = scopeClassId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScopeClassId(item.id)}
                      className={[
                        "group relative min-h-[116px] rounded-[30px] border-[4px] border-black px-4 py-3.5 text-left shadow-[0_6px_0_rgba(15,23,42,0.16)] transition-all duration-200",
                        visual.bg,
                        visual.text,
                        active
                          ? `-translate-y-[2px] ring-4 ring-white/70 ${visual.ring} shadow-[0_18px_34px_rgba(15,23,42,0.20)]`
                          : "hover:-translate-y-[2px] hover:shadow-[0_14px_26px_rgba(15,23,42,0.18)]",
                      ].join(" ")}
                    >
                      <div className="absolute right-3 top-3">
                        <div
                          className={[
                            "rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] backdrop-blur-sm",
                            active
                              ? "border-white/80 bg-white text-slate-900 shadow-sm"
                              : "border-white/65 bg-white/15 text-white",
                          ].join(" ")}
                        >
                          {active ? "Selected" : "Choose"}
                        </div>
                      </div>

                      <div className="pr-24">
                        <div className="text-xl font-extrabold tracking-tight leading-tight" style={{ textShadow: "0 3px 6px rgba(0,0,0,0.28)" }}>
                          {item.name}
                        </div>
                        <div className="mt-1.5 text-sm font-semibold opacity-95">{item.subject}</div>
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
                <div className="mt-3 text-sm text-slate-700">
                  Selected class: <span className="font-semibold text-slate-900">{classById.get(scopeClassId)?.name || "Choose a class"}</span>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[32px] border border-cyan-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,246,255,0.96),rgba(245,243,255,0.96))] p-4 shadow-[0_16px_40px_rgba(14,165,233,0.08)]">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Step 2</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">How do you want to work?</div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
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
                        "rounded-[28px] border-2 p-3.5 text-left transition",
                        `bg-gradient-to-br ${gradient}`,
                        active
                          ? "border-slate-900 shadow-[0_16px_36px_rgba(15,23,42,0.14)] ring-2 ring-slate-200"
                          : `${border} shadow-sm hover:-translate-y-[1px] hover:shadow-md`,
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-extrabold text-slate-900">{title}</div>
                          <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</div>
                        </div>
                        <div
                          className={[
                            "mt-0.5 grid h-8 w-8 place-items-center rounded-full border text-xs font-black",
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-white/80 bg-white/90 text-slate-500",
                          ].join(" ")}
                        >
                          {active ? "OK" : ""}
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
                          {checked ? "OK" : disableNewSelection ? "!" : "+"}
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
              <div className="text-xs text-slate-500">{loadingClasses ? "Loading classes..." : `${classes.length} classes available`}</div>
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

