import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";

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

type ReportLength = "Short" | "Medium" | "Long";

type StudentReportDraft = {
    length: ReportLength;
    indicators: string[];
    signOff: string;
    comment: string;
};

const REPORT_INDICATORS = [
    "Has more ability",
    "Not working hard enough",
    "Lacks concentration",
    "Poor attendance",
    "Disruptive in class",
    "Excellent performer",
    "Always well behaved",
    "Participates well in class",
    "Willing to help others",
    "Improving steadily",
];

export default function ClassAdminPage() {
    const { id } = useParams<{ id: string }>();
    const classId = useMemo(() => Number(id), [id]);
    const validClassId = Number.isFinite(classId) && classId > 0;
    const [studentToken, setStudentToken] = useState<string | null>(null);

    const navigate = useNavigate();

    const [tab, setTab] = useState<"students" | "tests" | "insights" | "reports">("students");

    const [students, setStudents] = useState<Student[]>([]);
    const [tests, setTests] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [insights, setInsights] = useState<InsightsPayload | null>(null);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [insightsError, setInsightsError] = useState<string | null>(null);
    const [cat4Enabled, setCat4Enabled] = useState(false);

    const [historyCache, setHistoryCache] = useState<Record<number, StudentHistoryResp | null>>({});
    const [historyLoading, setHistoryLoading] = useState<Record<number, boolean>>({});
    const [selectedHistoryStudent, setSelectedHistoryStudent] = useState<InsightStudentRow | null>(null);

    // quick add student
    const [firstName, setFirstName] = useState("");
    const [notes, setNotes] = useState("");
    const [bulkNames, setBulkNames] = useState("");
    const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    // ---- Assessments / Results UI ----
    const [showCreateTest, setShowCreateTest] = useState(false);
    const [newTestTitle, setNewTestTitle] = useState("");
    const [newTestDate, setNewTestDate] = useState("");

    const [showEditTest, setShowEditTest] = useState(false);
    const [editingTest, setEditingTest] = useState<Assessment | null>(null);
    const [editTestTitle, setEditTestTitle] = useState("");
    const [editTestDate, setEditTestDate] = useState("");
    const [savingEditTest, setSavingEditTest] = useState(false);

    const [showResults, setShowResults] = useState(false);
    const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
    const [resultRows, setResultRows] = useState<ResultRow[]>([]);
    const [savingResults, setSavingResults] = useState(false);
    const reportDraftsKey = `elume_report_drafts_class_${classId}`;

    const [reportDrafts, setReportDrafts] = useState<Record<number, StudentReportDraft>>(() => {
        try {
            const raw = localStorage.getItem(`elume_report_drafts_class_${classId}`);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    const [generatingReportFor, setGeneratingReportFor] = useState<number | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);

    const activeCount = students.filter((s) => s.active).length;
    const inactiveCount = students.length - activeCount;

    const card =
        "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
    const cardPad = "p-4 md:p-5";
    const pill =
        "rounded-full border-2 border-slate-200 bg-white px-5 py-2 text-sm hover:bg-slate-50";

    useEffect(() => {
        if (tab !== "insights" && tab !== "reports") return;
        loadInsights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, classId]);

    useEffect(() => {
        if (tab !== "insights" || !validClassId) return;

        let cancelled = false;
        apiFetch(`${API_BASE}/classes/${classId}/cat4/meta`)
            .then((data) => {
                if (cancelled) return;
                setCat4Enabled(Boolean(data?.feature_enabled));
            })
            .catch(() => {
                if (cancelled) return;
                setCat4Enabled(false);
            });

        return () => {
            cancelled = true;
        };
    }, [tab, classId, validClassId]);

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId, validClassId]);

    useEffect(() => {
        if (!validClassId) return;

        apiFetch(`${API_BASE}/student-access/${classId}`)
            .then((data) => setStudentToken(data.token))
            .catch(() => { });
    }, [classId, validClassId]);

    useEffect(() => {
        setReportDrafts((prev) => {
            const next = { ...prev };

            for (const s of students) {
                if (!next[s.id]) {
                    next[s.id] = {
                        length: "Medium",
                        indicators: [],
                        signOff: "",
                        comment: "",
                    };
                }
            }

            return next;
        });
    }, [students]);

    useEffect(() => {
        try {
            localStorage.setItem(reportDraftsKey, JSON.stringify(reportDrafts));
        } catch {
            // ignore storage errors
        }
    }, [reportDrafts, reportDraftsKey]);

    useEffect(() => {
        if (tab !== "insights" && tab !== "reports") return;
        loadInsights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, classId, validClassId]);

    async function fetchStudentHistory(studentId: number) {
        if (!validClassId) return;
        if (historyCache[studentId] || historyLoading[studentId]) return;

        setHistoryLoading((p) => ({ ...p, [studentId]: true }));

        try {
            const data = (await apiFetch(
                `${API_BASE}/classes/${classId}/students/${studentId}/history`
            )) as StudentHistoryResp;

            setHistoryCache((p) => ({ ...p, [studentId]: data }));
        } catch {
            setHistoryCache((p) => ({ ...p, [studentId]: null }));
        } finally {
            setHistoryLoading((p) => ({ ...p, [studentId]: false }));
        }
    }

    async function openStudentHistoryModal(student: InsightStudentRow) {
        setSelectedHistoryStudent(student);
        await fetchStudentHistory(student.student_id);
    }

    async function loadAll() {
        if (!validClassId) return;
        setLoading(true);
        setError(null);

        try {
            const [sdata, tdata] = await Promise.all([
                apiFetch(`${API_BASE}/classes/${classId}/students`),
                apiFetch(`${API_BASE}/classes/${classId}/assessments`),
            ]);

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
        const data = await apiFetch(`${API_BASE}/student-access/${classId}`, {
            method: "POST",
        });
        setStudentToken(data.token);
    }

    async function addStudent() {
        const fn = firstName.trim();
        if (!fn || !validClassId) return;

        try {
            setError(null);
            const created = await apiFetch(`${API_BASE}/classes/${classId}/students`, {
                method: "POST",
                body: JSON.stringify({ first_name: fn, notes: notes.trim() }),
            });
            setStudents((prev) => [created, ...prev]);
            setFirstName("");
            setNotes("");
        } catch (e: any) {
            setError(e?.message || "Failed to add student");
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
            const created = await apiFetch(`${API_BASE}/classes/${classId}/students/bulk`, {
                method: "POST",
                body: JSON.stringify({ names }),
            });
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
            const updated = await apiFetch(`${API_BASE}/students/${studentId}`, {
                method: "PUT",
                body: JSON.stringify({ active }),
            });
            setStudents((prev) => prev.map((s) => (s.id === studentId ? updated : s)));
        } catch (e: any) {
            setError(e?.message || "Failed to update student");
        }
    }

    async function confirmDeleteStudent() {
        if (!deletingStudent) return;

        try {
            setDeleteBusy(true);
            setError(null);
            await apiFetch(`${API_BASE}/students/${deletingStudent.id}`, {
                method: "DELETE",
            });
            setStudents((prev) => prev.filter((s) => s.id !== deletingStudent.id));
            setHistoryCache((prev) => {
                const next = { ...prev };
                delete next[deletingStudent.id];
                return next;
            });
            setHistoryLoading((prev) => {
                const next = { ...prev };
                delete next[deletingStudent.id];
                return next;
            });
            setReportDrafts((prev) => {
                const next = { ...prev };
                delete next[deletingStudent.id];
                return next;
            });
            if (selectedHistoryStudent?.student_id === deletingStudent.id) {
                setSelectedHistoryStudent(null);
            }
            setDeletingStudent(null);
            if (tab === "insights" || tab === "reports") {
                void loadInsights();
            }
        } catch (e: any) {
            setError(e?.message || "Failed to delete student");
        } finally {
            setDeleteBusy(false);
        }
    }

    async function createAssessment() {
        if (!validClassId) return;
        const title = newTestTitle.trim();
        if (!title) return;

        try {
            setError(null);
            const created = await apiFetch(`${API_BASE}/classes/${classId}/assessments`, {
                method: "POST",
                body: JSON.stringify({
                    title,
                    assessment_date: newTestDate.trim() || null,
                }),
            });

            setTests((prev) => [created, ...prev]);

            setNewTestTitle("");
            setNewTestDate("");
            setShowCreateTest(false);
        } catch (e: any) {
            setError(e?.message || "Failed to create test");
        }
    }

    function openEditTestModal(test: Assessment) {
        setEditingTest(test);
        setEditTestTitle(test.title || "");
        setEditTestDate(test.assessment_date || "");
        setShowEditTest(true);
    }

    async function saveEditedTest() {
        if (!editingTest) return;

        const title = editTestTitle.trim();
        if (!title) return;

        try {
            setSavingEditTest(true);
            setError(null);

            const updated = (await apiFetch(`${API_BASE}/assessments/${editingTest.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    title,
                    assessment_date: editTestDate.trim() || null,
                }),
            })) as Assessment;

            setTests((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

            if (selectedAssessment?.id === updated.id) {
                setSelectedAssessment(updated);
            }

            setShowEditTest(false);
            setEditingTest(null);
            setEditTestTitle("");
            setEditTestDate("");
        } catch (e: any) {
            setError(
                e?.message ||
                "Failed to update test. You may need to add PUT /assessments/{id} on the backend."
            );
        } finally {
            setSavingEditTest(false);
        }
    }

    async function deleteAssessment(assessment: Assessment) {
        const ok = window.confirm(
            `Delete "${assessment.title}"?\n\nThis should also remove its saved results.`
        );
        if (!ok) return;

        try {
            setError(null);

            await apiFetch(`${API_BASE}/assessments/${assessment.id}`, {
                method: "DELETE",
            });

            setTests((prev) => prev.filter((t) => t.id !== assessment.id));

            if (selectedAssessment?.id === assessment.id) {
                setShowResults(false);
                setSelectedAssessment(null);
                setResultRows([]);
            }

            if (tab === "insights") {
                loadInsights();
            }
        } catch (e: any) {
            setError(
                e?.message ||
                "Failed to delete test. You may need to add DELETE /assessments/{id} on the backend."
            );
        }
    }

    async function openResults(assessmentId: number) {
        try {
            setError(null);
            const data = await apiFetch(`${API_BASE}/assessments/${assessmentId}/results`);

            setSelectedAssessment(data.assessment);
            setResultRows(Array.isArray(data.results) ? data.results : []);
            setShowResults(true);
        } catch (e: any) {
            setError(e?.message || "Failed to load results");
        }
    }

    async function loadInsights() {
        if (!validClassId) return;

        setInsightsLoading(true);
        setInsightsError(null);

        try {
            const data = (await apiFetch(
                `${API_BASE}/classes/${classId}/insights`
            )) as InsightsPayload;
            setInsights(data);
        } catch (e: any) {
            setInsightsError(e?.message || "Failed to load insights");
            setInsights(null);
        } finally {
            setInsightsLoading(false);
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

    function clearStudentResult(studentId: number) {
        setResultRows((prev) =>
            prev.map((r) =>
                r.student_id === studentId
                    ? {
                        ...r,
                        score_percent: null,
                        absent: false,
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

            await apiFetch(`${API_BASE}/assessments/${selectedAssessment.id}/results`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });

            setShowResults(false);
            setSelectedAssessment(null);
            setResultRows([]);
            if (tab === "insights") {
                loadInsights();
            }
        } catch (e: any) {
            setError(e?.message || "Failed to save results");
        } finally {
            setSavingResults(false);
        }
    }

    function openClassReport() {
        window.open(`/#/class/${classId}/report`, "_blank", "noopener,noreferrer");
    }

    function openStudentReport(studentId: number) {
        window.open(`/#/class/${classId}/student-report/${studentId}`, "_blank", "noopener,noreferrer");
    }
    const insightByStudent = useMemo(() => {
        const m = new Map<number, InsightStudentRow>();
        for (const row of insights?.student_rankings || []) {
            m.set(row.student_id, row);
        }
        return m;
    }, [insights]);

    function updateReportDraft(studentId: number, patch: Partial<StudentReportDraft>) {
        setReportDrafts((prev) => {
            const existing = prev[studentId];

            return {
                ...prev,
                [studentId]: existing
                    ? { ...existing, ...patch }
                    : {
                        length: "Medium",
                        indicators: [],
                        signOff: "",
                        comment: "",
                        ...patch,
                    },
            };
        });
    }
    function toggleReportIndicator(studentId: number, label: string) {
        const current = reportDrafts[studentId] || {
            length: "Medium" as ReportLength,
            indicators: [],
            signOff: "",
            comment: "",
        };

        const exists = current.indicators.includes(label);

        updateReportDraft(studentId, {
            indicators: exists
                ? current.indicators.filter((x) => x !== label)
                : [...current.indicators, label],
        });
    }

    async function generateReportComment(studentId: number) {
        const draft = reportDrafts[studentId];
        if (!draft) return;

        try {
            setGeneratingReportFor(studentId);
            setReportError(null);

            const data = await apiFetch(
                `${API_BASE}/classes/${classId}/students/${studentId}/generate-report-comment`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        length: draft.length,
                        indicators: draft.indicators,
                        sign_off: draft.signOff.trim() || null,
                    }),
                }
            );

            updateReportDraft(studentId, {
                comment: data.comment || "",
            });
        } catch (e: any) {
            setReportError(e?.message || "Failed to generate report comment");
        } finally {
            setGeneratingReportFor(null);
        }
    }

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
        const d = latest - avg;
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

        return (
            <svg className={common} viewBox="0 0 24 24" fill="none">
                <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
            .flatMap((p) => [p.student, p.class_avg])
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
                    points={poly((p) => p.class_avg)}
                    fill="none"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="stroke-red-500"
                />
                <polyline
                    points={poly((p) => p.student)}
                    fill="none"
                    strokeWidth="2.5"
                    className="stroke-slate-900"
                />
            </svg>
        );
    }

    const resultsEnteredCount = resultRows.filter(
        (r) => r.absent || typeof r.score_percent === "number"
    ).length;

    const numericScores = resultRows
        .filter((r) => !r.absent && typeof r.score_percent === "number")
        .map((r) => r.score_percent as number);

    const modalAverage =
        numericScores.length > 0
            ? numericScores.reduce((sum, n) => sum + n, 0) / numericScores.length
            : null;

    return (
        <>
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

                            <button
                                type="button"
                                onClick={() => setTab("reports")}
                                className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-md transition
    ${tab === "reports"
                                        ? "bg-gradient-to-r from-teal-500 via-blue-500 to-emerald-500"
                                        : "bg-gradient-to-r from-teal-400 via-blue-400 to-emerald-400 hover:from-teal-500 hover:via-blue-500 hover:to-emerald-500"
                                    }`}
                            >
                                <span className="relative flex items-center justify-center">

                                    {/* pulsing AI halo */}
                                    <span className="absolute inline-flex h-4 w-4 rounded-full bg-white opacity-40 animate-[ping_2s_ease-out_infinite]"></span>

                                    {/* brain icon */}
                                    <span className="relative text-xs">🧠</span>

                                </span>

                                Report Comments Generator
                            </button>
                        </div>

                        {tab === "tests" && (
                            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg font-extrabold tracking-tight text-slate-900">
                                        Tests & Results
                                    </div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        Create, edit and delete tests • Enter % per student • Mark absent • Clear saved results
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-extrabold tracking-tight text-slate-900">Student Roster</div>
                                <div className="mt-1 text-sm text-slate-600">
                                    Add first names only. Use notes for quick teacher reminders.
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={generateStudentLink}
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                >
                                    Refresh Student Link
                                </button>

                                {studentToken && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            navigator.clipboard.writeText(`${window.location.origin}/s/${studentToken}`).catch(() => { })
                                        }
                                        className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                    >
                                        Copy Student Link
                                    </button>
                                )}
                            </div>
                        </div>

                        {studentToken && (
                            <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                                Student access link ready for this class.
                            </div>
                        )}

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
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleActive(s.id, !s.active)}
                                                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                                >
                                                    {s.active ? "Deactivate" : "Activate"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeletingStudent(s)}
                                                    className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
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
                            Open a test to enter results, edit the test details, or delete it completely.
                        </div>

                        <div className="mt-4">
                            {loading ? (
                                <div className="text-sm text-slate-600">Loading…</div>
                            ) : tests.length === 0 ? (
                                <div className="text-sm text-slate-600">No tests yet.</div>
                            ) : (
                                <div className="divide-y divide-slate-200 rounded-3xl border-2 border-slate-200 bg-white">
                                    {tests.map((t) => (
                                        <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                            <div>
                                                <div className="font-semibold text-slate-900">{t.title}</div>
                                                <div className="text-sm text-slate-600">{t.assessment_date || "No date set"}</div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                                    onClick={() => openResults(t.id)}
                                                >
                                                    Enter Results
                                                </button>

                                                <button
                                                    type="button"
                                                    className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                                                    onClick={() => openEditTestModal(t)}
                                                >
                                                    Edit Test
                                                </button>

                                                <button
                                                    type="button"
                                                    className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                                                    onClick={() => deleteAssessment(t)}
                                                >
                                                    Delete Test
                                                </button>
                                            </div>
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-extrabold tracking-tight text-slate-900">Insights</div>
                                <div className="mt-1 text-sm text-slate-600">
                                    Strongest → weakest by average • Class average • At-risk list
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={openClassReport}
                                    className="rounded-2xl border-2 border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
                                >
                                    Open Class Report
                                </button>

                                <button
                                    type="button"
                                    onClick={loadInsights}
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                >
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {cat4Enabled && (
                            <div className="mt-4 rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-sky-700">Pilot</div>
                                        <div className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">CAT4 Insights</div>
                                        <div className="mt-1 text-sm text-slate-600">
                                            Compare CAT4 baseline ability with named term result sets and review matched versus unmatched rows.
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => navigate(`/class/${classId}/admin/cat4`)}
                                        className="rounded-2xl border-2 border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
                                    >
                                        Open CAT4 Insights
                                    </button>
                                </div>
                            </div>
                        )}

                        {insightsError && (
                            <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                                {insightsError}
                            </div>
                        )}

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                            <div className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-600">Class Average</div>
                                <div className="mt-2 flex items-end gap-3">
                                    <div className="text-4xl font-extrabold tracking-tight text-slate-900">
                                        {insightsLoading ? "…" : pct(insights?.class_average ?? null)}
                                    </div>

                                    <span
                                        className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${avgPillClass(
                                            insights?.class_average ?? null
                                        )}`}
                                        title="Colour bands: 85+ excellent, 70+ strong, 50+ watch, below 50 at-risk"
                                    >
                                        {insights?.assessment_count ?? 0} assessments
                                    </span>
                                </div>

                                <div className="mt-2 text-xs text-slate-500">
                                    Active students: {insights?.active_student_count ?? 0}
                                </div>
                            </div>

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
                                    <div className="grid grid-cols-12 items-center bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                                        <div className="col-span-3">Name</div>
                                        <div className="col-span-2">Average</div>
                                        <div className="col-span-2">Latest</div>
                                        <div className="col-span-1">Taken</div>
                                        <div className="col-span-1">Missed</div>
                                        <div className="col-span-3 text-right">Report</div>
                                    </div>

                                    <div className="divide-y divide-slate-200">
                                        {insights.student_rankings.map((s) => {
                                            const t = trendFromLatest(s.average, s.latest);

                                            return (
                                                <div
                                                    key={s.student_id}
                                                    className="grid grid-cols-12 items-center px-4 py-3 text-sm"
                                                >
                                                    <div className="col-span-3 font-semibold text-slate-900">
                                                        <div className="col-span-3 font-semibold text-slate-900">
                                                            <button
                                                                type="button"
                                                                onClick={() => openStudentHistoryModal(s)}
                                                                className="underline decoration-dotted underline-offset-4 hover:text-emerald-700"
                                                            >
                                                                {s.first_name}
                                                            </button>
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
                                                        <span
                                                            className={`inline-flex items-center gap-1 text-xs font-semibold ${trendClass(t)}`}
                                                        >
                                                            <TrendIcon t={t} />
                                                            {s.latest == null ? "—" : `${s.latest.toFixed(0)}%`}
                                                            <span className="ml-1 font-normal">{trendText(t)}</span>
                                                        </span>
                                                    </div>

                                                    <div className="col-span-1 text-slate-700">{s.taken}</div>
                                                    <div className="col-span-1 text-slate-700">{s.missed}</div>

                                                    <div className="col-span-3 flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => openStudentReport(s.student_id)}
                                                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                                                        >
                                                            Open Student Report
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === "reports" && (
                    <div className={`${card} ${cardPad} mt-6`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-extrabold tracking-tight text-slate-900">AI Report Comments</div>
                                <div className="mt-1 text-sm text-slate-600">
                                    Generate individual student report comments using results + teacher-selected indicators.
                                </div>
                            </div>

                            <div className="text-xs text-slate-500">
                                Phase 2A • Per-student generation
                            </div>
                        </div>

                        {reportError && (
                            <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                                {reportError}
                            </div>
                        )}

                        <div className="mt-5 space-y-4">
                            {students.length === 0 ? (
                                <div className="text-sm text-slate-600">No students yet.</div>
                            ) : (
                                students
                                    .filter((s) => s.active)
                                    .map((s) => {
                                        const draft = reportDrafts[s.id] || {
                                            length: "Medium" as ReportLength,
                                            indicators: [],
                                            signOff: "",
                                            comment: "",
                                        };

                                        const insight = insightByStudent.get(s.id);

                                        return (
                                            <div key={s.id} className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-base font-extrabold tracking-tight text-slate-900">
                                                            {s.first_name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-slate-600">
                                                            Avg: {insight?.average == null ? "—" : `${insight.average}%`}
                                                            <span className="mx-2 text-slate-300">•</span>
                                                            Latest: {insight?.latest == null ? "—" : `${insight.latest}%`}
                                                            <span className="mx-2 text-slate-300">•</span>
                                                            Taken: {insight?.taken ?? 0}
                                                            <span className="mx-2 text-slate-300">•</span>
                                                            Missed: {insight?.missed ?? 0}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={draft.length}
                                                            onChange={(e) =>
                                                                updateReportDraft(s.id, {
                                                                    length: e.target.value as ReportLength,
                                                                })
                                                            }
                                                            className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                                        >
                                                            <option value="Short">Short</option>
                                                            <option value="Medium">Medium</option>
                                                            <option value="Long">Long</option>
                                                        </select>

                                                        <button
                                                            type="button"
                                                            onClick={() => generateReportComment(s.id)}
                                                            disabled={generatingReportFor === s.id}
                                                            className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                                        >
                                                            {generatingReportFor === s.id ? "Generating…" : "Generate Comment"}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mt-4">
                                                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                        Indicators
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        {REPORT_INDICATORS.map((label) => {
                                                            const active = draft.indicators.includes(label);

                                                            return (
                                                                <button
                                                                    key={label}
                                                                    type="button"
                                                                    onClick={() => toggleReportIndicator(s.id, label)}
                                                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active
                                                                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                                                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                                                        }`}
                                                                >
                                                                    {label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                                    <div className="md:col-span-3">
                                                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                            Final sign-off
                                                        </label>
                                                        <input
                                                            value={draft.signOff}
                                                            onChange={(e) =>
                                                                updateReportDraft(s.id, { signOff: e.target.value })
                                                            }
                                                            placeholder="e.g. Enjoy the summer break."
                                                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                                        />
                                                    </div>

                                                    <div className="md:col-span-3">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                                Comment
                                                            </label>

                                                            <button
                                                                type="button"
                                                                onClick={() => navigator.clipboard.writeText(draft.comment || "").catch(() => { })}
                                                                disabled={!draft.comment.trim()}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
                                                                title="Copy comment"
                                                            >
                                                                ⧉
                                                            </button>
                                                        </div>

                                                        <textarea
                                                            value={draft.comment}
                                                            onChange={(e) =>
                                                                updateReportDraft(s.id, { comment: e.target.value })
                                                            }
                                                            rows={4}
                                                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                                                            placeholder="Generated comment will appear here…"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                )}

                {selectedHistoryStudent && (
                    <div
                        className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
                        onClick={() => setSelectedHistoryStudent(null)}
                    >
                        <div
                            className="w-full max-w-2xl rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xl font-extrabold tracking-tight text-slate-900">
                                        {selectedHistoryStudent.first_name}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        Latest: <b>{selectedHistoryStudent.latest ?? "—"}</b>% · Avg:{" "}
                                        <b>{selectedHistoryStudent.average ?? "—"}</b>% · Taken:{" "}
                                        <b>{selectedHistoryStudent.taken}</b> · Missed:{" "}
                                        <b>{selectedHistoryStudent.missed}</b>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSelectedHistoryStudent(null)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                                    title="Close"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 p-3">
                                {historyLoading[selectedHistoryStudent.student_id] && (
                                    <div className="text-sm text-slate-500">Loading…</div>
                                )}

                                {!historyLoading[selectedHistoryStudent.student_id] &&
                                    historyCache[selectedHistoryStudent.student_id]?.points?.length ? (
                                    <>
                                        <Sparkline
                                            points={historyCache[selectedHistoryStudent.student_id]!.points.slice(-8)}
                                        />

                                        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                            {historyCache[selectedHistoryStudent.student_id]!.points
                                                .slice(-10)
                                                .slice()
                                                .reverse()
                                                .map((p) => {
                                                    const delta =
                                                        typeof p.student === "number" &&
                                                            typeof p.class_avg === "number"
                                                            ? Math.round((p.student - p.class_avg) * 10) / 10
                                                            : null;

                                                    return (
                                                        <div
                                                            key={p.assessment_id}
                                                            className="flex items-center justify-between gap-3 border-b border-slate-200/70 py-2 last:border-b-0"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-semibold text-slate-800">
                                                                    {p.title}
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {p.date ?? ""}
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-right">
                                                                <div className="text-sm font-extrabold text-slate-900">
                                                                    {p.absent
                                                                        ? "Absent"
                                                                        : p.student == null
                                                                            ? "—"
                                                                            : `${p.student}%`}
                                                                </div>

                                                                <div className="text-xs text-slate-500">
                                                                    {typeof p.class_avg === "number"
                                                                        ? `avg ${p.class_avg}%`
                                                                        : "avg —"}
                                                                    {delta != null && (
                                                                        <span
                                                                            className={
                                                                                delta >= 0
                                                                                    ? "ml-1 text-emerald-700"
                                                                                    : "ml-1 text-rose-700"
                                                                            }
                                                                        >
                                                                            ({delta >= 0 ? "+" : ""}
                                                                            {delta})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>

                                        <div className="mt-3 text-xs text-slate-500">
                                            Solid = student · Dotted red = class average
                                        </div>
                                    </>
                                ) : null}

                                {!historyLoading[selectedHistoryStudent.student_id] &&
                                    !historyCache[selectedHistoryStudent.student_id]?.points?.length && (
                                        <div className="text-sm text-slate-500">No history available yet.</div>
                                    )}
                            </div>
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

                {/* Edit Test Modal */}
                {showEditTest && editingTest && (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
                        <div className="w-full max-w-lg rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                            <div className="flex items-center justify-between">
                                <div className="text-lg font-extrabold text-slate-900">Edit Test</div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditTest(false);
                                        setEditingTest(null);
                                    }}
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <label className="text-sm font-semibold text-slate-700">
                                    Test title
                                    <input
                                        value={editTestTitle}
                                        onChange={(e) => setEditTestTitle(e.target.value)}
                                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                                        placeholder="e.g. Waves Test"
                                    />
                                </label>

                                <label className="text-sm font-semibold text-slate-700">
                                    Date (optional)
                                    <input
                                        type="date"
                                        value={editTestDate}
                                        onChange={(e) => setEditTestDate(e.target.value)}
                                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2"
                                    />
                                </label>

                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={saveEditedTest}
                                        disabled={!editTestTitle.trim() || savingEditTest}
                                        className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        {savingEditTest ? "Saving…" : "Save Changes"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Enter Results Modal */}
                {showResults && selectedAssessment && (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
                        <div className="w-full max-w-4xl rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
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
                                        onClick={() => openEditTestModal(selectedAssessment)}
                                        className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                                    >
                                        Edit Test
                                    </button>

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

                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-semibold text-slate-500">Students</div>
                                    <div className="mt-1 text-2xl font-extrabold text-slate-900">{resultRows.length}</div>
                                </div>

                                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-semibold text-slate-500">Entered / absent</div>
                                    <div className="mt-1 text-2xl font-extrabold text-slate-900">{resultsEnteredCount}</div>
                                </div>

                                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-semibold text-slate-500">Current average</div>
                                    <div className={`mt-1 text-2xl font-extrabold ${avgClass(modalAverage)}`}>
                                        {modalAverage == null ? "—" : `${modalAverage.toFixed(1)}%`}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-3xl border-2 border-slate-200">
                                <div className="grid grid-cols-12 gap-2 border-b-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                                    <div className="col-span-4">Student</div>
                                    <div className="col-span-3">Result (%)</div>
                                    <div className="col-span-2 text-center">Absent</div>
                                    <div className="col-span-3 text-right">Actions</div>
                                </div>

                                <div className="max-h-[60vh] overflow-auto">
                                    {resultRows.map((r) => (
                                        <div
                                            key={r.student_id}
                                            className="grid grid-cols-12 items-center gap-2 border-b border-slate-100 px-3 py-2"
                                        >
                                            <div className="col-span-4 font-semibold text-slate-900">{r.first_name}</div>

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

                                            <div className="col-span-2 flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleAbsent(r.student_id)}
                                                    className={
                                                        r.absent
                                                            ? "rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                                                            : "rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                                                    }
                                                >
                                                    {r.absent ? "Yes" : "No"}
                                                </button>
                                            </div>

                                            <div className="col-span-3 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => clearStudentResult(r.student_id)}
                                                    className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                                                >
                                                    Clear Result
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 text-xs text-slate-500">
                                Tip: leaving a score blank keeps it empty; “Absent” excludes them from averages; “Clear Result” removes a saved result for that student when you click Save.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {deletingStudent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
                <div className="w-full max-w-lg rounded-2xl border-2 border-slate-200 bg-white p-5">
                    <div className="text-xl font-semibold">Delete student?</div>
                    <div className="mt-2 text-sm text-slate-600">
                        Deleting {deletingStudent.first_name} will also permanently remove their saved results and result history for this class.
                        Please print or save any report you may need before continuing.
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                            onClick={() => setDeletingStudent(null)}
                            disabled={deleteBusy}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded-2xl border-2 border-rose-700 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            onClick={() => void confirmDeleteStudent()}
                            disabled={deleteBusy}
                        >
                            {deleteBusy ? "Deleting…" : "Delete student"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
