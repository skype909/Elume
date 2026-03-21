import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import elumeLogo from "./assets/ELogo2.png";
import CollabBoard from "./CollabBoard";
import type { BoardSnapshot } from "./CollabBoard";
import { apiFetch } from "./api";

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

function getWsBase() {
    const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

    if (isLocal) return "ws://127.0.0.1:8000";

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
}

function buildRoomsFromParticipants(participants: CollabParticipant[], roomCount: number): BreakoutRoom[] {
    return Array.from({ length: roomCount }, (_, i) => ({
        roomNumber: i + 1,
        participantIds: participants.filter((p) => p.roomNumber === i + 1).map((p) => p.id),
    }));
}

function autoAssignParticipants(participants: CollabParticipant[], roomCount: number): CollabParticipant[] {
    const next = participants.map((p) => ({ ...p }));
    const unassigned = next.filter((p) => p.roomNumber == null);

    unassigned.forEach((p, index) => {
        p.roomNumber = (index % roomCount) + 1;
    });

    return next;
}

function JoinChip({
    label,
    value,
    onCopy,
    large = false,
}: {
    label: string;
    value: string;
    onCopy: () => void;
    large?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>

            {large ? (
                <div className="mt-3 text-4xl font-black tracking-[0.18em] text-slate-900 md:text-5xl">
                    {value}
                </div>
            ) : (
                <div className="mt-2 break-all text-sm font-semibold text-slate-800 md:text-base">
                    {value}
                </div>
            )}

            <button
                type="button"
                onClick={onCopy}
                className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
                Copy
            </button>
        </div>
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
    const [pdfImportRequestNonce, setPdfImportRequestNonce] = useState(0);
    const [teacherBoardPromptDraft, setTeacherBoardPromptDraft] = useState("");
    const [teacherBoardPrompt, setTeacherBoardPrompt] = useState("");
    const [teacherBoardClearNonce, setTeacherBoardClearNonce] = useState(0);
    const [showTeacherPromptModal, setShowTeacherPromptModal] = useState(false);

    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showBreakoutModal, setShowBreakoutModal] = useState(false);

    const [roomCount, setRoomCount] = useState(4);
    const [timerMinutes, setTimerMinutes] = useState(10);
    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);

    const [participants, setParticipants] = useState<CollabParticipant[]>([]);
    const [sessionCode, setSessionCode] = useState<string>("");
    const [status, setStatus] = useState<CollabStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isStartingBreakout, setIsStartingBreakout] = useState(false);


    const pollRef = useRef<number | null>(null);
    const joinCodeRef = useRef("");

    const btnGlow =
        "relative inline-flex items-center gap-3 rounded-2xl border-2 border-violet-600 " +
        "bg-gradient-to-r from-violet-500 via-purple-500 to-emerald-500 " +
        "px-7 py-3 text-base font-extrabold text-white " +
        "shadow-[0_0_18px_rgba(120,120,120,0.35)] " +
        "ring-4 ring-slate-300/60 " +
        "hover:shadow-[0_0_40px_rgba(120,120,120,0.6)] hover:ring-slate-400 " +
        "hover:-translate-y-[2px] hover:scale-[1.03] active:scale-[0.98] " +
        "transition-all duration-200 overflow-hidden " +
        "after:absolute after:top-0 after:left-[-60%] after:h-full after:w-[60%] " +
        "after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent " +
        "after:rotate-12 hover:after:left-[120%] after:transition-all after:duration-700";


    const [rooms, setRooms] = useState<BreakoutRoom[]>(
        Array.from({ length: 4 }, (_, i) => ({ roomNumber: i + 1, participantIds: [] }))
    );

    const [reviewPanels, setReviewPanels] = useState<ReviewPanel[]>([
        { id: uid("panel"), selectedBoard: "room-1" },
        { id: uid("panel"), selectedBoard: "room-2" },
        { id: uid("panel"), selectedBoard: "room-3" },
        { id: uid("panel"), selectedBoard: "room-4" },
    ]);

    const teacherBoardExportRef = useRef<null | (() => Promise<void>)>(null);
    const teacherBoardSnapshotRef = useRef<null | (() => BoardSnapshot)>(null);
    const reviewBoardExportRefs = useRef<Record<string, () => Promise<void>>>({});
    const focusedReviewBoardExportRef = useRef<null | (() => Promise<void>)>(null);

    const [focusedReviewBoard, setFocusedReviewBoard] = useState<string | null>(null);
    const [roomInitialSnapshots, setRoomInitialSnapshots] = useState<Record<string, BoardSnapshot>>({});
    const joinCode = sessionCode;
    const hasSession = Boolean(joinCode);

    useEffect(() => {
        joinCodeRef.current = joinCode;
    }, [joinCode]);

    const joinUrl = useMemo(
        () => (joinCode ? `${window.location.origin}/#/collab/join/${joinCode}` : ""),
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
        if (!joinCode) {
            stopPolling();
            return;
        }

        stopPolling();

        void fetchStatus(joinCode);
        if (!showBreakoutModal) {
            void fetchParticipants(joinCode);
        }

        pollRef.current = window.setInterval(() => {
            const currentCode = joinCodeRef.current;
            if (!currentCode) return;
            void fetchStatus(currentCode);
            if (!showBreakoutModal) {
                void fetchParticipants(currentCode);
            }
        }, 1000);

        return () => stopPolling();
    }, [joinCode, showBreakoutModal]);

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

        setFocusedReviewBoard(null);
    }, [roomCount]);

    useEffect(() => {
        setRooms(buildRoomsFromParticipants(participants, roomCount));
    }, [participants, roomCount]);

    useEffect(() => {
        if (timeLeftSeconds === null || timeLeftSeconds <= 0) return;

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

    function stopPolling() {
        if (pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }

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

    function formatTime(totalSeconds: number | null) {
        if (totalSeconds === null) return "—";
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${String(secs).padStart(2, "0")}`;
    }

    async function fetchStatus(code: string) {
        try {
            const res = await fetch(`${API_BASE}/collab/${code}/status`);
            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error("No session yet. Create a session first.");
                }
                throw new Error("Status unavailable.");
            }

            const data = (await res.json()) as CollabStatus;
            setStatus(data);
            setSessionState(data.state);

            // Only hydrate from backend before a teacher edits locally,
            // or if you want backend to remain the source of truth.
            // For now: do not force roomCount back on every poll.
            setTimeLeftSeconds(data.time_left_seconds ?? null);
            setStatusError(null);
        } catch (e: any) {
            setStatusError(e?.message || "Status unavailable.");
        }
    }

    async function fetchParticipants(code: string) {
        try {
            const data = await apiFetch(`${API_BASE}/collab/${code}/participants`);
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
        } catch (e: any) {
            setStatusError(e?.message || "Participants unavailable.");
        }

    }

    async function persistAssignments(code: string, nextParticipants: CollabParticipant[]) {
        const assignments = nextParticipants.map((p) => ({
            participant_id: Number(p.id),
            room_number: p.roomNumber,
        }));

        await apiFetch(`${API_BASE}/collab/${code}/assignments`, {
            method: "POST",
            body: JSON.stringify({ assignments }),
        });
    }

    async function syncBreakoutConfig(code: string) {
        await apiFetch(`${API_BASE}/collab/${code}/config`, {
            method: "POST",
            body: JSON.stringify({
                room_count: roomCount,
                timer_minutes: timerMinutes,
            }),
        });
    }


    async function createSession() {
        if (isCreating) return;
        setIsCreating(true);

        try {
            const data = (await apiFetch(`${API_BASE}/collab/create`, {
                method: "POST",
                body: JSON.stringify({
                    class_id: classId,
                    title: sessionTitle,
                    room_count: roomCount,
                    timer_minutes: timerMinutes,
                }),
            })) as CollabCreateResponse;
            if (!data.session_code) {
                throw new Error("Backend returned no session code.");
            }

            setSessionCode(data.session_code);
            setSessionState("lobby");
            await Promise.all([fetchStatus(data.session_code), fetchParticipants(data.session_code)]);
            setShowJoinModal(true);
        } catch (e: any) {
            window.alert(e?.message || "Failed to create collaboration session.");
        } finally {
            setIsCreating(false);
        }
    }

    async function assignAndSave(participantId: string, roomNumber: number | null) {
        const code = joinCodeRef.current;
        if (!code) {
            window.alert("Create a session first.");
            return;
        }

        const nextParticipants = participants.map((p) =>
            p.id === participantId ? { ...p, roomNumber } : p
        );

        setParticipants(nextParticipants);

        try {
            await syncBreakoutConfig(code);
            await persistAssignments(code, nextParticipants);
            await Promise.all([fetchParticipants(code), fetchStatus(code)]);
        } catch (e: any) {
            window.alert(e?.message || "Failed to save assignments.");
        }
    }


    async function saveAssignments() {
        const code = joinCodeRef.current;
        if (!code) {
            window.alert("Create a session first.");
            return;
        }

        try {
            await syncBreakoutConfig(code);
            await persistAssignments(code, participants);
            await Promise.all([fetchParticipants(code), fetchStatus(code)]);
        } catch (e: any) {
            window.alert(e?.message || "Failed to save assignments.");
        }
    }

    function randomEvenSplit() {
        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const nextParticipants = shuffled.map((p, idx) => ({
            ...p,
            roomNumber: (idx % roomCount) + 1,
        }));

        const restoredOrder = participants.map((original) => {
            const updated = nextParticipants.find((p) => p.id === original.id);
            return updated || original;
        });

        setParticipants(restoredOrder);
    }

    function clearAssignments() {
        setParticipants((prev) => prev.map((p) => ({ ...p, roomNumber: null })));
    }

    async function startBreakoutAndPersist() {
        const code = joinCodeRef.current;
        if (!code) {
            throw new Error("No session code available. Create the session first.");
        }

        if (isStartingBreakout) return;
        setIsStartingBreakout(true);

        try {
            const nextParticipants = autoAssignParticipants(participants, roomCount);
            const teacherMainSnapshot = teacherBoardSnapshotRef.current?.() ?? null;
            const roomKeys = Array.from({ length: roomCount }, (_, i) => `room-${i + 1}`);

            setParticipants(nextParticipants);
            setRooms(buildRoomsFromParticipants(nextParticipants, roomCount));

            await syncBreakoutConfig(code);
            await persistAssignments(code, nextParticipants);

            await apiFetch(`${API_BASE}/collab/${code}/start`, {
                method: "POST",
                body: JSON.stringify({}),
            });

            if (teacherMainSnapshot) {
                setRoomInitialSnapshots(
                    Object.fromEntries(roomKeys.map((targetRoomKey) => [targetRoomKey, teacherMainSnapshot]))
                );

                await Promise.allSettled(
                    roomKeys.map((targetRoomKey) =>
                        fanOutRoomSnapshot(code, targetRoomKey, teacherMainSnapshot)
                    )
                );
            }

            await Promise.all([fetchStatus(code), fetchParticipants(code)]);
            setSessionState("live");
            setShowBreakoutModal(false);
            setTimeLeftSeconds(timerMinutes * 60);
        } finally {
            setIsStartingBreakout(false);
        }
    }


    async function endBreakout() {
        const code = joinCodeRef.current;
        if (!code) {
            window.alert("No active session.");
            return;
        }

        try {
            await apiFetch(`${API_BASE}/collab/${code}/end`, {
                method: "POST",
            });

            await Promise.all([fetchStatus(code), fetchParticipants(code)]);
            setSessionState("review");
            setTimeLeftSeconds(null);
        } catch (e: any) {
            window.alert(e?.message || "Failed to end breakout.");
        }
    }

    async function downloadTeacherPng() {
        if (!teacherBoardExportRef.current) {
            window.alert("Teacher board export is not ready yet.");
            return;
        }

        try {
            await teacherBoardExportRef.current();
        } catch {
            window.alert("Could not download teacher board.");
        }
    }

    async function downloadReviewBoardPng(boardKey: string) {
        const fn = reviewBoardExportRefs.current[boardKey];
        if (!fn) {
            window.alert("Board export is not ready yet.");
            return;
        }

        try {
            await fn();
        } catch {
            window.alert("Could not download board.");
        }
    }

    async function downloadFocusedReviewBoardPng() {
        if (!focusedReviewBoardExportRef.current) {
            window.alert("Board export is not ready yet.");
            return;
        }

        try {
            await focusedReviewBoardExportRef.current();
        } catch {
            window.alert("Could not download board.");
        }
    }

    function handleStartNewSession() {
        stopPolling();
        joinCodeRef.current = "";
        teacherBoardExportRef.current = null;
        teacherBoardSnapshotRef.current = null;
        reviewBoardExportRefs.current = {};
        focusedReviewBoardExportRef.current = null;

        setSessionState("draft");
        setShowJoinModal(false);
        setShowBreakoutModal(false);
        setTimeLeftSeconds(null);
        setSessionCode("");
        setStatus(null);
        setStatusError(null);
        setIsCreating(false);
        setIsStartingBreakout(false);
        setFocusedReviewBoard(null);
        setRoomInitialSnapshots({});
    }

    function handleFullReset() {
        handleStartNewSession();
        setSessionTitle("Collaboration Whiteboard");
        setTool("pen");
        setPenColor("black");
        setPenSize(1);
        setEraserSize(1);
        setHighlightColor("yellow");
        setRoomCount(4);
        setTimerMinutes(10);
        setParticipants([]);
        setRooms(Array.from({ length: 4 }, (_, i) => ({ roomNumber: i + 1, participantIds: [] })));
        setReviewPanels([
            { id: uid("panel"), selectedBoard: "room-1" },
            { id: uid("panel"), selectedBoard: "room-2" },
            { id: uid("panel"), selectedBoard: "room-3" },
            { id: uid("panel"), selectedBoard: "room-4" },
        ]);
        setTeacherBoardPrompt("");
        setTeacherBoardPromptDraft("");
        setTeacherBoardClearNonce(0);
    }

    function dispatchScopedBoardClear(targetRoomKey: string, nonce: number) {
        window.dispatchEvent(
            new CustomEvent("collab-clear-board", {
                detail: { roomKey: targetRoomKey, nonce },
            })
        );
    }

    function fanOutRoomSnapshot(code: string, targetRoomKey: string, snapshot: BoardSnapshot) {
        return new Promise<void>((resolve) => {
            const ws = new WebSocket(`${getWsBase()}/ws/collab/${code}/${targetRoomKey}`);
            let settled = false;

            const finish = () => {
                if (settled) return;
                settled = true;
                window.setTimeout(() => {
                    try {
                        ws.close();
                    } catch { }
                }, 80);
                resolve();
            };

            const timeout = window.setTimeout(() => {
                console.warn("[CollaborationPage] breakout snapshot fan-out timed out", { code, targetRoomKey });
                finish();
            }, 1500);

            ws.onopen = () => {
                try {
                    ws.send(
                        JSON.stringify({
                            type: "snapshot-sync",
                            snapshot,
                            sourceId: "teacher",
                        })
                    );
                } catch (error) {
                    console.warn("[CollaborationPage] breakout snapshot send failed", { code, targetRoomKey, error });
                }

                window.clearTimeout(timeout);
                finish();
            };

            ws.onerror = () => {
                window.clearTimeout(timeout);
                console.warn("[CollaborationPage] breakout snapshot socket error", { code, targetRoomKey });
                finish();
            };

            ws.onclose = () => {
                window.clearTimeout(timeout);
                finish();
            };
        });
    }

    function applyTeacherBoardPrompt() {
        const nextPrompt = teacherBoardPromptDraft.trim();
        const nextNonce = teacherBoardClearNonce + 1;
        setTeacherBoardPrompt(nextPrompt);
        setTeacherBoardClearNonce(nextNonce);
        dispatchScopedBoardClear("teacher-main", nextNonce);
        setShowTeacherPromptModal(false);
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
                    <div className="mb-3 rounded-[22px] border border-white/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl md:px-5">
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white shadow-md ring-1 ring-emerald-100">
                                        <img src={elumeLogo} alt="Elume" className="h-9 w-9 object-contain" />
                                    </div>

                                    <div>
                                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                            Live collaboration
                                        </div>

                                        <h1 className="text-lg font-bold text-slate-900 md:text-xl">Collaboration Whiteboard</h1>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={createSession}
                                        disabled={isCreating || hasSession}
                                        className={cls(
                                            "rounded-2xl px-6 py-3 text-base font-black text-white shadow-lg transition",
                                            isCreating || hasSession
                                                ? "cursor-not-allowed bg-emerald-300"
                                                : "bg-emerald-600 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl"
                                        )}
                                    >
                                        {hasSession ? "Session created" : isCreating ? "Creating session..." : "Start by creating session"}
                                    </button>


                                    <button
                                        onClick={() => hasSession && setShowJoinModal(true)}
                                        disabled={!hasSession}
                                        className={cls(
                                            "rounded-lg border px-4 py-2 text-sm font-black",
                                            hasSession
                                                ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                        )}
                                    >
                                        Student join
                                    </button>
                                    <button
                                        onClick={() => setShowBreakoutModal(true)}
                                        disabled={!hasSession}
                                        className={cls(
                                            "rounded-lg border px-4 py-2 text-sm font-black",
                                            hasSession
                                                ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                        )}
                                    >
                                        Start Breakout
                                    </button>

                                    <button
                                        onClick={endBreakout}
                                        disabled={!hasSession}
                                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50"
                                    >
                                        End breakout
                                    </button>

                                    <button
                                        onClick={handleStartNewSession}
                                        disabled={!hasSession}
                                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Start new session
                                    </button>

                                    <button
                                        onClick={handleFullReset}
                                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                                    >
                                        Full reset
                                    </button>

                                    <button
                                        onClick={() => navigate(`/class/${classId}`)}
                                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50"
                                    >
                                        ← Back
                                    </button>

                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="max-w-xl text-sm text-slate-600">
                                    Live teacher board with student joining breakout rooms, and shared whiteboards.
                                </p>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const nextNonce = teacherBoardClearNonce + 1;
                                            setTeacherBoardClearNonce(nextNonce);
                                            dispatchScopedBoardClear("teacher-main", nextNonce);
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-800 hover:bg-slate-50"
                                    >
                                        Erase all
                                    </button>

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
                                        Rooms {roomCount}
                                    </div>

                                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                                        Timer: {formatTime(status?.time_left_seconds ?? timeLeftSeconds)}
                                    </div>

                                    {statusError ? (
                                        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                                            {statusError}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
                        <div className="sticky top-3 z-20 self-start">
                            <div className="rounded-[24px] border border-white/70 bg-white/90 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                                    <div className="text-sm font-black text-slate-900">Tools</div>
                                    <div className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                                        {tool}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        ["select", "✋", "Select"],
                                        ["pen", "✎", "Pen"],
                                        ["eraser", "⌫", "Erase"],
                                        ["highlighter", "🖍️", "Mark"],
                                        ["rectangle", "▭", "Rect"],
                                        ["circle", "◯", "Circle"],
                                        ["triangle", "△", "Tri"],
                                        ["sticky", "🗒️", "Sticky"],
                                        ["arrow", "➜", "Arrow"],
                                        ["curved-arrow", "↷", "Curve"],
                                        ["speech", "💬", "Speech"],
                                    ].map(([key, icon, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setTool(key as ToolKey)}
                                            className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-xs font-black shadow-sm transition ${tool === key
                                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                                }`}
                                        >
                                            <span className="text-lg">{icon}</span>
                                            <span>{label}</span>
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => setPdfImportRequestNonce((n) => n + 1)}
                                        className="flex h-14 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                                    >
                                        <span className="text-lg">📄</span>
                                        <span>PDF</span>
                                    </button>
                                </div>

                                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Tool settings</div>

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

                                    {!['pen', 'eraser', 'highlighter'].includes(tool) && (
                                        <div className="text-xs font-semibold text-slate-600">Select the tool and use the board directly.</div>
                                    )}
                                </div>

                                <div className="mt-3 space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowBreakoutModal(true)}
                                        disabled={!hasSession}
                                        className={cls(
                                            "w-full rounded-2xl border px-3 py-3 text-xs font-black shadow-sm transition",
                                            hasSession
                                                ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                        )}
                                    >
                                        Breakout rooms
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => hasSession && setShowJoinModal(true)}
                                        disabled={!hasSession}
                                        className={cls(
                                            "w-full rounded-2xl border px-3 py-3 text-xs font-black shadow-sm transition",
                                            hasSession
                                                ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                        )}
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
                                            onClick={() => setPdfImportRequestNonce((n) => n + 1)}
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
                                        <div className="sticky top-3 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-[22px] border border-slate-200 bg-white/88 px-4 py-3 shadow-sm backdrop-blur-xl">
                                            <button
                                                type="button"
                                                onClick={() => setShowTeacherPromptModal(true)}
                                                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 shadow-sm hover:bg-emerald-100"
                                            >
                                                New board prompt
                                            </button>

                                            {teacherBoardPrompt ? (
                                                <div className="inline-flex max-w-full items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800">
                                                    <span className="mr-2 uppercase tracking-[0.14em] text-cyan-600">Prompt</span>
                                                    <span className="max-w-[42rem] truncate">{teacherBoardPrompt}</span>
                                                </div>
                                            ) : (
                                                <div className="text-xs font-semibold text-slate-500">
                                                    Clear the teacher board for a fresh round without changing breakout setup.
                                                </div>
                                            )}
                                        </div>

                                        {hasSession ? (
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
                                                classId={String(classId)}
                                                apiBase={API_BASE}
                                                apiFetch={apiFetch}
                                                pdfImportRequestNonce={pdfImportRequestNonce}
                                                onExportReady={(fn) => {
                                                    teacherBoardExportRef.current = fn;
                                                }}
                                                onSnapshotReady={(getSnapshot) => {
                                                    teacherBoardSnapshotRef.current = getSnapshot;
                                                }}
                                            />
                                        ) : (
                                            <div className="grid min-h-[760px] place-items-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50">
                                                <div className="text-center">
                                                    <div className="text-xl font-black text-slate-900">
                                                        Start a collaboration session
                                                    </div>

                                                    <div className="mt-2 text-sm text-slate-600">
                                                        Create a session first, then invite students and assign breakout rooms.
                                                    </div>

                                                    <button
                                                        className={`mt-6 ${btnGlow}`}
                                                        type="button"
                                                        onClick={createSession}
                                                        disabled={isCreating}
                                                        title="Start a live collaboration session"
                                                    >
                                                        <span className="relative flex items-center justify-center">

                                                            {/* pulsing collaboration halo */}
                                                            <span className="absolute inline-flex h-6 w-6 rounded-full bg-violet-400 opacity-60 animate-[ping_2.2s_ease-out_infinite]"></span>

                                                            {/* collaboration icon */}
                                                            <span className="relative text-lg leading-none drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                                                                🤝
                                                            </span>

                                                        </span>

                                                        <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]">
                                                            {isCreating ? "Creating session..." : "Create Collaboration Session"}
                                                        </span>

                                                        <span className="ml-1 rounded-full bg-white/20 px-2 py-[2px] text-[10px] font-bold tracking-wide text-white border border-white/40">
                                                            LIVE
                                                        </span>
                                                    </button>

                                                </div>
                                            </div>

                                        )}

                                        {timeLeftSeconds !== null && sessionState === "live" && (
                                            <div className="absolute right-4 top-4 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-800 shadow-sm">
                                                Timer: {formatTime(timeLeftSeconds)}
                                            </div>
                                        )}
                                    </div>
                                ) : focusedReviewBoard ? (
                                    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div className="text-sm font-black text-slate-900">
                                                {boardOptions.find((b) => b.value === focusedReviewBoard)?.label || "Board"}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={downloadFocusedReviewBoardPng}
                                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                                >
                                                    Download PNG
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setFocusedReviewBoard(null)}
                                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                                >
                                                    Back to 2×2 grid
                                                </button>
                                            </div>
                                        </div>

                                        <div className="relative min-h-[760px] overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                                            <div className="absolute left-3 top-3 z-10 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
                                                {boardOptions.find((b) => b.value === focusedReviewBoard)?.label || "Board"}
                                            </div>

                                            {hasSession ? (
                                                <CollabBoard
                                                    key={`focused-${focusedReviewBoard}`}
                                                    sessionCode={joinCode}
                                                    roomKey={focusedReviewBoard}
                                                    participantId="teacher-review-focus"
                                                    tool="select"
                                                    penColor={penColor}
                                                    penSize={penSize}
                                                    highlighterColor={highlightColor}
                                                eraserSize={eraserSize}
                                                height={760}
                                                readOnly
                                                viewportMode="pan"
                                                boardWidth={1600}
                                                boardHeight={960}
                                                initialSnapshot={
                                                    focusedReviewBoard ? roomInitialSnapshots[focusedReviewBoard] ?? null : null
                                                }
                                                onExportReady={(fn) => {
                                                    focusedReviewBoardExportRef.current = fn;
                                                }}
                                                />

                                            ) : (
                                                <div className="grid min-h-[760px] place-items-center text-slate-500">No session.</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                        {reviewPanels.map((panel, idx) => (
                                            <div key={panel.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                    <div className="text-sm font-black text-slate-900">Review Panel {idx + 1}</div>

                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={panel.selectedBoard}
                                                            onChange={(e) =>
                                                                setReviewPanels((prev) =>
                                                                    prev.map((p) => (p.id === panel.id ? { ...p, selectedBoard: e.target.value } : p))
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

                                                        <button
                                                            type="button"
                                                            onClick={() => setFocusedReviewBoard(panel.selectedBoard)}
                                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                                        >
                                                            Expand
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => downloadReviewBoardPng(panel.selectedBoard)}
                                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                                        >
                                                            Download PNG
                                                        </button>

                                                    </div>
                                                </div>

                                                <div className="relative min-h-[300px] overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                                                    <div className="absolute left-3 top-3 z-10 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
                                                        {boardOptions.find((b) => b.value === panel.selectedBoard)?.label || "Board"}
                                                    </div>

                                                    {hasSession ? (
                                                        <>
                                                            <CollabBoard
                                                                key={`${panel.id}-${panel.selectedBoard}`}
                                                                sessionCode={joinCode}
                                                                roomKey={panel.selectedBoard}
                                                                participantId={`review-${panel.id}`}
                                                                tool="select"
                                                                penColor={penColor}
                                                                penSize={penSize}
                                                                highlighterColor={highlightColor}
                                                                eraserSize={eraserSize}
                                                                height={300}
                                                                readOnly
                                                                viewportMode="pan"
                                                                boardWidth={1600}
                                                                boardHeight={960}
                                                                initialSnapshot={roomInitialSnapshots[panel.selectedBoard] ?? null}
                                                            />

                                                            <div className="pointer-events-none absolute -left-[99999px] top-0 opacity-0">
                                                                <>
                                                                    <CollabBoard
                                                                        key={`${panel.id}-${panel.selectedBoard}`}
                                                                        sessionCode={joinCode}
                                                                        roomKey={panel.selectedBoard}
                                                                        participantId={`review-${panel.id}`}
                                                                        tool="select"
                                                                        penColor={penColor}
                                                                        penSize={penSize}
                                                                        highlighterColor={highlightColor}
                                                                        eraserSize={eraserSize}
                                                                        height={300}
                                                                        readOnly
                                                                        viewportMode="pan"
                                                                        boardWidth={1600}
                                                                        boardHeight={960}
                                                                        initialSnapshot={roomInitialSnapshots[panel.selectedBoard] ?? null}
                                                                    />

                                                                    <div className="pointer-events-none absolute -left-[99999px] top-0 opacity-0">
                                                                        <CollabBoard
                                                                            key={`export-${panel.id}-${panel.selectedBoard}`}
                                                                            sessionCode={joinCode}
                                                                            roomKey={panel.selectedBoard}
                                                                            participantId={`review-export-${panel.id}`}
                                                                            tool="select"
                                                                            penColor={penColor}
                                                                            penSize={penSize}
                                                                            highlighterColor={highlightColor}
                                                                            eraserSize={eraserSize}
                                                                            height={760}
                                                                            readOnly
                                                                            viewportMode="pan"
                                                                            boardWidth={1600}
                                                                            boardHeight={960}
                                                                            initialSnapshot={roomInitialSnapshots[panel.selectedBoard] ?? null}
                                                                            onExportReady={(fn) => {
                                                                                reviewBoardExportRefs.current[panel.selectedBoard] = fn;
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </>

                                                            </div>
                                                        </>

                                                    ) : (
                                                        <div className="grid min-h-[300px] place-items-center text-slate-500">No session.</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                                }
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
                                    <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-black text-slate-900">{p.name}</div>
                                                <div className="mt-1 text-xs font-semibold text-slate-500">{p.isOnline ? "Online" : "Offline"}</div>
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

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {Array.from({ length: roomCount }).map((_, i) => {
                                                const room = i + 1;
                                                const isAssigned = p.roomNumber === room;

                                                return (
                                                    <button
                                                        key={room}
                                                        type="button"
                                                        onClick={() => assignAndSave(p.id, room)}
                                                        className={cls(
                                                            "rounded-xl border px-3 py-2 text-xs font-black",
                                                            isAssigned
                                                                ? "border-emerald-300 bg-emerald-500 text-white"
                                                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                        )}
                                                    >
                                                        Room {room}
                                                    </button>
                                                );
                                            })}

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
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Student Join</div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Invite students to collaboration</h3>
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
                                        src={joinUrl ? qrUrl : "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="}
                                        alt="Join QR"
                                        className="mx-auto h-[220px] w-[220px] rounded-2xl border border-slate-100 bg-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <JoinChip
                                    label="Session code"
                                    value={joinCode || "Create session first"}
                                    onCopy={() => joinCode && copyToClipboard(joinCode)}
                                    large
                                />

                                <JoinChip label="Join link" value={joinUrl || "Create session first"} onCopy={() => joinUrl && copyToClipboard(joinUrl)} />

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
                    <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/70 bg-white/95 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="border-b border-slate-100 px-6 py-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Breakout Rooms</div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Setup breakout collaboration</h3>
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
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
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
                                            disabled={sessionState === "live" || sessionState === "review" || sessionState === "ended"}
                                            onChange={(e) => {
                                                if (sessionState === "live" || sessionState === "review" || sessionState === "ended") return;

                                                const value = Math.max(1, Math.min(12, Number(e.target.value || 1)));
                                                setRoomCount(value);
                                            }}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                        />

                                    </div>

                                    <div className="mt-4">
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Timer minutes</div>
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
                                            disabled={!hasSession}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                        >
                                            Save assignments
                                        </button>

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await startBreakoutAndPersist();
                                                } catch (e: any) {
                                                    window.alert(e?.message || "Failed to start breakout session.");
                                                }
                                            }}
                                            disabled={!hasSession || isStartingBreakout}
                                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                        >
                                            {isStartingBreakout ? "Starting breakout..." : "Start breakout session"}
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                    <div className="text-sm font-black text-slate-900">Unassigned students</div>
                                    <div className="mt-3 space-y-2">
                                        {unassigned.length ? (
                                            unassigned.map((p) => (
                                                <div key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800">
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
                                        <div key={room.roomNumber} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-base font-black text-slate-900">Room {room.roomNumber}</div>
                                                <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-700">
                                                    {roomParticipants.length} students
                                                </div>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                {roomParticipants.length ? (
                                                    roomParticipants.map((p) => (
                                                        <div key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800">
                                                            {p.name}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                                                        No students assigned yet.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        </div>
                        <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-6 py-4">
                            <div className="flex flex-wrap items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowBreakoutModal(false)}
                                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            await startBreakoutAndPersist();
                                        } catch (e: any) {
                                            window.alert(e?.message || "Failed to start breakout session.");
                                        }
                                    }}
                                    disabled={!hasSession || isStartingBreakout}
                                    className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isStartingBreakout ? "Starting breakout..." : "Start breakout session"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showTeacherPromptModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Teacher Board</div>
                                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">New board prompt</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Add a short prompt, then apply it to clear the teacher board for a fresh round while keeping breakout setup intact.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowTeacherPromptModal(false)}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-5">
                            <input
                                value={teacherBoardPromptDraft}
                                onChange={(e) => setTeacherBoardPromptDraft(e.target.value)}
                                placeholder="e.g. Sketch your first ideas for today’s challenge"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                autoFocus
                            />
                        </div>

                        {teacherBoardPrompt && (
                            <div className="mt-4 inline-flex max-w-full items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800">
                                <span className="mr-2 uppercase tracking-[0.14em] text-cyan-600">Current</span>
                                <span className="truncate">{teacherBoardPrompt}</span>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowTeacherPromptModal(false)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={applyTeacherBoardPrompt}
                                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 shadow-sm hover:bg-emerald-100"
                            >
                                Apply prompt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {false && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">PDF Import</div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Import from notes / PDF source</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    This modal is where your current whiteboard PDF picker, page preview, and snipping flow can be dropped in.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => { }}
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
