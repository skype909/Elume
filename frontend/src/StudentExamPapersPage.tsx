import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, ChevronLeft, SlidersHorizontal } from "lucide-react";

type PublicExamPaper = {
  id: string;
  cycle: string;
  subject: string;
  level: string;
  year: number | string;
  title: string;
  official_source_url: string;
  source: string;
};

const OFFICIAL_SEC_HOSTS = new Set(["examinations.ie", "www.examinations.ie"]);

function isOfficialSecUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && OFFICIAL_SEC_HOSTS.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function asPublicExamPaper(value: unknown): PublicExamPaper | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const textFields = ["id", "cycle", "subject", "level", "title", "source"] as const;
  if (textFields.some((field) => typeof item[field] !== "string" || !String(item[field]).trim())) return null;
  if ((typeof item.year !== "number" && typeof item.year !== "string") || !String(item.year).trim()) return null;
  if (!isOfficialSecUrl(item.official_source_url)) return null;
  return {
    id: String(item.id).trim(),
    cycle: String(item.cycle).trim(),
    subject: String(item.subject).trim(),
    level: String(item.level).trim(),
    year: item.year as number | string,
    title: String(item.title).trim(),
    official_source_url: item.official_source_url.trim(),
    source: String(item.source).trim(),
  };
}

function sortValues(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export default function StudentExamPapersPage() {
  const [items, setItems] = useState<PublicExamPaper[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [cycle, setCycle] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/data/public_exam_library.json", { credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalogue unavailable");
        return response.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        const rawItems = Array.isArray(data)
          ? data
          : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
            ? (data as { items: unknown[] }).items
            : [];
        setItems(rawItems.map(asPublicExamPaper).filter((item): item is PublicExamPaper => item !== null));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setStatus("unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => ({
      cycles: sortValues(items.map((item) => item.cycle)),
      subjects: sortValues(items.map((item) => item.subject)),
      levels: sortValues(items.map((item) => item.level)),
      years: sortValues(items.map((item) => String(item.year))).reverse(),
    }),
    [items]
  );

  const filteredItems = useMemo(
    () => items.filter((item) =>
      (!cycle || item.cycle === cycle) &&
      (!subject || item.subject === subject) &&
      (!level || item.level === level) &&
      (!year || String(item.year) === year)
    ),
    [items, cycle, subject, level, year]
  );

  const filtersActive = Boolean(cycle || subject || level || year);
  const resetFilters = () => {
    setCycle("");
    setSubject("");
    setLevel("");
    setYear("");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.15),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#f4f7fb_100%)] px-4 py-7 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <a
          href="/#/student"
          className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          <ChevronLeft aria-hidden="true" size={18} />
          Back to Student Hub
        </a>

        <section className="mt-4 overflow-hidden rounded-[32px] border border-blue-100 bg-white shadow-xl shadow-blue-100/60">
          <header className="bg-gradient-to-r from-blue-800 via-indigo-700 to-slate-800 px-6 py-7 text-white sm:px-8 sm:py-9">
            <div className="inline-flex rounded-2xl bg-white/15 p-3 ring-1 ring-white/25">
              <BookOpen aria-hidden="true" size={28} strokeWidth={2.4} />
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Exam Papers</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
              Find official Junior Cycle and Leaving Certificate past papers.
            </p>
          </header>

          <div className="p-5 sm:p-7">
            {status === "loading" ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-5 text-sm font-medium text-blue-900">
                Loading exam papers…
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-5 text-sm leading-6 text-blue-900">
                Exam papers are being prepared for students. Please check back soon.
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-label="Exam paper filters">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-sm font-black text-slate-800">
                      <SlidersHorizontal aria-hidden="true" size={17} />
                      Filter papers
                    </div>
                    {filtersActive ? (
                      <button type="button" onClick={resetFilters} className="text-sm font-bold text-blue-700 hover:text-blue-900 hover:underline">
                        Reset filters
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <FilterSelect label="Cycle" value={cycle} onChange={setCycle} options={options.cycles} />
                    <FilterSelect label="Subject" value={subject} onChange={setSubject} options={options.subjects} />
                    <FilterSelect label="Level" value={level} onChange={setLevel} options={options.levels} />
                    <FilterSelect label="Year" value={year} onChange={setYear} options={options.years} />
                  </div>
                </section>

                <section className="mt-5" aria-live="polite">
                  {filteredItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                      <p className="font-bold text-slate-800">No papers match those filters.</p>
                      <button type="button" onClick={resetFilters} className="mt-3 text-sm font-bold text-blue-700 hover:text-blue-900 hover:underline">
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredItems.map((item) => (
                        <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <h2 className="font-black text-slate-900">{item.title}</h2>
                              <p className="mt-1 text-sm text-slate-600">
                                {item.subject} · {item.level} · {item.year} · {item.cycle}
                              </p>
                            </div>
                            <a
                              href={item.official_source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-95"
                            >
                              Open Official Paper
                              <ArrowUpRight aria-hidden="true" size={17} strokeWidth={2.5} />
                            </a>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              Official examination materials are published by the State Examinations Commission.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-base font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
