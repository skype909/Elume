import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ELogo2 from "./assets/ELogo2.png";
import { apiFetch } from "./api";

const API_BASE = "/api";

type ClassReportStudent = {
    id: number;
    name: string;
    average: number | null;
    taken: number;
    missed: number;
};

type ClassReportData = {
    class_id: number;
    assessment_count: number;
    class_average: number | null;
    students: ClassReportStudent[];
};

export default function ClassReportPage() {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<ClassReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError(null);

                const json = await apiFetch(`${API_BASE}/classes/${id}/report-data`);
                if (!cancelled) setData(json);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to load report");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (loading) {
        return <div className="min-h-screen bg-white p-8 text-slate-700">Loading report…</div>;
    }

    if (error || !data) {
        return <div className="min-h-screen bg-white p-8 text-rose-700">{error || "Report unavailable"}</div>;
    }

    return (
        <div className="min-h-screen bg-white text-slate-900">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { size: A4; margin: 14mm; }
                }
            `}</style>

            <div className="mx-auto max-w-4xl px-6 py-8">
                <div className="no-print mb-6 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-2xl font-extrabold tracking-tight">ELume Class Report</div>
                        <div className="text-sm text-slate-600">Open in browser • Print / Save as PDF</div>
                    </div>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50"
                    >
                        Print / Save as PDF
                    </button>
                </div>

                <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-3xl font-extrabold tracking-tight text-slate-900">Class Report</div>
                            <div className="mt-2 text-sm text-slate-600">
                                Assessments: <span className="font-semibold text-slate-900">{data.assessment_count}</span>
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                                Class Average:{" "}
                                <span className="font-semibold text-slate-900">
                                    {data.class_average == null ? "—" : `${data.class_average}%`}
                                </span>
                            </div>
                        </div>

                        <img src={ELogo2} alt="ELume" className="h-16 w-auto object-contain opacity-90" />
                    </div>

                    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
                        <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                            <div className="col-span-5">Student</div>
                            <div className="col-span-3">Average</div>
                            <div className="col-span-2">Taken</div>
                            <div className="col-span-2">Missed</div>
                        </div>

                        <div className="divide-y divide-slate-200">
                            {data.students.map((s) => (
                                <div key={s.id} className="grid grid-cols-12 px-4 py-3 text-sm">
                                    <div className="col-span-5 font-semibold text-slate-900">{s.name}</div>
                                    <div className="col-span-3">{s.average == null ? "—" : `${s.average}%`}</div>
                                    <div className="col-span-2">{s.taken}</div>
                                    <div className="col-span-2">{s.missed}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-10 flex items-end justify-between gap-4">
                        <div className="text-xs text-slate-500">
                            ELume Report • Generated from class assessment data
                        </div>
                        <img src={ELogo2} alt="ELume" className="h-10 w-auto object-contain opacity-60" />
                    </div>
                </div>
            </div>
        </div>
    );
}
