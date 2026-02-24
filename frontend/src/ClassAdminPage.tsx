import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";


const API_BASE = "/api";


type Student = {
    id: number;
    class_id: number;
    first_name: string;
    notes?: string;
    active: boolean;
};

type Assessment = {
    id: number;
    class_id: number;
    title: string;
    assessment_date: string | null; // YYYY-MM-DD
};

type ResultRow = {
    student_id: number;
    first_name: string;
    score_percent: number | null;
    absent: boolean;
};

type InsightStudentRow = {
    student_id: number;
    first_name: string;
    average: number | null;
    taken: number;
    missed: number;
    latest: number | null;
};

type AtRiskRow = {
    student_id: number;
    first_name: string;
    average: number | null;
    missed: number;
    reasons: string[];
};

type InsightsPayload = {
    class_id: number;
    class_average: number | null;
    assessment_count: number;
    active_student_count: number;
    student_rankings: InsightStudentRow[];
    at_risk: AtRiskRow[];
};

type StudentHistoryPoint = {
    assessment_id: number;
    title: string;
    date: string | null;
    student: number | null;
    absent: boolean;
    class_avg: number | null;
};

type StudentHistoryResp = {
    student: { id: number; first_name: string };
    points: StudentHistoryPoint[];
};

export default function ClassAdminPage() {
    const { id } = useParams<{ id: string }>();
    const classId = useMemo(() => Number(id), [id]);
    const validClassId = Number.isFinite(classId) && classId > 0;
    const [studentToken, setStudentToken] = useState<string | null>(null);

    const navigate = useNavigate();

    const [tab, setTab] = useState<"students" | "tests" | "insights">("students");

    useEffect(() => {
        if (tab !== "insights") return;
        loadInsights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, classId]);


    const [students, setStudents] = useState<Student[]>([]);
    const [tests, setTests] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [insights, setInsights] = useState<InsightsPayload | null>(null);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [insightsError, setInsightsError] = useState<string | null>(null);

    const [historyCache, setHistoryCache] = useState<Record<number, StudentHistoryResp | null>>({});
    const [historyLoading, setHistoryLoading] = useState<Record<number, boolean>>({});

    async function fetchStudentHistory(studentId: number) {
        if (!validClassId) return;
        if (historyCache[studentId] || historyLoading[studentId]) return;

        setHistoryLoading(p => ({ ...p, [studentId]: true }));

        try {
            const token = localStorage.getItem("elume_token") || "";

            const res = await fetch(`${API_BASE}/classes/${classId}/students/${studentId}/history`, {
                headers: {
                    Authorization: token ? `Bearer ${token}` : "",
                },
            });

            if (!res.ok) throw new Error(await res.text());
            const data: StudentHistoryResp = await res.json();

            setHistoryCache(p => ({ ...p, [studentId]: data }));
        } catch {
            setHistoryCache(p => ({ ...p, [studentId]: null }));
        } finally {
            setHistoryLoading(p => ({ ...p, [studentId]: false }));
        }
    }

    // quick add student
    const [firstName, setFirstName] = useState("");
    const [notes, setNotes] = useState("");
    const [bulkNames, setBulkNames] = useState("");

    // ---- Assessments / Results UI ----
    const [showCreateTest, setShowCreateTest] = useState(false);
    const [newTestTitle, setNewTestTitle] = useState("");
    const [newTestDate, setNewTestDate] = useState(""); // YYYY-MM-DD (optional)

    const [showResults, setShowResults] = useState(false);
    const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
    const [resultRows, setResultRows] = useState<ResultRow[]>([]);
    const [savingResults, setSavingResults] = useState(false);

    const activeCount = students.filter((s) => s.active).length;
    const inactiveCount = students.length - activeCount;

    const card =
        "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
    const cardPad = "p-4 md:p-5";
    const pill =
        "rounded-full border-2 border-slate-200 bg-white px-5 py-2 text-sm hover:bg-slate-50";

    async function loadAll() {
        if (!validClassId) return;
        setLoading(true);
        setError(null);

        try {
            const [sr, tr] = await Promise.all([
                fetch(`${API_BASE}/classes/${classId}/students`),
                fetch(`${API_BASE}/classes/${classId}/assessments`),
            ]);

            if (!sr.ok) throw new Error(`Students fetch failed (${sr.status})`);
            if (!tr.ok) throw new Error(`Tests fetch failed (${tr.status})`);

            const sdata = await sr.json();
            const tdata = await tr.json();

            setStudents(Array.isArray(sdata) ? sdata : []);
            setTests(Array.isArray(tdata) ? tdata : []);
        } catch (e: any) {
            setError(e?.message || "Failed to load admin data");
            setStudents([]);
            setTests([]);
        } finally {
            setLoading(false);
        }
    }

    async function generateStudentLink() {
        const r = await fetch(`${API_BASE}/student-access/${classId}`, {
            method: "POST",
        });

        const data = await r.json();
        setStudentToken(data.token);
    }


    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId, validClassId]);

    useEffect(() => {
        if (!validClassId) return;

        fetch(`${API_BASE}/student-access/${classId}`)
            .then(r => r.json())
            .then(data => setStudentToken(data.token))
            .catch(() => { });
    }, [classId, validClassId]);


    useEffect(() => {
        if (tab !== "insights") return;
        loadInsights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, classId, validClassId]);


    async function addStudent() {
        const fn = firstName.trim();
        if (!fn || !validClassId) return;

        try {
            setError(null);
            const r = await fetch(`${API_BASE}/classes/${classId}/students`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: fn, notes: notes.trim() }),
            });
            if (!r.ok) throw new Error(`Create student failed (${r.status})`);
            const created = await r.json();
            setStudents((prev) => [created, ...prev]);
            setFirstName("");
            setNotes("");
        } catch (e: any) {
            setError(e?.message || "Failed to add student");
        }
    }
    async function loadInsights() {
        if (!validClassId) return;

        setInsightsLoading(true);
        setInsightsError(null);

        try {
            const r = await fetch(`${API_BASE}/classes/${classId}/insights`);
            if (!r.ok) throw new Error(`Insights fetch failed (${r.status})`);

            const data = (await r.json()) as InsightsPayload;
            setInsights(data);
        } catch (e: any) {
            setInsightsError(e?.message || "Failed to load insights");
            setInsights(null);
        } finally {
            setInsightsLoading(false);
        }
    }

    async function addStudentsBulk() {
        if (!validClassId) return;

        const names = bulkNames
            .split(/\r?\n|,/)
            .map((s) => s.trim())
            .filter(Boolean);

        if (names.length === 0) return;

        try {
            setError(null);
            const r = await fetch(`${API_BASE}/classes/${classId}/students/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ names }),
            });
            if (!r.ok) throw new Error(`Bulk add failed (${r.status})`);
            const created = await r.json();
            if (Array.isArray(created) && created.length) {
                setStudents((prev) => [...created, ...prev]);
            }
            setBulkNames("");
        } catch (e: any) {
            setError(e?.message || "Failed to add students");
        }
    }

    async function toggleActive(studentId: number, active: boolean) {
        try {
            setError(null);
            const r = await fetch(`${API_BASE}/students/${studentId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ active }),
            });
            if (!r.ok) throw new Error(`Update student failed (${r.status})`);
            const updated = await r.json();
            setStudents((prev) => prev.map((s) => (s.id === studentId ? updated : s)));
        } catch (e: any) {
            setError(e?.message || "Failed to update student");
        }
    }

    async function createAssessment() {
        if (!validClassId) return;
        const title = newTestTitle.trim();
        if (!title) return;

        try {
            setError(null);
            const r = await fetch(`${API_BASE}/classes/${classId}/assessments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    assessment_date: newTestDate.trim() || null,
                }),
            });

            if (!r.ok) throw new Error(`Create test failed (${r.status})`);
            const created = await r.json();

            setTests((prev) => [created, ...prev]);

            setNewTestTitle("");
            setNewTestDate("");
            setShowCreateTest(false);
        } catch (e: any) {
            setError(e?.message || "Failed to create test");
        }
    }

    async function openResults(assessmentId: number) {
        try {
            setError(null);
            const r = await fetch(`${API_BASE}/assessments/${assessmentId}/results`);
            if (!r.ok) throw new Error(`Load results failed (${r.status})`);
            const data = await r.json();

            setSelectedAssessment(data.assessment);
            setResultRows(Array.isArray(data.results) ? data.results : []);
            setShowResults(true);
        } catch (e: any) {
            setError(e?.message || "Failed to load results");
        }
    }
    function avgClass(avg: number | null | undefined) {
        if (avg == null) return "text-slate-400";
        if (avg < 50) return "text-red-700";
        if (avg < 70) return "text-amber-700";
        return "text-emerald-700";
    }

    function setRowScore(studentId: number, raw: string) {
        setResultRows((prev) =>
            prev.map((r) => {
                if (r.student_id !== studentId) return r;

                const trimmed = raw.trim();
                if (trimmed === "") {
                    return { ...r, score_percent: null, absent: false };
                }

                const num = Number(trimmed);
                if (Number.isNaN(num)) return r;

                const clamped = Math.max(0, Math.min(100, Math.trunc(num)));
                return { ...r, score_percent: clamped, absent: false };
            })
        );
    }

    function toggleAbsent(studentId: number) {
        setResultRows((prev) =>
            prev.map((r) =>
                r.student_id === studentId
                    ? {
                        ...r,
                        absent: !r.absent,
                        score_percent: !r.absent ? null : r.score_percent,
                    }
                    : r
            )
        );
    }

    async function saveResults() {
        if (!selectedAssessment) return;

        try {
            setSavingResults(true);
            setError(null);

            const payload = {
                results: resultRows.map((r) => ({
                    student_id: r.student_id,
                    score_percent: r.absent ? null : r.score_percent,
                    absent: !!r.absent,
                })),
            };

            const res = await fetch(`${API_BASE}/assessments/${selectedAssessment.id}/results`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(`Save failed (${res.status})`);

            setShowResults(false);
            setSelectedAssessment(null);
            setResultRows([]);
        } catch (e: any) {
            setError(e?.message || "Failed to save results");
        } finally {
            setSavingResults(false);
        }
    }
    // ------------------------------
    // Insights helpers (pills + trend)
    // ------------------------------
    type Trend = "up" | "down" | "flat" | "none";

    function pct(v: number | null | undefined) {
        if (v == null || !Number.isFinite(v)) return "—";
        return `${v.toFixed(1)}%`;
    }

    function avgPillClass(avg: number | null) {
        if (avg == null) return "bg-slate-50 border-slate-200 text-slate-700";
        if (avg >= 85) return "bg-emerald-50 border-emerald-200 text-emerald-800";
        if (avg >= 70) return "bg-sky-50 border-sky-200 text-sky-800";
        if (avg >= 50) return "bg-amber-50 border-amber-200 text-amber-900";
        return "bg-rose-50 border-rose-200 text-rose-800";
    }

    function trendFromLatest(avg: number | null, latest: number | null): Trend {
        if (avg == null || latest == null) return "none";
        const d = latest - avg; // compare latest to overall average
        if (d >= 3) return "up";
        if (d <= -3) return "down";
        return "flat";
    }

    function TrendIcon({ t }: { t: Trend }) {
        if (t === "none") return null;

        const common = "h-4 w-4";
        if (t === "up")
            return (
                <svg className={common} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M7 14l5-5 5 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            );

        if (t === "down")
            return (
                <svg className={common} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M7 10l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            );

        // flat
        return (
            <svg className={common} viewBox="0 0 24 24" fill="none">
                <path
                    d="M6 12h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
            </svg>
        );
    }

    function trendText(t: Trend) {
        if (t === "up") return "Improving";
        if (t === "down") return "Dropping";
        if (t === "flat") return "Stable";
        return "";
    }

    function trendClass(t: Trend) {
        if (t === "up") return "text-emerald-700";
        if (t === "down") return "text-rose-700";
        if (t === "flat") return "text-slate-600";
        return "text-slate-400";
    }
    function Sparkline({ points }: { points: StudentHistoryPoint[] }) {
        const width = 220;
        const height = 60;
        const pad = 6;

        const vals = points
            .flatMap(p => [p.student, p.class_avg])
            .filter((v): v is number => typeof v === "number");

        const maxY = Math.max(100, ...vals);
        const minY = 0;

        const w = width - pad * 2;
        const h = height - pad * 2;

        const xTo = (i: number) => pad + (points.length <= 1 ? 0 : (i / (points.length - 1)) * w);
        const yTo = (v: number) => pad + (1 - (v - minY) / (maxY - minY || 1)) * h;

        const poly = (getter: (p: StudentHistoryPoint) => number | null) =>
            points
                .map((p, i) => {
                    const v = getter(p);
                    return typeof v === "number" ? `${xTo(i)},${yTo(v)}` : null;
                })
                .filter(Boolean)
                .join(" ");

        return (
            <svg width={width} height={height}>
                <polyline
                    points={poly(p => p.class_avg)}
                    fill="none"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="stroke-red-500"
                />
                <polyline
                    points={poly(p => p.student)}
                    fill="none"
                    strokeWidth="2.5"
                    className="stroke-slate-900"
                />
            </svg>
        );
    }
    return (
        <div className="min-h-screen bg-emerald-100 p-6">
            <div className="mx-auto max-w-6xl px-4 py-6">
                {/* Header card */}
                <div className={`${card} ${cardPad}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                                Class Admin
                            </div>
                            <div className="text-sm text-slate-600">
                                Private teacher tools • First names only (GDPR friendly)
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate(`/class/${classId}`)}
                            className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                        >
                            Back to Class
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            {error}
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="mt-4">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={tab === "students" ? `${pill} border-emerald-400 bg-emerald-50` : pill}
                                onClick={() => setTab("students")}
                            >
                                Students
                            </button>

                            <button
                                type="button"
                                className={tab === "tests" ? `${pill} border-emerald-400 bg-emerald-50` : pill}
                                onClick={() => setTab("tests")}
                            >
                                Test Results
                            </button>

                            <button
                                type="button"
                                className={tab === "insights" ? `${pill} border-emerald-400 bg-emerald-50` : pill}
                                onClick={() => setTab("insights")}
                            >
                                Insights
                            </button>
                        </div>

                        {tab === "tests" && (
                            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg font-extrabold tracking-tight text-slate-900">
                                        Tests & Results
                                    </div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        Create a test, enter % per student, mark absent.
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowCreateTest(true)}
                                    className="shrink-0 rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                >
                                    Create Test
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Students tab */}
                {tab === "students" && (
                    <div className={`${card} ${cardPad} mt-6`}>
                        <div className="text-lg font-extrabold tracking-tight text-slate-900">Student Roster</div>
                        <div className="mt-1 text-sm text-slate-600">
                            Add first names only. Use notes for quick teacher reminders.
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <input
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                                placeholder="First name (e.g. Aoife)"
                            />
                            <input
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                                placeholder="Notes (optional)"
                            />
                            <button
                                type="button"
                                onClick={addStudent}
                                className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                disabled={!firstName.trim()}
                            >
                                Add Student
                            </button>
                        </div>

                        <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                            <div className="text-sm font-extrabold text-slate-900">Add multiple students</div>
                            <div className="mt-1 text-sm text-slate-600">
                                Paste first names (one per line or comma separated).
                            </div>

                            <textarea
                                value={bulkNames}
                                onChange={(e) => setBulkNames(e.target.value)}
                                className="mt-3 h-32 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                                placeholder={"Aoife\nLiam\nSarah\nJack"}
                            />

                            <div className="mt-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={addStudentsBulk}
                                    className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                    disabled={!bulkNames.trim()}
                                >
                                    Add Students
                                </button>
                            </div>
                        </div>

                        <div className="mt-5">
                            {loading ? (
                                <div className="text-sm text-slate-600">Loading…</div>
                            ) : students.length === 0 ? (
                                <div className="text-sm text-slate-600">No students yet.</div>
                            ) : (
                                <div className="divide-y divide-slate-200 rounded-3xl border-2 border-slate-200 bg-white">
                                    {students.map((s) => (
                                        <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                                            <div>
                                                <div className="font-semibold text-slate-900">
                                                    {s.first_name}
                                                    {!s.active && (
                                                        <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                                                            inactive
                                                        </span>
                                                    )}
                                                </div>
                                                {!!s.notes && <div className="text-sm text-slate-600">{s.notes}</div>}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => toggleActive(s.id, !s.active)}
                                                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                            >
                                                {s.active ? "Deactivate" : "Activate"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 text-sm text-slate-600 flex justify-between items-center">
                            <span>
                                Active students:{" "}
                                <span className="font-semibold text-slate-900">{activeCount}</span>
                            </span>

                            {inactiveCount > 0 && (
                                <span>
                                    Inactive: <span className="font-semibold text-slate-900">{inactiveCount}</span>
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Tests tab */}
                {tab === "tests" && (
                    <div className={`${card} ${cardPad} mt-6`}>
                        <div className="text-lg font-extrabold tracking-tight text-slate-900">Tests & Results</div>
                        <div className="mt-1 text-sm text-slate-600">
                            Next step: create a test, enter % per student, mark absent.
                        </div>

                        <div className="mt-4">
                            {loading ? (
                                <div className="text-sm text-slate-600">Loading…</div>
                            ) : tests.length === 0 ? (
                                <div className="text-sm text-slate-600">No tests yet.</div>
                            ) : (
                                <div className="divide-y divide-slate-200 rounded-3xl border-2 border-slate-200 bg-white">
                                    {tests.map((t) => (
                                        <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                                            <div>
                                                <div className="font-semibold text-slate-900">{t.title}</div>
                                                <div className="text-sm text-slate-600">{t.assessment_date || ""}</div>
                                            </div>

                                            <button
                                                type="button"
                                                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                                onClick={() => openResults(t.id)}
                                            >
                                                Edit Results
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Insights tab */}
                {tab === "insights" && (
                    <div className={`${card} ${cardPad} mt-6`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-extrabold tracking-tight text-slate-900">Insights</div>
                                <div className="mt-1 text-sm text-slate-600">
                                    Strongest → weakest by average • Class average • At-risk list
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={loadInsights}
                                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                            >
                                Refresh
                            </button>
                        </div>

                        {insightsError && (
                            <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                                {insightsError}
                            </div>
                        )}

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                            {/* Class average card */}
                            <div className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-600">Class Average</div>
                                <div className="mt-2 flex items-end gap-3">
                                    <div className="text-4xl font-extrabold tracking-tight text-slate-900">
                                        {insightsLoading ? "…" : pct(insights?.class_average ?? null)}
                                    </div>

                                    <span
                                        className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${avgPillClass(insights?.class_average ?? null)
                                            }`}
                                        title="Colour bands: 85+ excellent, 70+ strong, 50+ watch, below 50 at-risk"
                                    >
                                        {insights?.assessment_count ?? 0} assessments
                                    </span>
                                </div>

                                <div className="mt-2 text-xs text-slate-500">
                                    Active students: {insights?.active_student_count ?? 0}
                                </div>
                            </div>

                            {/* At-risk card */}
                            <div className="md:col-span-2 rounded-3xl border-2 border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-slate-600">At-risk students</div>
                                    <div className="text-xs text-slate-500">Rule: avg &lt; 50 or missed ≥ 2</div>
                                </div>

                                {insightsLoading ? (
                                    <div className="mt-3 text-sm text-slate-600">Loading…</div>
                                ) : !insights || insights.at_risk.length === 0 ? (
                                    <div className="mt-3 text-sm text-slate-600">No at-risk students flagged.</div>
                                ) : (
                                    <div className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200">
                                        {insights.at_risk.slice(0, 6).map((r) => (
                                            <div key={r.student_id} className="flex items-start justify-between gap-3 p-3">
                                                <div>
                                                    <div className="font-semibold text-slate-900">{r.first_name}</div>
                                                    <div className="mt-1 text-xs text-slate-600">
                                                        {r.reasons.join(" • ")}
                                                    </div>
                                                </div>

                                                <div className="text-right text-xs text-slate-600">
                                                    <div>
                                                        Avg: <span className="font-semibold text-slate-900">{pct(r.average)}</span>
                                                    </div>
                                                    <div>
                                                        Missed: <span className="font-semibold text-slate-900">{r.missed}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Rankings table */}
                        <div className="mt-5 rounded-3xl border-2 border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold text-slate-600">Rankings</div>
                                <div className="text-xs text-slate-500">Latest vs overall avg (±3% = arrow)</div>
                            </div>

                            {insightsLoading ? (
                                <div className="mt-3 text-sm text-slate-600">Loading…</div>
                            ) : !insights || insights.student_rankings.length === 0 ? (
                                <div className="mt-3 text-sm text-slate-600">No results yet.</div>
                            ) : (
                                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                                    <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                                        <div className="col-span-4">Name</div>
                                        <div className="col-span-2">Average</div>
                                        <div className="col-span-2">Latest</div>
                                        <div className="col-span-2">Taken</div>
                                        <div className="col-span-2">Missed</div>
                                    </div>

                                    <div className="divide-y divide-slate-200">
                                        {insights.student_rankings.map((s) => {
                                            const t = trendFromLatest(s.average, s.latest);

                                            return (
                                                <div
                                                    key={s.student_id}
                                                    className="grid grid-cols-12 items-center px-3 py-2 text-sm"
                                                >
                                                    <div className="col-span-4 font-semibold text-slate-900">
                                                        <div
                                                            className="relative inline-block group hover:z-40"
                                                            onMouseEnter={() => fetchStudentHistory(s.student_id)}
                                                        >
                                                            <span className="underline decoration-dotted underline-offset-4">
                                                                {s.first_name}
                                                            </span>

                                                            <div className="absolute left-0 top-[calc(100%-4px)] z-30 mt-2 hidden w-[320px] rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-xl group-hover:block">

                                                                <div className="text-sm font-extrabold text-slate-900">
                                                                    {s.first_name}
                                                                </div>

                                                                <div className="text-xs text-slate-600 mt-1">
                                                                    Latest: <b>{s.latest ?? "—"}</b>% ·
                                                                    Avg: <b>{s.average ?? "—"}</b>% ·
                                                                    Taken: <b>{s.taken}</b> ·
                                                                    Missed: <b>{s.missed}</b>
                                                                </div>

                                                                <div className="mt-3 border rounded-xl p-2">
                                                                    {historyLoading[s.student_id] && (
                                                                        <div className="text-xs text-slate-500">Loading…</div>
                                                                    )}

                                                                    {!historyLoading[s.student_id] &&
                                                                        historyCache[s.student_id]?.points?.length ? (
                                                                        <>
                                                                            <Sparkline points={historyCache[s.student_id]!.points.slice(-8)} />
                                                                            <div className="mt-2 max-h-28 overflow-auto rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                                                                                {historyCache[s.student_id]!.points
                                                                                    .slice(-10)
                                                                                    .slice()
                                                                                    .reverse()
                                                                                    .map((p) => {
                                                                                        const delta =
                                                                                            typeof p.student === "number" && typeof p.class_avg === "number"
                                                                                                ? Math.round((p.student - p.class_avg) * 10) / 10
                                                                                                : null;

                                                                                        return (
                                                                                            <div
                                                                                                key={p.assessment_id}
                                                                                                className="flex items-center justify-between gap-2 border-b border-slate-200/60 py-1 last:border-b-0"
                                                                                            >
                                                                                                <div className="min-w-0">
                                                                                                    <div className="truncate text-xs font-semibold text-slate-800">
                                                                                                        {p.title}
                                                                                                    </div>
                                                                                                    <div className="text-[11px] text-slate-500">
                                                                                                        {p.date ?? ""}
                                                                                                    </div>
                                                                                                </div>

                                                                                                <div className="shrink-0 text-right">
                                                                                                    <div className="text-xs font-extrabold text-slate-900">
                                                                                                        {p.absent ? "Absent" : (p.student == null ? "—" : `${p.student}%`)}
                                                                                                    </div>

                                                                                                    <div className="text-[11px] text-slate-500">
                                                                                                        {typeof p.class_avg === "number" ? `avg ${p.class_avg}%` : "avg —"}
                                                                                                        {delta != null && (
                                                                                                            <span className={delta >= 0 ? "ml-1 text-emerald-700" : "ml-1 text-rose-700"}>
                                                                                                                ({delta >= 0 ? "+" : ""}{delta})
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                            </div>

                                                                            <div className="mt-2 text-[11px] text-slate-500">
                                                                                Solid = student · Dotted red = class avg
                                                                            </div>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="col-span-2">
                                                        <span
                                                            className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-semibold ${avgPillClass(
                                                                s.average
                                                            )}`}
                                                        >
                                                            {pct(s.average)}
                                                        </span>
                                                    </div>

                                                    <div className="col-span-2">
                                                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${trendClass(t)}`}>
                                                            <TrendIcon t={t} />
                                                            {s.latest == null ? "—" : `${s.latest.toFixed(0)}%`}
                                                            <span className="ml-1 font-normal">{trendText(t)}</span>
                                                        </span>
                                                    </div>

                                                    <div className="col-span-2 text-slate-700">{s.taken}</div>
                                                    <div className="col-span-2 text-slate-700">{s.missed}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {/* Create Test Modal */}
                {showCreateTest && (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
                        <div className="w-full max-w-lg rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                            <div className="flex items-center justify-between">
                                <div className="text-lg font-extrabold text-slate-900">Create Test</div>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateTest(false)}
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <label className="text-sm font-semibold text-slate-700">
                                    Test title
                                    <input
                                        value={newTestTitle}
                                        onChange={(e) => setNewTestTitle(e.target.value)}
                                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                                        placeholder="e.g. Waves Test"
                                    />
                                </label>

                                <label className="text-sm font-semibold text-slate-700">
                                    Date (optional)
                                    <input
                                        type="date"
                                        value={newTestDate}
                                        onChange={(e) => setNewTestDate(e.target.value)}
                                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                                    />
                                </label>

                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={createAssessment}
                                        disabled={!newTestTitle.trim()}
                                        className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Enter Results Modal */}
                {showResults && selectedAssessment && (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
                        <div className="w-full max-w-3xl rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg font-extrabold text-slate-900">
                                        {selectedAssessment.title}
                                    </div>
                                    <div className="text-sm text-slate-600">
                                        {selectedAssessment.assessment_date || ""}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowResults(false);
                                            setSelectedAssessment(null);
                                            setResultRows([]);
                                        }}
                                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                    >
                                        Close
                                    </button>

                                    <button
                                        type="button"
                                        onClick={saveResults}
                                        disabled={savingResults}
                                        className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        {savingResults ? "Saving…" : "Save"}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-3xl border-2 border-slate-200">
                                <div className="grid grid-cols-12 gap-2 border-b-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                                    <div className="col-span-6">Student</div>
                                    <div className="col-span-3">Result (%)</div>
                                    <div className="col-span-3 text-right">Absent</div>
                                </div>

                                <div className="max-h-[60vh] overflow-auto">
                                    {resultRows.map((r) => (
                                        <div
                                            key={r.student_id}
                                            className="grid grid-cols-12 items-center gap-2 border-b border-slate-100 px-3 py-2"
                                        >
                                            <div className="col-span-6 font-semibold text-slate-900">{r.first_name}</div>

                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    disabled={r.absent}
                                                    value={r.score_percent ?? ""}
                                                    onChange={(e) => setRowScore(r.student_id, e.target.value)}
                                                    className="w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                                                    placeholder="0-100"
                                                />
                                            </div>

                                            <div className="col-span-3 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleAbsent(r.student_id)}
                                                    className={
                                                        r.absent
                                                            ? "rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                                                            : "rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                                    }
                                                >
                                                    {r.absent ? "Absent ✓" : "Mark absent"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 text-xs text-slate-500">
                                Tip: leaving a score blank keeps it empty; “Absent” excludes them from averages.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
