import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import elumeLogo from "./assets/ELogo2.png";
import { apiFetch } from "./api";

const API_BASE = "/api";

type ClassItem = { id: number; name: string; subject?: string };

type ChoiceKey = "A" | "B" | "C" | "D";

type LiveQuestion = {
  id: string;
  prompt: string;
  choices: Record<ChoiceKey, string>;
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

      let choicesObj: Record<ChoiceKey, string> = { A: "", B: "", C: "", D: "" };

      if (Array.isArray(rq.choices) && rq.choices.length === 4) {
        choicesObj = {
          A: String(rq.choices[0] ?? ""),
          B: String(rq.choices[1] ?? ""),
          C: String(rq.choices[2] ?? ""),
          D: String(rq.choices[3] ?? ""),
        };
      } else if (rq.choices && typeof rq.choices === "object") {
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

      let correct: ChoiceKey | null | undefined = undefined;
      const rawCorrect =
        typeof rq.correctIndex === "number" && rq.correctIndex >= 0 && rq.correctIndex <= 3
          ? rq.correctIndex
          : rq.correct ??
            rq.answer ??
            rq.correctAnswer ??
            rq.correctIndex ??
            rq.key ??
            null;

      if (rawCorrect === null || rawCorrect === undefined || rawCorrect === "") {
        correct = null;
      } else if (typeof rawCorrect === "string") {
        const s = rawCorrect.trim();
        const up = s.toUpperCase();
        if (up === "A" || up === "B" || up === "C" || up === "D") {
          correct = up as ChoiceKey;
        } else {
          const n = Number(s);
          if (Number.isFinite(n)) {
            const map: ChoiceKey[] = ["A", "B", "C", "D"];
            if (n >= 0 && n <= 3) correct = map[n] ?? null;
            else if (n >= 1 && n <= 4) correct = map[n - 1] ?? null;
          }
        }
      } else if (typeof rawCorrect === "number") {
        const map: ChoiceKey[] = ["A", "B", "C", "D"];
        if (rawCorrect >= 0 && rawCorrect <= 3) correct = map[rawCorrect] ?? null;
        else if (rawCorrect >= 1 && rawCorrect <= 4) correct = map[rawCorrect - 1] ?? null;
        else correct = null;
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

function StatCard({
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
    <div
      className={`rounded-3xl border bg-gradient-to-br p-4 shadow-sm ${toneMap[tone]}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
    </div>
  );
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

  const [anonymous, setAnonymous] = useState<boolean>(false);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [autoEndWhenAllAnswered, setAutoEndWhenAllAnswered] = useState<boolean>(false);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState<number>(20);
  const [useTimer, setUseTimer] = useState<boolean>(true);

  const [customTitle, setCustomTitle] = useState<string>("Quick Poll");
  const [customQuestions, setCustomQuestions] = useState<LiveQuestion[]>([
    {
      id: uid("cq"),
      prompt: "Your question here…",
      choices: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" },
      correct: null,
    },
  ]);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [session, setSession] = useState<{ code: string; joinUrl: string } | null>(null);

  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const quizzesStorageKey = useMemo(() => `elume:quizzes:class:${classId}`, [classId]);
  const liveHistoryKey = useMemo(() => `elume:livequiz:history:class:${classId}`, [classId]);

  const [history, setHistory] = useState<LiveQuizHistoryItem[]>([]);
  const [activeReport, setActiveReport] = useState<LiveQuizHistoryItem | null>(null);

  useEffect(() => {
    if (!classId || Number.isNaN(classId)) {
      setLoadError("Invalid class id.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    apiFetch(`${API_BASE}/classes/${classId}`, { signal: controller.signal })
      .then((cls) => setClassInfo(cls))
      .catch((e: any) => setLoadError(e?.message || "Failed to load class."))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [classId]);

  async function loadSavedQuizzes() {
    const raw = localStorage.getItem(quizzesStorageKey);
    const parsed = safeJsonParse<any>(raw, []);
    const storedArr = Array.isArray(parsed) ? parsed : parsed?.quizzes && Array.isArray(parsed.quizzes) ? parsed.quizzes : [];
    const storedNormalised = (storedArr as SavedQuizAny[]).map(normaliseSavedQuiz).filter(Boolean) as NormalisedQuiz[];

    if (storedNormalised.length) {
      setSavedQuizzes(storedNormalised);
      setSelectedSavedQuizId((prev) => prev || storedNormalised[0].id);
    }

    if (!classId || Number.isNaN(classId)) return;

    try {
      const data = await apiFetch(`${API_BASE}/classes/${classId}/quizzes`);
      const apiQuizzes = (Array.isArray(data) ? data : []).map((q: any) => ({
        id: String(q.id),
        title: String(q.title || ""),
        category: String(q.category || "General"),
        description: String(q.description || ""),
        createdAt: q.created_at ? new Date(q.created_at).getTime() : Date.now(),
        questions: Array.isArray(q.questions)
          ? [...q.questions]
              .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
              .map((qq: any) => ({
                id: String(qq.id),
                prompt: String(qq.prompt || ""),
                choices: [
                  String(qq.choices?.[0] || ""),
                  String(qq.choices?.[1] || ""),
                  String(qq.choices?.[2] || ""),
                  String(qq.choices?.[3] || ""),
                ],
                correctIndex: Math.max(0, Math.min(3, Number(qq.correct_index ?? 0))),
                explanation: qq.explanation ? String(qq.explanation) : undefined,
              }))
          : [],
      }));

      const normalised = apiQuizzes.map(normaliseSavedQuiz).filter(Boolean) as NormalisedQuiz[];
      setSavedQuizzes(normalised);
      setSelectedSavedQuizId((prev) => {
        if (prev && normalised.some((q) => q.id === prev)) return prev;
        return normalised[0]?.id || "";
      });
      localStorage.setItem(quizzesStorageKey, JSON.stringify(apiQuizzes));
    } catch {
      if (!storedNormalised.length) {
        setSavedQuizzes([]);
        setSelectedSavedQuizId("");
      }
    }
  }

  useEffect(() => {
    void loadSavedQuizzes();
  }, [classId, quizzesStorageKey]);

  useEffect(() => {
    function handleFocus() {
      void loadSavedQuizzes();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadSavedQuizzes();
      }
    }

    function handleStorage(e: StorageEvent) {
      if (e.key === quizzesStorageKey) {
        void loadSavedQuizzes();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [quizzesStorageKey, classId]);

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
      const data = (await apiFetch(`${API_BASE}/livequiz/create`, {
        method: "POST",
        body: JSON.stringify(payload),
      })) as CreateSessionResponse;
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
    const results = (await apiFetch(`${API_BASE}/livequiz/${code}/results`)) as LiveQuizResults;

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
      await apiFetch(`${API_BASE}/livequiz/${session.code}/${action}`, { method: "POST" });

      fetchStatus(session.code);

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
        ? "border-slate-200 bg-white/80 text-slate-700"
        : s === "live"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800";
    return <span className={`rounded-full border px-3 py-1 text-xs font-black tracking-wide ${cls}`}>{s.toUpperCase()}</span>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-6">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_25px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="text-2xl font-black tracking-tight text-slate-900">Loading Live Quiz…</div>
          <div className="mt-2 text-sm text-slate-600">Fetching class info…</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 p-6">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-rose-200 bg-white/90 p-8 shadow-[0_25px_70px_rgba(15,23,42,0.08)]">
          <div className="text-2xl font-black tracking-tight text-rose-700">Could not load</div>
          <div className="mt-2 text-sm text-slate-700">{loadError}</div>
          <button
            className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-md hover:opacity-95"
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute right-[-90px] top-12 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-[-90px] left-[10%] h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:38px_38px]" />
      </div>

      <div className="relative z-10 p-4 md:p-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-6 rounded-[36px] border border-white/70 bg-white/80 p-5 shadow-[0_25px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-white/70 bg-white/90 shadow-xl ring-1 ring-emerald-100">
                  <img src={elumeLogo} alt="Elume" className="h-14 w-14 object-contain drop-shadow-sm" />
                </div>

                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                    Live teaching tools
                  </div>

                  <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
                    {pageTitle}
                  </h1>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                    Run a polished live quiz or anonymous poll with QR joining, clear teacher controls,
                    instant pacing, and saved results history.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-white/70 bg-gradient-to-r from-cyan-50 via-white to-emerald-50 px-4 py-3 text-sm shadow-sm">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Current mode</div>
                  <div className="mt-1 font-black text-slate-900">
                    {mode === "saved" ? "Saved quiz" : "Quick custom poll"}
                  </div>
                </div>

                <button
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                  onClick={() => navigate(`/class/${classId}`)}
                >
                  ← Back to class
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Questions" value={effectiveQuestions.length} tone="violet" />
              <StatCard label="Session" value={session?.code || "—"} tone="cyan" />
              <StatCard label="Joined" value={status?.joined_count ?? "—"} tone="emerald" />
              <StatCard
                label="State"
                value={status?.state ? status.state.toUpperCase() : "NOT LIVE"}
                tone={status?.state === "live" ? "emerald" : status?.state === "ended" ? "violet" : "slate"}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-5 space-y-5">
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-black tracking-tight text-slate-900">Quiz setup</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Choose a saved quiz or build a quick live poll.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-violet-700">
                    Setup
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${mode === "saved"
                        ? "border-slate-900 bg-slate-900 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:bg-slate-50"
                      }`}
                    onClick={() => setMode("saved")}
                  >
                    Use saved quiz
                  </button>

                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${mode === "custom"
                        ? "border-slate-900 bg-slate-900 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:bg-slate-50"
                      }`}
                    onClick={() => setMode("custom")}
                  >
                    Quick custom
                  </button>
                </div>

                {mode === "saved" ? (
                  <div className="mt-5">
                    <div className="text-sm font-bold text-slate-700">Choose a saved quiz</div>
                    <div className="mt-2">
                      {savedQuizzes.length ? (
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
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
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          No saved quizzes found for this class yet. Generate one in the Quizzes page, or use
                          “Quick custom”.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5">
                    <div className="text-sm font-bold text-slate-700">Session title</div>
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="e.g. Exit ticket / Topic vote / Quick check"
                    />
                  </div>
                )}

                <div className="mt-5 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
                  <div className="text-sm font-black text-slate-900">Session options</div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <span className="text-sm font-semibold text-slate-800">Anonymous mode</span>
                      <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <span className="text-sm font-semibold text-slate-800">Shuffle questions</span>
                      <input
                        type="checkbox"
                        checked={shuffleQuestions}
                        onChange={(e) => setShuffleQuestions(e.target.checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <span className="text-sm font-semibold text-slate-800">Use timer</span>
                      <input type="checkbox" checked={useTimer} onChange={(e) => setUseTimer(e.target.checked)} />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <span className="text-sm font-semibold text-slate-800">Auto-end when all answered</span>
                      <input
                        type="checkbox"
                        checked={autoEndWhenAllAnswered}
                        onChange={(e) => setAutoEndWhenAllAnswered(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        Seconds per question
                      </div>
                      <input
                        type="number"
                        min={5}
                        max={600}
                        disabled={!useTimer}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:opacity-50"
                        value={secondsPerQuestion}
                        onChange={(e) => setSecondsPerQuestion(clamp(parseInt(e.target.value || "20", 10), 5, 600))}
                      />
                    </label>

                    <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        Questions loaded
                      </div>
                      <div className="mt-2 text-4xl font-black tracking-tight text-slate-900">
                        {effectiveQuestions.length}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-xs leading-5 text-slate-600">
                    Tip: Anonymous mode works best for opinion polls. Turn it off for named participation and
                    leaderboard-style quizzes.
                  </div>
                </div>

                {createError && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {createError}
                  </div>
                )}

                <button
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-4 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={creating || (mode === "saved" && !selectedQuiz)}
                  onClick={createSession}
                >
                  {creating ? "Creating session…" : "Create live session"}
                </button>
              </div>

              {mode === "custom" && (
                <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xl font-black tracking-tight text-slate-900">Custom questions</div>
                      <div className="mt-1 text-sm text-slate-600">Build a fast poll or quiz on the fly.</div>
                    </div>

                    <button
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                      onClick={addCustomQuestion}
                    >
                      + Add question
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    {customQuestions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-black text-slate-900">Question {idx + 1}</div>
                          {customQuestions.length > 1 && (
                            <button
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100"
                              onClick={() => removeCustomQuestion(q.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <label className="mt-3 block text-sm font-bold text-slate-700">
                          Prompt
                          <textarea
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                            value={q.prompt}
                            onChange={(e) => updateCustomQuestion(q.id, { prompt: e.target.value })}
                            rows={2}
                          />
                        </label>

                        <div className="mt-3 grid grid-cols-1 gap-2">
                          {(["A", "B", "C", "D"] as ChoiceKey[]).map((k) => (
                            <label key={k} className="block text-xs font-black uppercase tracking-wide text-slate-600">
                              {k}
                              <input
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                                value={q.choices[k]}
                                onChange={(e) => updateCustomChoice(q.id, k, e.target.value)}
                              />
                            </label>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs text-slate-600">
                            Optional: mark a correct answer. Leave blank for poll mode.
                          </div>
                          <select
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm outline-none focus:border-emerald-400"
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

            <div className="xl:col-span-7 space-y-5">
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-black tracking-tight text-slate-900">Live session</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Students scan the QR, join instantly, and you control the pace.
                    </div>
                  </div>

                  {session ? (
                    <button
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
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
                  ) : null}
                </div>

                {!session ? (
                  <div className="mt-6 rounded-[28px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-10 text-center">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
                      <img src={elumeLogo} alt="Elume" className="h-10 w-10 object-contain" />
                    </div>
                    <div className="mt-4 text-lg font-black text-slate-900">No session yet</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Choose a saved quiz or build a custom poll, then click <b>Create live session</b>.
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[28px] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black uppercase tracking-[0.18em] text-cyan-700">
                            Student join
                          </div>
                          <div className="mt-1 text-lg font-black text-slate-900">QR + join link</div>
                        </div>
                        {statusBadge()}
                      </div>

                      <div className="mt-5 flex items-center justify-center">
                        {qrImgSrc ? (
                          <div className="rounded-[28px] border border-white/80 bg-white p-4 shadow-lg">
                            <img
                              src={qrImgSrc}
                              alt="Join QR"
                              className="h-[220px] w-[220px] rounded-2xl border border-slate-100 bg-white"
                            />
                          </div>
                        ) : (
                          <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
                            QR will appear here
                          </div>
                        )}
                      </div>

                      <div className="mt-5 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Join link</div>
                        <div className="mt-2 break-all text-sm font-semibold text-slate-700">{joinUrl}</div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <button
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                          onClick={() => copyToClipboard(joinUrl)}
                        >
                          Copy link
                        </button>
                        <button
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                          onClick={() => copyToClipboard(session.code)}
                        >
                          Copy code
                        </button>
                      </div>

                      <div className="mt-4 rounded-2xl border border-cyan-100 bg-white/80 px-4 py-3 text-sm text-slate-700">
                        Session code: <span className="font-black text-slate-900">{session.code}</span>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50 p-5 shadow-sm">
                      <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                        Teacher controls
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-900">Run the session live</div>

                      {statusError && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                          {statusError}
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <StatCard label="Joined" value={status?.joined_count ?? "—"} tone="emerald" />
                        <StatCard label="Answered" value={status?.answered_count ?? "—"} tone="cyan" />
                        <StatCard
                          label="Question"
                          value={status?.total_questions ? `${(status.current_index ?? 0) + 1}/${status.total_questions}` : "—"}
                          tone="violet"
                        />
                        <StatCard
                          label="Time left"
                          value={typeof status?.time_left_seconds === "number" ? `${status.time_left_seconds}s` : "—"}
                          tone="slate"
                        />
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <button
                          className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                          onClick={() => postControl("start")}
                        >
                          Start
                        </button>

                        <button
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                          onClick={() => postControl("next")}
                        >
                          Next
                        </button>

                        <button
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                          onClick={() => postControl("end-question")}
                        >
                          End Q early
                        </button>

                        <button
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100"
                          onClick={() => postControl("end-session")}
                        >
                          End session
                        </button>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-xs leading-5 text-slate-600 shadow-sm">
                        Tip: turn off Anonymous if you want kid-friendly names and leaderboard-style results.
                        Auto-end can finish a question early when everyone has answered.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xl font-black tracking-tight text-slate-900">Results & History</div>
                    <div className="mt-1 text-sm text-slate-600">Reports are saved locally on this device.</div>
                  </div>

                  {session?.code ? (
                    <button
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                      onClick={() => fetchResultsAndSave(session.code)}
                    >
                      Refresh results
                    </button>
                  ) : null}
                </div>

                {activeReport ? (
                  <div className="mt-5 rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-lg font-black text-slate-900">{activeReport.title}</div>
                      <div className="text-xs font-semibold text-slate-500">
                        {new Date(activeReport.saved_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <StatCard label="Joined" value={activeReport.summary.joined} tone="emerald" />
                      <StatCard label="Attempted" value={activeReport.summary.attempted_any} tone="cyan" />
                      <StatCard label="Questions" value={activeReport.summary.total_questions} tone="violet" />
                      <StatCard label="Average" value={`${activeReport.summary.avg_percent}%`} tone="slate" />
                    </div>

                    <div className="mt-5">
                      <div className="text-sm font-black text-slate-900">Top 3</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {(activeReport.top3 || []).map((p, i) => (
                          <div
                            key={i}
                            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                              #{i + 1}
                            </div>
                            <div className="mt-2 text-lg font-black text-slate-900">{p.name}</div>
                            <div className="mt-1 text-sm text-slate-600">
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

                    <div className="mt-5">
                      <div className="text-sm font-black text-slate-900">Leaderboard</div>
                      <div className="mt-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        {(activeReport.leaderboard || []).slice(0, 25).map((r, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0"
                          >
                            <div className="text-sm font-semibold text-slate-900">
                              {idx + 1}. {r.name}
                            </div>
                            <div className="text-sm font-black text-slate-900">
                              {activeReport.summary.scored_mode ? r.correct : r.answered} • {r.percent}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-10 text-center">
                    <div className="text-base font-black text-slate-900">No report selected</div>
                    <div className="mt-2 text-sm text-slate-600">
                      End a session to generate a report automatically.
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <div className="text-sm font-black text-slate-900">History</div>
                  <div className="mt-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    {history.length ? (
                      history.map((h, idx) => (
                        <div
                          key={`${h.session_code}_${h.saved_at}_${idx}`}
                          className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                        >
                          <button
                            className="flex-1 text-left transition hover:opacity-90"
                            onClick={() => setActiveReport(h)}
                            type="button"
                          >
                            <div className="text-sm font-black text-slate-900">{h.title}</div>
                            <div className="text-xs text-slate-600">
                              {new Date(h.saved_at).toLocaleString()} • {h.anonymous ? "Anonymous" : "Named"} • Avg{" "}
                              {h.summary.avg_percent}%
                            </div>
                          </button>

                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800 hover:bg-rose-100"
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
                      <div className="px-4 py-5 text-sm text-slate-600">No history yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xl font-black tracking-tight text-slate-900">Question preview</div>
                    <div className="mt-1 text-sm text-slate-600">
                      This is what will be sent into the live session when you create it.
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700">
                    {effectiveQuestions.length} question{effectiveQuestions.length === 1 ? "" : "s"}
                  </div>
                </div>

                {!effectiveQuestions.length ? (
                  <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 text-center text-sm text-slate-600">
                    No questions yet.
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {effectiveQuestions.slice(0, 6).map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm"
                      >
                        <div className="text-sm font-black text-slate-900">
                          {idx + 1}. {q.prompt}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                          {(["A", "B", "C", "D"] as ChoiceKey[]).map((k) => (
                            <div
                              key={k}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm"
                            >
                              <span className="mr-2 font-black text-slate-500">{k}</span>
                              {q.choices[k] || <span className="text-slate-400">Empty</span>}
                            </div>
                          ))}
                        </div>
                        {q.correct ? (
                          <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                            Correct: {q.correct}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-slate-600">Poll mode (no correct answer)</div>
                        )}
                      </div>
                    ))}

                    {effectiveQuestions.length > 6 && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center text-xs text-slate-600 shadow-sm">
                        Showing first 6 questions only…
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
