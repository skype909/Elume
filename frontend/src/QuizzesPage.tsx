import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/** ---------------- Types ---------------- */
type MCQQuestion = {
  id: string;
  prompt: string;
  choices: [string, string, string, string]; // A-D
  correctIndex: 0 | 1 | 2 | 3;
  explanation?: string;
};

type QuizItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  createdAt: number;
  questions: MCQQuestion[];
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
const API_BASE = "http://127.0.0.1:8000";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
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
  const [genNum, setGenNum] = useState<number>(10);
  const [genBusy, setGenBusy] = useState(false);

  /** --------- Play Mode --------- */
  type PlayState = {
    quizId: string;
    order: string[]; // question ids in play order
    index: number;
    answers: Record<string, 0 | 1 | 2 | 3 | null>;
    startedAt: number;
    finishedAt?: number;
    shuffleQuestions: boolean;
  };

  const [playing, setPlaying] = useState<PlayState | null>(null);

  /** --------- Persistence --------- */
  useEffect(() => {
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
  }, [storageKey]);

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

  /** --------- Styling (match ELume) --------- */
  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const pill =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 active:translate-y-[1px]";
  const btnPrimary =
    "rounded-full border-2 border-emerald-700 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
  const dangerBtn =
    "rounded-full border-2 border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50";

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

  function saveQuizMeta() {
    resetError();
    const title = quizTitle.trim();
    if (!title) return setError("Quiz title can’t be empty.");

    const category = clampCategory(quizCategory);
    const description = quizDescription.trim();

    if (editingQuizId) {
      setQuizzes((prev) =>
        prev.map((q) =>
          q.id === editingQuizId ? { ...q, title, category, description } : q
        )
      );
    } else {
      const newQuiz: QuizItem = {
        id: uid("quiz"),
        title,
        category,
        description,
        createdAt: Date.now(),
        questions: [],
      };
      setQuizzes((prev) => [newQuiz, ...prev]);
      setEditingQuizId(newQuiz.id);
    }

    setShowQuizModal(false);
  }

  function deleteQuiz(quizId: string) {
    setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    if (editingQuizId === quizId) setEditingQuizId(null);
    if (playing?.quizId === quizId) setPlaying(null);
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

  function saveQuestion() {
    resetError();
    if (!editingQuizId) return setError("No quiz selected.");

    const prompt = qPrompt.trim();
    if (!prompt) return setError("Question text can’t be empty.");

    const a = qA.trim();
    const b = qB.trim();
    const c = qC.trim();
    const d = qD.trim();

    if (!a || !b || !c || !d) return setError("All 4 options must be filled.");

    const newQ: MCQQuestion = {
      id: editingQuestionId || uid("q"),
      prompt,
      choices: [a, b, c, d],
      correctIndex: qCorrect,
      explanation: qExplanation.trim() || undefined,
    };

    setQuizzes((prev) =>
      prev.map((quiz) => {
        if (quiz.id !== editingQuizId) return quiz;
        const existing = quiz.questions.find((x) => x.id === newQ.id);
        if (existing) {
          return {
            ...quiz,
            questions: quiz.questions.map((x) => (x.id === newQ.id ? newQ : x)),
          };
        }
        return { ...quiz, questions: [newQ, ...quiz.questions] };
      })
    );

    setShowQuestionModal(false);
  }

  function deleteQuestion(questionId: string) {
    if (!editingQuizId) return;
    setQuizzes((prev) =>
      prev.map((quiz) =>
        quiz.id === editingQuizId
          ? { ...quiz, questions: quiz.questions.filter((q) => q.id !== questionId) }
          : quiz
      )
    );
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
      const res = await fetch(`${API_BASE}/notes/${classId}?kind=${kind}`);
      if (!res.ok) throw new Error(`Failed to load PDFs (${res.status})`);
      const data = (await res.json()) as NoteItem[];
      setGenNotes(Array.isArray(data) ? data : []);
      setGenNoteId(Array.isArray(data) && data.length ? data[0].id : null);
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

    setGenBusy(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/ai/generate-quiz-from-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
  class_id: Number(classId),
  note_id: Number(genNoteId),
  num_questions: Number(genNum),
}),

      });

     const data = (await res.json()) as GenerateQuizResponse;


if (!res.ok) {
  const detail = (data as any)?.detail ?? JSON.stringify(data);
  throw new Error(detail || `Generate failed (${res.status})`);
}


      const safeQuestions: MCQQuestion[] = ((data as any).questions || []).map((q: any) => {
        const choices = (q.choices || []).slice(0, 4);
        while (choices.length < 4) choices.push("—");
        const correct = Math.max(0, Math.min(3, Number(q.correctIndex) || 0)) as 0 | 1 | 2 | 3;

        return {
          id: uid("q"),
          prompt: String(q.prompt || "").trim(),
          choices: [String(choices[0]), String(choices[1]), String(choices[2]), String(choices[3])] as [
            string,
            string,
            string,
            string
          ],
          correctIndex: correct,
          explanation: q.explanation ? String(q.explanation) : undefined,
        };
      });

      const newQuiz: QuizItem = {
        id: uid("quiz"),
        title: (data.title || "Generated Quiz").trim(),
        category: clampCategory(data.category || "General"),
        description: (data.description || "Generated from PDF").trim(),
        createdAt: Date.now(),
        questions: safeQuestions,
      };

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

  /** ---------------- Render ---------------- */
  return (
    <div className="min-h-screen bg-emerald-100 p-6">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className={`${card} p-5 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border-2 border-slate-200 bg-slate-50">
              <QuizIcon className="h-6 w-6" />
            </span>
            <div>
              <div className="text-2xl font-extrabold tracking-tight">Quizzes</div>
              <div className="text-sm text-slate-600">
                Self-paced multiple-choice quizzes. Create, edit, play — or generate from PDFs.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className={pill} type="button" onClick={() => navigate(`/class/${classId}`)}>
              Back to Class
            </button>

            <button className={pill} type="button" onClick={openGenerateModal} title="Generate from Notes/Exam PDFs">
              <span className="inline-flex items-center gap-2">
                <SparkIcon /> Generate from PDF
              </span>
            </button>

            <button className={btnPrimary} type="button" onClick={openNewQuiz}>
              + New Quiz
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-3xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Playing View */}
        {playing && playingQuiz && playView && (
          <div className="mt-6">
            <div className={`${card} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xl font-extrabold truncate">{playingQuiz.title}</div>
                  <div className="text-sm text-slate-600 truncate">
                    {playingQuiz.category} • {playView.answeredCount}/{playView.total} answered
                    {playing.shuffleQuestions ? " • shuffled" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className={pill} type="button" onClick={exitPlay}>
                    Exit
                  </button>
                </div>
              </div>

              {playView.isFinished ? (
                <div className="mt-5 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                  <div className="text-2xl font-extrabold">
                    Score: {playView.score} / {playView.total}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">Review your answers below.</div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border-2 border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-500">
                    Question {playing.index + 1} of {playView.total}
                  </div>
                  <div className="mt-2 text-lg font-extrabold text-slate-900 whitespace-pre-wrap">
                    {playView.question.prompt}
                  </div>

                  <div className="mt-4 grid gap-2">
                    {playView.question.choices.map((choice, idx) => {
                      const i = idx as 0 | 1 | 2 | 3;
                      const active = playView.selected === i;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAnswer(playView.qid, i)}
                          className={`w-full text-left rounded-2xl border-2 px-4 py-3 text-sm ${
                            active
                              ? "border-emerald-600 bg-emerald-50"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-extrabold mr-2">{["A", "B", "C", "D"][idx]}.</span>
                          {choice}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <button
                      className={pill}
                      type="button"
                      onClick={prevQuestion}
                      disabled={playing.index === 0}
                    >
                      Previous
                    </button>

                    <div className="flex items-center gap-2">
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
                          title={
                            playView.answeredCount < playView.total
                              ? "Answer all questions to finish"
                              : "Finish quiz"
                          }
                        >
                          Finish
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Review */}
              {playView.isFinished && (
                <div className="mt-5 space-y-3">
                  {playing.order.map((qid, idx) => {
                    const q = playingQuiz.questions.find((qq) => qq.id === qid);
                    if (!q) return null;
                    const a = playing.answers[qid];
                    const correct = q.correctIndex;
                    const isCorrect = a !== null && a === correct;

                    return (
                      <div key={qid} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-500">Q{idx + 1}</div>
                        <div className="mt-1 font-extrabold whitespace-pre-wrap">{q.prompt}</div>

                        <div className="mt-3 grid gap-2">
                          {q.choices.map((choice, cidx) => {
                            const ci = cidx as 0 | 1 | 2 | 3;
                            const wasChosen = a === ci;
                            const isAnswer = correct === ci;

                            let cls = "border-slate-200 bg-white";
                            if (isAnswer) cls = "border-emerald-600 bg-emerald-50";
                            if (wasChosen && !isAnswer) cls = "border-red-300 bg-red-50";

                            return (
                              <div key={cidx} className={`rounded-2xl border-2 px-4 py-2 text-sm ${cls}`}>
                                <span className="font-extrabold mr-2">{["A", "B", "C", "D"][cidx]}.</span>
                                {choice}
                                {isAnswer && (
                                  <span className="ml-2 text-xs font-semibold text-emerald-700">(correct)</span>
                                )}
                                {wasChosen && (
                                  <span className="ml-2 text-xs font-semibold text-slate-700">(your choice)</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <div className={`text-sm font-extrabold ${isCorrect ? "text-emerald-700" : "text-red-700"}`}>
                            {a === null ? "Not answered" : isCorrect ? "Correct" : "Incorrect"}
                          </div>
                        </div>

                        {q.explanation && (
                          <div className="mt-2 text-sm text-slate-700">
                            <span className="font-semibold">Explanation:</span> {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Library */}
        {!playing && (
          <div className="mt-6 space-y-6">
            {quizzes.length === 0 ? (
              <div className={`${card} p-6 text-sm text-slate-700`}>
                No quizzes yet. Click <b>Generate from PDF</b> or <b>+ New Quiz</b>.
              </div>
            ) : (
              grouped.map(({ category, quizzes: list }) => (
                <section key={category} className={`${card} p-5`}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-2xl font-extrabold">{category}</h2>
                    <div className="text-xs text-slate-500">
                      {list.length} quiz{list.length === 1 ? "" : "zes"}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((q) => (
                      <div key={q.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-extrabold truncate">{q.title}</div>
                            {q.description && (
                              <div className="mt-1 text-sm text-slate-600 line-clamp-2">{q.description}</div>
                            )}
                            <div className="mt-2 text-xs text-slate-500">
                              {q.questions.length} question{q.questions.length === 1 ? "" : "s"}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="rounded-full border-2 border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50"
                            title="Play"
                            onClick={() => startPlay(q.id, true)}
                          >
                            <span className="inline-flex items-center gap-2">
                              <PlayIcon /> Play
                            </span>
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button className={pill} type="button" onClick={() => startPlay(q.id, false)}>
                            Play (in order)
                          </button>
                          <button className={pill} type="button" onClick={() => setEditingQuizId(q.id)}>
                            Edit questions
                          </button>
                          <button className={pill} type="button" onClick={() => openEditQuiz(q.id)}>
                            Edit details
                          </button>
                          <button className={dangerBtn} type="button" onClick={() => deleteQuiz(q.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

        {/* Editor panel */}
        {!playing && editingQuiz && (
          <div className="mt-6">
            <div className={`${card} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xl font-extrabold truncate">Editing: {editingQuiz.title}</div>
                  <div className="text-sm text-slate-600 truncate">
                    {editingQuiz.category} • {editingQuiz.questions.length} questions
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className={pill} type="button" onClick={() => openEditQuiz(editingQuiz.id)}>
                    Edit details
                  </button>
                  <button className={btnPrimary} type="button" onClick={openAddQuestion}>
                    + Add Question
                  </button>
                </div>
              </div>

              {editingQuiz.questions.length === 0 ? (
                <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  No questions yet. Click <b>+ Add Question</b>.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {editingQuiz.questions
                    .slice()
                    .reverse()
                    .map((q) => (
                      <div key={q.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-extrabold whitespace-pre-wrap">{q.prompt}</div>
                            <div className="mt-2 grid gap-1 text-sm text-slate-700">
                              {q.choices.map((c, idx) => (
                                <div
                                  key={idx}
                                  className={idx === q.correctIndex ? "text-emerald-700 font-semibold" : ""}
                                >
                                  {["A", "B", "C", "D"][idx]}. {c}
                                  {idx === q.correctIndex ? " (correct)" : ""}
                                </div>
                              ))}
                            </div>
                            {q.explanation && (
                              <div className="mt-2 text-sm text-slate-600">
                                <span className="font-semibold">Explanation:</span> {q.explanation}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
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

              <div className="mt-5 flex items-center justify-between">
                <button className={pill} type="button" onClick={() => setEditingQuizId(null)}>
                  Close editor
                </button>
                <div className="flex items-center gap-2">
                  <button className={pill} type="button" onClick={() => startPlay(editingQuiz.id, true)}>
                    Play (shuffled)
                  </button>
                  <button className={pill} type="button" onClick={() => startPlay(editingQuiz.id, false)}>
                    Play (in order)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quiz Modal (Create/Edit metadata) */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="text-xl font-semibold">{editingQuizId ? "Edit quiz" : "New quiz"}</div>
            <div className="mt-1 text-sm text-slate-600">
              Give it a clear title and category so it’s easy to find later.
            </div>

            {error && (
              <div className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Quiz title"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                autoFocus
              />

              <input
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Category"
                value={quizCategory}
                onChange={(e) => setQuizCategory(e.target.value)}
              />

              <textarea
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
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

      {/* Question Modal (Add/Edit) */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="text-xl font-semibold">{editingQuestionId ? "Edit question" : "Add question"}</div>
            <div className="mt-1 text-sm text-slate-600">
              Enter the question and 4 choices, then pick the correct answer.
            </div>

            {error && (
              <div className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              <textarea
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Question text"
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                rows={3}
                autoFocus
              />

              <div className="grid gap-3 md:grid-cols-2">
                <input className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm" placeholder="A" value={qA} onChange={(e) => setQA(e.target.value)} />
                <input className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm" placeholder="B" value={qB} onChange={(e) => setQB(e.target.value)} />
                <input className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm" placeholder="C" value={qC} onChange={(e) => setQC(e.target.value)} />
                <input className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm" placeholder="D" value={qD} onChange={(e) => setQD(e.target.value)} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
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
                          className={`rounded-full border-2 px-4 py-2 text-sm ${
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

                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-700">Explanation (optional)</div>
                  <textarea
                    className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-4xl rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold">Generate quiz from PDF</div>
                <div className="mt-1 text-sm text-slate-600">
                  Choose a PDF from Notes or Exam Papers. The quiz will auto-save.
                </div>
              </div>
              <button
                className={pill}
                type="button"
                onClick={() => {
                  setShowGenerate(false);
                  setGenNotes([]);
                  setGenNoteId(null);
                  setGenBusy(false);
                  setGenLoading(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-full border-2 px-4 py-2 text-sm ${
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
                className={`rounded-full border-2 px-4 py-2 text-sm ${
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
                  className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                  value={genNum}
                  onChange={(e) => setGenNum(Number(e.target.value))}
                >
                  {[5, 8, 10, 12, 15, 20, 25, 30].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                <button className={btnPrimary} type="button" onClick={runGenerate} disabled={genBusy || genLoading || !genNoteId}>
                  {genBusy ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-700">
                  Select PDF {genLoading ? "• loading..." : ""}
                </div>

                <div className="mt-3 max-h-[420px] overflow-auto pr-1 space-y-4">
                  {genLoading ? (
                    <div className="text-sm text-slate-600">Loading PDFs…</div>
                  ) : genNotes.length === 0 ? (
                    <div className="text-sm text-slate-600">No PDFs found in this section.</div>
                  ) : (
                    notesGrouped.map((group) => (
                      <div key={group.topic} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                        <div className="text-sm font-extrabold text-emerald-800">{group.topic}</div>
                        <div className="mt-2 space-y-2">
                          {group.items.map((n) => {
                            const active = genNoteId === n.id;
                            return (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => setGenNoteId(n.id)}
                                className={`w-full rounded-xl border-2 px-3 py-2 text-left text-sm ${
                                  active
                                    ? "border-emerald-600 bg-emerald-50"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="font-semibold truncate">{n.filename}</div>
                                <div className="text-xs text-slate-500">ID: {n.id}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-700">Preview</div>

                {genNoteId ? (
                  <div className="mt-3 rounded-2xl border-2 border-slate-200 overflow-hidden">
                    <iframe
                      title="PDF Preview"
                      src={`${API_BASE}/uploads/${encodeURIComponent(
                        (genNotes.find((x) => x.id === genNoteId)?.file_url || "").split("/uploads/")[1] || ""
                      )}`}
                      className="h-[420px] w-full"
                    />
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-600">Select a PDF to preview it.</div>
                )}

                <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Tip: if a PDF is scanned (image-only) and generation fails, we’ll add OCR next.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
