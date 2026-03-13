import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import elumeLogo from "./assets/ELogo2.png";

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

function hashStringToInt(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledChoices(keys: ChoiceKey[], seedStr: string) {
  const seed = hashStringToInt(seedStr);
  const rand = mulberry32(seed);
  const arr = [...keys];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

function Pill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "amber" | "cyan";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "cyan"
          ? "border-cyan-200 bg-cyan-50 text-cyan-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${cls}`}>
      {children}
    </div>
  );
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
  const [hasAnswered, setHasAnswered] = useState(false);

  const lastQuestionIdRef = useRef<string>("");
  const lastQuestionIndexRef = useRef<number | null>(null);

  const [transitioning, setTransitioning] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionActiveRef = useRef(false);
  const pendingQuestionRef = useRef<CurrentResponse | null>(null);
  const [answersLocked, setAnswersLocked] = useState(false);

  const pollRef = useRef<number | null>(null);
  const answeringRef = useRef(false);

  const title = current?.title || "Live Quiz";
  const state = current?.state || "lobby";
  const q = current?.question || null;

  const displayOrder = useMemo(() => {
    if (!q) return [] as ChoiceKey[];

    const base: ChoiceKey[] = ["A", "B", "C", "D"];
    const valid = base.filter((k) => (q.choices?.[k] ?? "").trim().length > 0);

    const seedStr = `${sessionCode}::${anonId || "anon"}::${q.id || ""}`;
    return shuffledChoices(valid, seedStr);
  }, [q?.id, q?.choices, anonId, sessionCode]);

  const isAnonymousSession = Boolean(current?.anonymous);

  const questionNumberText = useMemo(() => {
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

      const newQid = data.question?.id || "";
      const newIdx = typeof data.current_index === "number" ? data.current_index : null;

      const prevQid = lastQuestionIdRef.current;
      const prevIdx = lastQuestionIndexRef.current;

      const idChanged = Boolean(newQid) && newQid !== prevQid;
      const idxChanged = newIdx !== null && newIdx !== prevIdx;
      const questionChanged = idChanged || idxChanged;

      if (questionChanged) {
        if (prevQid || prevIdx !== null) {
          pendingQuestionRef.current = data;

          if (!transitionActiveRef.current) {
            transitionActiveRef.current = true;
            setTransitioning(true);
            setAnswersLocked(true);

            if (transitionTimerRef.current) {
              window.clearTimeout(transitionTimerRef.current);
            }

            transitionTimerRef.current = window.setTimeout(() => {
              const nextData = pendingQuestionRef.current || data;
              setSelectedChoice(null);
              setHasAnswered(false);
              setCurrent(nextData);

              lastQuestionIdRef.current = nextData.question?.id || "";
              lastQuestionIndexRef.current =
                typeof nextData.current_index === "number" ? nextData.current_index : null;

              setTransitioning(false);
              setAnswersLocked(false);
              transitionActiveRef.current = false;
              pendingQuestionRef.current = null;
            }, 1200);
          }
        } else {
          setSelectedChoice(null);
          setHasAnswered(false);
          setCurrent(data);

          lastQuestionIdRef.current = newQid;
          lastQuestionIndexRef.current = newIdx;
        }
      } else {
        if (!transitionActiveRef.current) {
          setCurrent(data);
        }
      }


      setPollError(null);

      if (data.state === "ended") stopPolling();
    } catch (e: any) {
      setPollError(e?.message || "Connection issue.");
    }
  }

  async function submitAnswer(choice: ChoiceKey) {
    if (!anonId) return;
    if (!q?.id) return;
    if (answeringRef.current) return;

    setSelectedChoice(choice);
    setHasAnswered(true);

    answeringRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/livequiz/${sessionCode}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anon_id: anonId, question_id: q.id, choice }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to submit answer.");
      }
    } catch (e: any) {
      setPollError(e?.message || "Failed to submit answer.");
    } finally {
      answeringRef.current = false;
    }
  }

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

    if (storedName && !nameInput) setNameInput(storedName);

    if (storedAnon) {
      setLoading(true);
      joinSession(storedAnon, storedName || storedNick)
        .then(() => fetchCurrent())
        .then(() => startPolling())
        .catch((e: any) => setFatalError(e?.message || "Could not join this session."))
        .finally(() => setLoading(false));

      return () => stopPolling();
    }

    setHasJoined(false);
    setAnonId("");
    setNickname("");
    setLoading(false);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode]);

  useEffect(() => {
    return () => {
      stopPolling();
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      transitionActiveRef.current = false;
      pendingQuestionRef.current = null;
    };

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
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 top-[-40px] h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute right-[-60px] top-16 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" />
          <div className="absolute bottom-[-70px] left-[12%] h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:34px_34px]" />
        </div>

        <div className="relative z-10 flex min-h-screen items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md">
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
              <div className="text-center">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/70 bg-white/90 shadow-xl ring-1 ring-emerald-100">
                  <img
                    src={elumeLogo}
                    alt="Elume"
                    className="h-14 w-14 object-contain drop-shadow-sm"
                  />
                </div>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                  Student live quiz
                </div>

                <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  Join the Live Quiz
                </h1>

                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                  Enter your name to join the session and send your answers live.
                </p>
              </div>

              <div className="mt-6 rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      Session code
                    </div>
                    <div className="mt-1 text-2xl font-black tracking-[0.08em] text-slate-900">
                      {sessionCode || "—"}
                    </div>
                  </div>
                  <Pill tone="cyan">Ready to join</Pill>
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-black text-slate-800">Your name</label>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-4 text-base font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Aoife"
                  autoFocus
                  autoComplete="name"
                />
              </div>

              {pollError ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {pollError}
                </div>
              ) : null}

              <button
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-4 text-base font-black text-white shadow-lg transition hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={joinWithName}
                disabled={nameInput.trim().length < 2}
              >
                Join Quiz
              </button>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs leading-5 text-slate-600">
                Tip: use your first name only so the teacher can identify you clearly.
              </div>
            </div>

            <div className="mt-4 text-center text-[11px] text-slate-500">
              Elume Live Quiz • Mobile-friendly student view
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 top-[-40px] h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute right-[-60px] top-16 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen max-w-md items-center">
          <div className="w-full rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-white/70 bg-white/90 shadow-lg ring-1 ring-emerald-100">
              <img src={elumeLogo} alt="Elume" className="h-11 w-11 object-contain" />
            </div>
            <div className="mt-5 text-center text-2xl font-black tracking-tight text-slate-900">
              Joining…
            </div>
            <div className="mt-2 text-center text-sm text-slate-600">
              Connecting to the live quiz.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-rose-50 p-4 sm:p-6">
        <div className="relative z-10 mx-auto flex min-h-screen max-w-md items-center">
          <div className="w-full rounded-[32px] border border-rose-200 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-rose-100 bg-rose-50 shadow-sm">
              <img src={elumeLogo} alt="Elume" className="h-11 w-11 object-contain" />
            </div>

            <div className="mt-5 text-center text-2xl font-black tracking-tight text-rose-700">
              Can’t join
            </div>
            <div className="mt-2 text-center text-sm leading-6 text-slate-700">{fatalError}</div>

            <button
              className="mt-6 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-md hover:opacity-95"
              onClick={() => navigate("/")}
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const headerRight = (
    <div className="flex flex-wrap items-center gap-2">
      {questionNumberText ? <Pill tone="slate">Q {questionNumberText}</Pill> : null}
      {timeLeftText ? <Pill tone="emerald">{timeLeftText}</Pill> : null}
    </div>
  );

  const displayName = nameInput.trim() || nickname || "Student";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-[-40px] h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute right-[-60px] top-16 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-[-70px] left-[12%] h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:34px_34px]" />
      </div>

      <div className="relative z-10 min-h-screen p-3 sm:p-4 md:p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white/90 shadow-md ring-1 ring-emerald-100">
                  <img
                    src={elumeLogo}
                    alt="Elume"
                    className="h-9 w-9 object-contain"
                  />
                </div>

                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                    Elume Live Quiz
                  </div>

                  <div className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                    {title}
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    You are: <span className="font-black text-slate-900">{displayName}</span>
                  </div>

                  {isAnonymousSession ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                      This session is in anonymous mode. Your name may not be shown to the teacher.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="sm:text-right">{headerRight}</div>
            </div>

            {pollError && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {pollError}
              </div>
            )}
          </div>

          {state === "lobby" && (
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-8">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-emerald-100 bg-emerald-50 shadow-sm">
                <img src={elumeLogo} alt="Elume" className="h-10 w-10 object-contain" />
              </div>

              <div className="mt-5 text-2xl font-black tracking-tight text-slate-900">
                Waiting for the teacher…
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                The quiz hasn’t started yet. Keep this page open and the first question will appear automatically.
              </div>

              <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-800">
                Session code: {sessionCode}
              </div>
            </div>
          )}

          {state === "live" && (
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-5">
              {transitioning ? (
                <div className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-8 text-center shadow-sm sm:p-10">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-emerald-100 bg-white shadow-sm">
                    <img src={elumeLogo} alt="Elume" className="h-10 w-10 object-contain" />
                  </div>

                  <div className="mt-5 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
                    Next question
                  </div>

                  <div className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                    Get ready…
                  </div>

                  <div className="mt-3 text-base font-semibold text-slate-600">
                    A new question is loading now.
                  </div>

                  {questionNumberText ? (
                    <div className="mt-6 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-5 py-2 text-sm font-black text-emerald-800">
                      Coming up: Question {questionNumberText}
                    </div>
                  ) : null}
                </div>
              ) : !q ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="text-lg font-black text-slate-900">Starting…</div>
                  <div className="mt-2 text-sm text-slate-600">Loading the question.</div>
                </div>
              ) : (
                <>
                  <div className="rounded-[28px] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-4 shadow-sm sm:p-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
                      Live question
                    </div>
                    <div className="mt-2 text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
                      {q.prompt}
                    </div>

                    {answersLocked && (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
                        Answers locked ✓
                        <span className="ml-2 text-xs font-semibold text-amber-700">
                          Get ready for the next question.
                        </span>
                      </div>
                    )}

                    {hasAnswered && selectedChoice ? (
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">
                        Answer recorded ✓{" "}
                        <span className="text-xs font-semibold text-emerald-800">
                          You can still change it until the teacher moves on.
                        </span>
                      </div>
                    ) : (
                      <div className="mt-4 text-sm font-semibold text-slate-600">
                        Tap an option below to submit your answer.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    {displayOrder.map((k, idx) => {
                      const label = q.choices?.[k] || "";
                      const disabled = !label.trim();
                      const isSelected = selectedChoice === k;
                      const shownLetter = (["A", "B", "C", "D"] as const)[idx] ?? "A";

                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={disabled}
                          onClick={() => submitAnswer(k)}
                          className={`w-full rounded-[26px] border px-4 py-4 text-left text-base font-black shadow-sm transition active:scale-[0.99] sm:px-5 sm:py-5 ${disabled
                            ? "border-slate-200 bg-slate-50 text-slate-300"
                            : isSelected
                              ? "border-emerald-500 bg-gradient-to-r from-emerald-50 to-cyan-50 text-emerald-900 ring-4 ring-emerald-200"
                              : "border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:bg-slate-50"
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${isSelected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                                }`}
                            >
                              {shownLetter}
                            </span>

                            <span className="flex-1 leading-6">
                              {label || <span className="text-slate-400">Empty</span>}
                            </span>

                            {isSelected ? (
                              <span className="text-lg font-black text-emerald-700">✓</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 text-center text-xs text-slate-600">
                    Tip: You can change your answer until the teacher moves on.
                  </div>
                </>
              )}
            </div>
          )}

          {state === "ended" && (
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-8">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
                <img src={elumeLogo} alt="Elume" className="h-10 w-10 object-contain" />
              </div>

              <div className="mt-5 text-2xl font-black tracking-tight text-slate-900">
                Session finished
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                The teacher has ended the quiz. You can close this page.
              </div>

              <button
                className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                onClick={() => {
                  stopPolling();
                  fetchCurrent().then(() => startPolling());
                }}
              >
                Check again
              </button>
            </div>
          )}

          <div className="mt-4 text-center text-[11px] text-slate-500">
            Elume Live Quiz • Keep this tab open during the session
          </div>
        </div>
      </div>
    </div>
  );
}