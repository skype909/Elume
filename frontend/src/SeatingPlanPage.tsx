import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE = "/api";

type ClassItem = { id: number; name: string; subject: string };

type StudentRow = {
    id: number;
    class_id: number;
    first_name: string;
    notes?: string | null;
    active: boolean;
};

type TableConfig = {
    id: string; // stable id for table
    seats: number; // 1..6
};

type SeatingLayout = {
    rows: number; // number of rows of tables
    tablesPerRow: number; // how many tables in each row
    tables: TableConfig[]; // length = rows * tablesPerRow
};

type RosterOverride = {
    // We keep a seating-plan specific list of included student IDs
    includedStudentIds: number[];

    // Plus manual names that don’t exist in Class Admin (optional)
    manualStudents: { id: string; name: string }[];
};

type Assignment = {
    // tableId -> list of assigned names (length <= seats)
    [tableId: string]: string[];
};

type SeatingPlanState = {
    layout: SeatingLayout | null;
    roster: RosterOverride | null;
    assignment: Assignment | null;
    updatedAt: string;
};

function uid(prefix = "t") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

/**
 * Create a default table list for a given rows x tablesPerRow.
 * Default seats per table = 2.
 */
function makeLayout(rows: number, tablesPerRow: number): SeatingLayout {
    const r = clamp(rows, 1, 12);
    const c = clamp(tablesPerRow, 1, 12);
    const total = r * c;

    const tables: TableConfig[] = Array.from({ length: total }).map((_, idx) => ({
        id: `table_${idx + 1}_${uid("tbl")}`,
        seats: 2,
    }));

    return { rows: r, tablesPerRow: c, tables };
}

/**
 * Core: generate seating assignment trying to avoid any table having exactly 1 student.
 * - We never force-fill 1-seat tables; they will stay empty unless unavoidable.
 * - We try to fix a "last table has 1" by moving one student from a table that has 3+.
 *
 * Returns { assignment, warning? }
 */
function generateAssignment(
    layout: SeatingLayout,
    rosterNames: string[]
): { assignment: Assignment; warning?: string } {
    const tables = layout.tables;

    const shuffled = shuffle(rosterNames);
    const assignment: Assignment = {};
    tables.forEach((t) => (assignment[t.id] = []));

    // Prefer filling tables with seats >= 2 first; keep 1-seat tables last
    const tablesOrder = [...tables].sort((a, b) => {
        const aScore = a.seats === 1 ? 999 : a.seats;
        const bScore = b.seats === 1 ? 999 : b.seats;
        return aScore - bScore;
    });

    let remaining = [...shuffled];

    // Step 1: naive fill in order (up to capacity), skipping 1-seat tables where possible
    for (const t of tablesOrder) {
        if (remaining.length === 0) break;

        const cap = t.seats;

        // If cap === 1, only use it if we have no other capacity left later
        // (we’ll generally try to keep these empty)
        if (cap === 1) continue;

        const take = Math.min(cap, remaining.length);
        assignment[t.id] = remaining.slice(0, take);
        remaining = remaining.slice(take);
    }

    // If we still have remaining students, we MUST use whatever tables are left (including 1-seat)
    if (remaining.length > 0) {
        for (const t of tablesOrder) {
            if (remaining.length === 0) break;
            const cap = t.seats;
            const current = assignment[t.id] || [];
            if (current.length >= cap) continue;

            const space = cap - current.length;
            const take = Math.min(space, remaining.length);
            assignment[t.id] = current.concat(remaining.slice(0, take));
            remaining = remaining.slice(take);
        }
    }

    // Step 2: fix any singleton tables (most commonly 1 student in a table)
    // We try to resolve by moving one student from a table that has >= 3 students.
    const singletonTableIds = tables
        .map((t) => t.id)
        .filter((id) => (assignment[id]?.length || 0) === 1);

    let warning: string | undefined;

    for (const singleId of singletonTableIds) {
        // Find donor table with >= 3 students
        const donorId = tables
            .map((t) => t.id)
            .find((id) => (assignment[id]?.length || 0) >= 3);

        if (!donorId) {
            warning =
                "With the current table sizes, it isn’t possible to avoid a student sitting alone. Try increasing seats on one table (e.g., make one table 3+) or reducing 1-seat tables.";
            break;
        }

        const donor = assignment[donorId];
        const moved = donor.pop(); // take one from donor
        if (moved) {
            assignment[singleId].push(moved); // singleton becomes 2
        }
    }

    return { assignment, warning };
}

export default function SeatingPlanPage() {
    const { id } = useParams();
    const classId = Number(id);
    const navigate = useNavigate();

    const STORAGE_KEY = useMemo(() => `elume_seating_plan_v1_${classId}`, [classId]);

    const [classInfo, setClassInfo] = useState<ClassItem | null>(null);
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [state, setState] = useState<SeatingPlanState>({
        layout: null,
        roster: null,
        assignment: null,
        updatedAt: new Date().toISOString(),
    });

    const [wizardRows, setWizardRows] = useState(4);
    const [wizardTablesPerRow, setWizardTablesPerRow] = useState(5);

    const [warning, setWarning] = useState<string | null>(null);
    const [selectedSeat, setSelectedSeat] = useState<{ tableId: string; seatIndex: number } | null>(null);
    const [newManualName, setNewManualName] = useState("");

    // ---- load class + students
    useEffect(() => {
        if (!classId || Number.isNaN(classId)) {
            setError("Invalid class id.");
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        Promise.all([
            fetch(`${API_BASE}/classes/${classId}`, { signal: controller.signal }).then(async (r) => {
                if (!r.ok) throw new Error("Failed to load class.");
                return (await r.json()) as ClassItem;
            }),
            fetch(`${API_BASE}/classes/${classId}/students`, { signal: controller.signal }).then(async (r) => {
                if (!r.ok) throw new Error("Failed to load students.");
                return (await r.json()) as StudentRow[];
            }),
        ])
            .then(([cls, studs]) => {
                setClassInfo(cls);
                setStudents(studs || []);
            })
            .catch((e: any) => setError(e?.message || "Failed to load data."))
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [classId]);

    // ---- load saved seating plan (localStorage)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as SeatingPlanState;
            if (parsed && typeof parsed === "object") {
                setState(parsed);
            }
        } catch {
            // ignore bad storage
        }
    }, [STORAGE_KEY]);

    // ---- persist on change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // ignore
        }
    }, [STORAGE_KEY, state]);

    // ---- derived: base roster names from Class Admin (active only by default)
    const baseStudentNames = useMemo(() => {
        // In your backend, students include inactive too.
        // For seating plan, we *default* to active students only.
        return students
            .filter((s) => s.active)
            .map((s) => ({ id: s.id, name: s.first_name?.trim() || `Student ${s.id}` }));
    }, [students]);

    // ---- derived: seating plan roster
    const seatingRoster = useMemo(() => {
        const roster = state.roster;

        // If no roster saved yet, default to active students
        const includedIds = roster?.includedStudentIds?.length
            ? roster.includedStudentIds
            : baseStudentNames.map((s) => s.id);

        const includedFromAdmin = baseStudentNames
            .filter((s) => includedIds.includes(s.id))
            .map((s) => s.name);

        const manual = roster?.manualStudents?.map((m) => m.name.trim()).filter(Boolean) || [];

        return [...includedFromAdmin, ...manual].filter(Boolean);
    }, [state.roster, baseStudentNames]);

    const seatingRosterCount = seatingRoster.length;

    const totalSeatCapacity = useMemo(() => {
        if (!state.layout) return 0;
        return state.layout.tables.reduce((sum, t) => sum + (t.seats || 0), 0);
    }, [state.layout]);

    // ---- actions
    function initWizardLayout() {
        const layout = makeLayout(wizardRows, wizardTablesPerRow);

        const roster: RosterOverride = {
            includedStudentIds: baseStudentNames.map((s) => s.id),
            manualStudents: [],
        };

        const { assignment, warning: w } = generateAssignment(layout, [
            ...baseStudentNames.map((s) => s.name),
            ...(roster.manualStudents?.map((m) => m.name) || []),
        ]);

        setWarning(w || null);

        setState({
            layout,
            roster,
            assignment,
            updatedAt: new Date().toISOString(),
        });
    }

    function setTableSeats(tableId: string, seats: number) {
        const layout = state.layout;
        if (!layout) return;

        const nextSeats = clamp(seats, 1, 6);

        const next: SeatingLayout = {
            ...layout,
            tables: layout.tables.map((t) => (t.id === tableId ? { ...t, seats: nextSeats } : t)),
        };

        setState((prev) => ({ ...prev, layout: next, updatedAt: new Date().toISOString() }));
    }

    function regenerate() {
        if (!state.layout) return;
        setSelectedSeat(null);
        const { assignment, warning: w } = generateAssignment(state.layout, seatingRoster);
        setWarning(w || null);
        setState((prev) => ({
            ...prev,
            assignment,
            updatedAt: new Date().toISOString(),
        }));
    }

    function toggleIncludedStudent(idNum: number) {
        const roster = state.roster || {
            includedStudentIds: baseStudentNames.map((s) => s.id),
            manualStudents: [],
        };

        const exists = roster.includedStudentIds.includes(idNum);
        const nextIds = exists
            ? roster.includedStudentIds.filter((x) => x !== idNum)
            : [...roster.includedStudentIds, idNum];

        setState((prev) => ({
            ...prev,
            roster: { ...roster, includedStudentIds: nextIds },
            updatedAt: new Date().toISOString(),
        }));
    }

    function addManualStudent() {
        const name = newManualName.trim();
        if (!name) return;

        const roster = state.roster || {
            includedStudentIds: baseStudentNames.map((s) => s.id),
            manualStudents: [],
        };

        const next = {
            ...roster,
            manualStudents: [...(roster.manualStudents || []), { id: uid("manual"), name }],
        };

        setNewManualName("");

        setState((prev) => ({
            ...prev,
            roster: next,
            updatedAt: new Date().toISOString(),
        }));
    }

    function removeManualStudent(manualId: string) {
        const roster = state.roster;
        if (!roster) return;

        const next = {
            ...roster,
            manualStudents: (roster.manualStudents || []).filter((m) => m.id !== manualId),
        };

        setState((prev) => ({
            ...prev,
            roster: next,
            updatedAt: new Date().toISOString(),
        }));
    }

    function handleSeatClick(tableId: string, seatIndex: number) {
        if (!state.layout) return;

        // Ensure there is an assignment array for every table
        const currentAssignment: Assignment = state.assignment ? { ...state.assignment } : {};
        for (const t of state.layout.tables) {
            if (!currentAssignment[t.id]) currentAssignment[t.id] = [];
        }

        // If first tap: select seat
        if (!selectedSeat) {
            setSelectedSeat({ tableId, seatIndex });
            return;
        }

        // If tapped the same seat again: unselect
        if (selectedSeat.tableId === tableId && selectedSeat.seatIndex === seatIndex) {
            setSelectedSeat(null);
            return;
        }

        // Swap values (names or empty)
        const aTable = selectedSeat.tableId;
        const aIndex = selectedSeat.seatIndex;

        const aArr = [...(currentAssignment[aTable] || [])];
        const bArr = [...(currentAssignment[tableId] || [])];

        const aVal = aArr[aIndex] || "";
        const bVal = bArr[seatIndex] || "";

        aArr[aIndex] = bVal;
        bArr[seatIndex] = aVal;

        currentAssignment[aTable] = aArr;
        currentAssignment[tableId] = bArr;

        setState((prev) => ({
            ...prev,
            assignment: currentAssignment,
            updatedAt: new Date().toISOString(),
        }));

        setSelectedSeat(null);
    }


    // Layout for rendering tables grid
    const gridStyle = useMemo(() => {
        if (!state.layout) return {};
        return {
            gridTemplateColumns: `repeat(${state.layout.tablesPerRow}, minmax(0, 1fr))`,
        } as React.CSSProperties;
    }, [state.layout]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 p-6">
                <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                    <div className="text-lg font-semibold text-slate-800">Loading seating plan…</div>
                    <div className="mt-2 text-sm text-slate-600">Fetching class + students…</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 p-6">
                <div className="rounded-3xl border-2 border-rose-200 bg-white p-6 shadow-sm">
                    <div className="text-lg font-semibold text-rose-700">Something went wrong</div>
                    <div className="mt-2 text-sm text-slate-700">{error}</div>
                    <button
                        className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => navigate(`/class/${classId}`)}
                    >
                        Back to class
                    </button>
                </div>
            </div>
        );
    }

    const title = `${classInfo?.name || `Class ${classId}`} — Seating Plan`;

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-6">
            {/* Header */}
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</div>
                    <div className="mt-1 text-sm text-slate-600">
                        Regenerate every 6 weeks • Roster is editable here without affecting Class Admin
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                        onClick={() => navigate(`/class/${classId}`)}
                    >
                        ← Back to class
                    </button>

                    {state.layout && (
                        <button
                            className="rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                            onClick={regenerate}
                        >
                            🔁 Regenerate
                        </button>
                    )}
                </div>
            </div>

            {/* Main split */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left: controls */}
                <div className="lg:col-span-4">
                    <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-lg font-bold text-slate-900">Setup & Roster</div>

                        {!state.layout ? (
                            <>
                                <div className="mt-3 text-sm text-slate-600">
                                    First time here — tell me the classroom layout and I’ll generate the seating plan.
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <label className="text-sm font-semibold text-slate-700">
                                        Rows of tables
                                        <input
                                            type="number"
                                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
                                            value={wizardRows}
                                            min={1}
                                            max={12}
                                            onChange={(e) => setWizardRows(clamp(parseInt(e.target.value || "4", 10), 1, 12))}
                                        />
                                    </label>

                                    <label className="text-sm font-semibold text-slate-700">
                                        Tables per row
                                        <input
                                            type="number"
                                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
                                            value={wizardTablesPerRow}
                                            min={1}
                                            max={12}
                                            onChange={(e) =>
                                                setWizardTablesPerRow(clamp(parseInt(e.target.value || "5", 10), 1, 12))
                                            }
                                        />
                                    </label>
                                </div>

                                <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                    <div className="font-semibold">Students detected (active)</div>
                                    <div className="mt-1">
                                        {baseStudentNames.length} student{baseStudentNames.length === 1 ? "" : "s"} will be included by
                                        default.
                                    </div>
                                </div>

                                <button
                                    className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-95"
                                    onClick={initWizardLayout}
                                >
                                    Create seating plan
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-600">Students in plan</div>
                                        <div className="text-xl font-extrabold text-slate-900">{seatingRosterCount}</div>
                                    </div>
                                    <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-600">Total seats</div>
                                        <div className="text-xl font-extrabold text-slate-900">{totalSeatCapacity}</div>
                                    </div>
                                </div>

                                {warning && (
                                    <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        <div className="font-bold">Heads up</div>
                                        <div className="mt-1">{warning}</div>
                                    </div>
                                )}

                                {/* Roster editor */}
                                <div className="mt-4">
                                    <div className="text-sm font-bold text-slate-900">Roster override</div>
                                    <div className="mt-1 text-xs text-slate-600">
                                        Toggle students included in the seating plan (doesn’t change Class Admin).
                                    </div>

                                    <div className="mt-3 max-h-64 overflow-auto rounded-2xl border-2 border-slate-200">
                                        {baseStudentNames.map((s) => {
                                            const roster = state.roster;
                                            const includedIds = roster?.includedStudentIds?.length
                                                ? roster.includedStudentIds
                                                : baseStudentNames.map((x) => x.id);
                                            const included = includedIds.includes(s.id);

                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                                                    onClick={() => toggleIncludedStudent(s.id)}
                                                >
                                                    <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                                                    <div
                                                        className={`rounded-full px-2 py-1 text-xs font-bold ${included ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                                                            }`}
                                                    >
                                                        {included ? "Included" : "Excluded"}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Manual add */}
                                    <div className="mt-4">
                                        <div className="text-sm font-bold text-slate-900">Add student (manual)</div>
                                        <div className="mt-1 text-xs text-slate-600">
                                            Useful if a student dropped level but you still want them in this seating plan.
                                        </div>

                                        <div className="mt-2 flex gap-2">
                                            <input
                                                className="flex-1 rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
                                                placeholder="Student name…"
                                                value={newManualName}
                                                onChange={(e) => setNewManualName(e.target.value)}
                                            />
                                            <button
                                                className="rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:opacity-95"
                                                onClick={addManualStudent}
                                            >
                                                Add
                                            </button>
                                        </div>

                                        {state.roster?.manualStudents?.length ? (
                                            <div className="mt-3 rounded-2xl border-2 border-slate-200 bg-white">
                                                {state.roster.manualStudents.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        className="flex items-center justify-between border-b border-slate-100 px-3 py-2"
                                                    >
                                                        <div className="text-sm font-semibold text-slate-800">{m.name}</div>
                                                        <button
                                                            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                                            onClick={() => removeManualStudent(m.id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Regenerate after roster changes */}
                                    <button
                                        className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
                                        onClick={regenerate}
                                    >
                                        Apply roster changes + regenerate
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: classroom overhead view */}
                <div className="lg:col-span-8">
                    <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-lg font-bold text-slate-900">Overhead classroom view</div>
                                <div className="mt-1 text-xs text-slate-600">
                                    Teacher desk at the top • Tables below • Click table seat count to adjust (1–6)
                                </div>
                            </div>

                            {state.layout ? (
                                <button
                                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                                    onClick={() => {
                                        if (!window.confirm("Reset seating plan layout? This will clear layout + roster overrides for this class.")) return;
                                        setWarning(null);
                                        setState({
                                            layout: null,
                                            roster: null,
                                            assignment: null,
                                            updatedAt: new Date().toISOString(),
                                        });
                                    }}
                                >
                                    Reset layout
                                </button>
                            ) : null}
                        </div>

                        {!state.layout ? (
                            <div className="mt-6 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                <div className="text-base font-bold text-slate-900">No seating plan yet</div>
                                <div className="mt-2 text-sm text-slate-600">
                                    Use the setup panel on the left to create your classroom layout.
                                </div>
                            </div>
                        ) : (
                            <div className="mt-5">
                                {/* Teacher desk */}
                                <div className="mb-4 flex justify-center">
                                    <div className="w-full max-w-xl rounded-3xl border-2 border-slate-200 bg-slate-50 p-4 text-center shadow-sm">
                                        <div className="text-xs font-bold text-slate-600">FRONT OF ROOM</div>
                                        <div className="mt-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-900">
                                            Teacher Desk
                                        </div>
                                    </div>
                                </div>

                                {/* Tables grid */}
                                <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                                    <div className="grid gap-3" style={gridStyle}>
                                        {state.layout.tables.map((t) => {
                                            const assigned = state.assignment?.[t.id] || [];

                                            return (
                                                <div
                                                    key={t.id}
                                                    className="rounded-3xl border-2 border-slate-200 bg-white p-3 shadow-sm"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs font-bold text-slate-600">Table</div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-[11px] font-semibold text-slate-600">Seats</div>
                                                            <select
                                                                className="rounded-xl border-2 border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800"
                                                                value={t.seats}
                                                                onChange={(e) => setTableSeats(t.id, parseInt(e.target.value, 10))}
                                                            >
                                                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                                                    <option key={n} value={n}>
                                                                        {n}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Seats */}
                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                        {Array.from({ length: t.seats }).map((_, idx) => {
                                                            const name = assigned[idx] || "";
                                                            const isSelected =
                                                                selectedSeat?.tableId === t.id && selectedSeat?.seatIndex === idx;

                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => handleSeatClick(t.id, idx)}
                                                                    className={`rounded-2xl border-2 px-2 py-2 text-center text-xs font-bold transition ${isSelected
                                                                        ? "border-slate-900 bg-slate-900 text-white"
                                                                        : name
                                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:opacity-95"
                                                                            : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
                                                                        }`}
                                                                    title={
                                                                        isSelected
                                                                            ? "Selected — tap another seat to swap"
                                                                            : name || "Empty seat"
                                                                    }
                                                                >
                                                                    {name ? name : "Empty"}
                                                                </button>
                                                            );
                                                        })}

                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Footer info */}
                                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div className="text-xs text-slate-600">
                                        Last updated:{" "}
                                        <span className="font-semibold text-slate-800">
                                            {new Date(state.updatedAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="text-right"></div>
                                   
                                    <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                                        *If you ever see a singleton warning, make one table 3 seats (or reduce 1-seat tables).<br />
                                        *You can swap students by tapping a seat to select it, then tapping another seat to switch them.</div>
                                        </div>
                                    </div>
                        )}
                    </div>

                    {/* Space for future: behaviour rules, exclusions, seat locks */}
                    <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-sm font-bold text-slate-900">Next upgrades (I'm hoping to add next)</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                            <li>Save seating plans to the database (multi-device + cloud)</li>
                            <li>Seat “locks” (keep certain students fixed when regenerating)</li>
                            <li>Behaviour rules (separate specific pairs / keep apart)</li>
                            <li>Printable export</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
