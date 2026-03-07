import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ELogo2 from "./assets/ELogo2.png";

const API_BASE = "/api";

type StudentReportRow = {
    assessment_id: number;
    title: string;
    date: string | null;
    result: string;
    absent: boolean;
    score_percent: number | null;
};

type StudentReportData = {
    class_id: number;
    assessment_count: number;
    student: {
        id: number;
        name: string;
        average: number | null;
        taken: number;
        missed: number;
    };
    assessments: StudentReportRow[];
};

export default function StudentReportPage() {
    const { id, studentId } = useParams<{ id: string; studentId: string }>();
    const [data, setData] = useState<StudentReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(`${API_BASE}/classes/${id}/students/${studentId}/report-data`);
                if (!res.ok) throw new Error(`Failed to load student report (${res.status})`);

                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to load student report");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [id, studentId]);

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
                        <div className="text-2xl font-extrabold tracking-tight">ELume Student Report</div>
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
                            <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                                Student Report
                            </div>
                            <div className="mt-2 text-lg font-semibold text-slate-800">
                                {data.student.name}
                            </div>
                            <div className="mt-3 text-sm text-slate-600">
                                Average:{" "}
                                <span className="font-semibold text-slate-900">
                                    {data.student.average == null ? "—" : `${data.student.average}%`}
                                </span>
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                                Tests Taken: <span className="font-semibold text-slate-900">{data.student.taken}</span>
                                <span className="mx-2 text-slate-300">•</span>
                                Missed: <span className="font-semibold text-slate-900">{data.student.missed}</span>
                            </div>
                        </div>

                        <img src={ELogo2} alt="ELume" className="h-16 w-auto object-contain opacity-90" />
                    </div>

                    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
                        <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                            <div className="col-span-5">Assessment</div>
                            <div className="col-span-3">Date</div>
                            <div className="col-span-4">Result</div>
                        </div>

                        <div className="divide-y divide-slate-200">
                            {data.assessments.map((row) => (
                                <div key={row.assessment_id} className="grid grid-cols-12 px-4 py-3 text-sm">
                                    <div className="col-span-5 font-semibold text-slate-900">{row.title}</div>
                                    <div className="col-span-3">{row.date || "—"}</div>
                                    <div className="col-span-4">{row.result}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-10 flex items-end justify-between gap-4">
                        <div className="text-xs text-slate-500">
                            ELume Report • Individual student assessment summary
                        </div>
                        <img src={ELogo2} alt="ELume" className="h-10 w-auto object-contain opacity-60" />
                    </div>
                </div>
            </div>
        </div>
    );
}