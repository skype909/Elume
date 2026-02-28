import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE = "/api";

type ChoiceKey = "A" | "B" | "C" | "D";

type CurrentQuestion = {
  id: string;
  prompt: string;
  choices: Record<ChoiceKey, string>;
  correct?: ChoiceKey | null;
};

type CurrentResponse = {
  state: "lobby" | "live" | "ended";
  title?: string;
  anonymous?: boolean;
  current_index?: number;
  total_questions?: number;
  time_left_seconds?: number | null;
  question?: CurrentQuestion | null;
};

type JoinResponse = {
  anon_id: string;
  nickname?: string | null;
};

type StoredParticipant = {
  anon_id?: string;
  name?: string;
  nickname?: string;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function StudentJoinQuizPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  const sessionCode = (code || "").trim();
  const storageKey = useMemo(() => `elume:livequiz:participant:${sessionCode}`, [sessionCode]);

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [anonId, setAnonId] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [hasJoined, setHasJoined] = useState<boolean>(false);

  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const [selectedChoice, setSelectedChoice] = useState<ChoiceKey | null>(null);
  const [lastQuestionId, setLastQuestionId] = useState<string>("");

  const pollRef = useRef<number | null>(null);
  const answeringRef = useRef(false);

  const title = current?.title || "Live Quiz";
  const state = current?.state || "lobby";
  const q = current?.question || null;
  const isAnonymousSession = Boolean(current?.anonymous);

  const questionNumberText = useMemo(() => {
    // Only show question number once live has started properly
    if (current?.state !== "live") return "";
    if (typeof current?.current_index === "number" && typeof current?.total_questions === "number") {
      if (current.current_index < 0) return "";
      const n = current.current_index + 1;
      const t = current.total_questions;
      return `${clamp(n, 1, t)}/${t}`;
    }
    return "";
  }, [current?.state, current?.current_index, current?.total_questions]);

  const timeLeftText = useMemo(() => {
    if (typeof current?.time_left_seconds === "number") return `${current.time_left_seconds}s`;
    return "";
  }, [current?.time_left_seconds]);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = window.setInterval(fetchCurrent, 800);
  }

  async function joinSession(existingAnonId?: string, providedName?: string) {
    const res = await fetch(`${API_BASE}/livequiz/${sessionCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anon_id: existingAnonId || null,
        name: (providedName || "").trim() || null,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Could not join session.");
    }

    const data = (await res.json()) as JoinResponse;

    const nameToStore = (providedName || "").trim();

    setHasJoined(true);
    setAnonId(data.anon_id);
    setNickname((data.nickname || "").toString());

    // ✅ store once (don’t overwrite yourself)
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        anon_id: data.anon_id,
        name: nameToStore,
        nickname: (data.nickname || "").toString(),
      } satisfies StoredParticipant)
    );
  }

  async function fetchCurrent() {
    try {
      const res = await fetch(`${API_BASE}/livequiz/${sessionCode}/current`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to load current question.");
      }
      const data = (await res.json()) as CurrentResponse;
      setCurrent(data);
      setPollError(null);

      // When the teacher advances to a new question, reset local selection
      const newQid = data.question?.id || "";
      if (newQid && newQid !== lastQuestionId) {
        setSelectedChoice(null);
        setLastQuestionId(newQid);
      }

      if (data.state === "ended") stopPolling();
    } catch (e: any) {
      setPollError(e?.message || "Connection issue.");
    }
  }

  async function submitAnswer(choice: ChoiceKey) {
    if (!anonId) return;
    if (!q?.id) return;
    if (answeringRef.current) return;

    answeringRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/livequiz/${sessionCode}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anon_id: anonId,
          question_id: q.id,
          choice,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to submit answer.");
      }

      setSelectedChoice(choice);
    } catch (e: any) {
      setPollError(e?.message || "Failed to submit answer.");
    } finally {
      answeringRef.current = false;
    }
  }

  // Boot: validate code, load stored participant.
  // If stored exists -> rejoin automatically.
  // If not -> show name entry screen (no auto-join).
  useEffect(() => {
    if (!sessionCode) {
      setFatalError("Missing session code.");
      setLoading(false);
      return;
    }

    setFatalError(null);
    setPollError(null);

    const stored = safeJsonParse<StoredParticipant>(localStorage.getItem(storageKey), {});
    const storedAnon = (stored.anon_id || "").trim();
    const storedName = (stored.name || "").trim();
    const storedNick = (stored.nickname || "").trim();

    // Pre-fill name box from last time (nice UX)
    if (storedName && !nameInput) setNameInput(storedName);

    // If we already joined before (have anon_id), rejoin quietly
    if (storedAnon) {
      setLoading(true);
      joinSession(storedAnon, storedName || storedNick)
        .then(() => fetchCurrent())
        .then(() => startPolling())
        .catch((e: any) => setFatalError(e?.message || "Could not join this session."))
        .finally(() => setLoading(false));

      return () => stopPolling();
    }

    // Fresh scan: show name entry, don’t auto-join
    setHasJoined(false);
    setAnonId("");
    setNickname("");
    setLoading(false);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode]);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function joinWithName() {
    const clean = nameInput.trim();
    if (clean.length < 2) {
      setPollError("Please enter your name.");
      return;
    }
    setLoading(true);
    setFatalError(null);
    setPollError(null);

    try {
      await joinSession(undefined, clean);
      await fetchCurrent();
      startPolling();
    } catch (e: any) {
      setFatalError(e?.message || "Could not join this session.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasJoined && !loading && !fatalError) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xl font-extrabold text-slate-900">Join the Live Quiz</div>
          <div className="mt-2 text-sm text-slate-600">Enter your name so your answers can be recorded.</div>

          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-700">Your name</label>
            <input
              className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-slate-400"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Aoife"
              autoFocus
            />
          </div>

          {pollError ? (
            <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {pollError}
            </div>
          ) : null}

          <button
            className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            onClick={joinWithName}
            disabled={nameInput.trim().length < 2}
          >
            Join Quiz
          </button>

          <div className="mt-3 text-xs text-slate-500">
            Tip: use your first name only. • Code: <span className="font-bold">{sessionCode}</span>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-extrabold text-slate-900">Joining…</div>
          <div className="mt-2 text-sm text-slate-600">Connecting to the live quiz.</div>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-3xl border-2 border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-extrabold text-rose-700">Can’t join</div>
          <div className="mt-2 text-sm text-slate-700">{fatalError}</div>
          <button
            className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            onClick={() => navigate("/")}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2">
      {questionNumberText ? (
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">Q {questionNumberText}</div>
      ) : null}
      {timeLeftText ? (
        <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{timeLeftText}</div>
      ) : null}
    </div>
  );

  const displayName = nameInput.trim() || nickname || "Student";

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-extrabold text-slate-900">{title}</div>
              <div className="mt-1 text-sm text-slate-600">
                You are: <span className="font-bold text-slate-900">{displayName}</span>
              </div>
              {isAnonymousSession ? (
                <div className="mt-2 text-xs font-semibold text-amber-800">
                  Note: This session is in anonymous mode — names may not be recorded by the teacher.
                </div>
              ) : null}
            </div>
            {headerRight}
          </div>

          {pollError && (
            <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {pollError}
            </div>
          )}
        </div>

        {/* Body */}
        {state === "lobby" && (
          <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-lg font-extrabold text-slate-900">Waiting for the teacher…</div>
            <div className="mt-2 text-sm text-slate-600">The quiz hasn’t started yet. Keep this page open.</div>
            <div className="mt-6 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Session code: <span className="font-bold text-slate-800">{sessionCode}</span>
            </div>
          </div>
        )}

        {state === "live" && (
          <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            {!q ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="text-base font-extrabold text-slate-900">Starting…</div>
                <div className="mt-2 text-sm text-slate-600">Loading the question.</div>
              </div>
            ) : (
              <>
                <div className="text-lg font-extrabold text-slate-900">{q.prompt}</div>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  {(["A", "B", "C", "D"] as ChoiceKey[]).map((k) => {
                    const label = q.choices?.[k] || "";
                    const disabled = !label.trim();
                    const isSelected = selectedChoice === k;

                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={disabled}
                        onClick={() => submitAnswer(k)}
                        className={`w-full rounded-3xl border-2 px-4 py-4 text-left text-base font-bold transition ${
                          disabled
                            ? "border-slate-200 bg-slate-50 text-slate-300"
                            : isSelected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`mr-3 inline-block w-7 rounded-xl px-2 py-1 text-center text-sm ${
                            isSelected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {k}
                        </span>
                        {label || <span className="text-slate-400">Empty</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-xs text-slate-600">
                  Tip: Tap an option to answer. You can change your answer until the teacher moves on.
                </div>
              </>
            )}
          </div>
        )}

        {state === "ended" && (
          <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-lg font-extrabold text-slate-900">Session finished</div>
            <div className="mt-2 text-sm text-slate-600">The teacher has ended the quiz. You can close this page.</div>

            <button
              className="mt-6 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
              onClick={() => {
                stopPolling();
                fetchCurrent().then(() => startPolling());
              }}
            >
              Check again
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 text-center text-[11px] text-slate-500">ELume Live Quiz • Keep this tab open during the session</div>
      </div>
    </div>
  );
}