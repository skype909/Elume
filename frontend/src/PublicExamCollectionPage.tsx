import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, FileText, Folder } from "lucide-react";

type PublicPaper = { id: string; title: string; cycle: string; level: string; topic: string; topic_id: string; duration: string; marks: string; badge?: string; download_filename: string };
type PublicTopic = { id: string; title: string; published_paper_count: number };
type PublicCollection = { id: string; title: string; description: string; topics: PublicTopic[]; items: PublicPaper[] };
const collectionId = "mr-fitz-maths-mini-papers";

function useCollection() {
  const [collection, setCollection] = useState<PublicCollection | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public-exam-collections/${collectionId}`, { credentials: "omit" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => { if (!cancelled) setCollection(result); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  return { collection, error };
}

function Crumbs({ topic }: { topic?: string }) {
  return <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm font-bold text-slate-600"><a href="/#/student/exam-papers" className="rounded-lg px-2 py-1 hover:bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">Exam Papers</a><ChevronRight aria-hidden="true" size={16} /><a href={`/#/student/exam-papers/${collectionId}`} className="rounded-lg px-2 py-1 hover:bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">Mr Fitz Maths Mini Papers</a>{topic ? <><ChevronRight aria-hidden="true" size={16} /><span className="px-2 py-1 text-slate-900">{topic}</span></> : null}</nav>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 sm:px-6"><div className="mx-auto max-w-4xl">{children}</div></main>; }

export default function PublicExamCollectionPage() {
  const { collection, error } = useCollection();
  return <Shell><Crumbs />{error ? <div className="rounded-2xl bg-red-50 p-5 font-bold text-red-800">This collection is unavailable right now. Please try again later.</div> : !collection ? <div className="rounded-2xl bg-white p-6 text-slate-600">Loading collection...</div> : <section className="rounded-[32px] border border-teal-100 bg-white p-6 shadow-xl shadow-teal-100/50 sm:p-8"><div className="inline-flex rounded-2xl bg-teal-100 p-3 text-teal-800"><FileText size={28} /></div><p className="mt-4 text-sm font-black uppercase tracking-wide text-teal-700">Original practice material</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{collection.title}</h1><div className="mt-6 space-y-3">{collection.topics.map((topic) => <a key={topic.id} href={`/#/student/exam-papers/${collectionId}/${topic.id}`} className="flex min-h-[92px] items-center justify-between gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-teal-300 hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-teal-200"><span className="flex items-center gap-4"><span className="rounded-xl bg-teal-100 p-3 text-teal-700"><Folder aria-hidden="true" size={24} /></span><span><span className="block text-lg font-black">{topic.title}</span><span className="mt-1 block text-sm text-slate-600">{topic.published_paper_count} published {topic.published_paper_count === 1 ? "paper" : "papers"}</span></span></span><ChevronRight aria-hidden="true" size={22} /></a>)}</div></section>}</Shell>;
}

export function PublicExamTopicPage({ topicId }: { topicId: string }) {
  const { collection, error } = useCollection();
  const topic = useMemo(() => collection?.topics.find((candidate) => candidate.id === topicId), [collection, topicId]);
  const papers = useMemo(() => collection?.items.filter((paper) => paper.topic_id === topicId) || [], [collection, topicId]);
  return <Shell><Crumbs topic={topic?.title || "Topic"} />{error || (collection && !topic) ? <div className="rounded-2xl bg-red-50 p-5 font-bold text-red-800">This topic is unavailable right now.</div> : !collection ? <div className="rounded-2xl bg-white p-6 text-slate-600">Loading papers...</div> : <section className="rounded-[32px] border border-teal-100 bg-white p-6 shadow-xl shadow-teal-100/50 sm:p-8"><h1 className="text-3xl font-black tracking-tight">{topic?.title}</h1><p className="mt-2 text-slate-600">Original practice papers from Mr Fitz Maths.</p><div className="mt-6 space-y-3">{papers.map((paper) => <article key={paper.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-black">{paper.title}</h2>{paper.badge ? <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">{paper.badge}</span> : null}</div><p className="mt-2 text-sm text-slate-600">{paper.cycle} | {paper.level} | {paper.topic} | {paper.duration} | {paper.marks}</p></div><a download={paper.download_filename} href={`/api/public-exam-collections/${collectionId}/items/${paper.id}/download`} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white focus:outline-none focus:ring-4 focus:ring-teal-200"><ArrowDownToLine aria-hidden="true" size={18} /> Open / download</a></article>)}</div></section>}</Shell>;
}
