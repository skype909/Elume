import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import elumeLogo from "./assets/ELogo2.png";
import quizLoopMp3 from "./assets/live-quiz/quiz-loop.mp3";
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
  classId?: number;
  originClassName?: string;
  isStarred?: boolean;
  questions: LiveQuestion[];
};

type CreateSessionPayload = {
  class_id: number;
  title: string;
  anonymous: boolean;
  quiz_id?: string | null;
  seconds_per_question: number | null;
  shuffle_questions: boolean;
  auto_play: boolean;
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
  auto_play?: boolean;
  seconds_per_question?: number | null;
  current_index?: number;
  total_questions?: number;
  time_left_seconds?: number | null;
  joined_count?: number;
  answered_count?: number;
  answers_open?: boolean;
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
  question_stats?: Array<{
    question_id: string;
    prompt: string;
    correct?: ChoiceKey | null;
    counts: Record<ChoiceKey, number>;
    total_answers: number;
    correct_rate?: number | null;
  }>;
};

type LiveQuizAttempt = {
  id: number;
  session_id: number;
  quiz_id?: string | null;
  participant_display_name: string;
  score: number;
  score_percent?: number | null;
  total_questions: number;
  completed: boolean;
  scored_mode: boolean;
  excluded_from_average: boolean;
  submitted_at?: string | null;
  finished_at?: string | null;
  counted: boolean;
};

type LiveQuizInsightStudent = {
  group_key: string;
  student_id?: number | null;
  display_name: string;
  counted_attempts: number;
  average_percent?: number | null;
  attempts: LiveQuizAttempt[];
};

type LiveQuizInsightsResponse = {
  summary: {
    total_attempts: number;
    counted_attempts: number;
    excluded_attempts: number;
    incomplete_attempts: number;
  };
  students: LiveQuizInsightStudent[];
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

type PollResultsModalState = {
  questionId: string;
  prompt: string;
  choices: Record<ChoiceKey, string>;
  counts: Record<ChoiceKey, number>;
  totalAnswers: number;
  sourceLabel: string;
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

  return {
    id,
    title,
    createdAt,
    classId: typeof q.class_id === "number" ? q.class_id : undefined,
    originClassName: typeof q.origin_class_name === "string" ? q.origin_class_name : undefined,
    isStarred: Boolean(q.is_starred),
    questions,
  };
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
  const [starredQuizzes, setStarredQuizzes] = useState<NormalisedQuiz[]>([]);
  const [selectedStarredQuizId, setSelectedStarredQuizId] = useState<string>("");

  const [mode, setMode] = useState<"saved" | "starred" | "custom">("saved");

  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [autoEndWhenAllAnswered, setAutoEndWhenAllAnswered] = useState<boolean>(false);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState<number>(20);
  const [useTimer, setUseTimer] = useState<boolean>(true);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(false);
  const [musicVolume, setMusicVolume] = useState<number>(35);
  const [musicNotice, setMusicNotice] = useState<string | null>(null);

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultsSavedForSessionRef = useRef<string | null>(null);

  const [insights, setInsights] = useState<LiveQuizInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsFilter, setInsightsFilter] = useState<"all" | "counted" | "excluded" | "incomplete">("all");
  const [updatingAttemptId, setUpdatingAttemptId] = useState<number | null>(null);

  const quizzesStorageKey = useMemo(() => `elume:quizzes:class:${classId}`, [classId]);
  const liveHistoryKey = useMemo(() => `elume:livequiz:history:class:${classId}`, [classId]);

  const [history, setHistory] = useState<LiveQuizHistoryItem[]>([]);
  const [activeReport, setActiveReport] = useState<LiveQuizHistoryItem | null>(null);
  const [pollResultsModal, setPollResultsModal] = useState<PollResultsModalState | null>(null);
  const [pollResultsBusy, setPollResultsBusy] = useState(false);
  const [pollResultsError, setPollResultsError] = useState<string | null>(null);
  const previousStatusRef = useRef<LiveStatus | null>(null);

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

    try {
      const data = await apiFetch(`${API_BASE}/quizzes/starred`);
      const normalisedStarred = (Array.isArray(data) ? data : []).map(normaliseSavedQuiz).filter(Boolean) as NormalisedQuiz[];
      setStarredQuizzes(normalisedStarred);
      setSelectedStarredQuizId((prev) => {
        if (prev && normalisedStarred.some((q) => q.id === prev)) return prev;
        return normalisedStarred[0]?.id || "";
      });
    } catch {
      setStarredQuizzes([]);
      setSelectedStarredQuizId("");
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

  const selectedStarredQuiz = useMemo(() => {
    if (mode !== "starred") return null;
    return starredQuizzes.find((q) => q.id === selectedStarredQuizId) || null;
  }, [mode, starredQuizzes, selectedStarredQuizId]);

  const effectiveQuestions = useMemo(() => {
    if (mode === "saved" && selectedQuiz) return selectedQuiz.questions;
    if (mode === "starred" && selectedStarredQuiz) return selectedStarredQuiz.questions;
    if (mode === "custom") return customQuestions;
    return [];
  }, [mode, selectedQuiz, selectedStarredQuiz, customQuestions]);

  const effectiveTitle = useMemo(() => {
    if (mode === "saved" && selectedQuiz) return selectedQuiz.title;
    if (mode === "starred" && selectedStarredQuiz) return selectedStarredQuiz.title;
    return customTitle.trim() || "Live Quiz";
  }, [mode, selectedQuiz, selectedStarredQuiz, customTitle]);

  const currentLiveQuestion = useMemo(() => {
    if (typeof status?.current_index !== "number") return null;
    return effectiveQuestions[status.current_index] || null;
  }, [effectiveQuestions, status?.current_index]);

  const filteredInsightStudents = useMemo(() => {
    const students = insights?.students || [];
    return students
      .map((student) => {
        const attempts = student.attempts.filter((attempt) => {
          if (insightsFilter === "counted") return attempt.counted;
          if (insightsFilter === "excluded") return attempt.excluded_from_average;
          if (insightsFilter === "incomplete") return !attempt.completed;
          return true;
        });
        return { ...student, attempts };
      })
      .filter((student) => student.attempts.length > 0)
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [insights, insightsFilter]);

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
      anonymous: false,
      quiz_id: mode === "saved" && selectedQuiz ? selectedQuiz.id : mode === "starred" && selectedStarredQuiz ? selectedStarredQuiz.id : null,
      seconds_per_question: useTimer ? clamp(secondsPerQuestion, 5, 600) : null,
      shuffle_questions: shuffleQuestions,
      auto_play: autoPlay,
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
      resultsSavedForSessionRef.current = null;
    } catch (e: any) {
      setCreateError(e?.message || "Failed to create session.");
    } finally {
      setCreating(false);
    }
  }

  async function fetchStatus(code: string) {
    try {
      const data = (await apiFetch(`${API_BASE}/livequiz/${code}/status`)) as LiveStatus;
      setStatus(data);
      setStatusError(null);
    } catch (e: any) {
      setStatusError(e?.message || "Status unavailable.");
    }
  }

  async function loadInsights() {
    if (!classId || Number.isNaN(classId)) return;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const data = (await apiFetch(`${API_BASE}/classes/${classId}/livequiz/insights`)) as LiveQuizInsightsResponse;
      setInsights(data);
    } catch (e: any) {
      setInsightsError(e?.message || "Could not load live quiz insights.");
    } finally {
      setInsightsLoading(false);
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

  useEffect(() => {
    const audio = new Audio(quizLoopMp3);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = musicVolume / 100;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = musicVolume / 100;
    }
  }, [musicVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (musicEnabled && status?.state === "live") {
      void audio.play().then(() => {
        setMusicNotice(null);
      }).catch(() => {
        setMusicNotice("Music is ready. Press Start or re-enable the toggle if your browser blocked playback.");
      });
      return;
    }

    audio.pause();
    setMusicNotice(null);
    if (!session || status?.state === "ended") {
      audio.currentTime = 0;
    }
  }, [musicEnabled, session, status?.state]);

  useEffect(() => {
    if (!session?.code || status?.state !== "ended") return;
    if (resultsSavedForSessionRef.current === session.code) return;
    void fetchResultsAndSave(session.code);
  }, [session?.code, status?.state]);

  async function openPollResultsForQuestion(question: LiveQuestion, sourceLabel: string) {
    if (!session?.code) return;
    setPollResultsBusy(true);
    setPollResultsError(null);
    try {
      const results = (await apiFetch(`${API_BASE}/livequiz/${session.code}/results`)) as LiveQuizResults;
      const stats = (results.question_stats || []).find((item) => item.question_id === question.id);
      const counts: Record<ChoiceKey, number> = {
        A: Number(stats?.counts?.A ?? 0),
        B: Number(stats?.counts?.B ?? 0),
        C: Number(stats?.counts?.C ?? 0),
        D: Number(stats?.counts?.D ?? 0),
      };
      const totalAnswers = Number(stats?.total_answers ?? counts.A + counts.B + counts.C + counts.D);
      setPollResultsModal({
        questionId: question.id,
        prompt: question.prompt,
        choices: question.choices,
        counts,
        totalAnswers,
        sourceLabel,
      });
    } catch (e: any) {
      setPollResultsError(e?.message || "Could not load poll results.");
    } finally {
      setPollResultsBusy(false);
    }
  }

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;

    if (!session?.code || !status || !previous) return;
    if (previous.session_code !== status.session_code) return;

    const previousIndex = typeof previous.current_index === "number" ? previous.current_index : null;
    const currentIndex = typeof status.current_index === "number" ? status.current_index : null;
    const previousQuestion = previousIndex !== null ? effectiveQuestions[previousIndex] || null : null;
    if (!previousQuestion || previousQuestion.correct !== null) return;

    const questionClosedWithoutAdvance =
      previous.answers_open === true &&
      status.answers_open === false &&
      previousIndex === currentIndex;

    const advancedToNextQuestion =
      previous.state === "live" &&
      currentIndex !== null &&
      previousIndex !== null &&
      currentIndex !== previousIndex;

    const sessionEndedAfterQuestion = previous.state === "live" && status.state === "ended";

    if (questionClosedWithoutAdvance || advancedToNextQuestion || sessionEndedAfterQuestion) {
      void openPollResultsForQuestion(previousQuestion, "Poll results");
    }
  }, [effectiveQuestions, session?.code, status]);

  useEffect(() => {
    void loadInsights();
  }, [classId]);

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
    resultsSavedForSessionRef.current = code;
    void loadInsights();
  }

  async function updateAttemptExcluded(attemptId: number, excluded: boolean) {
    setUpdatingAttemptId(attemptId);
    try {
      await apiFetch(`${API_BASE}/livequiz/attempts/${attemptId}/exclude`, {
        method: "POST",
        body: JSON.stringify({ excluded }),
      });
      setInsights((prev) => {
        if (!prev) return prev;
        const students = prev.students.map((student) => {
          const attempts = student.attempts.map((attempt) =>
            attempt.id === attemptId
              ? { ...attempt, excluded_from_average: excluded, counted: !excluded && attempt.score_percent !== null && attempt.score_percent !== undefined }
              : attempt
          );
          const counted = attempts
            .filter((attempt) => attempt.counted && attempt.score_percent !== null && attempt.score_percent !== undefined)
            .map((attempt) => Number(attempt.score_percent));
          return {
            ...student,
            attempts,
            counted_attempts: counted.length,
            average_percent: counted.length ? Math.round(counted.reduce((sum, value) => sum + value, 0) / counted.length) : null,
          };
        });
        const flat = students.flatMap((student) => student.attempts);
        return {
          summary: {
            total_attempts: flat.length,
            counted_attempts: flat.filter((attempt) => attempt.counted && attempt.score_percent !== null && attempt.score_percent !== undefined).length,
            excluded_attempts: flat.filter((attempt) => attempt.excluded_from_average).length,
            incomplete_attempts: flat.filter((attempt) => !attempt.completed).length,
          },
          students,
        };
      });
    } catch (e: any) {
      setInsightsError(e?.message || "Could not update attempt.");
    } finally {
      setUpdatingAttemptId(null);
    }
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

      if (action === "start" && musicEnabled && audioRef.current) {
        void audioRef.current.play().then(() => {
          setMusicNotice(null);
        }).catch(() => {
          setMusicNotice("Music is ready, but your browser needs another click to allow playback.");
        });
      }
      if (action === "end-session") {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
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
                    Run a polished live quiz with QR joining, clear teacher controls, instant pacing,
                    and saved results history.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-white/70 bg-gradient-to-r from-cyan-50 via-white to-emerald-50 px-4 py-3 text-sm shadow-sm">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Current mode</div>
                  <div className="mt-1 font-black text-slate-900">
                    {mode === "saved" ? "Saved Quizzes" : mode === "starred" ? "Main Quiz Collection" : "Quick Custom"}
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

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${mode === "saved"
                        ? "border-slate-900 bg-slate-900 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:bg-slate-50"
                      }`}
                    onClick={() => setMode("saved")}
                  >
                    Class Quizzes
                  </button>


                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${mode === "starred"
                        ? "border-slate-900 bg-slate-900 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:bg-slate-50"
                      }`}
                    onClick={() => setMode("starred")}
                  >
                    Main Quiz Collection
                  </button>

                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${mode === "custom"
                        ? "border-slate-900 bg-slate-900 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:bg-slate-50"
                      }`}
                    onClick={() => setMode("custom")}
                  >
                    Quick Custom
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
                          No saved quizzes found for this class yet. Generate one in the Quizzes page, or use Quick Custom.
                        </div>
                      )}
                    </div>
                  </div>
                ) : mode === "starred" ? (
                  <div className="mt-5">
                    <div className="text-sm font-bold text-slate-700">Choose a quiz from your main quiz collection</div>
                    <div className="mt-2">
                      {starredQuizzes.length ? (
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                          value={selectedStarredQuizId}
                          onChange={(e) => setSelectedStarredQuizId(e.target.value)}
                        >
                          {starredQuizzes.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.title} {q.originClassName ? `| ${q.originClassName}` : ""} {q.questions?.length ? `(${q.questions.length} Qs)` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          No quizzes in your main quiz collection yet. Save a quiz from the Quizzes page to reuse it across classes.
                        </div>
                      )}
                    </div>
                    {selectedStarredQuiz?.originClassName ? (
                      <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                        Origin class: <span className="font-semibold">{selectedStarredQuiz.originClassName}</span>
                      </div>
                    ) : null}
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
                      <span className="text-sm font-semibold text-slate-800">Auto-play</span>
                      <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
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
                    Tip: Auto-play moves to the next question when the timer ends. Leave it off if you want
                    a pause between questions and manual pacing.
                  </div>
                </div>

                {createError && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {createError}
                  </div>
                )}

                <button
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-4 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={creating || (mode === "saved" && !selectedQuiz) || (mode === "starred" && !selectedStarredQuiz)}
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
                        if (audioRef.current) {
                          audioRef.current.pause();
                          audioRef.current.currentTime = 0;
                        }
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

                      <div className="mt-4 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Session code
                        </div>
                        <div className="mt-3 text-center text-5xl font-black tracking-[0.24em] text-slate-900 md:text-6xl">
                          {session.code}
                        </div>
                        <div className="mt-4 flex justify-center">
                          <button
                            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                            onClick={() => copyToClipboard(session.code)}
                          >
                            Copy code
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <button
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                          onClick={() => copyToClipboard(joinUrl)}
                        >
                          Copy link
                        </button>
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

                      {currentLiveQuestion?.correct === null ? (
                        <div className="mt-4 rounded-2xl border border-violet-200 bg-white/90 p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
                                Poll question
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-800">
                                View the live A/B/C/D response split for this poll.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void openPollResultsForQuestion(currentLiveQuestion, "Live poll results")}
                              disabled={pollResultsBusy}
                              className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {pollResultsBusy ? "Loading..." : "View poll results"}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              Quiz music
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-800">Play a looping background track during the session.</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={musicEnabled}
                            onChange={(e) => setMusicEnabled(e.target.checked)}
                          />
                        </div>
                        {musicEnabled ? (
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                              <span>Volume</span>
                              <span>{musicVolume}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={musicVolume}
                              onChange={(e) => setMusicVolume(clamp(parseInt(e.target.value || "35", 10), 0, 100))}
                              className="mt-3 w-full accent-emerald-500"
                            />
                          </div>
                        ) : null}
                        {musicNotice ? (
                          <div className="mt-3 text-xs font-semibold leading-5 text-slate-500">{musicNotice}</div>
                        ) : null}
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
                        Tip: Auto-end can finish a question early when everyone has answered. Auto-play only
                        moves on when the timer reaches zero, so you can still stop a question without skipping ahead.
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
                    <div className="text-xl font-black tracking-tight text-slate-900">Class insights</div>
                    <div className="mt-1 text-sm text-slate-600">Recent live quiz attempts for this class, grouped by student.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(["all", "counted", "excluded", "incomplete"] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => setInsightsFilter(filterKey)}
                        className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${insightsFilter === filterKey ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        {filterKey === "all" ? "All" : filterKey === "counted" ? "Counted" : filterKey === "excluded" ? "Excluded" : "Incomplete"}
                      </button>
                    ))}
                  </div>
                </div>

                {insightsError ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {insightsError}
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard label="Attempts" value={insights?.summary.total_attempts ?? "-"} tone="violet" />
                  <StatCard label="Counted" value={insights?.summary.counted_attempts ?? "-"} tone="emerald" />
                  <StatCard label="Excluded" value={insights?.summary.excluded_attempts ?? "-"} tone="cyan" />
                  <StatCard label="Incomplete" value={insights?.summary.incomplete_attempts ?? "-"} tone="slate" />
                </div>

                {insightsLoading ? (
                  <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 text-center text-sm text-slate-600">
                    Loading class insights...
                  </div>
                ) : filteredInsightStudents.length ? (
                  <div className="mt-5 space-y-4">
                    {filteredInsightStudents.map((student) => (
                      <div key={student.group_key} className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-lg font-black text-slate-900">{student.display_name}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              {student.average_percent === null ? "No counted attempts yet" : `Average ${student.average_percent}%`} | {student.counted_attempts} counted
                            </div>
                          </div>
                          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700">
                            {student.attempts.length} attempt{student.attempts.length === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {student.attempts.map((attempt) => (
                            <div key={attempt.id} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="text-sm font-black text-slate-900">
                                    {attempt.scored_mode && attempt.score_percent !== null && attempt.score_percent !== undefined
                                      ? `${attempt.score_percent}%`
                                      : attempt.completed
                                        ? "Completed"
                                        : "Incomplete"}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    {attempt.total_questions ? `${attempt.score}/${attempt.total_questions}` : "No question count"} | {attempt.finished_at ? new Date(attempt.finished_at).toLocaleString() : "Not finished"}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {attempt.excluded_from_average ? (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-800">Excluded</span>
                                  ) : (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800">Counted</span>
                                  )}
                                  {!attempt.completed ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700">Incomplete</span>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={updatingAttemptId === attempt.id}
                                    onClick={() => updateAttemptExcluded(attempt.id, !attempt.excluded_from_average)}
                                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${attempt.excluded_from_average ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"} disabled:cursor-not-allowed disabled:opacity-60`}
                                  >
                                    {updatingAttemptId === attempt.id ? "Saving..." : attempt.excluded_from_average ? "Include" : "Exclude"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 text-center text-sm text-slate-600">
                    No live quiz attempts match this filter yet.
                  </div>
                )}
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

      {pollResultsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.97))] p-7 shadow-[0_32px_100px_rgba(15,23,42,0.24)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
                  {pollResultsModal.sourceLabel}
                </div>
                <div className="mt-4 break-words text-3xl font-black tracking-tight text-slate-900 md:text-[2.2rem]">
                  {pollResultsModal.prompt}
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-600 md:text-base">
                  {pollResultsModal.totalAnswers} response{pollResultsModal.totalAnswers === 1 ? "" : "s"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPollResultsModal(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {pollResultsModal.totalAnswers === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm font-semibold text-slate-600">
                No responses yet. Keep the modal open to watch live answers come in.
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-3 rounded-[28px] border border-slate-200/80 bg-white/70 p-4 shadow-sm md:p-5">
              {([
                ["A", "from-emerald-400 to-emerald-500", "bg-emerald-500", "border-emerald-100 bg-emerald-50/50"],
                ["B", "from-cyan-400 to-cyan-500", "bg-cyan-500", "border-cyan-100 bg-cyan-50/50"],
                ["C", "from-violet-400 to-violet-500", "bg-violet-500", "border-violet-100 bg-violet-50/50"],
                ["D", "from-amber-400 to-lime-400", "bg-lime-400", "border-lime-100 bg-lime-50/60"],
              ] as Array<[ChoiceKey, string, string, string]>).map(([choice, gradientClass, dotClass, cardClass]) => {
                const count = pollResultsModal.counts[choice] || 0;
                const percent = pollResultsModal.totalAnswers
                  ? Math.round((count / pollResultsModal.totalAnswers) * 100)
                  : 0;
                return (
                  <div key={choice} className={`rounded-[24px] border p-4 md:p-5 ${cardClass}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <span className={`inline-block h-3.5 w-3.5 rounded-full ${dotClass}`} />
                          <span className="text-lg font-black text-slate-900">{choice}</span>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap break-words text-base font-semibold leading-6 text-slate-700 md:text-lg">
                          {pollResultsModal.choices[choice] || "No option text"}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-right shadow-sm md:min-w-[108px]">
                        {count} • {percent}%
                      </div>
                    </div>
                    <div className="mt-4 h-6 overflow-hidden rounded-full bg-white/95 ring-1 ring-slate-200/80 shadow-inner">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${gradientClass} transition-[width] duration-300`}
                        style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {pollResultsError ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {pollResultsError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
