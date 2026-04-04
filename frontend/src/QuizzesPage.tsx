import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "./api";

/** ---------------- Types ---------------- */
type MCQQuestion = {
  id: string;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation?: string;
};

type QuizItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  createdAt: number;
  is_starred?: boolean;
  questions: MCQQuestion[];
};

type SavedQuizOut = {
  id: number;
  class_id: number;
  title: string;
  category: string;
  description?: string | null;
  is_starred?: boolean;
  origin_class_name?: string | null;
  created_at?: string;
  questions?: Array<{
    id: number;
    prompt: string;
    choices: string[];
    correct_index: number;
    explanation?: string | null;
  }>;
};

type NoteItem = {
  id: number;
  class_id: number;
  topic_id: number;
  filename: string;
  file_url: string;
  uploaded_at: string;
  topic_name: string;
};

type GenerateQuizResponse = {
  title: string;
  category: string;
  description: string;
  questions: Array<{
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation?: string;
  }>;
};

/** ---------------- Helpers ---------------- */
const API_BASE = "/api";

function getFileExtension(name: string) {
  const trimmed = String(name || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) return "";
  return trimmed.slice(dot).toLowerCase();
}

function isPdfFilename(name: string) {
  return getFileExtension(name) === ".pdf";
}

function filenameToQuizTitle(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "Quiz";
  const dot = trimmed.lastIndexOf(".");
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim() || "Quiz";
}

function resolveFileUrl(fileUrl: string) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
  if (fileUrl.startsWith("/api/")) return fileUrl;
  if (fileUrl.startsWith("/")) return `${API_BASE}${fileUrl}`;
  return `${API_BASE}/${fileUrl}`;
}

function clampCategory(value: string) {
  const v = (value || "").trim();
  return v || "General";
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function mapSavedQuizToQuizItem(quiz: SavedQuizOut): QuizItem {
  return {
    id: String(quiz.id),
    title: String(quiz.title || "").trim(),
    category: clampCategory(quiz.category || "General"),
    description: String(quiz.description || "").trim(),
    createdAt: quiz.created_at ? new Date(quiz.created_at).getTime() : Date.now(),
    is_starred: Boolean(quiz.is_starred),
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.map((q) => ({
          id: String(q.id),
          prompt: String(q.prompt || "").trim(),
          choices: [
            String(q.choices?.[0] || ""),
            String(q.choices?.[1] || ""),
            String(q.choices?.[2] || ""),
            String(q.choices?.[3] || ""),
          ] as [string, string, string, string],
          correctIndex: Math.max(0, Math.min(3, Number(q.correct_index) || 0)) as 0 | 1 | 2 | 3,
          explanation: q.explanation ? String(q.explanation) : undefined,
        }))
      : [],
  };
}

/** ---------------- Icons ---------------- */
function QuizIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14l-4-2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 7h8M8 11h8M8 15h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.2 4.2L17.4 8 13.2 9.2 12 13.4 10.8 9.2 6.6 8l4.2-1.8L12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M19 11l.8 2.8 2.2 1.2-2.8.8-.8 2.8-.8-2.8-2.8-.8 2.2-1.2L19 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 5l12 7-12 7V5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RocketIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4c2.5 0 5 2.5 5 5 0 4-4 7-7 8l-2 2-3-3 2-2c1-3 4-7 8-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" />
      <path d="M6 18l-2 2M8 20l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ---------------- Page ---------------- */
export default function QuizzesPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);
  const storageKey = `elume:quizzes:class:${classId}`;

  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** --------- UI State --------- */
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  const [quizTitle, setQuizTitle] = useState("");
  const [quizCategory, setQuizCategory] = useState("General");
  const [quizDescription, setQuizDescription] = useState("");

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const [qPrompt, setQPrompt] = useState("");
  const [qA, setQA] = useState("");
  const [qB, setQB] = useState("");
  const [qC, setQC] = useState("");
  const [qD, setQD] = useState("");
  const [qCorrect, setQCorrect] = useState<0 | 1 | 2 | 3>(0);
  const [qExplanation, setQExplanation] = useState("");

  /** --------- AI Generate Modal --------- */
  const [showGenerate, setShowGenerate] = useState(false);
  const [genKind, setGenKind] = useState<"notes" | "exam">("notes");
  const [genNotes, setGenNotes] = useState<NoteItem[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genNoteId, setGenNoteId] = useState<number | null>(null);
  const [genPreviewUrl, setGenPreviewUrl] = useState<string | null>(null);
  const [genQuizTitle, setGenQuizTitle] = useState("");
  const [genNum, setGenNum] = useState<number>(10);
  const [genBusy, setGenBusy] = useState(false);

  /** --------- Play Mode --------- */
  type PlayState = {
    quizId: string;
    order: string[];
    index: number;
    answers: Record<string, 0 | 1 | 2 | 3 | null>;
    startedAt: number;
    finishedAt?: number;
    shuffleQuestions: boolean;
  };

  const [playing, setPlaying] = useState<PlayState | null>(null);

  /** --------- Persistence --------- */
  useEffect(() => {
    let cancelled = false;

    async function loadQuizzes() {
      try {
        const data = (await apiFetch(`${API_BASE}/classes/${classId}/quizzes`)) as SavedQuizOut[];
        if (cancelled) return;
        setQuizzes(Array.isArray(data) ? data.map(mapSavedQuizToQuizItem) : []);
        return;
      } catch {
        if (cancelled) return;
      }

      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
          setQuizzes([]);
          return;
        }
        const parsed = JSON.parse(raw) as QuizItem[];
        setQuizzes(Array.isArray(parsed) ? parsed : []);
      } catch {
        setQuizzes([]);
      }
    }

    void loadQuizzes();

    return () => {
      cancelled = true;
    };
  }, [classId, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(quizzes));
    } catch {
      // ignore
    }
  }, [quizzes, storageKey]);

  /** --------- Derived --------- */
  const grouped = useMemo(() => {
    const map = new Map<string, QuizItem[]>();
    for (const q of quizzes) {
      const cat = clampCategory(q.category);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(q);
    }
    const cats = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return cats.map((cat) => ({
      category: cat,
      quizzes: (map.get(cat) || []).sort((a, b) => b.createdAt - a.createdAt),
    }));
  }, [quizzes]);

  const editingQuiz = useMemo(() => {
    if (!editingQuizId) return null;
    return quizzes.find((q) => q.id === editingQuizId) || null;
  }, [editingQuizId, quizzes]);

  const playingQuiz = useMemo(() => {
    if (!playing) return null;
    return quizzes.find((q) => q.id === playing.quizId) || null;
  }, [playing, quizzes]);

  const totalQuestions = useMemo(
    () => quizzes.reduce((sum, q) => sum + q.questions.length, 0),
    [quizzes]
  );

  /** --------- Styling --------- */
  const card =
    "rounded-[32px] border-2 border-slate-200/90 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]";
  const softCard =
    "rounded-[28px] border-2 border-slate-200/90 bg-white/90 shadow-[0_4px_18px_rgba(15,23,42,0.05)]";
  const pill =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary =
    "rounded-full border-2 border-emerald-700 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
  const btnDark =
    "rounded-full border-2 border-slate-900 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
  const btnGhost =
    "rounded-full border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";
  const dangerBtn =
    "rounded-full border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50";
  const labelCls = "text-[11px] font-extrabold uppercase tracking-[0.24em] text-slate-500";

  /** --------- Utilities --------- */
  function resetError() {
    setError(null);
  }

  function resetQuizDraft() {
    setQuizTitle("");
    setQuizCategory("General");
    setQuizDescription("");
    setError(null);
  }

  function openNewQuiz() {
    resetQuizDraft();
    setEditingQuizId(null);
    setShowQuizModal(true);
  }

  function openEditQuiz(quizId: string) {
    const q = quizzes.find((x) => x.id === quizId);
    if (!q) return;
    setEditingQuizId(quizId);
    setQuizTitle(q.title);
    setQuizCategory(clampCategory(q.category));
    setQuizDescription(q.description || "");
    setError(null);
    setShowQuizModal(true);
  }

  async function saveQuizMeta() {
    resetError();
    const title = quizTitle.trim();
    if (!title) return setError("Quiz title can’t be empty.");

    const category = clampCategory(quizCategory);
    const description = quizDescription.trim();

    try {
      if (editingQuizId) {
        const data = (await apiFetch(`${API_BASE}/quizzes/${editingQuizId}`, {
          method: "PUT",
          body: JSON.stringify({ title, category, description }),
        })) as SavedQuizOut;
        const updatedQuiz = mapSavedQuizToQuizItem(data);
        setQuizzes((prev) => prev.map((q) => (q.id === editingQuizId ? updatedQuiz : q)));
      } else {
        const data = (await apiFetch(`${API_BASE}/classes/${classId}/quizzes`, {
          method: "POST",
          body: JSON.stringify({ title, category, description, questions: [] }),
        })) as SavedQuizOut;
        const newQuiz = mapSavedQuizToQuizItem(data);
        setQuizzes((prev) => [newQuiz, ...prev]);
        setEditingQuizId(newQuiz.id);
      }

      setShowQuizModal(false);
    } catch (e: any) {
      setError(e?.message || "Could not save quiz.");
    }
  }

  async function deleteQuiz(quizId: string) {
    try {
      await apiFetch(`${API_BASE}/quizzes/${quizId}`, {
        method: "DELETE",
      });
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      if (editingQuizId === quizId) setEditingQuizId(null);
      if (playing?.quizId === quizId) setPlaying(null);
    } catch (e: any) {
      setError(e?.message || "Could not delete quiz.");
    }
  }

  async function toggleQuizStar(quizId: string, nextStarred: boolean) {
    try {
      const data = (await apiFetch(`${API_BASE}/quizzes/${quizId}/${nextStarred ? "star" : "unstar"}`, {
        method: "POST",
      })) as SavedQuizOut;
      const updatedQuiz = mapSavedQuizToQuizItem(data);
      setQuizzes((prev) => prev.map((q) => (q.id === quizId ? updatedQuiz : q)));
    } catch (e: any) {
      setError(e?.message || "Could not update main quiz collection status.");
    }
  }

  function resetQuestionDraft() {
    setQPrompt("");
    setQA("");
    setQB("");
    setQC("");
    setQD("");
    setQCorrect(0);
    setQExplanation("");
    setEditingQuestionId(null);
    setError(null);
  }

  function openAddQuestion() {
    if (!editingQuizId) {
      setError("Create the quiz first, then add questions.");
      return;
    }
    resetQuestionDraft();
    setShowQuestionModal(true);
  }

  function openEditQuestion(questionId: string) {
    if (!editingQuiz) return;
    const q = editingQuiz.questions.find((qq) => qq.id === questionId);
    if (!q) return;
    setEditingQuestionId(questionId);
    setQPrompt(q.prompt);
    setQA(q.choices[0]);
    setQB(q.choices[1]);
    setQC(q.choices[2]);
    setQD(q.choices[3]);
    setQCorrect(q.correctIndex);
    setQExplanation(q.explanation || "");
    setError(null);
    setShowQuestionModal(true);
  }

  async function saveQuestion() {
    resetError();
    if (!editingQuizId) return setError("No quiz selected.");

    const prompt = qPrompt.trim();
    if (!prompt) return setError("Question text can’t be empty.");

    const a = qA.trim();
    const b = qB.trim();
    const c = qC.trim();
    const d = qD.trim();

    if (!a || !b || !c || !d) return setError("All 4 options must be filled.");

    try {
      const data = (await apiFetch(
        editingQuestionId
          ? `${API_BASE}/quizzes/${editingQuizId}/questions/${editingQuestionId}`
          : `${API_BASE}/quizzes/${editingQuizId}/questions`,
        {
          method: editingQuestionId ? "PUT" : "POST",
          body: JSON.stringify({
            prompt,
            choices: [a, b, c, d],
            correct_index: qCorrect,
            explanation: qExplanation.trim() || null,
          }),
        }
      )) as SavedQuizOut;

      const updatedQuiz = mapSavedQuizToQuizItem(data);
      setQuizzes((prev) => prev.map((quiz) => (quiz.id === editingQuizId ? updatedQuiz : quiz)));
      setShowQuestionModal(false);
    } catch (e: any) {
      setError(e?.message || "Could not save question.");
    }
  }

  async function deleteQuestion(questionId: string) {
    if (!editingQuizId) return;
    try {
      const data = (await apiFetch(`${API_BASE}/quizzes/${editingQuizId}/questions/${questionId}`, {
        method: "DELETE",
      })) as SavedQuizOut;
      const updatedQuiz = mapSavedQuizToQuizItem(data);
      setQuizzes((prev) => prev.map((quiz) => (quiz.id === editingQuizId ? updatedQuiz : quiz)));
    } catch (e: any) {
      setError(e?.message || "Could not delete question.");
    }
  }

  /** --------- Play mode --------- */
  function startPlay(quizId: string, shuffleQuestions: boolean) {
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz) return;

    if (quiz.questions.length === 0) {
      setError("This quiz has no questions yet.");
      return;
    }

    const ids = quiz.questions.map((q) => q.id);
    const order = shuffleQuestions ? shuffle(ids) : ids;

    const answers: Record<string, 0 | 1 | 2 | 3 | null> = {};
    for (const qid of order) answers[qid] = null;

    setPlaying({
      quizId,
      order,
      index: 0,
      answers,
      startedAt: Date.now(),
      shuffleQuestions,
    });

    setError(null);
  }

  function setAnswer(questionId: string, choice: 0 | 1 | 2 | 3) {
    if (!playing) return;
    setPlaying({ ...playing, answers: { ...playing.answers, [questionId]: choice } });
  }

  function nextQuestion() {
    if (!playing) return;
    setPlaying({ ...playing, index: Math.min(playing.index + 1, playing.order.length - 1) });
  }

  function prevQuestion() {
    if (!playing) return;
    setPlaying({ ...playing, index: Math.max(playing.index - 1, 0) });
  }

  function finishQuiz() {
    if (!playing) return;
    setPlaying({ ...playing, finishedAt: Date.now() });
  }

  function exitPlay() {
    setPlaying(null);
  }

  const playView = useMemo(() => {
    if (!playing || !playingQuiz) return null;

    const total = playing.order.length;
    const qid = playing.order[playing.index];
    const question = playingQuiz.questions.find((q) => q.id === qid);
    if (!question) return null;

    const selected = playing.answers[qid];
    const isFinished = Boolean(playing.finishedAt);
    const answeredCount = Object.values(playing.answers).filter((v) => v !== null).length;

    const score = playingQuiz.questions.reduce((acc, q) => {
      const a = playing.answers[q.id];
      if (a !== null && a === q.correctIndex) return acc + 1;
      return acc;
    }, 0);

    return { total, question, qid, selected, isFinished, answeredCount, score };
  }, [playing, playingQuiz]);

  /** ---------------- AI: Generate from PDF ---------------- */
  async function fetchNotes(kind: "notes" | "exam") {
    setGenLoading(true);
    setError(null);
    try {
      const data = (await apiFetch(`${API_BASE}/notes/${classId}?kind=${kind}`)) as NoteItem[];
      const notes = Array.isArray(data) ? data : [];
      setGenNotes(notes);
      const firstPdf = notes.find((note) => isPdfFilename(note.filename));
      setGenNoteId(firstPdf ? firstPdf.id : null);
    } catch (e: any) {
      setError(e?.message || "Failed to load PDFs.");
      setGenNotes([]);
      setGenNoteId(null);
    } finally {
      setGenLoading(false);
    }
  }

  function openGenerateModal() {
    setShowGenerate(true);
    setGenKind("notes");
    setGenNum(10);
    setGenQuizTitle("");
    setGenNotes([]);
    setGenNoteId(null);
    setError(null);
    fetchNotes("notes");
  }

  async function runGenerate() {
    if (!genNoteId) {
      setError("Select a PDF first.");
      return;
    }

    const selected = genNotes.find((note) => note.id === genNoteId) || null;
    if (!selected || !isPdfFilename(selected.filename)) {
      setError("Please choose a PDF to generate a quiz.");
      return;
    }

    const title = genQuizTitle.trim() || filenameToQuizTitle(selected.filename);

    setGenBusy(true);
    setError(null);

    try {
      const data = (await apiFetch(`${API_BASE}/ai/generate-quiz-from-note`, {
        method: "POST",
        body: JSON.stringify({
          class_id: Number(classId),
          note_id: Number(genNoteId),
          num_questions: Number(genNum),
        }),
      })) as GenerateQuizResponse;

      const safeQuestions = ((data as any).questions || []).map((q: any, index: number) => {
        const choices = (q.choices || []).slice(0, 4);
        while (choices.length < 4) choices.push("-");
        const correct = Math.max(0, Math.min(3, Number(q.correctIndex) || 0)) as 0 | 1 | 2 | 3;

        return {
          prompt: String(q.prompt || "").trim(),
          choices: [String(choices[0]), String(choices[1]), String(choices[2]), String(choices[3])],
          correct_index: correct,
          explanation: q.explanation ? String(q.explanation) : null,
          position: index,
        };
      });

      const savedQuiz = (await apiFetch(`${API_BASE}/classes/${classId}/quizzes`, {
        method: "POST",
        body: JSON.stringify({
          title,
          category: clampCategory(data.category || "General"),
          description: (data.description || "Generated from PDF").trim(),
          questions: safeQuestions,
        }),
      })) as SavedQuizOut;

      const newQuiz = mapSavedQuizToQuizItem(savedQuiz);
      setQuizzes((prev) => [newQuiz, ...prev]);
      setEditingQuizId(newQuiz.id);
      setShowGenerate(false);
    } catch (e: any) {
      setError(e?.message || "Generate failed.");
    } finally {
      setGenBusy(false);
    }
  }

  const notesGrouped = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const n of genNotes) {
      const t = (n.topic_name || "Unsorted").trim() || "Unsorted";
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(n);
    }
    const topics = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return topics.map((topic) => ({
      topic,
      items: (map.get(topic) || []).slice().sort((a, b) => b.id - a.id),
    }));
  }, [genNotes]);

  const selectedNote = genNotes.find((x) => x.id === genNoteId) || null;
  const selectablePdfCount = useMemo(
    () => genNotes.filter((note) => isPdfFilename(note.filename)).length,
    [genNotes]
  );
  const hasNonPdfChoices = useMemo(
    () => genNotes.some((note) => !isPdfFilename(note.filename)),
    [genNotes]
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadPreview() {
      if (!selectedNote?.file_url || !isPdfFilename(selectedNote.filename)) {
        setGenPreviewUrl(null);
        return;
      }

      try {
        const blob = await apiFetchBlob(resolveFileUrl(selectedNote.file_url), {
          method: "GET",
        });
        if (cancelled) return;
        objectUrl = window.URL.createObjectURL(blob);
        setGenPreviewUrl(objectUrl);
      } catch (e: any) {
        if (cancelled) return;
        setGenPreviewUrl(null);
        setError(e?.message || "Could not load PDF preview.");
      }
    }

    setGenPreviewUrl(null);
    void loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedNote]);

  /** ---------------- Render ---------------- */
  return (
    <div className="min-h-screen bg-emerald-100/70 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border-2 border-white/70 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:bg-slate-50"
            type="button"
            onClick={() => navigate(`/class/${classId}`)}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sky-700">
              <ArrowLeftIcon />
            </span>
            Back to Class
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-[24px] border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        {!playing && (
          <>
            {/* Hero */}
            <section className={`${card} overflow-hidden p-6 md:p-7`}>
              <div className="grid gap-6 xl:grid-cols-[1.5fr_0.95fr]">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-emerald-800">
                    <SparkIcon className="h-4 w-4" />
                    AI Quiz Builder
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[24px] border-2 border-slate-200 bg-slate-50 text-slate-900">
                      <QuizIcon className="h-8 w-8" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 md:text-5xl">
                        Quizzes
                      </h1>
                      <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-600">
                        Build a quiz in minutes from a class PDF, tidy it up if needed, then deliver it through{" "}
                        <span className="font-bold text-slate-900">Live Quiz</span> with clear teacher control.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[24px] border-2 border-amber-200 bg-amber-50 p-4">
                      <div className={labelCls}>Step 1</div>
                      <div className="mt-2 flex items-center gap-2 text-base font-extrabold text-slate-900">
                        <FolderIcon className="h-5 w-5 text-amber-700" />
                        Pick a class PDF
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Use a PDF that already exists in <span className="font-semibold">Notes</span> or{" "}
                        <span className="font-semibold">Exam Papers</span>.
                      </p>
                    </div>

                    <div className="rounded-[24px] border-2 border-violet-200 bg-violet-50 p-4">
                      <div className={labelCls}>Step 2</div>
                      <div className="mt-2 flex items-center gap-2 text-base font-extrabold text-slate-900">
                        <SparkIcon className="h-5 w-5 text-violet-700" />
                        Generate with AI
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Choose how many questions you want, then let Elume create a quiz automatically.
                      </p>
                    </div>

                    <div className="rounded-[24px] border-2 border-cyan-200 bg-cyan-50 p-4">
                      <div className={labelCls}>Step 3</div>
                      <div className="mt-2 flex items-center gap-2 text-base font-extrabold text-slate-900">
                        <RocketIcon className="h-5 w-5 text-cyan-700" />
                        Deliver it live
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Once a quiz is ready, run it from the class{" "}
                        <span className="font-semibold">Live Quiz</span> page.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button className={btnPrimary} type="button" onClick={openGenerateModal}>
                      <span className="inline-flex items-center gap-2">
                        <SparkIcon />
                        Generate from PDF
                      </span>
                    </button>

                    <button className={btnGhost} type="button" onClick={openNewQuiz}>
                      + New Manual Quiz
                    </button>

                    <button
                      className={btnDark}
                      type="button"
                      onClick={() => navigate(`/class/${classId}/live-quiz`)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <PlayIcon />
                        Go to Live Quiz
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[28px] border-2 border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-5">
                    <div className={labelCls}>This class</div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[22px] border-2 border-slate-200 bg-white p-4">
                        <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                          Quizzes
                        </div>
                        <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">
                          {quizzes.length}
                        </div>
                      </div>
                      <div className="rounded-[22px] border-2 border-slate-200 bg-white p-4">
                        <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                          Questions
                        </div>
                        <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">
                          {totalQuestions}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border-2 border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-emerald-700">
                          <CheckCircleIcon />
                        </div>
                        <div>
                          <div className="text-sm font-extrabold text-slate-900">
                            Fastest way to get started
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            Upload or reuse a class PDF, generate a quiz here, then launch the session from{" "}
                            <span className="font-semibold">Live Quiz</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border-2 border-slate-200 bg-slate-50 p-5">
                    <div className={labelCls}>Teacher note</div>
                    <div className="mt-2 text-lg font-extrabold text-slate-950">
                      AI generation uses PDFs already stored for this class.
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      That keeps quiz creation tidy and predictable. No extra upload step is needed inside the quiz tool.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className={pill} type="button" onClick={() => navigate(`/class/${classId}/notes`)}>
                        Open Notes
                      </button>
                      <button className={pill} type="button" onClick={() => navigate(`/class/${classId}/exam-papers`)}>
                        Open Exam Papers
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Empty / Library */}
            <section className="mt-6">
              {quizzes.length === 0 ? (
                <div className={`${card} p-6 md:p-7`}>
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-slate-600">
                        Ready to create
                      </div>
                      <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
                        No quizzes yet
                      </h2>
                      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                        Start with <span className="font-semibold text-slate-900">Generate from PDF</span> for the quickest route.
                        Elume will use a PDF already stored in this class and build a quiz you can refine before delivery.
                      </p>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button className={btnPrimary} type="button" onClick={openGenerateModal}>
                          <span className="inline-flex items-center gap-2">
                            <SparkIcon />
                            Generate from PDF
                          </span>
                        </button>
                        <button className={btnGhost} type="button" onClick={openNewQuiz}>
                          Create Manually
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-[24px] border-2 border-slate-200 bg-white p-4">
                        <div className={labelCls}>Good sources</div>
                        <div className="mt-2 text-base font-extrabold text-slate-900">
                          Notes, revision sheets, worked examples, exam papers
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          The clearer the PDF, the better the question generation.
                        </p>
                      </div>

                      <div className="rounded-[24px] border-2 border-slate-200 bg-white p-4">
                        <div className={labelCls}>After generation</div>
                        <div className="mt-2 text-base font-extrabold text-slate-900">
                          Edit if needed, then move to Live Quiz
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          This page is for building the quiz. Live delivery happens through the class Live Quiz tool.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className={`${card} p-5 md:p-6`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-800">
                          Quiz library
                        </div>
                        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
                          Built quizzes for this class
                        </h2>
                        <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                          Create from PDF, tidy up the questions, then launch from{" "}
                          <span className="font-semibold text-slate-900">Live Quiz</span> when you are ready.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button className={btnPrimary} type="button" onClick={openGenerateModal}>
                          <span className="inline-flex items-center gap-2">
                            <SparkIcon />
                            Generate another quiz
                          </span>
                        </button>
                        <button
                          className={btnDark}
                          type="button"
                          onClick={() => navigate(`/class/${classId}/live-quiz`)}
                        >
                          <span className="inline-flex items-center gap-2">
                            <PlayIcon />
                            Open Live Quiz
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {grouped.map(({ category, quizzes: list }) => (
                    <section key={category} className={`${card} p-5 md:p-6`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className={labelCls}>Category</div>
                          <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
                            {category}
                          </h3>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
                          {list.length} quiz{list.length === 1 ? "" : "zes"}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {list.map((q) => (
                          <div key={q.id} className={`${softCard} p-5`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-xl font-extrabold tracking-tight text-slate-950">
                                  {q.title}
                                </div>
                                {q.description ? (
                                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                                    {q.description}
                                  </p>
                                ) : (
                                  <p className="mt-2 text-sm leading-6 text-slate-500">
                                    No description yet.
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                className="shrink-0 rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => startPlay(q.id, true)}
                              >
                                Preview
                              </button>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${q.is_starred ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                                onClick={() => toggleQuizStar(q.id, !q.is_starred)}
                              >
                                {q.is_starred ? "In Main Quiz Collection" : "Save to Main Quiz Collection"}
                              </button>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-[20px] border-2 border-slate-200 bg-white p-3">
                                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-500">
                                  Questions
                                </div>
                                <div className="mt-2 text-2xl font-extrabold text-slate-950">
                                  {q.questions.length}
                                </div>
                              </div>

                              <div className="rounded-[20px] border-2 border-slate-200 bg-white p-3">
                                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-500">
                                  Created
                                </div>
                                <div className="mt-2 text-base font-bold text-slate-900">
                                  {formatDate(q.createdAt)}
                                </div>
                              </div>

                              <div className="rounded-[20px] border-2 border-slate-200 bg-emerald-50 p-3">
                                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-emerald-700">
                                  Next step
                                </div>
                                <div className="mt-2 text-base font-bold text-slate-900">
                                  Deliver via Live Quiz
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                              <button className={btnDark} type="button" onClick={() => navigate(`/class/${classId}/live-quiz`)}>
                                <span className="inline-flex items-center gap-2">
                                  <PlayIcon />
                                  Deliver live
                                </span>
                              </button>

                              <button className={pill} type="button" onClick={() => setEditingQuizId(q.id)}>
                                Edit questions
                              </button>
                              <button className={pill} type="button" onClick={() => openEditQuiz(q.id)}>
                                Edit details
                              </button>
                              <button className={pill} type="button" onClick={() => startPlay(q.id, false)}>
                                Preview in order
                              </button>
                              <button className={dangerBtn} type="button" onClick={() => deleteQuiz(q.id)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>

            {/* Editor panel */}
            {editingQuiz && (
              <section className="mt-6">
                <div className={`${card} p-5 md:p-6`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-violet-800">
                        Quiz editor
                      </div>
                      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
                        Editing: {editingQuiz.title}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {editingQuiz.category} • {editingQuiz.questions.length} question
                        {editingQuiz.questions.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className={pill} type="button" onClick={() => openEditQuiz(editingQuiz.id)}>
                        Edit details
                      </button>
                      <button className={btnPrimary} type="button" onClick={openAddQuestion}>
                        + Add Question
                      </button>
                    </div>
                  </div>

                  {editingQuiz.questions.length === 0 ? (
                    <div className="mt-5 rounded-[24px] border-2 border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                      No questions yet. Add one manually, or generate a quiz from PDF first.
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {editingQuiz.questions
                        .slice()
                        .reverse()
                        .map((q, index) => (
                          <div key={q.id} className="rounded-[24px] border-2 border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                                  Question {editingQuiz.questions.length - index}
                                </div>
                                <div className="mt-2 text-base font-extrabold leading-7 text-slate-950 whitespace-pre-wrap">
                                  {q.prompt}
                                </div>

                                <div className="mt-3 grid gap-2">
                                  {q.choices.map((c, idx) => (
                                    <div
                                      key={idx}
                                      className={`rounded-[18px] border-2 px-3 py-2 text-sm ${
                                        idx === q.correctIndex
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                          : "border-slate-200 bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      <span className="mr-2 font-extrabold">{["A", "B", "C", "D"][idx]}.</span>
                                      {c}
                                      {idx === q.correctIndex ? " (correct)" : ""}
                                    </div>
                                  ))}
                                </div>

                                {q.explanation && (
                                  <div className="mt-3 text-sm leading-6 text-slate-600">
                                    <span className="font-semibold text-slate-800">Explanation:</span> {q.explanation}
                                  </div>
                                )}
                              </div>

                              <div className="flex shrink-0 flex-wrap gap-2">
                                <button className={pill} type="button" onClick={() => openEditQuestion(q.id)}>
                                  Edit
                                </button>
                                <button className={dangerBtn} type="button" onClick={() => deleteQuestion(q.id)}>
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button className={pill} type="button" onClick={() => setEditingQuizId(null)}>
                      Close editor
                    </button>

                    <div className="flex flex-wrap gap-2">
                      <button className={pill} type="button" onClick={() => startPlay(editingQuiz.id, true)}>
                        Preview shuffled
                      </button>
                      <button className={btnDark} type="button" onClick={() => navigate(`/class/${classId}/live-quiz`)}>
                        Deliver through Live Quiz
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* Playing View */}
        {playing && playingQuiz && playView && (
          <section className={`${card} p-5 md:p-6`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-800">
                  Quiz preview
                </div>
                <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
                  {playingQuiz.title}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {playingQuiz.category} • {playView.answeredCount}/{playView.total} answered
                  {playing.shuffleQuestions ? " • shuffled" : ""}
                </div>
              </div>
              <button className={pill} type="button" onClick={exitPlay}>
                Exit preview
              </button>
            </div>

            {playView.isFinished ? (
              <div className="mt-5 rounded-[24px] border-2 border-emerald-200 bg-emerald-50 p-5">
                <div className="text-3xl font-extrabold tracking-tight text-slate-950">
                  Score: {playView.score} / {playView.total}
                </div>
                <div className="mt-1 text-sm text-slate-600">Review the answers below.</div>
              </div>
            ) : (
              <div className="mt-5 rounded-[28px] border-2 border-slate-200 bg-white p-5">
                <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                  Question {playing.index + 1} of {playView.total}
                </div>
                <div className="mt-3 text-xl font-extrabold leading-8 text-slate-950 whitespace-pre-wrap">
                  {playView.question.prompt}
                </div>

                <div className="mt-5 grid gap-3">
                  {playView.question.choices.map((choice, idx) => {
                    const i = idx as 0 | 1 | 2 | 3;
                    const active = playView.selected === i;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAnswer(playView.qid, i)}
                        className={`w-full rounded-[22px] border-2 px-4 py-4 text-left text-sm font-medium transition ${
                          active
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <span className="mr-2 font-extrabold">{["A", "B", "C", "D"][idx]}.</span>
                        {choice}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button className={pill} type="button" onClick={prevQuestion} disabled={playing.index === 0}>
                    Previous
                  </button>

                  {playing.index < playView.total - 1 ? (
                    <button className={btnPrimary} type="button" onClick={nextQuestion}>
                      Next
                    </button>
                  ) : (
                    <button
                      className={btnPrimary}
                      type="button"
                      onClick={finishQuiz}
                      disabled={playView.answeredCount < playView.total}
                    >
                      Finish preview
                    </button>
                  )}
                </div>
              </div>
            )}

            {playView.isFinished && (
              <div className="mt-5 space-y-3">
                {playing.order.map((qid, idx) => {
                  const q = playingQuiz.questions.find((qq) => qq.id === qid);
                  if (!q) return null;
                  const a = playing.answers[qid];
                  const correct = q.correctIndex;
                  const isCorrect = a !== null && a === correct;

                  return (
                    <div key={qid} className="rounded-[24px] border-2 border-slate-200 bg-white p-4">
                      <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                        Review {idx + 1}
                      </div>
                      <div className="mt-2 text-base font-extrabold text-slate-950 whitespace-pre-wrap">
                        {q.prompt}
                      </div>

                      <div className="mt-3 grid gap-2">
                        {q.choices.map((choice, cidx) => {
                          const ci = cidx as 0 | 1 | 2 | 3;
                          const wasChosen = a === ci;
                          const isAnswer = correct === ci;

                          let cls = "border-slate-200 bg-white";
                          if (isAnswer) cls = "border-emerald-600 bg-emerald-50";
                          if (wasChosen && !isAnswer) cls = "border-red-300 bg-red-50";

                          return (
                            <div key={cidx} className={`rounded-[18px] border-2 px-4 py-3 text-sm ${cls}`}>
                              <span className="mr-2 font-extrabold">{["A", "B", "C", "D"][cidx]}.</span>
                              {choice}
                              {isAnswer && (
                                <span className="ml-2 text-xs font-bold text-emerald-700">(correct)</span>
                              )}
                              {wasChosen && (
                                <span className="ml-2 text-xs font-bold text-slate-700">(your choice)</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className={`mt-3 text-sm font-extrabold ${isCorrect ? "text-emerald-700" : "text-red-700"}`}>
                        {a === null ? "Not answered" : isCorrect ? "Correct" : "Incorrect"}
                      </div>

                      {q.explanation && (
                        <div className="mt-2 text-sm leading-6 text-slate-600">
                          <span className="font-semibold text-slate-800">Explanation:</span> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Quiz Modal */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-xl rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-2xl font-extrabold tracking-tight text-slate-950">
              {editingQuizId ? "Edit quiz" : "New quiz"}
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              Give it a clear title and category so it is easy to find later.
            </div>

            {error && (
              <div className="mt-3 rounded-[18px] border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm"
                placeholder="Quiz title"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                autoFocus
              />

              <input
                className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm"
                placeholder="Category"
                value={quizCategory}
                onChange={(e) => setQuizCategory(e.target.value)}
              />

              <textarea
                className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm"
                placeholder="Short description (optional)"
                value={quizDescription}
                onChange={(e) => setQuizDescription(e.target.value)}
                rows={3}
              />

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className={pill}
                  type="button"
                  onClick={() => {
                    setShowQuizModal(false);
                    resetError();
                    if (!editingQuizId) resetQuizDraft();
                  }}
                >
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={saveQuizMeta}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-2xl font-extrabold tracking-tight text-slate-950">
              {editingQuestionId ? "Edit question" : "Add question"}
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              Enter the question and 4 choices, then pick the correct answer.
            </div>

            {error && (
              <div className="mt-3 rounded-[18px] border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              <textarea
                className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm"
                placeholder="Question text"
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                rows={3}
                autoFocus
              />

              <div className="grid gap-3 md:grid-cols-2">
                <input className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm" placeholder="A" value={qA} onChange={(e) => setQA(e.target.value)} />
                <input className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm" placeholder="B" value={qB} onChange={(e) => setQB(e.target.value)} />
                <input className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm" placeholder="C" value={qC} onChange={(e) => setQC(e.target.value)} />
                <input className="w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-3 text-sm" placeholder="D" value={qD} onChange={(e) => setQD(e.target.value)} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[22px] border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-700">Correct answer</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["A", "B", "C", "D"] as const).map((label, idx) => {
                      const i = idx as 0 | 1 | 2 | 3;
                      const active = qCorrect === i;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setQCorrect(i)}
                          className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                            active
                              ? "border-emerald-700 bg-emerald-600 text-white"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[22px] border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-700">Explanation (optional)</div>
                  <textarea
                    className="mt-2 w-full rounded-[18px] border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                    rows={3}
                    value={qExplanation}
                    onChange={(e) => setQExplanation(e.target.value)}
                    placeholder="Short explanation for the answer"
                  />
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className={pill}
                  type="button"
                  onClick={() => {
                    setShowQuestionModal(false);
                    resetQuestionDraft();
                  }}
                >
                  Cancel
                </button>
                <button className={btnPrimary} type="button" onClick={saveQuestion}>
                  {editingQuestionId ? "Save changes" : "Add question"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-4">
          <div className="w-full max-w-5xl rounded-[30px] border-2 border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-violet-800">
                  <SparkIcon className="h-4 w-4" />
                  Generate from PDF
                </div>
                <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
                  Build a quiz from an existing class PDF
                </div>
                <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Choose a PDF from <span className="font-semibold">Notes</span> or{" "}
                  <span className="font-semibold">Exam Papers</span>, select a question count, and Elume will auto-save the quiz for this class.
                </div>
              </div>

              <button
                className={pill}
                type="button"
                onClick={() => {
                  setShowGenerate(false);
                  setGenQuizTitle("");
                  setGenNotes([]);
                  setGenNoteId(null);
                  setGenBusy(false);
                  setGenLoading(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[26px] border-2 border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                      genKind === "notes"
                        ? "border-emerald-700 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setGenKind("notes");
                      fetchNotes("notes");
                    }}
                  >
                    Notes
                  </button>

                  <button
                    type="button"
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                      genKind === "exam"
                        ? "border-emerald-700 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setGenKind("exam");
                      fetchNotes("exam");
                    }}
                  >
                    Exam Papers
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-700">Questions</div>
                    <select
                      className="rounded-[16px] border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                      value={genNum}
                      onChange={(e) => setGenNum(Number(e.target.value))}
                    >
                      {[5, 10, 20, 30].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border-2 border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                    Select PDF {genLoading ? "• loading..." : ""}
                  </div>

                  {hasNonPdfChoices && (
                    <div className="mt-3 rounded-[18px] border-2 border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      You can store DOCX and PPTX files in Notes, but quiz generation currently works with PDF files only. Please export documents or presentations as PDF first.
                    </div>
                  )}

                  <div className="mt-3 max-h-[430px] space-y-4 overflow-auto pr-1">
                    {genLoading ? (
                      <div className="text-sm text-slate-600">Loading PDFs…</div>
                    ) : selectablePdfCount === 0 ? (
                      <div className="rounded-[18px] border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        No PDFs found in this section yet.
                      </div>
                    ) : (
                      notesGrouped.map((group) => (
                        <div key={group.topic} className="rounded-[20px] border-2 border-slate-200 bg-slate-50 p-3">
                          <div className="text-sm font-extrabold text-slate-900">{group.topic}</div>
                          <div className="mt-2 space-y-2">
                            {group.items.map((n) => {
                              const active = genNoteId === n.id;
                              const pdf = isPdfFilename(n.filename);
                              return (
                                <button
                                  key={n.id}
                                  type="button"
                                  onClick={() => {
                                    if (!pdf) return;
                                    setGenNoteId(n.id);
                                  }}
                                  disabled={!pdf}
                                  className={`w-full rounded-[18px] border-2 px-3 py-3 text-left text-sm ${
                                    active
                                      ? "border-emerald-600 bg-emerald-50"
                                      : pdf
                                        ? "border-slate-200 bg-white hover:bg-slate-50"
                                        : "border-slate-200 bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  <div className={`truncate font-semibold ${pdf ? "text-slate-900" : "text-slate-500"}`}>{n.filename}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {pdf ? `ID: ${n.id}` : "Stored in Notes only. Export as PDF to use this for quiz generation."}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border-2 border-slate-200 bg-white p-4">
                <div className="grid gap-4">
                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                      Quiz title
                    </label>
                    <input
                      className="mt-2 w-full rounded-[18px] border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      value={genQuizTitle}
                      onChange={(e) => setGenQuizTitle(e.target.value)}
                      placeholder="e.g. Algebra quiz - Fractions"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                      Preview
                    </div>
                    {selectedNote && isPdfFilename(selectedNote.filename) ? (
                      <div className="mt-3 rounded-[22px] border-2 border-slate-200 overflow-hidden">
                        {genPreviewUrl ? (
                          <iframe
                            title="PDF Preview"
                            src={genPreviewUrl}
                            className="h-[390px] w-full"
                          />
                        ) : (
                          <div className="grid h-[390px] place-items-center bg-slate-50 text-sm text-slate-600">
                            Loading preview…
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[22px] border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                        Select a PDF to preview it here.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[22px] border-2 border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-sm font-extrabold text-slate-900">What happens next</div>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                      <li>• Elume creates a quiz and saves it to this class.</li>
                      <li>• You can edit the questions straight away.</li>
                      <li>• When ready, run it through the Live Quiz page.</li>
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-600">
                      {selectedNote ? (
                        <>
                          Selected: <span className="font-semibold text-slate-900">{selectedNote.filename}</span>
                        </>
                      ) : (
                        "Choose a PDF to continue."
                      )}
                    </div>

                    <button
                      className={btnPrimary}
                      type="button"
                      onClick={runGenerate}
                      disabled={genBusy || genLoading || !genNoteId}
                    >
                      {genBusy ? "Generating..." : "Generate quiz"}
                    </button>
                  </div>

                  <div className="rounded-[18px] border-2 border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Tip: cleaner text-based PDFs usually produce the best quiz results.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
