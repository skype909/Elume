import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE = "/api";

type ClassItem = { id: number; name: string; subject?: string };

type ChoiceKey = "A" | "B" | "C" | "D";

type LiveQuestion = {
  id: string;
  prompt: string;
  choices: Record<ChoiceKey, string>;
  // Optional for quizzes (polls can be null)
  correct?: ChoiceKey | null;
};

type SavedQuizAny = any;

type NormalisedQuiz = {
  id: string;
  title: string;
  createdAt?: string;
  questions: LiveQuestion[];
};

type CreateSessionPayload = {
  class_id: number;
  title: string;
  anonymous: boolean;
  seconds_per_question: number | null;
  shuffle_questions: boolean;
  auto_end_when_all_answered: boolean;
  questions: Array<{
    id: string;
    prompt: string;
    choices: Record<ChoiceKey, string>;
    correct?: ChoiceKey | null;
  }>;
};

type CreateSessionResponse = {
  session_code: string;
  join_url?: string;
};

type LiveStatus = {
  session_code: string;
  state: "lobby" | "live" | "ended";
  title?: string;
  anonymous?: boolean;
  seconds_per_question?: number | null;
  current_index?: number;
  total_questions?: number;
  time_left_seconds?: number | null;
  joined_count?: number;
  answered_count?: number;
};

type LiveQuizResults = {
  session_code: string;
  class_id: number;
  title: string;
  anonymous: boolean;
  ended_at?: string | null;
  summary: {
    joined: number;
    attempted_any: number;
    total_questions: number;
    avg_percent: number;
    hardest_question?: { question_id: string; prompt: string; correct_rate: number } | null;
    scored_mode: boolean;
  };
  top3: Array<{ name: string; correct: number; answered: number; percent: number }>;
  leaderboard: Array<{ name: string; correct: number; answered: number; percent: number }>;
};

type LiveQuizHistoryItem = {
  saved_at: string;
  session_code: string;
  title: string;
  anonymous: boolean;
  summary: LiveQuizResults["summary"];
  top3: LiveQuizResults["top3"];
  leaderboard: LiveQuizResults["leaderboard"];
};

function uid(prefix = "q") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Attempts to normalise a "saved quiz" from your Quizzes page into a consistent format.
 * Written defensively so it works even if your saved structure changes slightly.
 */
function normaliseSavedQuiz(q: SavedQuizAny): NormalisedQuiz | null {
  if (!q || typeof q !== "object") return null;

  const title =
    (typeof q.title === "string" && q.title.trim()) ||
    (typeof q.name === "string" && q.name.trim()) ||
    (typeof q.quizTitle === "string" && q.quizTitle.trim()) ||
    "Untitled Quiz";

  const id = String(q.id ?? q.quizId ?? q.key ?? uid("saved"));

  const createdAt =
    typeof q.createdAt === "string" ? q.createdAt : typeof q.date === "string" ? q.date : undefined;

  const rawQuestions: any[] = Array.isArray(q.questions)
    ? q.questions
    : Array.isArray(q.items)
      ? q.items
      : Array.isArray(q.quiz)
        ? q.quiz
        : [];

  const questions: LiveQuestion[] = rawQuestions
    .map((rq, idx) => {
      const prompt =
        (typeof rq.prompt === "string" && rq.prompt) ||
        (typeof rq.question === "string" && rq.question) ||
        (typeof rq.q === "string" && rq.q) ||
        "";

      if (!prompt.trim()) return null;

      // Choices can be array, object, or separate fields
      let choicesObj: Record<ChoiceKey, string> = { A: "", B: "", C: "", D: "" };

      if (rq.choices && typeof rq.choices === "object") {
        if (Array.isArray(rq.choices)) {
          choicesObj = {
            A: String(rq.choices[0] ?? ""),
            B: String(rq.choices[1] ?? ""),
            C: String(rq.choices[2] ?? ""),
            D: String(rq.choices[3] ?? ""),
          };
        } else {
          choicesObj = {
            A: String(rq.choices.A ?? rq.choices.a ?? ""),
            B: String(rq.choices.B ?? rq.choices.b ?? ""),
            C: String(rq.choices.C ?? rq.choices.c ?? ""),
            D: String(rq.choices.D ?? rq.choices.d ?? ""),
          };
        }
      } else if (rq.options && typeof rq.options === "object") {
        if (Array.isArray(rq.options)) {
          choicesObj = {
            A: String(rq.options[0] ?? ""),
            B: String(rq.options[1] ?? ""),
            C: String(rq.options[2] ?? ""),
            D: String(rq.options[3] ?? ""),
          };
        } else {
          choicesObj = {
            A: String(rq.options.A ?? rq.options.a ?? ""),
            B: String(rq.options.B ?? rq.options.b ?? ""),
            C: String(rq.options.C ?? rq.options.c ?? ""),
            D: String(rq.options.D ?? rq.options.d ?? ""),
          };
        }
      } else {
        choicesObj = {
          A: String(rq.A ?? rq.a ?? ""),
          B: String(rq.B ?? rq.b ?? ""),
          C: String(rq.C ?? rq.c ?? ""),
          D: String(rq.D ?? rq.d ?? ""),
        };
      }

      // Correct can be "A" or 0..3 etc
      let correct: ChoiceKey | null | undefined = undefined;
      const rawCorrect = rq.correct ?? rq.answer ?? rq.correctAnswer ?? rq.key ?? null;

      if (rawCorrect === null || rawCorrect === undefined || rawCorrect === "") {
        correct = null;
      } else if (typeof rawCorrect === "string") {
        const up = rawCorrect.trim().toUpperCase();
        if (up === "A" || up === "B" || up === "C" || up === "D") correct = up as ChoiceKey;
      } else if (typeof rawCorrect === "number") {
        const map: ChoiceKey[] = ["A", "B", "C", "D"];
        correct = map[rawCorrect] ?? null;
      }

      const nonEmptyCount = Object.values(choicesObj).filter((v) => String(v).trim().length > 0).length;
      if (nonEmptyCount < 2) return null;

      return {
        id: String(rq.id ?? rq.qid ?? `${id}_${idx}`),
        prompt: prompt.trim(),
        choices: {
          A: String(choicesObj.A ?? "").trim(),
          B: String(choicesObj.B ?? "").trim(),
          C: String(choicesObj.C ?? "").trim(),
          D: String(choicesObj.D ?? "").trim(),
        },
        correct,
      } as LiveQuestion;
    })
    .filter(Boolean) as LiveQuestion[];

  if (!questions.length) return null;

  return { id, title, createdAt, questions };
}

function copyToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

export default function LiveQuizPage() {
  const { id } = useParams();
  const classId = Number(id);
  const navigate = useNavigate();

  const [classInfo, setClassInfo] = useState<ClassItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [savedQuizzes, setSavedQuizzes] = useState<NormalisedQuiz[]>([]);
  const [selectedSavedQuizId, setSelectedSavedQuizId] = useState<string>("");

  const [mode, setMode] = useState<"saved" | "custom">("saved");

  // Settings
  const [anonymous, setAnonymous] = useState<boolean>(false);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [autoEndWhenAllAnswered, setAutoEndWhenAllAnswered] = useState<boolean>(true);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState<number>(20);
  const [useTimer, setUseTimer] = useState<boolean>(true);

  // Custom builder
  const [customTitle, setCustomTitle] = useState<string>("Quick Poll");
  const [customQuestions, setCustomQuestions] = useState<LiveQuestion[]>([
    {
      id: uid("cq"),
      prompt: "Your question here…",
      choices: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" },
      correct: null,
    },
  ]);

  // Session state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [session, setSession] = useState<{ code: string; joinUrl: string } | null>(null);

  // Live status polling
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const quizzesStorageKey = useMemo(() => `elume:quizzes:class:${classId}`, [classId]);
  const liveHistoryKey = useMemo(() => `elume:livequiz:history:class:${classId}`, [classId]);

  const [history, setHistory] = useState<LiveQuizHistoryItem[]>([]);
  const [activeReport, setActiveReport] = useState<LiveQuizHistoryItem | null>(null);

  // Load class info
  useEffect(() => {
    if (!classId || Number.isNaN(classId)) {
      setLoadError("Invalid class id.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    fetch(`${API_BASE}/classes/${classId}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load class.");
        return (await r.json()) as ClassItem;
      })
      .then((cls) => setClassInfo(cls))
      .catch((e: any) => setLoadError(e?.message || "Failed to load class."))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [classId]);

  // Load saved quizzes from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(quizzesStorageKey);
    const parsed = safeJsonParse<any>(raw, []);
    const arr = Array.isArray(parsed) ? parsed : parsed?.quizzes && Array.isArray(parsed.quizzes) ? parsed.quizzes : [];

    const normalised = (arr as SavedQuizAny[]).map(normaliseSavedQuiz).filter(Boolean) as NormalisedQuiz[];
    setSavedQuizzes(normalised);

    if (normalised.length && !selectedSavedQuizId) {
      setSelectedSavedQuizId(normalised[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzesStorageKey]);

  // Load live quiz history from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(liveHistoryKey);
    const parsed = safeJsonParse<LiveQuizHistoryItem[]>(raw, []);
    setHistory(Array.isArray(parsed) ? parsed : []);
  }, [liveHistoryKey]);

  const selectedQuiz = useMemo(() => {
    if (mode !== "saved") return null;
    return savedQuizzes.find((q) => q.id === selectedSavedQuizId) || null;
  }, [mode, savedQuizzes, selectedSavedQuizId]);

  const effectiveQuestions = useMemo(() => {
    if (mode === "saved" && selectedQuiz) return selectedQuiz.questions;
    if (mode === "custom") return customQuestions;
    return [];
  }, [mode, selectedQuiz, customQuestions]);

  const effectiveTitle = useMemo(() => {
    if (mode === "saved" && selectedQuiz) return selectedQuiz.title;
    return customTitle.trim() || "Live Quiz";
  }, [mode, selectedQuiz, customTitle]);

  const joinUrl = useMemo(() => (session ? session.joinUrl : ""), [session]);

  // QR without deps (uses QR image generator)
  const qrImgSrc = useMemo(() => {
    if (!joinUrl) return "";
    const data = encodeURIComponent(joinUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`;
  }, [joinUrl]);

  function addCustomQuestion() {
    setCustomQuestions((prev) => [
      ...prev,
      {
        id: uid("cq"),
        prompt: "New question…",
        choices: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" },
        correct: null,
      },
    ]);
  }

  function removeCustomQuestion(qid: string) {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== qid));
  }

  function updateCustomQuestion(qid: string, patch: Partial<LiveQuestion>) {
    setCustomQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  }

  function updateCustomChoice(qid: string, key: ChoiceKey, value: string) {
    setCustomQuestions((prev) =>
      prev.map((q) => (q.id === qid ? { ...q, choices: { ...q.choices, [key]: value } } : q))
    );
  }

  function validateQuestions(questions: LiveQuestion[]): string | null {
    if (!questions.length) return "Add at least one question.";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) return `Question ${i + 1} is missing a prompt.`;
      const nonEmptyChoices = Object.values(q.choices).filter((c) => String(c).trim().length > 0).length;
      if (nonEmptyChoices < 2) return `Question ${i + 1} needs at least 2 answer options.`;
    }
    return null;
  }

  async function createSession() {
    setCreateError(null);
    setStatusError(null);

    const questions = effectiveQuestions;
    const validationError = validateQuestions(questions);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreating(true);

    const payload: CreateSessionPayload = {
      class_id: classId,
      title: effectiveTitle,
      anonymous,
      seconds_per_question: useTimer ? clamp(secondsPerQuestion, 5, 600) : null,
      shuffle_questions: shuffleQuestions,
      auto_end_when_all_answered: autoEndWhenAllAnswered,
      questions: questions.map((q) => ({
        id: q.id,
        prompt: q.prompt.trim(),
        choices: {
          A: String(q.choices.A ?? "").trim(),
          B: String(q.choices.B ?? "").trim(),
          C: String(q.choices.C ?? "").trim(),
          D: String(q.choices.D ?? "").trim(),
        },
        correct: q.correct ?? null,
      })),
    };

    try {
      const res = await fetch(`${API_BASE}/livequiz/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to create live session.");
      }

      const data = (await res.json()) as CreateSessionResponse;
      const code = data.session_code;
      const defaultJoin = `${window.location.origin}/#/join/${code}`;
      const url = data.join_url || defaultJoin;

      setSession({ code, joinUrl: url });
      setStatus(null);
      setActiveReport(null);
    } catch (e: any) {
      setCreateError(e?.message || "Failed to create session.");
    } finally {
      setCreating(false);
    }
  }

  async function fetchStatus(code: string) {
    try {
      const res = await fetch(`${API_BASE}/livequiz/${code}/status`);
      if (!res.ok) throw new Error("Status unavailable.");
      const data = (await res.json()) as LiveStatus;
      setStatus(data);
      setStatusError(null);
    } catch (e: any) {
      setStatusError(e?.message || "Status unavailable.");
    }
  }

  function startPollingStatus(code: string) {
    stopPollingStatus();
    pollRef.current = window.setInterval(() => fetchStatus(code), 1000);
  }

  function stopPollingStatus() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    if (session?.code) {
      fetchStatus(session.code);
      startPollingStatus(session.code);
      return () => stopPollingStatus();
    }
    stopPollingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.code]);

  useEffect(() => {
    return () => stopPollingStatus();
  }, []);

  async function fetchResultsAndSave(code: string) {
    const res = await fetch(`${API_BASE}/livequiz/${code}/results`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Failed to fetch results.");
    }

    const results = (await res.json()) as LiveQuizResults;

    const item: LiveQuizHistoryItem = {
      saved_at: new Date().toISOString(),
      session_code: results.session_code,
      title: results.title,
      anonymous: results.anonymous,
      summary: results.summary,
      top3: results.top3 || [],
      leaderboard: results.leaderboard || [],
    };

    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 30);
      localStorage.setItem(liveHistoryKey, JSON.stringify(next));
      return next;
    });

    setActiveReport(item);
  }

  function deleteHistoryItem(saved_at: string, session_code: string) {
    setHistory((prev) => {
      const next = prev.filter((h) => !(h.saved_at === saved_at && h.session_code === session_code));
      localStorage.setItem(liveHistoryKey, JSON.stringify(next));

      // If the currently open report is the one deleted, clear it
      setActiveReport((curr) => {
        if (!curr) return null;
        return curr.saved_at === saved_at && curr.session_code === session_code ? null : curr;
      });

      return next;
    });
  }

  async function postControl(action: "start" | "next" | "end-question" | "end-session") {
    if (!session?.code) return;
    setStatusError(null);

    try {
      const res = await fetch(`${API_BASE}/livequiz/${session.code}/${action}`, { method: "POST" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Control action failed.");
      }

      // Refresh status after control
      fetchStatus(session.code);

      // If teacher ended session, fetch results + save history
      if (action === "end-session") {
        await fetchResultsAndSave(session.code);
      }
    } catch (e: any) {
      setStatusError(e?.message || "Control action failed.");
    }
  }

  function statusBadge() {
    const s = status?.state;
    if (!s) return null;
    const cls =
      s === "lobby"
        ? "bg-slate-100 text-slate-700"
        : s === "live"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-rose-100 text-rose-800";
    return <span className={`rounded-full px-2 py-1 text-xs font-bold ${cls}`}>{s.toUpperCase()}</span>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-800">Loading Live Quiz…</div>
          <div className="mt-2 text-sm text-slate-600">Fetching class info…</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="rounded-3xl border-2 border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-rose-700">Could not load</div>
          <div className="mt-2 text-sm text-slate-700">{loadError}</div>
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

  const pageTitle = `${classInfo?.name || `Class ${classId}`} — Live Quiz / Poll`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-extrabold tracking-tight text-slate-900">{pageTitle}</div>
          <div className="mt-1 text-sm text-slate-600">
            Run a live quiz or anonymous poll • Students join via QR • You control pacing
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => navigate(`/class/${classId}`)}
          >
            ← Back to class
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Setup */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-bold text-slate-900">Quiz setup</div>

            {/* Mode selector */}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-2xl border-2 px-4 py-2 text-sm font-bold ${mode === "saved"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                onClick={() => setMode("saved")}
              >
                Use saved quiz
              </button>

              <button
                type="button"
                className={`flex-1 rounded-2xl border-2 px-4 py-2 text-sm font-bold ${mode === "custom"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                onClick={() => setMode("custom")}
              >
                Quick custom
              </button>
            </div>

            {/* Saved quiz selector */}
            {mode === "saved" ? (
              <div className="mt-4">
                <div className="text-sm font-semibold text-slate-700">Choose a saved quiz</div>
                <div className="mt-2">
                  {savedQuizzes.length ? (
                    <select
                      className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                      value={selectedSavedQuizId}
                      onChange={(e) => setSelectedSavedQuizId(e.target.value)}
                    >
                      {savedQuizzes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title} {q.questions?.length ? `(${q.questions.length} Qs)` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      No saved quizzes found for this class yet. Generate one in your Quizzes page, or use “Quick
                      custom”.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="text-sm font-semibold text-slate-700">Title</div>
                <input
                  className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Exit ticket / Topic vote / Quick check"
                />
              </div>
            )}

            {/* Settings */}
            <div className="mt-5 rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">Session options</div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">Anonymous mode (don’t record names)</span>
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">Shuffle</span>
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">Timer</span>
                  <input type="checkbox" checked={useTimer} onChange={(e) => setUseTimer(e.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">Auto-end</span>
                  <input
                    type="checkbox"
                    checked={autoEndWhenAllAnswered}
                    onChange={(e) => setAutoEndWhenAllAnswered(e.target.checked)}
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-slate-700">
                  Seconds / question
                  <input
                    type="number"
                    min={5}
                    max={600}
                    disabled={!useTimer}
                    className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    value={secondsPerQuestion}
                    onChange={(e) => setSecondsPerQuestion(clamp(parseInt(e.target.value || "20", 10), 5, 600))}
                  />
                </label>

                <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-600">Questions loaded</div>
                  <div className="text-xl font-extrabold text-slate-900">{effectiveQuestions.length}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-600">
                Tip: Anonymous is best for polls (no usernames). Turn it off for games/leaderboards.
              </div>
            </div>

            {createError && (
              <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {createError}
              </div>
            )}

            <button
              className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-slate-900 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              disabled={creating || (mode === "saved" && !selectedQuiz)}
              onClick={createSession}
            >
              {creating ? "Creating session…" : "Create live session"}
            </button>
          </div>

          {/* Custom builder */}
          {mode === "custom" && (
            <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-slate-900">Custom questions</div>
                <button
                  className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  onClick={addCustomQuestion}
                >
                  + Add question
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {customQuestions.map((q, idx) => (
                  <div key={q.id} className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-extrabold text-slate-900">Question {idx + 1}</div>
                      {customQuestions.length > 1 && (
                        <button
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          onClick={() => removeCustomQuestion(q.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                      Prompt
                      <textarea
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={q.prompt}
                        onChange={(e) => updateCustomQuestion(q.id, { prompt: e.target.value })}
                        rows={2}
                      />
                    </label>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {(["A", "B", "C", "D"] as ChoiceKey[]).map((k) => (
                        <label key={k} className="block text-xs font-bold text-slate-600">
                          {k}
                          <input
                            className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                            value={q.choices[k]}
                            onChange={(e) => updateCustomChoice(q.id, k, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-slate-600">Optional: mark correct answer (leave blank for poll)</div>
                      <select
                        className="rounded-xl border-2 border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800"
                        value={q.correct ?? ""}
                        onChange={(e) => {
                          const v = e.target.value as ChoiceKey | "";
                          updateCustomQuestion(q.id, { correct: v ? (v as ChoiceKey) : null });
                        }}
                      >
                        <option value="">Poll (no correct)</option>
                        <option value="A">Correct: A</option>
                        <option value="B">Correct: B</option>
                        <option value="C">Correct: C</option>
                        <option value="D">Correct: D</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Session + QR + Controls + Results */}
        <div className="lg:col-span-7">
          <div className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">Live session</div>
                <div className="mt-1 text-xs text-slate-600">Create session → students join via QR → you control flow</div>
              </div>

              {session && (
                <button
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    if (!window.confirm("Clear this session from the page? (This does not end it on the server.)")) return;
                    setSession(null);
                    setStatus(null);
                    setStatusError(null);
                    setActiveReport(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {!session ? (
              <div className="mt-6 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="text-base font-bold text-slate-900">No session yet</div>
                <div className="mt-2 text-sm text-slate-600">
                  Choose a saved quiz or build a custom poll, then click <b>Create live session</b>.
                </div>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* QR + Join */}
                <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-extrabold text-slate-900">Student QR</div>
                    {statusBadge()}
                  </div>

                  <div className="mt-3 flex items-center justify-center">
                    {qrImgSrc ? (
                      <img
                        src={qrImgSrc}
                        alt="Join QR"
                        className="h-[220px] w-[220px] rounded-2xl border-2 border-slate-200 bg-white"
                      />
                    ) : (
                      <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-sm text-slate-500">
                        QR will appear here
                      </div>
                    )}
                  </div>

                  <div className="mt-3 text-xs font-semibold text-slate-700">Join link</div>
                  <div className="mt-1 break-all rounded-2xl border-2 border-slate-200 bg-white p-2 text-xs text-slate-700">
                    {joinUrl}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      onClick={() => copyToClipboard(joinUrl)}
                    >
                      Copy link
                    </button>
                    <button
                      className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      onClick={() => copyToClipboard(session.code)}
                    >
                      Copy code
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    Session code: <span className="font-bold text-slate-800">{session.code}</span>
                  </div>
                </div>

                {/* Live status + controls */}
                <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-extrabold text-slate-900">Teacher controls</div>

                  {statusError && (
                    <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      {statusError}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-semibold text-slate-600">Joined</div>
                      <div className="text-xl font-extrabold text-slate-900">{status?.joined_count ?? "—"}</div>
                    </div>

                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-semibold text-slate-600">Answered</div>
                      <div className="text-xl font-extrabold text-slate-900">{status?.answered_count ?? "—"}</div>
                    </div>

                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-semibold text-slate-600">Question</div>
                      <div className="text-xl font-extrabold text-slate-900">
                        {status?.total_questions ? `${(status.current_index ?? 0) + 1}/${status.total_questions}` : "—"}
                      </div>
                    </div>

                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-semibold text-slate-600">Time left</div>
                      <div className="text-xl font-extrabold text-slate-900">
                        {typeof status?.time_left_seconds === "number" ? `${status.time_left_seconds}s` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      className="rounded-2xl border-2 border-slate-200 bg-slate-900 px-3 py-2 text-sm font-extrabold text-white hover:opacity-95"
                      onClick={() => postControl("start")}
                    >
                      Start
                    </button>

                    <button
                      className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
                      onClick={() => postControl("next")}
                    >
                      Next
                    </button>

                    <button
                      className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
                      onClick={() => postControl("end-question")}
                    >
                      End Q early
                    </button>

                    <button
                      className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm font-extrabold text-rose-800 hover:bg-rose-100"
                      onClick={() => postControl("end-session")}
                    >
                      End session
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-slate-600">
                    Tip: Turn off Anonymous for kid-friendly usernames + leaderboards. Auto-end ends the question early
                    when everyone has answered.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results + History */}
          <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">Results & History</div>
                <div className="mt-1 text-xs text-slate-600">Reports are saved locally on this device.</div>
              </div>

              {session?.code ? (
                <button
                  className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
                  onClick={() => fetchResultsAndSave(session.code)}
                >
                  Refresh results
                </button>
              ) : null}
            </div>

            {activeReport ? (
              <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold text-slate-900">{activeReport.title}</div>
                  <div className="text-xs text-slate-600">{new Date(activeReport.saved_at).toLocaleString()}</div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold text-slate-600">Joined</div>
                    <div className="text-xl font-extrabold text-slate-900">{activeReport.summary.joined}</div>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold text-slate-600">Attempted</div>
                    <div className="text-xl font-extrabold text-slate-900">{activeReport.summary.attempted_any}</div>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold text-slate-600">Questions</div>
                    <div className="text-xl font-extrabold text-slate-900">{activeReport.summary.total_questions}</div>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold text-slate-600">Avg</div>
                    <div className="text-xl font-extrabold text-slate-900">{activeReport.summary.avg_percent}%</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-extrabold text-slate-900">Top 3</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(activeReport.top3 || []).map((p, i) => (
                      <div key={i} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                        <div className="text-xs font-bold text-slate-600">#{i + 1}</div>
                        <div className="mt-1 text-base font-extrabold text-slate-900">{p.name}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {activeReport.summary.scored_mode ? `${p.correct} correct` : `${p.answered} answered`} •{" "}
                          {p.percent}%
                        </div>
                      </div>
                    ))}
                    {!activeReport.top3?.length ? (
                      <div className="text-sm text-slate-600 sm:col-span-3">No results yet.</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-extrabold text-slate-900">Leaderboard</div>
                  <div className="mt-2 overflow-hidden rounded-2xl border-2 border-slate-200 bg-white">
                    {(activeReport.leaderboard || []).slice(0, 25).map((r, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between border-b border-slate-100 px-3 py-2 last:border-b-0"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          {idx + 1}. {r.name}
                        </div>
                        <div className="text-sm font-extrabold text-slate-900">
                          {activeReport.summary.scored_mode ? r.correct : r.answered} • {r.percent}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="text-sm font-extrabold text-slate-900">No report selected</div>
                <div className="mt-1 text-xs text-slate-600">End a session to generate a report automatically.</div>
              </div>
            )}

            <div className="mt-5">
              <div className="text-sm font-extrabold text-slate-900">History</div>
              <div className="mt-2 overflow-hidden rounded-2xl border-2 border-slate-200 bg-white">
                {history.length ? (
                  history.map((h, idx) => (
                    <div
                      key={`${h.session_code}_${h.saved_at}_${idx}`}
                      className="flex items-center justify-between border-b border-slate-100 px-3 py-2 last:border-b-0"
                    >
                      <button
                        className="flex-1 text-left hover:opacity-90"
                        onClick={() => setActiveReport(h)}
                        type="button"
                      >
                        <div className="text-sm font-extrabold text-slate-900">{h.title}</div>
                        <div className="text-xs text-slate-600">
                          {new Date(h.saved_at).toLocaleString()} • {h.anonymous ? "Anonymous" : "Named"} • Avg {h.summary.avg_percent}%
                        </div>
                      </button>

                      <button
                        type="button"
                        className="ml-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-800 hover:bg-rose-100"
                        onClick={() => {
                          const ok = window.confirm("Delete this saved report? This can't be undone.");
                          if (!ok) return;
                          deleteHistoryItem(h.saved_at, h.session_code);
                        }}
                        title="Delete report"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-slate-600">No history yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">Question preview</div>
                <div className="mt-1 text-xs text-slate-600">
                  This is what will be sent into the live session when you create it.
                </div>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {effectiveQuestions.length} question{effectiveQuestions.length === 1 ? "" : "s"}
              </div>
            </div>

            {!effectiveQuestions.length ? (
              <div className="mt-4 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                No questions yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {effectiveQuestions.slice(0, 6).map((q, idx) => (
                  <div key={q.id} className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-extrabold text-slate-900">
                      {idx + 1}. {q.prompt}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {(["A", "B", "C", "D"] as ChoiceKey[]).map((k) => (
                        <div
                          key={k}
                          className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                        >
                          <span className="mr-2 font-extrabold text-slate-600">{k}</span>
                          {q.choices[k] || <span className="text-slate-400">Empty</span>}
                        </div>
                      ))}
                    </div>
                    {q.correct ? (
                      <div className="mt-2 text-xs font-bold text-emerald-800">Correct: {q.correct}</div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-600">Poll mode (no correct answer)</div>
                    )}
                  </div>
                ))}

                {effectiveQuestions.length > 6 && (
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-center text-xs text-slate-600">
                    Showing first 6 questions only…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}