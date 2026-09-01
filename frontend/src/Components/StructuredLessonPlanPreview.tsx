import React from "react";

type Definition = { term: string; definition: string };
type LessonFlowItem = { minutes: string; phase: string; teacher_action: string; student_action: string; check_for_understanding?: string | null };

export type LessonPlanBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet_list"; title: string; items: string[] }
  | { type: "info_panel"; label: string; text?: string; definitions?: Definition[] }
  | { type: "timeline"; title: string; items: LessonFlowItem[] }
  | { type: "teacher_note"; title: string; text: string }
  | { type: "student_task"; title: string; items: string[] }
  | { type: "assessment_checkpoint"; title: string; items: string[] }
  | { type: "callout"; tone?: "warning" | "info"; title: string; text?: string; items?: string[] }
  | { type: "homework"; title: string; text: string }
  | { type: "page_break" };

export type StructuredLessonPlanDocument = {
  schema_version: 1;
  resource_type: "lesson_plan";
  title: string;
  subject?: string | null;
  level?: string | null;
  class_context?: string | null;
  duration?: string | null;
  primary_outcome: string;
  blocks: LessonPlanBlock[];
};

export function isStructuredLessonPlanDocument(value: unknown): value is StructuredLessonPlanDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<StructuredLessonPlanDocument>;
  return document.schema_version === 1 && document.resource_type === "lesson_plan" && typeof document.title === "string" && Array.isArray(document.blocks);
}

function List({ items }: { items: string[] }) {
  return <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 border-b border-slate-200 pb-2 text-sm font-black uppercase tracking-[0.14em] text-slate-700">{children}</h2>;
}

export default function StructuredLessonPlanPreview({ document, footer }: { document: StructuredLessonPlanDocument; footer: string }) {
  const metadata = [document.subject, document.level, document.class_context, document.duration].filter(Boolean);
  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <header className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f4fbf9)] px-6 py-6 sm:px-8">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Elume lesson plan</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{document.title}</h1>
        {metadata.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{metadata.map((item) => <span key={item} className="rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-semibold text-slate-600">{item}</span>)}</div>}
      </header>
      <div className="px-6 py-6 sm:px-8 sm:py-7">
        {document.blocks.map((block, index) => {
          if (block.type === "page_break") return <div key={index} className="my-8 border-t border-dashed border-slate-300" />;
          if (block.type === "heading") return <SectionTitle key={index}>{block.text}</SectionTitle>;
          if (block.type === "paragraph") return <p key={index} className="mt-3 text-sm leading-7 text-slate-700">{block.text}</p>;
          if (block.type === "bullet_list") return <section key={index}><SectionTitle>{block.title}</SectionTitle><List items={block.items} /></section>;
          if (block.type === "info_panel") return <section key={index} className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5"><div className="text-xs font-black uppercase tracking-[0.13em] text-emerald-800">{block.label}</div>{block.text && <p className="mt-2 text-sm leading-7 text-slate-800">{block.text}</p>}{block.definitions && <div className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-100 bg-white/80">{block.definitions.map((definition) => <div key={definition.term} className="grid gap-1 px-3 py-3 sm:grid-cols-[10rem_1fr] sm:gap-3"><dt className="text-sm font-bold text-slate-800">{definition.term}</dt><dd className="text-sm leading-6 text-slate-700">{definition.definition}</dd></div>)}</div>}</section>;
          if (block.type === "timeline") return <section key={index}><SectionTitle>{block.title}</SectionTitle><div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">{block.items.map((item, itemIndex) => <div key={`${item.phase}-${itemIndex}`} className="grid gap-3 px-4 py-4 sm:grid-cols-[5.5rem_1fr]"><div className="text-xs font-black uppercase tracking-wide text-teal-700">{item.minutes}</div><div><h3 className="text-sm font-extrabold text-slate-900">{item.phase}</h3><dl className="mt-2 grid gap-2 text-sm leading-6 text-slate-700"><div><dt className="inline font-bold text-slate-800">Teacher: </dt><dd className="inline">{item.teacher_action}</dd></div><div><dt className="inline font-bold text-slate-800">Students: </dt><dd className="inline">{item.student_action}</dd></div>{item.check_for_understanding && <div className="rounded-lg bg-cyan-50 px-3 py-2 text-cyan-950"><dt className="inline font-bold">Check: </dt><dd className="inline">{item.check_for_understanding}</dd></div>}</dl></div></div>)}</div></section>;
          if (block.type === "teacher_note") return <section key={index} className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-4"><h2 className="text-sm font-extrabold text-violet-950">{block.title}</h2><p className="mt-2 text-sm leading-7 text-slate-700">{block.text}</p></section>;
          if (block.type === "student_task") return <section key={index} className="mt-6 rounded-2xl border border-teal-200 bg-teal-50/60 p-4"><h2 className="text-sm font-extrabold text-teal-950">{block.title}</h2><List items={block.items} /></section>;
          if (block.type === "assessment_checkpoint") return <section key={index} className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4"><h2 className="text-sm font-extrabold text-cyan-950">{block.title}</h2><List items={block.items} /></section>;
          if (block.type === "homework") return <section key={index} className="mt-6 rounded-2xl border border-slate-300 bg-slate-50 p-4"><h2 className="text-sm font-extrabold text-slate-900">{block.title}</h2><p className="mt-2 text-sm leading-7 text-slate-700">{block.text}</p></section>;
          if (block.type === "callout") return <section key={index} className={`mt-6 rounded-2xl border p-4 ${block.tone === "warning" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50"}`}><h2 className="text-sm font-extrabold text-slate-900">{block.title}</h2>{block.text && <p className="mt-2 text-sm leading-7 text-slate-700">{block.text}</p>}{block.items && <List items={block.items} />}</section>;
          return null;
        })}
      </div>
      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500 sm:px-8">{footer}</footer>
    </article>
  );
}
