import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import elumeLogo from "./assets/ELogo2.png";
import CollabBoard from "./CollabBoard";

const API_BASE = "/api";

type CollabCreateResponse = {
    session_code: string;
    join_url?: string | null;
};

type CollabStatus = {
    session_code: string;
    title: string;
    state: "lobby" | "assigning" | "live" | "review" | "ended";
    room_count: number;
    timer_minutes?: number | null;
    time_left_seconds?: number | null;
    joined_count: number;
    assigned_count: number;
};

type CollabParticipantApi = {
    id: number;
    anon_id: string;
    name: string;
    room_number: number | null;
    is_online: boolean;
};

type ToolKey =
    | "select"
    | "pen"
    | "eraser"
    | "highlighter"
    | "rectangle"
    | "circle"
    | "triangle"
    | "speech"
    | "sticky"
    | "arrow"
    | "curved-arrow"
    | "pdf";

type PenColor = "black" | "red" | "blue" | "yellow" | "green" | "purple";
type PenSize = 1 | 2 | 3;
type EraserSize = 1 | 2 | 3;
type HighlightColor = "yellow" | "green" | "blue";

type CollabParticipant = {
    id: string;
    name: string;
    joinedAt: string;
    roomNumber: number | null;
    isOnline: boolean;
};

type BreakoutRoom = {
    roomNumber: number;
    participantIds: string[];
};

type ReviewPanel = {
    id: string;
    selectedBoard: string;
};

type BoardOption = {
    value: string;
    label: string;
};

type SessionState = "draft" | "lobby" | "assigning" | "live" | "review" | "ended";

function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function cls(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(" ");
}

function JoinChip({
    label,
    value,
    onCopy,
}: {
    label: string;
    value: string;
    onCopy: () => void;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
            </div>
            <div className="mt-1 break-all text-sm font-semibold text-slate-800">{value}</div>
            <button
                type="button"
                onClick={onCopy}
                className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
            >
                Copy
            </button>
        </div>
    );
}

function StatTile({
    label,
    value,
    tone = "slate",
}: {
    label: string;
    value: React.ReactNode;
    tone?: "slate" | "emerald" | "violet" | "cyan";
}) {
    const toneMap = {
        slate: "from-white to-slate-50 border-slate-200 text-slate-900",
        emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-900",
        violet: "from-violet-50 to-white border-violet-200 text-violet-900",
        cyan: "from-cyan-50 to-white border-cyan-200 text-cyan-900",
    };

    return (
        <div className={cls("rounded-3xl border bg-gradient-to-br p-4 shadow-sm", toneMap[tone])}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
        </div>
    );
}

function ToolButton({
    active,
    label,
    icon,
    onClick,
}: {
    active?: boolean;
    label: string;
    icon: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            title={label}
            onClick={onClick}
            className={cls(
                "group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm transition",
                active
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white/90 text-slate-800 hover:-translate-y-0.5 hover:bg-slate-50"
            )}
        >
            <div
                className={cls(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg font-black",
                    active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                )}
            >
                {icon}
            </div>
            <div className="min-w-0">
                <div className="truncate text-sm font-black">{label}</div>
            </div>
        </button>
    );
}

function SectionCard({
    title,
    hint,
    right,
    children,
}: {
    title: string;
    hint?: string;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-xl font-black tracking-tight text-slate-900">{title}</div>
                    {hint ? <div className="mt-1 text-sm text-slate-600">{hint}</div> : null}
                </div>
                {right}
            </div>
            <div className="mt-5">{children}</div>
        </div>
    );
}

export default function CollaborationPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const classId = Number(id || 0);

    const [sessionTitle, setSessionTitle] = useState("Collaboration Whiteboard");
    const [sessionState, setSessionState] = useState<SessionState>("draft");

    const [tool, setTool] = useState<ToolKey>("pen");
    const [penColor, setPenColor] = useState<PenColor>("black");
    const [penSize, setPenSize] = useState<PenSize>(1);
    const [eraserSize, setEraserSize] = useState<EraserSize>(1);
    const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");

    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showBreakoutModal, setShowBreakoutModal] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);

    const [roomCount, setRoomCount] = useState(4);
    const [timerMinutes, setTimerMinutes] = useState(10);
    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);

    const [participants, setParticipants] = useState<CollabParticipant[]>([]);
    const [sessionCode, setSessionCode] = useState<string>("");
    const [status, setStatus] = useState<CollabStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const pollRef = useRef<number | null>(null);
    const [rooms, setRooms] = useState<BreakoutRoom[]>(
        Array.from({ length: 4 }, (_, i) => ({
            roomNumber: i + 1,
            participantIds: [],
        }))
    );

    const [reviewPanels, setReviewPanels] = useState<ReviewPanel[]>([
        { id: uid("panel"), selectedBoard: "room-1" },
        { id: uid("panel"), selectedBoard: "room-2" },
        { id: uid("panel"), selectedBoard: "room-3" },
        { id: uid("panel"), selectedBoard: "room-4" },
    ]);

    const boardRef = useRef<HTMLDivElement | null>(null);

    const joinCode = sessionCode || `COLL-${String(classId || 1).padStart(2, "0")}-A7X9`;
    const joinUrl = useMemo(
        () => `${window.location.origin}/#/collab/join/${joinCode}`,
        [joinCode]
    );
    const qrUrl = useMemo(
        () =>
            `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}`,
        [joinUrl]
    );

    const boardOptions: BoardOption[] = useMemo(() => {
        const teacherBoard = [{ value: "teacher-main", label: "Teacher Main Board" }];
        const roomBoards = Array.from({ length: roomCount }, (_, i) => ({
            value: `room-${i + 1}`,
            label: `Breakout Room ${i + 1}`,
        }));
        return [...teacherBoard, ...roomBoards];
    }, [roomCount]);

    useEffect(() => {
        return () => stopPolling();
    }, []);

    useEffect(() => {
        if (!sessionCode) return;

        stopPolling();

        pollRef.current = window.setInterval(() => {
            fetchStatus(sessionCode);

            if (!showBreakoutModal) {
                fetchParticipants(sessionCode);
            }
        }, 1000);

        return () => stopPolling();
    }, [sessionCode, showBreakoutModal]);

    useEffect(() => {
        setRooms((prev) => {
            const next = Array.from({ length: roomCount }, (_, i) => {
                const existing = prev.find((r) => r.roomNumber === i + 1);
                return existing || { roomNumber: i + 1, participantIds: [] };
            });
            return next;
        });

        setReviewPanels((prev) =>
            prev.map((p, idx) => ({
                ...p,
                selectedBoard: `room-${Math.min(idx + 1, roomCount)}`,
            }))
        );
    }, [roomCount]);

    useEffect(() => {
        if (timeLeftSeconds === null) return;
        if (timeLeftSeconds <= 0) return;

        const timer = window.setInterval(() => {
            setTimeLeftSeconds((curr) => {
                if (curr === null) return null;
                if (curr <= 1) {
                    window.clearInterval(timer);
                    return 0;
                }
                return curr - 1;
            });
        }, 1000);

        return () => window.clearInterval(timer);
    }, [timeLeftSeconds]);

    function copyToClipboard(text: string) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => { });
            return;
        }
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    }

    function randomEvenSplit() {
        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const nextRooms = Array.from({ length: roomCount }, (_, i) => ({
            roomNumber: i + 1,
            participantIds: [] as string[],
        }));

        shuffled.forEach((p, idx) => {
            nextRooms[idx % roomCount].participantIds.push(p.id);
        });

        setRooms(nextRooms);
        setParticipants((prev) =>
            prev.map((p) => {
                const room = nextRooms.find((r) => r.participantIds.includes(p.id));
                return { ...p, roomNumber: room?.roomNumber ?? null };
            })
        );
    }

    function clearAssignments() {
        setRooms((prev) => prev.map((r) => ({ ...r, participantIds: [] })));
        setParticipants((prev) => prev.map((p) => ({ ...p, roomNumber: null })));
    }

    function assignParticipantToRoom(participantId: string, roomNumber: number | null) {
        setRooms((prev) =>
            prev.map((r) => ({
                ...r,
                participantIds:
                    roomNumber === r.roomNumber
                        ? Array.from(new Set([...r.participantIds.filter((id) => id !== participantId), participantId]))
                        : r.participantIds.filter((id) => id !== participantId),
            }))
        );

        setParticipants((prev) =>
            prev.map((p) => (p.id === participantId ? { ...p, roomNumber } : p))
        );
    }

    async function assignAndSave(participantId: string, roomNumber: number | null) {
        const nextParticipants = participants.map((p) =>
            p.id === participantId ? { ...p, roomNumber } : p
        );

        setRooms((prev) =>
            prev.map((r) => ({
                ...r,
                participantIds:
                    roomNumber === r.roomNumber
                        ? Array.from(
                            new Set([
                                ...r.participantIds.filter((id) => id !== participantId),
                                participantId,
                            ])
                        )
                        : r.participantIds.filter((id) => id !== participantId),
            }))
        );

        setParticipants(nextParticipants);

        if (!sessionCode) return;

        try {
            const assignments = nextParticipants.map((p) => ({
                participant_id: Number(p.id),
                room_number: p.roomNumber,
            }));

            const res = await fetch(`${API_BASE}/collab/${sessionCode}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments }),
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || "Failed to save assignments.");
            }

            await fetchParticipants(sessionCode);
            await fetchStatus(sessionCode);
        } catch (e: any) {
            window.alert(e?.message || "Failed to save assignments.");
        }
    }

    async function createSession() {
        try {
            const res = await fetch(`${API_BASE}/collab/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    class_id: classId,
                    title: sessionTitle,
                    room_count: roomCount,
                    timer_minutes: timerMinutes,
                }),
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || "Failed to create collaboration session.");
            }

            const data = (await res.json()) as CollabCreateResponse;
            setSessionCode(data.session_code);
            setSessionState("lobby");
            await fetchStatus(data.session_code);
            await fetchParticipants(data.session_code);
        } catch (e: any) {
            window.alert(e?.message || "Failed to create collaboration session.");
        }
    }

    async function fetchStatus(code: string) {
        try {
            const res = await fetch(`${API_BASE}/collab/${code}/status`);
            if (!res.ok) throw new Error("Status unavailable.");
            const data = (await res.json()) as CollabStatus;
            setStatus(data);
            setSessionState(data.state);
            setRoomCount(data.room_count);
            setTimeLeftSeconds(data.time_left_seconds ?? null);
            setStatusError(null);
        } catch (e: any) {
            setStatusError(e?.message || "Status unavailable.");
        }
    }

    async function fetchParticipants(code: string) {
        try {
            const res = await fetch(`${API_BASE}/collab/${code}/participants`);
            if (!res.ok) throw new Error("Participants unavailable.");

            const data = await res.json();
            const list = (data?.participants || []) as CollabParticipantApi[];

            setParticipants(
                list.map((p) => ({
                    id: String(p.id),
                    name: p.name,
                    joinedAt: "",
                    roomNumber: p.room_number,
                    isOnline: p.is_online,
                }))
            );
        } catch (e) {
            // ignore small participant refresh errors for now
        }
    }

    function stopPolling() {
        if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }


    async function postControl(action: "start" | "end" | "end-session") {
        if (!sessionCode) return;

        try {
            const res = await fetch(`${API_BASE}/collab/${sessionCode}/${action}`, {
                method: "POST",
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || "Control action failed.");
            }

            await fetchStatus(sessionCode);
            await fetchParticipants(sessionCode);
        } catch (e: any) {
            window.alert(e?.message || "Control action failed.");
        }
    }

    async function saveAssignments() {
        if (!sessionCode) return;

        const assignments = participants.map((p) => ({
            participant_id: Number(p.id),
            room_number: p.roomNumber,
        }));

        try {
            const res = await fetch(`${API_BASE}/collab/${sessionCode}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments }),
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || "Failed to save assignments.");
            }

            await fetchParticipants(sessionCode);
            await fetchStatus(sessionCode);
        } catch (e: any) {
            window.alert(e?.message || "Failed to save assignments.");
        }
    }

    function startLobby() {
        setSessionState("lobby");
    }

    function openAssigning() {
        setSessionState("assigning");
        setShowBreakoutModal(true);
    }

    function startBreakout() {
        setSessionState("live");
        setShowBreakoutModal(false);
        setTimeLeftSeconds(timerMinutes * 60);
    }

    function endBreakout() {
        setSessionState("review");
        setTimeLeftSeconds(null);
    }

    function saveBoard() {
        window.alert("Save board hook goes here.");
    }

    function downloadTeacherPng() {
        window.alert("Teacher PNG export hook goes here.");
    }

    function formatTime(totalSeconds: number | null) {
        if (totalSeconds === null) return "—";
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${String(secs).padStart(2, "0")}`;
    }

    const assignedCount = participants.filter((p) => p.roomNumber !== null).length;
    const unassigned = participants.filter((p) => p.roomNumber === null);

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
                <div className="absolute right-[-90px] top-12 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl" />
                <div className="absolute bottom-[-90px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />
                <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:38px_38px]" />
            </div>

            <div className="relative z-10 p-4 md:p-6">
                <div className="mx-auto max-w-[1700px]">
                    <div className="mb-4 rounded-[28px] border border-white/70 bg-white/80 px-5 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl md:px-6 md:py-3">
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-white/70 bg-white/90 shadow-xl ring-1 ring-emerald-100">
                                    <img src={elumeLogo} alt="Elume" className="h-14 w-14 object-contain drop-shadow-sm" />
                                </div>

                                <div>
                                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                                        Live collaboration
                                    </div>

                                    <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                                        Collaboration Whiteboard
                                    </h1>

                                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                                        Teacher-led live collaboration with breakout rooms, student joining, PDF imports,
                                        shared whiteboards, and side-by-side review.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => navigate(`/class/${classId}`)}
                                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                >
                                    ← Back to class
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowJoinModal(true)}
                                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                >
                                    Student join
                                </button>

                                <button
                                    type="button"
                                    onClick={saveBoard}
                                    className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                                >
                                    Save board
                                </button>
                            </div>
                        </div>

                        <div className="-mt-2 flex flex-wrap items-center justify-end gap-2">
                            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                                State: {(status?.state || sessionState).toUpperCase()}
                            </div>

                            <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">
                                Students: {status?.joined_count ?? participants.length}
                            </div>

                            <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">
                                Assigned: {status?.assigned_count ?? assignedCount}
                            </div>

                            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-800">
                                Rooms: {status?.room_count ?? roomCount}
                            </div>

                            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                                Timer: {formatTime(status?.time_left_seconds ?? timeLeftSeconds)}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
                        <div className="sticky top-4 self-start">
                            <div className="rounded-[24px] border border-white/70 bg-white/90 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                                    <div className="text-sm font-black text-slate-900">Tools</div>
                                    <div className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                                        {tool}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setTool("select")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "select"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">✋</span>
                                        <span>Select</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("pen")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "pen"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">✎</span>
                                        <span>Pen</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("eraser")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "eraser"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">⌫</span>
                                        <span>Erase</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("highlighter")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "highlighter"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">🖍️</span>
                                        <span>Mark</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("rectangle")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "rectangle"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">▭</span>
                                        <span>Rect</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("circle")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "circle"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">◯</span>
                                        <span>Circle</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("triangle")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "triangle"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">△</span>
                                        <span>Tri</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("sticky")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "sticky"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">🗒️</span>
                                        <span>Sticky</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("arrow")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "arrow"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">➜</span>
                                        <span>Arrow</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("curved-arrow")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "curved-arrow"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">↷</span>
                                        <span>Curve</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTool("speech")}
                                        className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === "speech"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                    >
                                        <span className="text-lg">💬</span>
                                        <span>Speech</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowPdfModal(true)}
                                        className="flex h-14 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                                    >
                                        <span className="text-lg">📄</span>
                                        <span>PDF</span>
                                    </button>
                                </div>

                                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                        Tool settings
                                    </div>

                                    {tool === "pen" && (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-3 gap-2">
                                                {(["black", "red", "blue", "yellow", "green", "purple"] as PenColor[]).map((c) => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        onClick={() => setPenColor(c)}
                                                        className={`rounded-xl border px-2 py-2 text-[11px] font-black capitalize ${penColor === c
                                                            ? "border-slate-900 bg-slate-900 text-white"
                                                            : "border-slate-200 bg-white text-slate-700"
                                                            }`}
                                                    >
                                                        {c}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                {[1, 2, 3].map((s) => (
                                                    <button
                                                        key={s}
                                                        type="button"
                                                        onClick={() => setPenSize(s as PenSize)}
                                                        className={`rounded-xl border px-2 py-2 text-[11px] font-black ${penSize === s
                                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                                            : "border-slate-200 bg-white text-slate-700"
                                                            }`}
                                                    >
                                                        Size {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {tool === "eraser" && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {[1, 2, 3].map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => setEraserSize(s as EraserSize)}
                                                    className={`rounded-xl border px-2 py-2 text-[11px] font-black ${eraserSize === s
                                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                                        : "border-slate-200 bg-white text-slate-700"
                                                        }`}
                                                >
                                                    Size {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {tool === "highlighter" && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {(["yellow", "green", "blue"] as HighlightColor[]).map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setHighlightColor(c)}
                                                    className={`rounded-xl border px-2 py-2 text-[11px] font-black capitalize ${highlightColor === c
                                                        ? "border-slate-900 bg-slate-900 text-white"
                                                        : "border-slate-200 bg-white text-slate-700"
                                                        }`}
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {!["pen", "eraser", "highlighter"].includes(tool) && (
                                        <div className="text-xs font-semibold text-slate-600">
                                            Select the tool and use the board directly.
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3 space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowBreakoutModal(true)}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
                                    >
                                        Breakout rooms
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowJoinModal(true)}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
                                    >
                                        Student join
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <SectionCard
                                title={sessionTitle}
                                hint="Teacher board stage"
                                right={
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowPdfModal(true)}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                        >
                                            Import PDF
                                        </button>

                                        <button
                                            type="button"
                                            onClick={downloadTeacherPng}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                        >
                                            Download PNG
                                        </button>
                                    </div>
                                }
                            >
                                {sessionState !== "review" ? (
                                    <div className="relative">
                                        <CollabBoard
                                            sessionCode={joinCode}
                                            roomKey="teacher-main"
                                            participantId="teacher"
                                            tool={
                                                tool === "highlighter"
                                                    ? "highlighter"
                                                    : tool === "eraser"
                                                        ? "eraser"
                                                        : tool === "select"
                                                            ? "select"
                                                            : tool === "rectangle"
                                                                ? "rectangle"
                                                                : tool === "circle"
                                                                    ? "circle"
                                                                    : tool === "triangle"
                                                                        ? "triangle"
                                                                        : tool === "sticky"
                                                                            ? "sticky"
                                                                            : tool === "arrow"
                                                                                ? "arrow"
                                                                                : tool === "curved-arrow"
                                                                                    ? "curved-arrow"
                                                                                    : tool === "speech"
                                                                                        ? "speech"
                                                                                        : "pen"
                                            }
                                            penColor={penColor}
                                            penSize={penSize}
                                            highlighterColor={highlightColor}
                                            eraserSize={eraserSize}
                                            height={760}
                                        />

                                        {timeLeftSeconds !== null && sessionState === "live" && (
                                            <div className="absolute right-4 top-4 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-800 shadow-sm">
                                                Timer: {formatTime(timeLeftSeconds)}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                        {reviewPanels.map((panel, idx) => (
                                            <div
                                                key={panel.id}
                                                className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
                                            >
                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                    <div className="text-sm font-black text-slate-900">
                                                        Review Panel {idx + 1}
                                                    </div>

                                                    <select
                                                        value={panel.selectedBoard}
                                                        onChange={(e) =>
                                                            setReviewPanels((prev) =>
                                                                prev.map((p) =>
                                                                    p.id === panel.id
                                                                        ? { ...p, selectedBoard: e.target.value }
                                                                        : p
                                                                )
                                                            )
                                                        }
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm outline-none"
                                                    >
                                                        {boardOptions.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>
                                                                {opt.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="relative min-h-[300px] overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
                                                    <div className="absolute left-3 top-3 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
                                                        {boardOptions.find((b) => b.value === panel.selectedBoard)?.label || "Board"}
                                                    </div>

                                                    <div className="absolute inset-0 grid place-items-center p-6 text-center">
                                                        <div>
                                                            <div className="text-lg font-black text-slate-900">Board review view</div>
                                                            <div className="mt-2 text-sm text-slate-600">
                                                                This panel will render the saved or live board for comparison after breakout ends.
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard
                                title="Session controls"
                                hint="Teacher flow for lobby, assignment, live breakout, and review"
                                right={
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                                        Control
                                    </div>
                                }
                            >
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                                    <button
                                        type="button"
                                        onClick={createSession}
                                        className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-4 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                                    >
                                        {sessionCode ? "Session ready" : "Create session"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={openAssigning}
                                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                    >
                                        Assign rooms
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => postControl("start")}
                                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                    >
                                        Start breakout
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => postControl("end")}
                                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                    >
                                        End breakout
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => postControl("end-session")}
                                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-black text-rose-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100"
                                    >
                                        End session
                                    </button>
                                </div>
                            </SectionCard>
                        </div>

                        <SectionCard
                            title="Students"
                            hint="Joined participants and room assignments"
                            right={
                                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
                                    Sidebar
                                </div>
                            }
                        >
                            <div className="mb-4 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
                                <div className="text-sm font-black text-slate-900">Session title</div>
                                <input
                                    value={sessionTitle}
                                    onChange={(e) => setSessionTitle(e.target.value)}
                                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                />
                            </div>

                            <div className="space-y-3">
                                {participants.map((p) => (
                                    <div
                                        key={p.id}
                                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-black text-slate-900">{p.name}</div>
                                                <div className="mt-1 text-xs font-semibold text-slate-500">
                                                    {p.isOnline ? "Online" : "Offline"}
                                                </div>
                                            </div>

                                            <div
                                                className={cls(
                                                    "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]",
                                                    p.roomNumber
                                                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                                        : "border border-slate-200 bg-slate-50 text-slate-600"
                                                )}
                                            >
                                                {p.roomNumber ? `Room ${p.roomNumber}` : "Unassigned"}
                                            </div>
                                        </div>

                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => assignAndSave(p.id, 1)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                                            >
                                                Room 1
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => assignAndSave(p.id, 2)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                                            >
                                                Room 2
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => assignAndSave(p.id, null)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>

            {showJoinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                    Student Join
                                </div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                    Invite students to collaboration
                                </h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Keep this as a modal so the whiteboard stays fully visible during teaching.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowJoinModal(false)}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
                            <div className="rounded-[28px] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5 shadow-sm">
                                <div className="mx-auto rounded-[28px] border border-white/80 bg-white p-4 shadow-lg">
                                    <img
                                        src={qrUrl}
                                        alt="Join QR"
                                        className="mx-auto h-[220px] w-[220px] rounded-2xl border border-slate-100 bg-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <JoinChip label="Session code" value={joinCode} onCopy={() => copyToClipboard(joinCode)} />
                                <JoinChip label="Join link" value={joinUrl} onCopy={() => copyToClipboard(joinUrl)} />

                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                                    Students can join by QR, direct link, or session code.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showBreakoutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-6xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
                                    Breakout Rooms
                                </div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                    Setup breakout collaboration
                                </h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Choose room count, assign students, start timer, then launch room boards copied from the teacher board.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowBreakoutModal(false)}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                            <div className="space-y-5">
                                <div className="rounded-[28px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-5 shadow-sm">
                                    <div className="text-sm font-black text-slate-900">Room settings</div>

                                    <div className="mt-4">
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                            Number of rooms
                                        </div>
                                        <input
                                            type="number"
                                            min={1}
                                            max={12}
                                            value={roomCount}
                                            onChange={(e) => {
                                                const value = Math.max(1, Math.min(12, Number(e.target.value || 1)));
                                                setRoomCount(value);
                                            }}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                        />
                                    </div>

                                    <div className="mt-4">
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                            Timer minutes
                                        </div>
                                        <input
                                            type="number"
                                            min={1}
                                            max={60}
                                            value={timerMinutes}
                                            onChange={(e) => setTimerMinutes(Math.max(1, Math.min(60, Number(e.target.value || 1))))}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                        />
                                    </div>

                                    <div className="mt-5 grid grid-cols-1 gap-3">
                                        <button
                                            type="button"
                                            onClick={randomEvenSplit}
                                            className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                                        >
                                            Random even split
                                        </button>

                                        <button
                                            type="button"
                                            onClick={clearAssignments}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                        >
                                            Clear assignments
                                        </button>

                                        <button
                                            type="button"
                                            onClick={saveAssignments}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                        >
                                            Save assignments
                                        </button>

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await postControl("start");
                                                setShowBreakoutModal(false);
                                            }}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                                        >
                                            Start breakout session
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                    <div className="text-sm font-black text-slate-900">Unassigned students</div>
                                    <div className="mt-3 space-y-2">
                                        {unassigned.length ? (
                                            unassigned.map((p) => (
                                                <div
                                                    key={p.id}
                                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800"
                                                >
                                                    {p.name}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                                                Everyone assigned.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {rooms.map((room) => {
                                    const roomParticipants = participants.filter((p) => p.roomNumber === room.roomNumber);

                                    return (
                                        <div
                                            key={room.roomNumber}
                                            className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-base font-black text-slate-900">Room {room.roomNumber}</div>
                                                <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-700">
                                                    {roomParticipants.length} students
                                                </div>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                {roomParticipants.length ? (
                                                    roomParticipants.map((p) => (
                                                        <div
                                                            key={p.id}
                                                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800"
                                                        >
                                                            {p.name}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                                                        No students assigned yet.
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-4 grid grid-cols-2 gap-2">
                                                {participants.slice(0, 4).map((p) => (
                                                    <button
                                                        key={`${room.roomNumber}_${p.id}`}
                                                        type="button"
                                                        onClick={() => assignAndSave(p.id, room.roomNumber)}
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                                                    >
                                                        + {p.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPdfModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
                                    PDF Import
                                </div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                    Import from notes / PDF source
                                </h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    This modal is where your current whiteboard PDF picker, page preview, and snipping flow can be dropped in.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowPdfModal(false)}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-6 rounded-[28px] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-8 text-center shadow-sm">
                            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/80 bg-white shadow-lg">
                                <span className="text-3xl">📄</span>
                            </div>

                            <div className="mt-5 text-xl font-black text-slate-900">PDF workflow placeholder</div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">
                                Reuse your existing PDF import, page rendering, and snip-to-board logic here.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}