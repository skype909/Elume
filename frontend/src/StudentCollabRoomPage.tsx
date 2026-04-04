import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CollabBoard from "./CollabBoard";
import elumeLogo from "./assets/ELogo2.png";

const API_BASE = "/api";
const STUDENT_NAME_KEY = "elume_student_name_v1";

type JoinResponse = {
  anon_id: string;
  name: string;
  room_number: number | null;
};

type MeResponse = {
  id: number;
  anon_id: string;
  name: string;
  room_number: number | null;
  is_online: boolean;
  session_state: "lobby" | "assigning" | "live" | "review" | "ended";
};

type StatusResponse = {
  session_code: string;
  title: string;
  state: "lobby" | "assigning" | "live" | "review" | "ended";
  room_count: number;
  timer_minutes?: number | null;
  time_left_seconds?: number | null;
  joined_count: number;
  assigned_count: number;
};

type ParticipantListItem = {
  id: number;
  name: string;
  room_number: number | null;
};

function cleanCode(s: string) {
  return s.replace(/[^A-Za-z0-9-_]/g, "").trim();
}

export default function StudentCollabRoomPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  const sessionCode = cleanCode(code || "");
  const storageKey = useMemo(() => `elume:collab:participant:${sessionCode}`, [sessionCode]);

  const [nameInput, setNameInput] = useState("");
  const [anonId, setAnonId] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [roomNumber, setRoomNumber] = useState<number | null>(null);
  const [sessionState, setSessionState] = useState<StatusResponse["state"]>("lobby");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tool, setTool] = useState<"pen" | "highlighter" | "eraser">("pen");
  const [viewportMode, setViewportMode] = useState<"fixed" | "pan">("fixed");
  const [penColor, setPenColor] = useState<"black" | "red">("black");
  const [penSize, setPenSize] = useState<1 | 2 | 3>(1);
  const [roomMembers, setRoomMembers] = useState<ParticipantListItem[]>([]);
  const [membersExpanded, setMembersExpanded] = useState(true);

  async function fetchStatus() {
    const res = await fetch(`${API_BASE}/collab/${sessionCode}/status`);
    if (!res.ok) throw new Error("Could not fetch session status");
    const data = (await res.json()) as StatusResponse;
    setSessionState(data.state);
  }

  async function fetchMe(existingAnonId: string): Promise<number | null> {
    const res = await fetch(`${API_BASE}/collab/${sessionCode}/me/${existingAnonId}`);
    if (!res.ok) throw new Error("Could not fetch participant");
    const data = (await res.json()) as MeResponse;
    const nextRoomNumber = data.room_number == null ? null : Number(data.room_number);
    setAnonId(data.anon_id);
    setParticipantName(data.name);
    setRoomNumber(nextRoomNumber);
    setSessionState(data.session_state);
    return nextRoomNumber;
  }

  async function fetchParticipants(targetRoomNumber?: number | null) {
    const res = await fetch(`${API_BASE}/collab/${sessionCode}/participants`);
    if (!res.ok) throw new Error("Could not fetch participants");
    const data = await res.json();
    const list = Array.isArray(data?.participants) ? data.participants : [];
    const currentRoomNumber = targetRoomNumber == null ? roomNumber : Number(targetRoomNumber);
    setRoomMembers(
      list
        .map((p: any) => ({
          id: Number(p.id),
          name: String(p.name || "Student"),
          room_number: p.room_number == null ? null : Number(p.room_number),
        }))
        .filter((p: ParticipantListItem) => p.room_number !== null && p.room_number === currentRoomNumber)
    );
  }

  async function joinSession() {
    const clean = nameInput.trim();
    if (clean.length < 2) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/collab/${sessionCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Could not join session.");
      }

      const data = (await res.json()) as JoinResponse;
      localStorage.setItem(STUDENT_NAME_KEY, clean);
      localStorage.setItem(storageKey, JSON.stringify(data));

      setAnonId(data.anon_id);
      setParticipantName(data.name);
      setRoomNumber(data.room_number == null ? null : Number(data.room_number));

      await fetchStatus();
      const nextRoomNumber = await fetchMe(data.anon_id);
      await fetchParticipants(nextRoomNumber);
    } catch (e: any) {
      setError(e?.message || "Could not join session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionCode) {
      setError("Missing session code.");
      setLoading(false);
      return;
    }

    const sharedName = (localStorage.getItem(STUDENT_NAME_KEY) || "").trim();
    if (sharedName) {
      setNameInput((prev) => prev || sharedName);
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as JoinResponse;
      if (!parsed?.anon_id) {
        setLoading(false);
        return;
      }

      fetchStatus()
        .then(() => fetchMe(parsed.anon_id))
        .then((latestRoomNumber) => fetchParticipants(latestRoomNumber))
        .catch(() => {})
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  }, [sessionCode, storageKey]);

  useEffect(() => {
    if (!anonId) return;

    const timer = window.setInterval(() => {
      fetchStatus().catch(() => {});
      fetchMe(anonId)
        .then((latestRoomNumber) => fetchParticipants(latestRoomNumber))
        .catch(() => {});
    }, 1500);

    return () => window.clearInterval(timer);
  }, [anonId, roomNumber, sessionCode]);

  useEffect(() => {
    if (!anonId || roomNumber === null) return;
    fetchParticipants(roomNumber).catch(() => {});
  }, [anonId, roomNumber, sessionCode]);

    useEffect(() => {
    if (sessionState !== "ended") return;

    const t = window.setTimeout(() => {
      navigate("/student?mode=collab", { replace: true });
    }, 1800);

    return () => window.clearTimeout(t);
  }, [sessionState, navigate]);

  if (!anonId && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4">
        <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/70 bg-white/90 shadow-xl ring-1 ring-emerald-100">
              <img src={elumeLogo} alt="Elume" className="h-14 w-14 object-contain" />
            </div>

            <div className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
              Collaboration Join
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              Join Collaboration
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter your name to join your breakout room board.
            </p>
          </div>

          <div className="mt-6 rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Session code
            </div>
            <div className="mt-2 text-2xl font-black tracking-[0.08em] text-slate-900">
              {sessionCode}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-black text-slate-800">Your name</label>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Aoife"
            />
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={joinSession}
            className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-4 text-base font-black text-white shadow-lg"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4">
        <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="text-2xl font-black text-slate-900">Loading…</div>
        </div>
      </div>
    );
  }

    if (sessionState === "ended") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4">
        <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
            <img src={elumeLogo} alt="Elume" className="h-10 w-10 object-contain" />
          </div>

          <div className="mt-5 text-2xl font-black text-slate-900">Session ended</div>
          <div className="mt-2 text-sm leading-6 text-slate-600">
            Your teacher has ended the collaboration session. Returning you to Student Hub…
          </div>

          <button
            type="button"
            onClick={() => navigate("/student?mode=collab", { replace: true })}
            className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm"
          >
            Return now
          </button>
        </div>
      </div>
    );
  }

  if (sessionState !== "live" || roomNumber === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4">
        <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-emerald-100 bg-emerald-50 shadow-sm">
            <img src={elumeLogo} alt="Elume" className="h-10 w-10 object-contain" />
          </div>

          <div className="mt-5 text-2xl font-black text-slate-900">Waiting…</div>
          <div className="mt-2 text-sm leading-6 text-slate-600">
            {roomNumber === null
              ? "Your teacher has not assigned your breakout room yet."
              : "Your teacher has not started the breakout session yet."}
          </div>

          <div className="mt-4 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-700 inline-flex">
            {participantName || "Student"}
          </div>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm"
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-3 md:p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/70 bg-white shadow-md">
                <img src={elumeLogo} alt="Elume" className="h-9 w-9 object-contain" />
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Collaboration Room
                </div>
                <div className="text-2xl font-black tracking-tight text-slate-900">
                  Room {roomNumber}
                </div>
                <div className="text-sm text-slate-600">{participantName}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTool("pen")}
                className={`rounded-2xl px-4 py-3 text-sm font-black shadow-sm ${
                  tool === "pen" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                Pen
              </button>
              <button
                type="button"
                onClick={() => setTool("highlighter")}
                className={`rounded-2xl px-4 py-3 text-sm font-black shadow-sm ${
                  tool === "highlighter"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                Highlight
              </button>
              <button
                type="button"
                onClick={() => setTool("eraser")}
                className={`rounded-2xl px-4 py-3 text-sm font-black shadow-sm ${
                  tool === "eraser"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                Eraser
              </button>
              <button
                type="button"
                onClick={() => setViewportMode((prev) => (prev === "pan" ? "fixed" : "pan"))}
                className={`rounded-2xl px-4 py-3 text-sm font-black shadow-sm ${
                  viewportMode === "pan"
                    ? "bg-cyan-600 text-white"
                    : "border border-slate-200 bg-white text-slate-800"
                } md:hidden`}
              >
                Pan
              </button>
              {tool === "pen" && (
                <div className="ml-1 inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
                  <span className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Colour</span>
                  {([
                    { value: "black" as const, label: "Black", dot: "bg-slate-900" },
                    { value: "red" as const, label: "Red", dot: "bg-red-500" },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPenColor(option.value)}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${
                        penColor === option.value
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${option.dot}`} />
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="ml-1 inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
                <span className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Size</span>
                {([1, 2, 3] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPenSize(size)}
                    className={`rounded-xl px-3 py-2 text-xs font-black ${
                      penSize === size
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute right-3 top-3 z-10 w-56 rounded-[24px] border border-white/70 bg-white/75 p-3 shadow-lg backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Room members
              </div>
              <button
                type="button"
                onClick={() => setMembersExpanded((prev) => !prev)}
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600"
              >
                {membersExpanded ? "Hide" : "Show"}
              </button>
            </div>

            {membersExpanded && (
              <div className="mt-3 space-y-2">
                {roomMembers.length ? (
                  roomMembers.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800">
                      {member.name}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-500">
                    Room list updates when available.
                  </div>
                )}
              </div>
            )}
          </div>

          <CollabBoard
            sessionCode={sessionCode}
            roomKey={`room-${roomNumber}`}
            participantId={anonId}
            tool={viewportMode === "pan" ? "select" : tool}
            penColor={penColor}
            penSize={penSize}
            highlighterColor="yellow"
            eraserSize={2}
            height={760}
            viewportMode={viewportMode}
            boardWidth={1600}
            boardHeight={1200}
          />
        </div>
      </div>
    </div>
  );
}
