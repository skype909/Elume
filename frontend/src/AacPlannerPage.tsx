import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";

const API = "/api";
type Project = {
  id: number;
  title: string;
  subject: string;
  weekly_minutes: number;
  status: string;
};

/* Historical pre-Insights prototype retained only as review context; it is not a component or route. */
/*
  const { id } = useParams(); const classId = Number(id); const navigate = useNavigate();
  const [enabled, setEnabled] = useState<boolean | null>(null); const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState("Physics in Practice"); const [subject, setSubject] = useState("Physics"); const [weekly, setWeekly] = useState(30);
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = async () => { try { const data = await apiFetch(`${API}/classes/${classId}/aac`); setEnabled(data.enabled === true); setProject(data.project ?? null); } catch (e: any) { setError(e?.message || "We couldn’t load AAC Planner."); } };
  useEffect(() => { if (Number.isInteger(classId)) void load(); }, [classId]);
  const warnings = project?.revision?.warnings ?? []; const stages = project?.revision?.plan?.stages ?? [];
  const create = async () => { setSaving(true); setError(null); try { setProject(await apiFetch(`${API}/classes/${classId}/aac/projects`, { method:"POST", body: JSON.stringify({title, subject, weekly_minutes: weekly, current_year_stage:"fifth_year"}) })); } catch (e:any) { setError(e?.message || "We couldn’t create the AAC draft."); } finally { setSaving(false); } };
  const approve = async () => { setSaving(true); setError(null); try { setProject(await apiFetch(`${API}/classes/${classId}/aac/approve`, {method:"POST"})); } catch (e:any) { setError(e?.message || "Resolve the planning checks before approval."); } finally { setSaving(false); } };
  return <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-emerald-50 p-5 text-slate-800"><section className="mx-auto max-w-5xl space-y-5">
    <button className="text-sm font-semibold text-teal-700" onClick={() => navigate(`/class/${classId}/admin/cat4`)}>← Back to Class Insights</button>
    <header className="rounded-3xl border border-cyan-100 bg-white p-6 shadow-sm"><p className="text-sm font-bold text-teal-700">Class Insights · optional</p><h1 className="mt-1 text-3xl font-black">AAC Planner</h1><p className="mt-2 max-w-3xl text-slate-600">Teacher-led planning for Additional Assessment Component coursework. Suggestions and extracted information remain drafts until you explicitly approve a plan.</p></header>
    {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
    {enabled === false && <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-extrabold">Enable AAC Planner for this class</h2><p className="mt-2 text-slate-600">AAC is off by default. Enabling it does not create calendar entries or share individual student information.</p><button disabled={saving} className="mt-4 rounded-xl bg-teal-600 px-4 py-2 font-bold text-white disabled:opacity-60" onClick={async()=>{setSaving(true); await apiFetch(`${API}/classes/${classId}/aac/enabled`,{method:"PUT",body:JSON.stringify({enabled:true})}); setSaving(false); void load();}}>Enable AAC Planner</button></section>}
    {enabled && !project && <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-extrabold">Start a teacher draft</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input aria-label="Project title" value={title} onChange={e=>setTitle(e.target.value)} className="rounded-xl border p-3"/><input aria-label="Subject" value={subject} onChange={e=>setSubject(e.target.value)} className="rounded-xl border p-3"/><label className="rounded-xl border p-2 text-sm">Weekly AAC minutes<input aria-label="Weekly AAC minutes" type="number" min="5" max="600" value={weekly} onChange={e=>setWeekly(Number(e.target.value))} className="ml-2 w-20 p-1"/></label></div><p className="mt-3 text-sm text-slate-600">Physics starts with a planning template only; it is not verified specification guidance. Add official documents and confirm requirements/deadlines before approval.</p><button disabled={saving} onClick={create} className="mt-4 rounded-xl bg-teal-600 px-4 py-2 font-bold text-white">Create draft</button></section>}
    {project && <><section className="rounded-3xl bg-white p-6 shadow-sm"><p className="text-sm font-bold text-teal-700">{project.status === "approved" ? "Approved plan" : "Teacher draft"}</p><h2 className="text-2xl font-black">{project.title}</h2><p>{project.subject} · {project.weekly_minutes} minutes weekly</p><p className="mt-4 text-sm text-slate-600">Source requirements, AI suggestions and teacher decisions are kept separate. No plan is published to the calendar until approval.</p></section><section className="rounded-3xl bg-white p-6 shadow-sm"><h3 className="font-extrabold">Proposed stages</h3>{stages.length ? <ol className="mt-3 space-y-2">{stages.map((s:any,i:number)=><li key={i} className="rounded-xl bg-slate-50 p-3"><b>{i+1}. {s.name}</b><span className="ml-2 text-sm text-slate-500">{s.estimated_minutes ? `${s.estimated_minutes} minutes` : "Time to confirm"} · {s.completion_date || "Date to confirm"}</span></li>)}</ol> : <p className="mt-2 text-slate-600">Add reviewed stages and checkpoints before approval.</p>}</section><section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h3 className="font-extrabold">Review before approval</h3>{warnings.length ? <ul className="mt-2 list-disc pl-5">{warnings.map(w=><li key={w}>{w}</li>)}</ul> : <p className="mt-2">Deadline, 14-day buffer and capacity checks are ready. Approval will create or update linked class calendar milestones.</p>}<button disabled={saving || warnings.length>0} onClick={approve} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">Approve plan</button></section></>}
  </section></main>;
*/

type SourceDocument = {
  id: number;
  purpose: string;
  display_filename: string;
  extraction_state: string;
  extraction_error?: string | null;
  sections: { reference: string; text: string }[];
};
type DeadlineCandidate = {
  source_document_id: number;
  source_reference: string;
  date: string;
  meaning: string;
  supporting_excerpt: string;
};
type DeadlineReview = {
  status: "specification_needed" | "extraction_pending" | "extraction_failed" | "no_clear_deadline" | "conflicting_candidates" | "candidate";
  candidates: DeadlineCandidate[];
  specifications: { id: number; display_filename: string; extraction_state: string; extraction_error?: string | null }[];
  stage_structure?: { source_document_id: number; source_reference: string; number: number; name: string }[];
  source_tasks?: { source_document_id: number; source_reference: string; name: string }[];
};
type Checkpoint = { id: string; text: string };
type Stage = {
  id: string;
  name: string;
  estimated_minutes?: number | null;
  provisional_estimate?: boolean;
  completion_date?: string | null;
  checkpoints: Checkpoint[];
};
type Revision = {
  id: number;
  state: string;
  review_token?: string;
  source_requirements: any[];
  assumptions: string[];
  source_document_ids: number[];
  planning_inputs: Record<string, any>;
  schedule?: { capacity_minutes?: number; estimated_minutes?: number; completion_target?: string; warnings?: string[]; stages?: { id: string; name: string; estimated_minutes?: number; provisional_estimate?: boolean; completion_date?: string | null; proposed_completion_date?: string | null }[] };
  plan: { stages?: any[]; candidate_deadlines?: any[]; interruptions?: any[]; tracker_setup_pending?: boolean };
};
type WorkspaceProject = Project & {
  examination_year?: number | null;
  current_year_stage?: string;
  approved_revision?: Revision | null;
  revision?: Revision | null;
};
export type AacPlannerPageProps = {
  embedded?: boolean;
  /** Insights renders the compact opt-in; the complete planner has its own class tab. */
  mode?: "entry" | "workspace";
  onEnabledChange?: (enabled: boolean) => void;
  onOpen?: () => void;
};

const sourcePurpose: Record<string, string> = {
  specification: "AAC specification / brief / guidance",
  fifth_year_calendar: "Fifth Year school calendar",
  sixth_year_calendar: "Sixth Year school calendar",
};
const stableId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `aac-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const AAC_REVIEWER_PILOT_DRAFT_ONLY = true;
const stageCardPalettes = [
  { card: "border-emerald-300 border-l-emerald-600 bg-emerald-50/70", badge: "bg-emerald-700 text-white" },
  { card: "border-cyan-300 border-l-cyan-600 bg-cyan-50/70", badge: "bg-cyan-700 text-white" },
  { card: "border-violet-300 border-l-violet-600 bg-violet-50/70", badge: "bg-violet-700 text-white" },
  { card: "border-amber-300 border-l-amber-600 bg-amber-50/70", badge: "bg-amber-700 text-white" },
  { card: "border-teal-300 border-l-teal-600 bg-teal-50/70", badge: "bg-teal-700 text-white" },
  { card: "border-blue-300 border-l-blue-600 bg-blue-50/70", badge: "bg-blue-700 text-white" },
];
const stageCardPalette = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return stageCardPalettes[Math.abs(hash) % stageCardPalettes.length];
};
const defaultInputs = () => ({
  weekly_minutes: 30,
  fifth_year_aac_minutes: 30,
  sixth_year_aac_minutes: 30,
  fifth_year_lessons_per_week: "",
  fifth_year_minutes_per_lesson: "",
  sixth_year_lessons_per_week: "",
  sixth_year_minutes_per_lesson: "",
  fifth_year_end: "",
  sixth_year_restart: "",
  planned_start: "",
  normal_finish_target: "",
  final_classroom_deadline: "",
  controlling_deadline: "",
  school_submission_window: "",
  internal_completion_target: "",
  sixth_year_calendar_status: "provisional",
});
const normalizeStages = (value: any): Stage[] =>
  Array.isArray(value)
    ? value.map((stage) => ({
        id: stage.id || stableId(),
        name: stage.name || "Untitled stage",
        estimated_minutes: stage.estimated_minutes ?? null,
        completion_date: stage.completion_date || "",
        checkpoints: Array.isArray(stage.checkpoints)
          ? stage.checkpoints.map((item: any) => ({
              id: item.id || stableId(),
              text: typeof item === "string" ? item : item.text || "",
            }))
          : [],
      }))
    : [];

/** A class-scoped private workspace; it can be embedded in ordinary Class Admin. */
export default function AacPlannerPage({
  embedded = false,
  mode = "workspace",
  onEnabledChange,
  onOpen,
}: AacPlannerPageProps) {
  const { id } = useParams();
  const classId = Number(id);
  const navigate = useNavigate();
  const requestVersion = useRef(0);
  const currentClassId = useRef(classId);
  currentClassId.current = classId;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pilotAccess, setPilotAccess] = useState<boolean | null>(null);
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [deadlineReview, setDeadlineReview] = useState<DeadlineReview | null>(null);
  const [suggestedDeadline, setSuggestedDeadline] = useState<DeadlineCandidate | null>(null);
  const [title, setTitle] = useState("Physics in Practice");
  const [subject, setSubject] = useState("Physics");
  const [examYear, setExamYear] = useState("");
  const [currentStage, setCurrentStage] = useState("fifth_year");
  const [inputs, setInputs] = useState<Record<string, any>>(defaultInputs);
  const [stages, setStages] = useState<Stage[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("specification");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reviewStale, setReviewStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [showSourceStagesDialog, setShowSourceStagesDialog] = useState(false);
  const [removeDocument, setRemoveDocument] = useState<SourceDocument | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeDialogRef = useRef<HTMLDivElement | null>(null);
  const [restoreRemoveDocumentId, setRestoreRemoveDocumentId] = useState<number | null>(null);
  const [recalculateProposals, setRecalculateProposals] = useState<Map<string, string>>(new Map());
  const [selectedRecalculationIds, setSelectedRecalculationIds] = useState<string[]>([]);
  const [showRecalculateDialog, setShowRecalculateDialog] = useState(false);
  const [showNewDraftDialog, setShowNewDraftDialog] = useState(false);
  const [startingNewDraft, setStartingNewDraft] = useState(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [reviewFocusRequest, setReviewFocusRequest] = useState(0);
  const finalDeadlineRef = useRef<HTMLInputElement>(null);
  const keyDatesHeadingRef = useRef<HTMLHeadingElement>(null);
  const teachingTimeHeadingRef = useRef<HTMLHeadingElement>(null);
  // Existing projects reopen at their editable plan; a newly created project starts at Step 1.
  const [setupStep, setSetupStep] = useState(4);
  const hydrate = useCallback((next: WorkspaceProject | null) => {
    setProject(next);
    const revision = next?.revision;
    if (!revision) return;
    const setupPending = revision.plan?.tracker_setup_pending === true;
    setStages(normalizeStages(revision.plan?.stages));
    setRequirements(revision.source_requirements || []);
    setAssumptions(revision.assumptions || []);
    setSelectedDocs(revision.source_document_ids || []);
    setInputs({
      ...defaultInputs(),
      weekly_minutes: next?.weekly_minutes || 30,
      ...(revision.planning_inputs || {}),
      // Old drafts used this as the final classroom deadline. Keep that value
      // and make it visible rather than changing its meaning.
      final_classroom_deadline: revision.planning_inputs?.final_classroom_deadline || revision.planning_inputs?.internal_completion_target || "",
    });
    setDirty(false);
    setReviewStale(false);
    if (setupPending) {
      setStartingNewDraft(true);
      setTitle(""); setSubject(""); setExamYear(""); setCurrentStage("fifth_year");
      setInputs(defaultInputs()); setStages([]); setRequirements([]); setAssumptions([]); setSelectedDocs([]);
      setSetupStep(1);
    } else {
      setStartingNewDraft(false);
    }
  }, []);
  const applyDeadlineReview = useCallback((review: DeadlineReview | null) => {
    const candidates = review && Array.isArray(review.candidates) ? review.candidates : [];
    setDeadlineReview(review ? { ...review, candidates, stage_structure: Array.isArray(review.stage_structure) ? review.stage_structure : [], source_tasks: Array.isArray(review.source_tasks) ? review.source_tasks : [] } : null);
    setSuggestedDeadline(review?.status === "candidate" && candidates.length ? candidates[0] : null);
  }, []);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null);
    applyDeadlineReview(null);
    try {
      const response = await apiFetch(`${API}/classes/${classId}/aac`);
      if (version !== requestVersion.current) return;
      setPilotAccess(true);
      const nextDocuments =
        response.enabled && response.project
          ? await apiFetch(`${API}/classes/${classId}/aac/documents`)
          : [];
      if (version !== requestVersion.current) return;
      setEnabled(response.enabled === true);
      hydrate(response.project || null);
      setDocuments(nextDocuments);
      if (response.enabled && response.project) {
        try {
          const review = await apiFetch(`${API}/classes/${classId}/aac/deadline-candidates`);
          if (version === requestVersion.current) applyDeadlineReview(review);
        } catch (err: any) {
          if (version === requestVersion.current) {
            applyDeadlineReview(null);
            setError(err?.message || "We couldn't check the extracted specification for a deadline.");
          }
        }
      } else {
        applyDeadlineReview(null);
      }
    } catch (err: any) {
      if (version === requestVersion.current)
        setError(err?.message || "We couldn’t load AAC Tracker.");
    }
  }, [applyDeadlineReview, classId, hydrate]);
  const refreshDeadlineReview = async () => {
    const review = await apiFetch(`${API}/classes/${classId}/aac/deadline-candidates`);
    if (currentClassId.current === classId) applyDeadlineReview(review);
  };
  const continueToSourceReview = () => {
    setSetupStep(2);
    setReviewFocusRequest((current) => current + 1);
  };
  useEffect(() => {
    if (!reviewFocusRequest) return;
    const timeout = window.setTimeout(() => {
      reviewHeadingRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      reviewHeadingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reviewFocusRequest]);
  useEffect(() => {
    if (Number.isFinite(classId) && classId > 0) void load();
  }, [classId, load]);
  useEffect(() => {
    if (enabled !== null) onEnabledChange?.(enabled);
  }, [enabled, onEnabledChange]);
  useEffect(() => {
    if (removeDocument) removeDialogRef.current?.focus();
  }, [removeDocument]);
  useEffect(() => {
    if (restoreRemoveDocumentId === null) return;
    document.getElementById(`aac-remove-source-${restoreRemoveDocumentId}`)?.focus();
    setRestoreRemoveDocumentId(null);
  }, [restoreRemoveDocumentId]);
  const changeInput = (key: string, value: any) => {
    setInputs((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };
  const enable = async () => {
    setBusy(true);
    try {
      await apiFetch(`${API}/classes/${classId}/aac/enabled`, {
        method: "PUT",
        body: JSON.stringify({ enabled: true }),
      });
      // The compact Insights entry is only an opt-in.  Open the same
      // class-scoped workspace immediately after a confirmed enablement.
      onEnabledChange?.(true);
      onOpen?.();
      await load();
    } catch (err: any) {
      setError(err?.message || "AAC Tracker couldn’t be enabled.");
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await apiFetch(`${API}/classes/${classId}/aac/${startingNewDraft ? "tracker-details" : "projects"}`, {
        method: startingNewDraft ? "PUT" : "POST",
        body: JSON.stringify({
          title,
          subject,
          examination_year: examYear ? Number(examYear) : null,
          current_year_stage: currentStage,
          weekly_minutes: Number(inputs.weekly_minutes) || 30,
        }),
      });
      hydrate(next);
      setSetupStep(1);
      setStartingNewDraft(false);
      setNotice(startingNewDraft ? "AAC tracker created. Add your new brief when you are ready." : "AAC tracker created. Add a brief or set it up manually.");
    } catch (err: any) {
      setError(err?.message || "We couldn’t create the AAC tracker.");
    } finally {
      setBusy(false);
    }
  };
  const prepareNewDraft = async () => {
    const version = ++requestVersion.current;
    setBusy(true); setError(null);
    try {
      const next = await apiFetch(`${API}/classes/${classId}/aac/new-draft`, { method: "POST" });
      if (version !== requestVersion.current || currentClassId.current !== classId) return;
      setShowNewDraftDialog(false); setShowSuggestionDialog(false); setShowSourceStagesDialog(false); setShowRecalculateDialog(false);
      setRemoveDocument(null); setRemoveError(null); setRecalculateProposals(new Map()); setSelectedRecalculationIds([]);
      hydrate(next); setDocuments([]); applyDeadlineReview(null); setSuggestedDeadline(null); setFile(null); setPurpose("specification"); setSetupStep(1);
      setNotice("Ready for your new brief.");
    } catch (err: any) {
      if (version === requestVersion.current && currentClassId.current === classId) setError(err?.message || "Your current tracker was kept because a new tracker could not be started.");
    } finally { setBusy(false); }
  };
  const save = async (options: { stages?: Stage[]; quiet?: boolean } = {}): Promise<WorkspaceProject | null> => {
    if (!project?.revision) return null;
    setSaving(true);
    setError(null);
    try {
      const next = await apiFetch(`${API}/classes/${classId}/aac/revision`, {
        method: "PUT",
        body: JSON.stringify({
          source_requirements: requirements,
          plan: {
            stages: options.stages ?? stages,
            candidate_deadlines:
              project.revision.plan?.candidate_deadlines || [],
            interruptions: project.revision.plan?.interruptions || [],
          },
          assumptions,
          source_document_ids: selectedDocs,
          planning_inputs: inputs,
        }),
      });
      hydrate(next);
      if (!options.quiet) setNotice("Tracker saved. The approved plan and calendar remain unchanged.");
      return next;
    } catch (err: any) {
      setError(err?.message || "Your draft wasn’t saved. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  };
  const approve = async () => {
    const revision = project?.revision;
    if (!revision?.review_token || revision.state !== "draft" || dirty || reviewStale) return;
    const approvalClassId = classId;
    const approvalVersion = ++requestVersion.current;
    setApproving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await apiFetch(`${API}/classes/${approvalClassId}/aac/approve`, {
        method: "POST",
        body: JSON.stringify({ revision_id: revision.id, review_token: revision.review_token }),
      });
      if (approvalVersion !== requestVersion.current || currentClassId.current !== approvalClassId) return;
      hydrate(next);
      await load();
      if (currentClassId.current !== approvalClassId) return;
      setNotice("Plan approved. Milestones are now in your teacher class and all-events calendars; students cannot view this plan.");
    } catch (err: any) {
      if (approvalVersion !== requestVersion.current || currentClassId.current !== approvalClassId) return;
      if (err?.status === 409) {
        setReviewStale(true);
        setError("This review is no longer current. Refresh the saved draft, review it again, then approve.");
      } else {
        setError(err?.message || "The plan could not be approved. Your saved draft and existing approved plan are unchanged.");
      }
    } finally {
      setApproving(false);
    }
  };
  const applySuggestedDates = () => {
    if (dirty) { setError("Save or refresh your edited draft before applying schedule suggestions."); return; }
    const scheduleStages = project?.revision?.schedule?.stages || [];
    const proposedById = new Map(scheduleStages.map((stage) => [stage.id, stage.proposed_completion_date]));
    const nextStages = stages.map((stage) => {
      const suggested = proposedById.get(stage.id);
      if (!stage.completion_date && suggested) return { ...stage, completion_date: suggested };
      return stage;
    });
    const applied = nextStages.filter((stage, index) => stage.completion_date !== stages[index].completion_date).length;
    setStages(nextStages);
    if (applied) { setDirty(true); setNotice("Suggested dates are ready in your tracker. Save tracker to keep them."); }
    else setNotice("There are no current suggested dates to apply.");
  };
  const openRecalculation = async () => {
    if (dirty) {
      setError("Save or refresh your edited draft before recalculating suggested dates.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiFetch(`${API}/classes/${classId}/aac?recalculate_dates=true`);
      if (currentClassId.current !== classId) return;
      const proposals = new Map<string, string>();
      for (const stage of next?.project?.revision?.schedule?.stages || []) {
        if (stage.id && stage.proposed_completion_date) proposals.set(stage.id, stage.proposed_completion_date);
      }
      if (!proposals.size) {
        setError("Elume could not calculate replacement dates. Review the teaching window and schedule warnings.");
        return;
      }
      setRecalculateProposals(proposals);
      // Older saved drafts do not record whether a date was generated or
      // teacher-entered. Preserve every saved date until the teacher selects it.
      setSelectedRecalculationIds([]);
      setShowRecalculateDialog(true);
    } catch (err: any) {
      setError(err?.message || "Elume could not recalculate suggested dates.");
    } finally {
      setBusy(false);
    }
  };
  const applySelectedRecalculation = () => {
    if (!selectedRecalculationIds.length) {
      setError("Choose at least one stage date to replace, or keep the current draft unchanged.");
      return;
    }
    const selected = new Set(selectedRecalculationIds);
    setStages((current) => current.map((stage) => selected.has(stage.id) && recalculateProposals.get(stage.id)
      ? { ...stage, completion_date: recalculateProposals.get(stage.id)! }
      : stage));
    setShowRecalculateDialog(false);
    setDirty(true);
    setReviewStale(true);
    setNotice("Selected replacement dates are in your tracker. Review them, then choose Save tracker to keep them.");
  };
  const scheduleMissingInputs = () => {
    const missing: string[] = [];
    if (!inputs.controlling_deadline) missing.push("SEC completion / hand-in deadline");
    else if (!inputs.official_deadline_confirmed) missing.push("confirmation of the SEC completion / hand-in deadline");
    if (!inputs.planned_start) missing.push("when AAC work will start");
    if (!finalClassroomDeadline) missing.push("final classroom deadline");
    if (!inputs.fifth_year_end) missing.push("Fifth Year teaching end date");
    if (!inputs.sixth_year_restart) missing.push("Sixth Year restart date");
    if (!stages.some((stage) => stage.id && stage.name.trim())) missing.push("at least one named stage");
    return missing;
  };
  const continueToSuggestedPlan = async () => {
    const missing = scheduleMissingInputs();
    if (missing.length) {
      setError(`Add ${missing.join(", ")} before Elume can suggest stage dates.`);
      return;
    }
    const saved = await save({ quiet: true });
    if (!saved) return;
    const proposedById = new Map((saved.revision?.schedule?.stages || []).map((stage) => [stage.id, stage]));
    const withSuggestions = stages.map((stage) => {
      const suggested = proposedById.get(stage.id);
      if (!suggested) return stage;
      const missingEstimate = !Number.isInteger(stage.estimated_minutes) || Number(stage.estimated_minutes) <= 0;
      return {
        ...stage,
        completion_date: !stage.completion_date && suggested.proposed_completion_date ? suggested.proposed_completion_date : stage.completion_date,
        ...(missingEstimate && Number.isInteger(suggested.estimated_minutes) && Number(suggested.estimated_minutes) > 0
          ? { estimated_minutes: suggested.estimated_minutes, provisional_estimate: true }
          : {}),
      };
    });
    const applied = withSuggestions.filter((stage, index) => stage.completion_date !== stages[index].completion_date || stage.estimated_minutes !== stages[index].estimated_minutes || stage.provisional_estimate !== stages[index].provisional_estimate).length;
    if (applied) {
      const persisted = await save({ stages: withSuggestions, quiet: true });
      if (!persisted) {
        setStages(withSuggestions);
        setDirty(true);
        setError("Suggested dates are ready in your editable tracker but could not be saved. Please try Save tracker.");
        return;
      }
      setSetupStep(4);
      setNotice("Tracker saved and suggested dates added. Review or edit every date before later approval.");
      return;
    }
    setSetupStep(4);
    if ((saved.revision?.schedule?.stages || []).some((stage) => stage.completion_date)) {
      setNotice("Tracker saved. Your existing teacher-entered stage dates were preserved.");
    } else {
      setError("Draft saved, but Elume could not calculate stage dates. Review the schedule warnings and teaching dates.");
    }
  };
  const confirmOfficialDeadline = (candidate?: any) => {
    const value = candidate?.date || inputs.controlling_deadline;
    if (!value) { setError("Enter an SEC completion / hand-in deadline before confirming it."); return; }
    setInputs((current) => ({ ...current, controlling_deadline: value, official_deadline_confirmed: true, official_deadline_source: candidate ? { source_document_id: candidate.source_document_id, source_reference: candidate.source_reference, supporting_excerpt: candidate.supporting_excerpt } : null }));
    setSuggestedDeadline(null);
    setDirty(true); setReviewStale(true); setNotice("Deadline confirmed in this editable tracker. Save it before approval.");
  };
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    if (startingNewDraft) {
      setError("Finish creating the new AAC tracker before adding sources.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("purpose", purpose);
    form.append(
      "academic_year",
      purpose === "fifth_year_calendar"
        ? "fifth_year"
        : purpose === "sixth_year_calendar"
          ? "sixth_year"
          : "",
    );
    form.append("file", file);
    try {
      const uploaded = await apiFetch(`${API}/classes/${classId}/aac/documents`, {
        method: "POST",
        body: form,
      });
      setFile(null);
      const refreshed = await apiFetch(`${API}/classes/${classId}/aac/documents`);
      setDocuments(refreshed);
      const uploadedDocument = refreshed.find((document: SourceDocument) => document.id === uploaded?.id);
      if (purpose === "specification") {
        setSelectedDocs(refreshed.filter((document: SourceDocument) => document.purpose === "specification" && document.extraction_state === "extracted").map((document: SourceDocument) => document.id));
      }
      await refreshDeadlineReview();
      if (purpose === "specification" && uploadedDocument?.extraction_state === "extracted") {
        setNotice("Brief uploaded ✓. Review what we found when you are ready.");
      } else if (uploadedDocument?.extraction_state === "unreadable") {
        setError(uploadedDocument.extraction_error || "The document was uploaded but could not be extracted. You can enter details manually.");
      } else {
        setNotice(`${sourcePurpose[purpose]} uploaded. Its status is shown below.`);
      }
    } catch (err: any) {
      setError(
        err?.message ||
          "Use a text-readable PDF or DOCX under 15 MB, or enter information manually.",
      );
    } finally {
      setBusy(false);
    }
  };
  const removeSource = async () => {
    if (!removeDocument) return;
    setBusy(true); setRemoveError(null);
    try {
      const result = await apiFetch(`${API}/classes/${classId}/aac/documents/${removeDocument.id}`, { method: "DELETE" });
      setDocuments(await apiFetch(`${API}/classes/${classId}/aac/documents`));
      await refreshDeadlineReview();
      setSelectedDocs((items) => items.filter((id) => id !== removeDocument.id));
      setDirty(true); setReviewStale(true); setNotice(result.message); setRemoveDocument(null);
    } catch (err: any) {
      setRemoveError(err?.message || "The source was kept. Please try again.");
    } finally { setBusy(false); }
  };
  const generate = async () => {
    if (!selectedDocs.length) {
      setError("Choose at least one readable source document first.");
      return;
    }
    if (dirty) { setShowSuggestionDialog(true); return; }
    await runGenerate();
  };
  const runGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await apiFetch(`${API}/classes/${classId}/aac/proposals`, {
        method: "POST",
        body: JSON.stringify({
          document_ids: selectedDocs,
          planning_inputs: inputs,
        }),
      });
      hydrate(next);
      setNotice(
        "Suggestions are ready for review. Nothing has been approved or added to the calendar.",
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Suggestions aren’t available right now. Your manual draft is still available.",
      );
    } finally {
      setBusy(false);
    }
  };
  const updateStage = (id: string, patch: Partial<Stage>) => {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, ...patch } : stage,
      ),
    );
    setDirty(true);
  };
  const moveStage = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next);
    setDirty(true);
  };
  const shiftStageDate = (stage: Stage, days: number) => {
    if (!stage.completion_date) {
      setError("Apply a suggested date or choose a date before moving this stage by a week.");
      return;
    }
    const parsed = new Date(`${stage.completion_date}T12:00:00`);
    parsed.setDate(parsed.getDate() + days);
    updateStage(stage.id, { completion_date: parsed.toISOString().slice(0, 10) });
  };
  const finalClassroomDeadline = inputs.final_classroom_deadline || inputs.internal_completion_target;
  // A source finding is shown in the field for review, but does not become a
  // planning input until the teacher explicitly confirms it.
  const displayedControllingDeadline = inputs.controlling_deadline || (!inputs.official_deadline_confirmed ? suggestedDeadline?.date || "" : "");
  const scheduledStageById = new Map((project?.revision?.schedule?.stages || []).map((stage) => [stage.id, stage]));
  const buffer =
    inputs.controlling_deadline && finalClassroomDeadline
      ? Math.round(
          (new Date(inputs.controlling_deadline).getTime() -
            new Date(finalClassroomDeadline).getTime()) /
            86400000,
        )
      : null;
  const catchUpDays = inputs.normal_finish_target && finalClassroomDeadline
    ? Math.round((new Date(finalClassroomDeadline).getTime() - new Date(inputs.normal_finish_target).getTime()) / 86400000)
    : null;
  const readableDate = (value?: string) => value ? new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "";
  const latestClassroomDeadline = inputs.controlling_deadline ? (() => { const day = new Date(`${inputs.controlling_deadline}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 14); return day.toISOString().slice(0, 10); })() : "";
  const calendarDays = (days: number) => `${days} calendar ${days === 1 ? "day" : "days"}`;
  const deadlineBufferIssue = inputs.controlling_deadline && finalClassroomDeadline && buffer !== null && buffer < 14
    ? { negative: buffer < 0, text: buffer < 0 ? `This deadline is ${calendarDays(Math.abs(buffer))} after the SEC deadline.` : `This leaves ${buffer} days before the SEC deadline. Allow at least 14 days.` }
    : null;
  const deadlineMissingGuidance = !inputs.controlling_deadline && !finalClassroomDeadline
    ? "Add the SEC completion / hand-in deadline and final classroom deadline to check the required buffer."
    : !inputs.controlling_deadline
      ? "Add the SEC completion / hand-in deadline to check the required buffer."
      : !finalClassroomDeadline
        ? "Add the final classroom deadline to check the required buffer."
        : null;
  const focusFinalDeadline = () => { setSetupStep(3); window.setTimeout(() => { const input = finalDeadlineRef.current; if (!input) return; input.scrollIntoView?.({ behavior: "smooth", block: "center" }); input.focus(); }, 0); };
  const focusSetupHeading = (heading: React.RefObject<HTMLHeadingElement | null>) => {
    setSetupStep(3);
    window.setTimeout(() => {
      const element = heading.current;
      if (!element) return;
      element.scrollIntoView?.({ behavior: "smooth", block: "start" });
      element.focus();
    }, 0);
  };
  const revision = project?.revision;
  const blockingWarnings = revision?.schedule?.warnings || [];
  const provisionalCalendarWarnings = blockingWarnings.filter((warning) => /provisional|calendar/i.test(warning));
  const schedulingBlockers = blockingWarnings.filter((warning) => !provisionalCalendarWarnings.includes(warning));
  const hasProvisionalStageAllocations = Boolean(revision?.schedule?.stages?.some((stage) => stage.provisional_estimate));
  const canApprove = Boolean(
    revision &&
      revision.state === "draft" &&
      revision.review_token &&
      !dirty &&
      !reviewStale &&
      !blockingWarnings.length &&
      !busy &&
      !saving &&
      !approving,
  );
  const page = (
    <>
      {!embedded && (
        <button
          onClick={() => navigate(`/class/${classId}/admin`)}
          className="text-sm font-bold text-teal-700"
        >
          ← Back to Class Insights
        </button>
      )}
      <header className="rounded-3xl border border-cyan-100 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-teal-700">
          Class Insights · optional
        </p>
        <h1 className="mt-1 text-3xl font-black">AAC Tracker</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Upload your brief, review the key dates and organise your stages.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </div>
      )}
      {showSuggestionDialog && <div role="dialog" aria-modal="true" aria-labelledby="suggestion-dialog-title" className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><h2 id="suggestion-dialog-title" className="text-lg font-extrabold">Update tracker suggestions?</h2><p className="mt-2 text-sm">Updating will replace the current source requirements, suggested dates and stages. Unsaved teacher edits in this tracker may be lost. Your approved plan is not changed.</p><div className="mt-4 flex gap-3"><button type="button" onClick={() => setShowSuggestionDialog(false)} className="rounded-xl border px-4 py-2 font-bold">Keep current tracker</button><button type="button" onClick={() => { setShowSuggestionDialog(false); void runGenerate(); }} className="rounded-xl bg-violet-700 px-4 py-2 font-bold text-white">Update suggestions</button></div></div>}
      {showRecalculateDialog && <div role="dialog" aria-modal="true" aria-labelledby="recalculate-dates-title" className="rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm"><h2 id="recalculate-dates-title" className="text-lg font-extrabold">Review replacement dates</h2><p className="mt-2 text-sm text-slate-700">These dates use your saved teaching window and capacity. Older drafts do not record whether a date was generated or teacher-entered, so nothing is selected by default.</p><div className="mt-4 space-y-2">{stages.map((stage) => { const proposed = recalculateProposals.get(stage.id); return proposed ? <label key={stage.id} className="flex items-start gap-3 rounded-xl bg-white p-3"><input type="checkbox" checked={selectedRecalculationIds.includes(stage.id)} onChange={(event) => setSelectedRecalculationIds((current) => event.target.checked ? [...current, stage.id] : current.filter((id) => id !== stage.id))} /><span><b>{stage.name || "Untitled stage"}</b><br /><span className="text-sm text-slate-600">{stage.completion_date || "No saved date"} → {proposed}</span></span></label> : null; })}</div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setShowRecalculateDialog(false)} className="rounded-xl border px-4 py-2 font-bold">Keep current dates</button><button type="button" onClick={applySelectedRecalculation} className="rounded-xl bg-violet-700 px-4 py-2 font-bold text-white">Apply selected dates</button></div></div>}
      {showNewDraftDialog && <div role="dialog" aria-modal="true" aria-labelledby="new-draft-title" className="rounded-3xl border border-teal-200 bg-teal-50 p-5 shadow-sm"><h2 id="new-draft-title" className="text-2xl font-extrabold">Start again with a new brief?</h2><p className="mt-2">Your saved tracker will be kept, but any unsaved changes will be lost.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => setShowNewDraftDialog(false)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button type="button" disabled={busy} onClick={() => void prepareNewDraft()} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white">Start new AAC tracker</button></div></div>}
      {enabled === false && (
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-extrabold">
            Enable AAC Tracker for this class
          </h2>
          <p className="mt-2 text-slate-600">
            AAC is off by default. It does not create calendar entries or share
            individual student information.
          </p>
          <button
            disabled={busy}
            onClick={enable}
            className="mt-4 rounded-xl bg-teal-600 px-4 py-2 font-bold text-white disabled:opacity-60"
          >
            Enable AAC Tracker
          </button>
        </section>
      )}
      {enabled && !project && (
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-extrabold">
            Create AAC tracker
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              aria-label="Project title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border p-3"
            />
            <input
              aria-label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-xl border p-3"
            />
            <input
              aria-label="Examination year"
              value={examYear}
              onChange={(e) => setExamYear(e.target.value)}
              placeholder="Examination year (optional)"
              className="rounded-xl border p-3"
            />
            <select
              aria-label="Current project stage"
              value={currentStage}
              onChange={(e) => setCurrentStage(e.target.value)}
              className="rounded-xl border p-3"
            >
              <option value="fifth_year">Fifth Year</option>
              <option value="sixth_year">Sixth Year</option>
              <option value="underway">Already underway</option>
            </select>
            <label className="rounded-xl border p-3 text-sm">
              Weekly AAC minutes{" "}
              <input
                aria-label="Weekly AAC minutes"
                type="number"
                min="5"
                max="600"
                value={inputs.weekly_minutes}
                onChange={(e) =>
                  changeInput("weekly_minutes", Number(e.target.value))
                }
                className="ml-2 w-20"
              />
            </label>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            30 minutes is the editable default. Physics starts with a planning
            template only, not verified official requirements.
          </p>
          <button
            disabled={busy || !title.trim() || !subject.trim()}
            onClick={create}
            className="mt-4 rounded-xl bg-teal-600 px-4 py-2 font-bold text-white disabled:opacity-60"
          >
            Create AAC tracker
          </button>
        </section>
      )}
      {project && (
        <div className="flex flex-col gap-7">
          {!startingNewDraft && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-slate-700">Start again with a new brief while keeping your saved tracker history.</p><button type="button" disabled={saving || busy} onClick={() => setShowNewDraftDialog(true)} className="rounded-xl border border-teal-300 bg-white px-4 py-2 font-bold text-teal-900 disabled:opacity-50">Start a new AAC tracker</button></div>}
          <nav aria-label="AAC setup steps" className="order-0 grid gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 sm:grid-cols-4">
            {[
              [1, "1. Get started"],
              [2, "2. What we found"],
              [3, "3. Teaching time"],
              [4, "4. Suggested plan"],
            ].map(([step, label]) => (
              <button key={step} type="button" disabled={startingNewDraft} onClick={() => Number(step) === 2 ? continueToSourceReview() : setSetupStep(Number(step))} className={`rounded-xl px-3 py-2 text-left text-sm font-bold disabled:opacity-50 ${setupStep === step ? "bg-teal-700 text-white" : "bg-white text-teal-900 hover:bg-teal-100"}`}>
                {label}
              </button>
            ))}
          </nav>
          <section className={`order-1 rounded-3xl bg-white p-6 shadow-sm ${setupStep === 2 ? "" : "hidden"}`}>
            <p className="text-sm font-bold text-teal-700">Step 2 of 4</p>
            <h3 ref={reviewHeadingRef} tabIndex={-1} className="mt-1 !text-3xl font-extrabold leading-tight">Here’s what we found</h3>
            <p className="mt-2 text-sm text-slate-600">These are source findings for you to review, not official decisions and not an AI-generated plan.</p>
            {documents.filter((document) => document.purpose === "specification").length === 0 ? (
              <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Add a readable specification or brief in Step 1, or continue with manual setup.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {documents.filter((document) => document.purpose === "specification").map((document) => (
                  <article key={document.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-bold">{document.display_filename}</p>
                    <p className="text-sm text-slate-600">Extraction: {document.extraction_state}</p>
                    {document.sections?.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold text-teal-800">Review source evidence</summary>{document.sections.map((section, index) => <p key={index} className="mt-2 rounded-xl bg-slate-50 p-3"><b>{section.reference}</b><br />{section.text}</p>)}</details>}
                  </article>
                ))}
              </div>
            )}
            {deadlineReview?.status === "conflicting_candidates" && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">More than one possible deadline was found. Choose the controlling student completion date in Step 3.</p>}
            {(deadlineReview?.candidates || []).map((candidate, index) => <article key={`${candidate.source_document_id}-${candidate.source_reference}-${index}`} className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm"><b>SEC completion / hand-in: {candidate.date}</b><p className="mt-1">{candidate.meaning} · {candidate.source_reference}</p><p className="mt-2 rounded-lg bg-white p-2">“{candidate.supporting_excerpt}”</p><button type="button" onClick={() => { confirmOfficialDeadline(candidate); setSetupStep(3); }} className="mt-3 rounded-lg bg-teal-700 px-3 py-1 font-bold text-white">Use and confirm this date</button></article>)}
            {(deadlineReview?.stage_structure || []).length > 0 && <div className="mt-4 rounded-2xl border border-teal-100 p-4"><p className="font-bold">Explicit stages from the brief</p><ol className="mt-2 list-decimal pl-5 text-sm">{deadlineReview?.stage_structure?.map((stage) => <li key={`${stage.source_document_id}-${stage.number}`}>{stage.name} <span className="text-slate-500">({stage.source_reference})</span></li>)}</ol><button type="button" onClick={() => { setSetupStep(3); setShowSourceStagesDialog(true); }} className="mt-3 rounded-lg border border-teal-300 bg-white px-3 py-1 font-bold text-teal-800">Review and apply source stages</button></div>}
            <div className="mt-5 flex justify-between gap-3"><button type="button" onClick={() => setSetupStep(1)} className="rounded-xl border px-4 py-2 font-bold">Back</button><button type="button" onClick={() => setSetupStep(3)} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white">Continue to teaching time</button></div>
          </section>
          <section className="order-2 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-teal-700">
                  {project.approved_revision
                    ? "Updated tracker"
                    : "AAC tracker"}
                </p>
                <h2 className="text-2xl font-black">
                  {startingNewDraft ? "New AAC tracker" : project.title}
                </h2>
                {!startingNewDraft && <p className="text-slate-600">
                  {project.subject} · {inputs.weekly_minutes || 30} minutes
                  weekly
                </p>}
              </div>
            </div>
          </section>
          <section className={`order-3 rounded-3xl bg-white p-6 shadow-sm ${setupStep === 3 ? "" : "hidden"}`}>
            <h3 ref={keyDatesHeadingRef} tabIndex={-1} className="text-2xl font-extrabold leading-tight">Key dates</h3>
            <p className="mt-1 text-sm text-slate-600">Teacher choices are editable and never silently moved.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DateField emphasis label="SEC completion / hand-in deadline" help="The confirmed official deadline for students to complete or hand in this AAC. Check the specification or brief before confirming it." value={displayedControllingDeadline} onChange={(value) => { setSuggestedDeadline(null); changeInput("controlling_deadline", value); changeInput("official_deadline_confirmed", false); }} />
              <DateField label="When will you start?" help="The date you plan to begin AAC work with this class." value={inputs.planned_start} onChange={(value) => changeInput("planned_start", value)} />
              <DateField label="When should students aim to finish?" help="Your normal classroom finish date, leaving time for students who need to catch up before your final classroom deadline." value={inputs.normal_finish_target} onChange={(value) => changeInput("normal_finish_target", value)} />
              <DateField label="Final classroom deadline" help="Your latest classroom deadline for outstanding work and catch-up. Leave at least 14 calendar days before the SEC deadline." value={finalClassroomDeadline} onChange={(value) => { changeInput("final_classroom_deadline", value); changeInput("internal_completion_target", value); }} inputRef={finalDeadlineRef} error={deadlineBufferIssue?.text || (inputs.controlling_deadline ? deadlineMissingGuidance || undefined : undefined)} />
            </div>
            {deadlineBufferIssue && <div role="alert" className="mt-4 rounded-2xl border-2 border-red-500 bg-red-50 p-4 text-red-950"><div className="flex gap-3"><span aria-hidden="true" className="text-3xl leading-none">⚠</span><div><h4 className="text-xl font-black">Change your final classroom deadline</h4><p className="mt-1 text-lg"><b>{deadlineBufferIssue.text}</b></p><p className="mt-2">Final classroom deadline: <b>{readableDate(finalClassroomDeadline)}</b><br />SEC deadline: <b>{readableDate(inputs.controlling_deadline)}</b><br />Latest permitted classroom date: <b>{readableDate(latestClassroomDeadline)}</b></p><button type="button" onClick={focusFinalDeadline} className="mt-3 rounded-xl bg-red-700 px-4 py-2 font-bold text-white">Change date</button></div></div></div>}
            <aside className="mt-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-extrabold text-teal-950">Document deadline review</h4>
                <button type="button" disabled={busy} onClick={async () => { try { setError(null); await refreshDeadlineReview(); } catch (err: any) { setError(err?.message || "We couldn't check the extracted specification for a deadline."); } }} className="rounded-lg border border-teal-300 bg-white px-3 py-1 font-bold text-teal-900 disabled:opacity-50">Check document for deadline</button>
              </div>
              {deadlineReview === null && <p className="mt-2 text-slate-600">Checking extracted specifications. This does not change stages or generate suggestions.</p>}
              {deadlineReview?.status === "specification_needed" && <p className="mt-2 text-slate-700">A readable AAC specification or brief is needed before Elume can check an official deadline. School calendars do not supply this date.</p>}
              {deadlineReview?.status === "extraction_pending" && <p className="mt-2 text-slate-700">Your specification is still being extracted. Check again when it is marked extracted.</p>}
              {deadlineReview?.status === "extraction_failed" && <p className="mt-2 text-amber-900">The specification could not be read. Upload a text-readable copy or enter the SEC date manually.</p>}
              {deadlineReview?.status === "no_clear_deadline" && <p className="mt-2 text-slate-700">No clear student completion / hand-in deadline was found in the extracted specification. Enter the date manually and confirm it after checking the brief.</p>}
              {deadlineReview?.status === "conflicting_candidates" && <p className="mt-2 text-amber-900">The specification contains conflicting possible deadlines. Review the source excerpts below and select or enter the correct SEC date.</p>}
              {suggestedDeadline && !inputs.controlling_deadline && !inputs.official_deadline_confirmed && <p className="mt-2 font-bold text-teal-950">Suggested from your specification — please confirm.</p>}
              {(deadlineReview?.candidates || []).map((candidate, index) => {
                const filename = documents.find((document) => document.id === candidate.source_document_id)?.display_filename || `source ${candidate.source_document_id}`;
                const differsFromConfirmed = Boolean(inputs.official_deadline_confirmed && inputs.controlling_deadline && inputs.controlling_deadline !== candidate.date);
                return <article key={`${candidate.source_document_id}-${candidate.source_reference}-${index}`} className="mt-3 rounded-xl bg-white p-3 text-slate-800 shadow-sm">
                  <p><b>Suggested SEC completion / hand-in date: {candidate.date}</b></p>
                  <p className="mt-1">Suggested from {filename}, {candidate.source_reference}</p>
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-slate-700">“{candidate.supporting_excerpt}”</p>
                  {differsFromConfirmed && <p className="mt-2 text-amber-900">Your confirmed date ({inputs.controlling_deadline}) stays unchanged unless you explicitly use this suggestion.</p>}
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => confirmOfficialDeadline(candidate)} className="rounded-lg bg-teal-700 px-3 py-1 font-bold text-white">{differsFromConfirmed ? "Use suggested date" : "Confirm date"}</button><button type="button" onClick={() => { changeInput("official_deadline_confirmed", false); setNotice("Change the date in Key dates, then confirm it before approval."); }} className="rounded-lg border border-slate-300 px-3 py-1 font-bold">Change date</button></div>
                </article>;
              })}
              {inputs.controlling_deadline && !inputs.official_deadline_confirmed && <button type="button" onClick={() => confirmOfficialDeadline()} className="mt-3 rounded-lg border border-teal-300 bg-white px-3 py-1 font-bold text-teal-800">Confirm entered SEC date</button>}
              {(deadlineReview?.stage_structure || []).length > 0 && <div className="mt-4 border-t border-teal-200 pt-3"><p className="font-extrabold">We found {deadlineReview?.stage_structure?.length} stages in this brief</p><ol className="mt-2 list-decimal pl-5">{deadlineReview?.stage_structure?.map((stage) => <li key={`${stage.source_document_id}-${stage.number}`}>{stage.name} <span className="text-slate-600">({stage.source_reference})</span></li>)}</ol>{deadlineReview?.source_tasks?.map((task) => <p key={`${task.source_document_id}-${task.name}`} className="mt-2 text-slate-700">Separate source task: {task.name} ({task.source_reference})</p>)}<button type="button" onClick={() => setShowSourceStagesDialog(true)} className="mt-3 rounded-lg border border-teal-300 bg-white px-3 py-1 font-bold text-teal-800">Review and apply source stages</button></div>}
            </aside>
            {showSourceStagesDialog && <div role="dialog" aria-modal="true" aria-labelledby="source-stage-dialog-title" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h4 id="source-stage-dialog-title" className="font-extrabold">Replace tracker stages with source stages?</h4><p className="mt-2 text-sm">This replaces only the editable tracker stages with the reviewed source-labelled stages. Your approved plan and calendars are unchanged.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setShowSourceStagesDialog(false)} className="rounded-lg border px-3 py-1 font-bold">Keep current tracker</button><button type="button" onClick={() => { const sourceStages = deadlineReview?.stage_structure || []; setStages(sourceStages.map((stage) => ({ id: `source-${stage.source_document_id}-stage-${stage.number}`, name: stage.name, estimated_minutes: null, completion_date: "", checkpoints: [] }))); setDirty(true); setReviewStale(true); setShowSourceStagesDialog(false); setNotice("Source stages are ready in your editable tracker. Save when you are ready."); }} className="rounded-lg bg-teal-700 px-3 py-1 font-bold text-white">Apply {deadlineReview?.stage_structure?.length || 0} stages</button></div></div>}
            <div className="mt-3 rounded-2xl bg-cyan-50 p-3 text-sm text-cyan-950">
              <p>{catchUpDays === null ? "Add normal finish and final classroom dates to see catch-up time." : catchUpDays < 0 ? "Normal finish must be on or before the final classroom deadline." : `Catch-up time: ${catchUpDays} calendar days.`}</p>
              <p className={deadlineBufferIssue || deadlineMissingGuidance ? "mt-1 font-semibold text-red-900" : "mt-1"}>{deadlineMissingGuidance || (deadlineBufferIssue ? deadlineBufferIssue.text : `Your final classroom deadline leaves ${buffer} calendar days before the SEC deadline.`)}</p>
            </div>
            <details className="mt-3 rounded-2xl border border-slate-200 p-3"><summary className="cursor-pointer font-bold">Other dates</summary><p className="mt-2 text-sm text-slate-600">Administrative school submission dates are separate from the student SEC completion deadline.</p><DateField label="School administrative submission date" help="Optional school administration date; it does not replace the SEC student completion deadline." value={inputs.school_submission_window} onChange={(value) => changeInput("school_submission_window", value)} /></details>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DateField
                label="Fifth Year teaching ends"
                value={inputs.fifth_year_end}
                onChange={(value) => changeInput("fifth_year_end", value)}
              />
              <DateField
                label="Sixth Year restarts"
                value={inputs.sixth_year_restart}
                onChange={(value) => changeInput("sixth_year_restart", value)}
              />
              <label className="text-sm font-semibold">
                Sixth Year calendar
                <select
                  value={inputs.sixth_year_calendar_status || "provisional"}
                  onChange={(e) =>
                    changeInput("sixth_year_calendar_status", e.target.value)
                  }
                  className="mt-1 block w-full rounded-xl border p-2 font-normal"
                >
                  <option value="provisional">
                    Provisional — calendar not yet supplied
                  </option>
                  <option value="reviewed">Teacher-reviewed calendar</option>
                </select>
              </label>
            </div>
            <p
              className={`mt-3 text-sm ${deadlineBufferIssue ? "text-red-800" : "text-slate-600"}`}
            >
              {deadlineMissingGuidance || (deadlineBufferIssue ? deadlineBufferIssue.text : `${buffer} calendar-day buffer.`)}
            </p>
            {(deadlineBufferIssue || deadlineMissingGuidance) && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-red-950"><b>Before continuing:</b> {deadlineMissingGuidance || "change the final classroom deadline so it is at least 14 calendar days before the SEC deadline."} {!finalClassroomDeadline && inputs.controlling_deadline && <button type="button" onClick={focusFinalDeadline} className="font-bold underline">Change date</button>}</div>}
          </section>
          <section className={`order-4 rounded-3xl bg-white p-6 shadow-sm ${setupStep === 3 ? "" : "hidden"}`}>
            <p className="text-sm font-bold text-teal-700">Step 3 of 4</p>
            <h3 ref={teachingTimeHeadingRef} tabIndex={-1} className="mt-1 !text-3xl font-extrabold leading-tight">When will your class work on this?</h3>
            <p className="mt-1 text-sm text-slate-600">AAC minutes are a weekly total, not per lesson. Confirm these estimates; Sixth Year can remain provisional.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {([['fifth_year','Fifth Year'],['sixth_year','Sixth Year']] as [string, string][]).map(([year, heading]) => <div key={year} className="rounded-2xl border border-slate-200 p-4"><h4 className="font-bold">{heading}</h4><div className="mt-3 grid gap-2"><NumberField label="Lessons per week" value={inputs[`${year}_lessons_per_week`]} onChange={(value: number | "") => changeInput(`${year}_lessons_per_week`, value)} /><NumberField label="Minutes per lesson" value={inputs[`${year}_minutes_per_lesson`]} onChange={(value: number | "") => changeInput(`${year}_minutes_per_lesson`, value)} /><NumberField label="AAC minutes per week" value={inputs[`${year}_aac_minutes`]} onChange={(value: number | "") => changeInput(`${year}_aac_minutes`, value)} /></div></div>)}
            </div>
            <div className="mt-5 rounded-2xl border border-teal-100 bg-teal-50 p-4">
              <p className="font-extrabold text-teal-950">Before Elume can suggest stage dates</p>
              {scheduleMissingInputs().length ? <ul className="mt-2 list-disc pl-5 text-slate-700">{scheduleMissingInputs().map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-slate-700">Ready to save this tracker and calculate editable suggested dates. Your existing stage dates will not be changed.</p>}
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setSetupStep(2)} className="rounded-xl border px-4 py-2 font-bold">Back</button><button type="button" disabled={saving || busy} onClick={() => void continueToSuggestedPlan()} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? "Saving tracker…" : "Continue and save tracker"}</button></div>
          </section>
          <section className={`order-1 rounded-3xl bg-white p-6 shadow-sm ${setupStep === 1 ? "" : "hidden"}`}>
            <h3 className="!text-3xl font-extrabold leading-tight">Let’s get started…</h3>
            <p className="mt-1 text-sm text-slate-600">Upload the specification or brief for your subject. We’ll help you find the important dates and build a plan you can adjust.</p>
            {startingNewDraft && <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4"><p className="font-extrabold text-teal-950">Set up your new AAC tracker</p><div className="mt-3 grid gap-3 md:grid-cols-2"><input aria-label="New project title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tracker title" className="rounded-xl border p-3" /><input aria-label="New project subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="rounded-xl border p-3" /><input aria-label="New examination year" value={examYear} onChange={(event) => setExamYear(event.target.value)} placeholder="Examination year (optional)" className="rounded-xl border p-3" /><select aria-label="New current project stage" value={currentStage} onChange={(event) => setCurrentStage(event.target.value)} className="rounded-xl border p-3"><option value="fifth_year">Fifth Year</option><option value="sixth_year">Sixth Year</option><option value="underway">Already underway</option></select></div><button type="button" disabled={busy || !title.trim() || !subject.trim()} onClick={() => void create()} className="mt-4 rounded-xl bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">Create AAC tracker</button></div>}
            <p className="mt-3 text-sm font-bold text-teal-800">Choose your specification</p>
            <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer font-semibold">Add school calendars — optional</summary><p className="mt-1">Calendars help plan around teaching dates and breaks. You can enter those details yourself.</p></details>
            <p className="mt-1 text-sm text-slate-600">
              PDF or DOCX only, maximum 15 MB. Scanned/unreadable PDFs need a
              text-readable version or manual entry.
            </p>
            <form onSubmit={upload} className="mt-4 space-y-3">
              <fieldset>
                <legend className="sr-only">Document type</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sourcePurpose).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setPurpose(value)} className={`rounded-xl px-3 py-2 text-sm font-bold ${purpose === value ? "bg-teal-700 text-white" : "border border-teal-200 bg-white text-teal-900"}`}>
                      {value === "specification" ? "Specification / brief" : label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 px-4 py-2 font-bold text-teal-900 focus-within:ring-2 focus-within:ring-teal-500">Choose file<input
                aria-label="AAC source file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="sr-only" /></label>
              <button
                disabled={busy || !file}
                className="rounded-xl bg-teal-600 px-4 py-2 font-bold text-white disabled:opacity-50"
              >
                {file ? `Upload ${file.name}` : `Choose ${purpose === "specification" ? "your specification" : sourcePurpose[purpose]}`}
              </button>
              </div>
            </form>
            {startingNewDraft && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-900">Earlier documents are kept with your saved trackers, but none are selected or used here.</p>}
            <div className="mt-4 space-y-3">
              {documents.length === 0 ? (
                <div><p className="text-sm text-slate-600">No sources yet. Manual drafting is still available.</p><button type="button" onClick={() => setNotice("Manual planning is ready. Add key dates, teaching time and stages whenever you are ready.")} className="mt-3 rounded-xl border border-teal-300 bg-white px-4 py-2 font-bold text-teal-800">Set up manually</button></div>
              ) : (
                documents.map((document) => (
                  <article
                    key={document.id}
                    className="rounded-2xl border border-slate-200 p-3"
                  >
                    <div className="flex gap-3">
                      <span>
                        <b>
                          {sourcePurpose[document.purpose] || document.purpose}
                        </b>{" "}
                        · {document.display_filename}
                        <span className="ml-2 text-xs text-slate-500">
                          {document.extraction_state}
                        </span>
                        {document.extraction_error && (
                          <span className="block text-amber-800">
                            {document.extraction_error}
                          </span>
                        )}
                      </span>
                    </div>
                    {document.purpose === "specification" && document.extraction_state === "extracted" && <>
                      <p className="mt-2 font-bold text-emerald-800">Brief uploaded ✓</p>
                      <button type="button" onClick={continueToSourceReview} className="mt-3 min-h-12 rounded-xl bg-teal-700 px-4 py-2 font-bold text-white">Continue → Review what we found</button>
                    </>}
                    {document.sections?.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer font-semibold">
                          Review extracted source sections
                        </summary>
                        {document.sections.map((section, index) => (
                          <p
                            key={index}
                            className="mt-2 rounded bg-slate-50 p-2"
                          >
                            <b>{section.reference}</b>
                            <br />
                            {section.text}
                          </p>
                        ))}
                      </details>
                    )}
                    {!startingNewDraft && (removeDocument?.id === document.id ? (
                      <div ref={removeDialogRef} role="dialog" aria-labelledby={`remove-document-${document.id}`} tabIndex={-1} className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                        <h4 id={`remove-document-${document.id}`} className="font-extrabold text-red-950">Remove this source?</h4>
                        <p className="mt-1 text-sm text-red-950"><b>{document.display_filename}</b> will no longer support new suggestions. If an approved plan uses it, only the active source is removed and the historical copy is retained.</p>
                        {removeError && <p role="alert" className="mt-2 text-sm font-semibold text-red-900">{removeError}</p>}
                        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setRestoreRemoveDocumentId(document.id); setRemoveDocument(null); setRemoveError(null); }} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-900">Cancel</button><button type="button" disabled={busy} onClick={() => void removeSource()} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Removing…" : "Remove source"}</button></div>
                      </div>
                    ) : <button id={`aac-remove-source-${document.id}`} type="button" onClick={() => { setRemoveError(null); setRemoveDocument(document); }} className="mt-3 rounded-lg border border-red-200 px-3 py-1 text-sm font-bold text-red-800">Remove source</button>)}
                  </article>
                ))
              )}
            </div>
            {!AAC_REVIEWER_PILOT_DRAFT_ONLY && <button disabled={busy || !selectedDocs.length} onClick={generate} className="mt-4 rounded-xl bg-violet-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "Working…" : "Generate draft suggestions"}</button>}
          </section>
          <section className={`order-5 rounded-3xl bg-white p-6 shadow-sm ${setupStep === 4 ? "" : "hidden"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-teal-700">Step 4 of 4</p>
                <h3 className="!text-3xl font-extrabold leading-tight">Here’s your suggested plan</h3>
                <p className="text-sm text-slate-600">
                  Use buttons as well as touch/keyboard controls to reorder.
                </p>
              </div>
              <button
                onClick={() => {
                  setStages((current) => [
                    ...current,
                    {
                      id: stableId(),
                      name: "New stage",
                      estimated_minutes: null,
                      completion_date: "",
                      checkpoints: [],
                    },
                  ]);
                  setDirty(true);
                }}
                className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-900"
              >
                Add stage
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {stages.map((stage, index) => {
                const scheduledStage = scheduledStageById.get(stage.id);
                const displayedMinutes = stage.estimated_minutes ?? scheduledStage?.estimated_minutes ?? null;
                const provisional = stage.provisional_estimate === true || (stage.estimated_minutes == null && scheduledStage?.provisional_estimate === true);
                const palette = stageCardPalette(stage.id);
                return <article
                  key={stage.id}
                  className={`rounded-2xl border border-l-4 p-3 ${palette.card}`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className={`inline-flex min-h-12 w-fit items-center rounded-xl px-4 text-lg font-black ${palette.badge}`}>Stage {index + 1}</span>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-label={`Move stage ${index + 1} up`} disabled={index === 0} onClick={() => moveStage(index, -1)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-lg font-bold text-slate-900 disabled:opacity-30">Move up</button>
                        <button type="button" aria-label={`Move stage ${index + 1} down`} disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-lg font-bold text-slate-900 disabled:opacity-30">Move down</button>
                        <button type="button" aria-label={`Remove stage ${index + 1}`} onClick={() => { setStages((current) => current.filter((item) => item.id !== stage.id)); setDirty(true); }} className="min-h-12 rounded-xl border border-red-200 bg-white px-3 text-lg font-bold text-red-700">Remove</button>
                      </div>
                    </div>
                    <label className="block text-lg font-bold text-slate-900">Stage title<textarea aria-label={`Stage ${index + 1} name`} rows={1} value={stage.name} onChange={(e) => updateStage(stage.id, { name: e.target.value })} className="mt-1 block w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-[22px] font-semibold leading-snug text-slate-950 [field-sizing:content]" /></label>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <label className="w-full text-lg font-bold text-slate-800 lg:w-56">Completion date<input aria-label={`Stage ${index + 1} date`} type="date" value={stage.completion_date || ""} onChange={(e) => updateStage(stage.id, { completion_date: e.target.value })} className="mt-1 block min-h-12 w-full rounded-xl border border-slate-300 bg-white p-2 text-lg font-normal" /></label>
                      <div className="flex flex-wrap gap-2"><button type="button" aria-label={`Stage ${index + 1}: 1 week earlier`} onClick={() => shiftStageDate(stage, -7)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-lg font-bold text-slate-900">−1 week</button><button type="button" aria-label={`Stage ${index + 1}: 1 week later`} onClick={() => shiftStageDate(stage, 7)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-lg font-bold text-slate-900">+1 week</button></div>
                      <details className="rounded-xl bg-white/80 p-3 lg:min-w-[260px] lg:flex-1"><summary className="cursor-pointer text-lg font-bold text-slate-900">Adjust time allocation{displayedMinutes ? ` (${displayedMinutes} minutes${provisional ? ", suggested" : ""})` : ""}</summary><label className="mt-3 block text-base font-bold text-slate-700">Total teaching time for this stage (minutes)<span className="mt-1 block text-base font-normal text-slate-600">{displayedMinutes ? provisional ? "Suggested from your plan. You can increase or reduce this estimate." : "Teacher-entered estimate." : "Add teaching inputs before Elume can allocate time for this stage."}</span><input aria-label={`Stage ${index + 1} minutes`} type="number" value={displayedMinutes ?? ""} onChange={(e) => updateStage(stage.id, { estimated_minutes: e.target.value ? Number(e.target.value) : null, provisional_estimate: false })} className="mt-1 block min-h-12 w-full rounded-xl border border-slate-300 bg-white p-2 text-lg font-normal" /></label></details>
                    </div>
                  </div>
                  {false && <div>
                    <label className="block text-lg font-bold text-slate-900">Stage {index + 1}<textarea aria-label={`Stage ${index + 1} name`} rows={2} value={stage.name} onChange={(e) => updateStage(stage.id, { name: e.target.value })} className="mt-2 block w-full resize-y rounded-xl border p-3 text-[22px] font-semibold leading-snug" /></label>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1 text-lg font-bold text-slate-800">Completion date<input aria-label={`Stage ${index + 1} date`} type="date" value={stage.completion_date || ""} onChange={(e) => updateStage(stage.id, { completion_date: e.target.value })} className="mt-1 block min-h-12 w-full rounded-xl border p-2 text-lg font-normal" /></label>
                      <div className="flex gap-2"><button type="button" aria-label={`Stage ${index + 1}: 1 week earlier`} onClick={() => shiftStageDate(stage, -7)} className="min-h-12 rounded-xl border px-3 text-lg font-bold">−1 week</button><button type="button" aria-label={`Stage ${index + 1}: 1 week later`} onClick={() => shiftStageDate(stage, 7)} className="min-h-12 rounded-xl border px-3 text-lg font-bold">+1 week</button></div>
                    </div>
                    <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-lg font-bold">Adjust time allocation{displayedMinutes ? ` (${displayedMinutes} minutes${provisional ? ", suggested" : ""})` : ""}</summary><label className="mt-3 block text-base font-bold text-slate-700">Total teaching time for this stage (minutes)<span className="mt-1 block text-base font-normal text-slate-600">{displayedMinutes ? provisional ? "Suggested from your plan. You can increase or reduce this estimate." : "Teacher-entered estimate." : "Add teaching inputs before Elume can allocate time for this stage."}</span><input aria-label={`Stage ${index + 1} minutes`} type="number" value={displayedMinutes ?? ""} onChange={(e) => updateStage(stage.id, { estimated_minutes: e.target.value ? Number(e.target.value) : null, provisional_estimate: false })} className="mt-1 block min-h-12 w-full rounded-xl border p-2 text-lg font-normal" /></label></details>
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <button
                        aria-label={`Move stage ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => moveStage(index, -1)}
                        className="min-h-12 rounded border px-3 text-lg disabled:opacity-30"
                      >
                        Move up
                      </button>
                      <button
                        aria-label={`Move stage ${index + 1} down`}
                        disabled={index === stages.length - 1}
                        onClick={() => moveStage(index, 1)}
                        className="min-h-12 rounded border px-3 text-lg disabled:opacity-30"
                      >
                        Move down
                      </button>
                      <button
                        aria-label={`Remove stage ${index + 1}`}
                        onClick={() => {
                          setStages((current) =>
                            current.filter((item) => item.id !== stage.id),
                          );
                          setDirty(true);
                        }}
                        className="min-h-12 rounded border border-red-200 px-3 text-lg text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>}
                  {stage.checkpoints.map((checkpoint) => (
                    <div key={checkpoint.id} className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        aria-label="Checkpoint"
                        value={checkpoint.text}
                        onChange={(e) =>
                          updateStage(stage.id, {
                            checkpoints: stage.checkpoints.map((item) =>
                              item.id === checkpoint.id
                                ? { ...item, text: e.target.value }
                                : item,
                            ),
                          })
                        }
                        className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white p-3 text-lg"
                      />
                      <button
                        aria-label="Remove checkpoint"
                        onClick={() =>
                          updateStage(stage.id, {
                            checkpoints: stage.checkpoints.filter(
                              (item) => item.id !== checkpoint.id,
                            ),
                          })
                        }
                        className="min-h-12 rounded-xl border border-red-200 bg-white px-3 text-lg font-bold text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      updateStage(stage.id, {
                        checkpoints: [
                          ...stage.checkpoints,
                          { id: stableId(), text: "New checkpoint" },
                        ],
                      })
                    }
                    className="mt-3 min-h-12 rounded-xl border border-teal-200 bg-white px-3 text-lg font-bold text-teal-800"
                  >
                    + Add checkpoint
                  </button>
                </article>;
              })}
            </div>
          </section>
          <section className={`order-7 rounded-3xl border border-violet-100 bg-violet-50 p-6 ${setupStep === 4 ? "" : "hidden"}`}>
            <h3 className="text-2xl font-extrabold leading-tight">Plan summary</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4"><p className="text-base font-semibold text-slate-700">Total allocated teaching time</p><p className="mt-1 text-2xl font-black text-slate-950">{revision?.schedule?.estimated_minutes ?? "—"} minutes</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-base font-semibold text-slate-700">Available teaching time</p><p className="mt-1 text-2xl font-black text-slate-950">{revision?.schedule?.capacity_minutes ?? "—"} minutes</p></div>
            </div>
            <dl className="mt-4 grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-2">
              <div><dt className="text-base font-semibold text-slate-700">Preferred student finish</dt><dd className="font-bold">{inputs.normal_finish_target ? readableDate(inputs.normal_finish_target) : "Not set"}</dd></div>
              <div><dt className="text-base font-semibold text-slate-700">Final classroom deadline</dt><dd className="font-bold">{finalClassroomDeadline ? readableDate(finalClassroomDeadline) : "Not set"}</dd></div>
              <div><dt className="text-base font-semibold text-slate-700">SEC deadline</dt><dd className="font-bold">{inputs.controlling_deadline ? readableDate(inputs.controlling_deadline) : "Not confirmed"}</dd></div>
              <div><dt className="text-base font-semibold text-slate-700">Final-classroom-to-SEC buffer</dt><dd className={deadlineBufferIssue || deadlineMissingGuidance ? "font-bold text-red-800" : "font-bold text-teal-900"}>{deadlineMissingGuidance || deadlineBufferIssue?.text || `${buffer} calendar days before the SEC deadline.`}</dd></div>
            </dl>
            {hasProvisionalStageAllocations && <p className="mt-4 rounded-2xl border border-violet-200 bg-white p-4 text-violet-950">Suggested stage allocations use your available teaching time. Adjust them to suit your class.</p>}
            {dirty && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">Schedule suggestions are stale after your edits. Save tracker to refresh them.</p>}
            {schedulingBlockers.length > 0 && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950"><p className="font-extrabold">Scheduling needs attention</p><ul className="mt-2 list-disc pl-5">{schedulingBlockers.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            {provisionalCalendarWarnings.length > 0 && <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-950"><p className="font-extrabold">Calendar information is provisional</p><ul className="mt-2 list-disc pl-5">{provisionalCalendarWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => focusSetupHeading(keyDatesHeadingRef)} className="rounded-xl border border-teal-300 bg-white px-4 py-2 font-bold text-teal-900">Edit dates</button>
              <button type="button" onClick={() => focusSetupHeading(teachingTimeHeadingRef)} className="rounded-xl border border-teal-300 bg-white px-4 py-2 font-bold text-teal-900">Edit teaching time</button>
              <button type="button" disabled={busy || saving || dirty} onClick={() => void openRecalculation()} className="rounded-xl bg-violet-700 px-4 py-2 font-bold text-white disabled:opacity-50">Recalculate suggested dates</button>
              <button type="button" disabled={startingNewDraft || !dirty || saving || busy} onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save tracker"}</button>
            </div>
            <p className="mt-3 text-base text-slate-700">Review proposed replacement dates before applying them. Saving keeps this tracker private to teachers; this pilot does not publish calendar events.</p>
            {assumptions.length > 0 && <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-bold">Recorded planning assumptions</summary><ul className="mt-3 list-disc pl-5">{assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
            {project.approved_revision && <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-bold">Saved plan comparison</summary><PlanComparison draft={stages} approved={normalizeStages(project.approved_revision.plan?.stages)} /></details>}
          </section>
          {false && <section className="hidden">
            <article className="rounded-3xl border border-cyan-100 bg-cyan-50 p-6">
              <h3 className="font-extrabold">
                Reviewed source requirements and dates
              </h3>
              {requirements.length ? (
                requirements.map((item, index) => (
                  <p
                    key={index}
                    className="mt-2 rounded-xl bg-white p-3 text-sm"
                  >
                    <b>{item.text || "Requirement"}</b>
                    <br />
                    Source {item.source_document_id} · {item.source_reference}
                  </p>
                ))
              ) : (
                <p className="mt-2 text-sm">
                  Add requirements manually or generate suggestions from
                  selected sources.
                </p>
              )}
            </article>
            <article className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="font-extrabold">Review and save</h3>
              <p className="mt-2 text-sm text-amber-900">Reviewer pilot: save AAC trackers only. AI suggestions, approval and calendar publication are unavailable.</p>
              {assumptions.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {assumptions.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm">No recorded assumptions yet.</p>
              )}
              {project?.approved_revision && (
                <PlanComparison
                  draft={stages}
                  approved={normalizeStages(
                    project?.approved_revision?.plan?.stages,
                  )}
                />
              )}
              <p className="mt-4 text-sm text-amber-900">
                {AAC_REVIEWER_PILOT_DRAFT_ONLY
                  ? "This pilot does not publish stages to any calendar or share them with students."
                  : "Approval publishes the saved stage milestones to your teacher class and all-events calendars. It does not share this plan with students."}
              </p>
              {project?.status === "approved" && !revision?.state.includes("draft") ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <b>Approved plan is live in your calendars.</b>
                  <button type="button" onClick={() => navigate(`/class/${classId}/calendar`)} className="ml-3 font-bold underline">Open class calendar</button>
                </div>
              ) : (
                <>
                  {dirty && <p className="mt-3 text-sm text-amber-900">Save your edits before approval so the reviewed revision and token are current.</p>}
                  {reviewStale && <p className="mt-3 text-sm text-red-800">Refresh the saved draft before approving again.</p>}
                  {blockingWarnings.length > 0 && <p className="mt-3 text-sm text-amber-900">Resolve the scheduling warnings shown above before approval.</p>}
                  <div className="mt-4 flex flex-wrap gap-3">
                    {!AAC_REVIEWER_PILOT_DRAFT_ONLY && <button
                      type="button"
                      disabled={AAC_REVIEWER_PILOT_DRAFT_ONLY || !canApprove}
                      onClick={approve}
                      className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50"
                    >
                      {approving ? "Approving…" : "Approve plan and update my calendars"}
                    </button>}
                    {reviewStale && <button type="button" disabled={approving || busy || saving} onClick={() => void load()} className="rounded-xl border border-amber-300 bg-white px-4 py-2 font-bold text-amber-900 disabled:opacity-50">Refresh review</button>}
                  </div>
                </>
              )}
            </article>
          </section>}
        </div>
      )}
    </>
  );
  if (pilotAccess !== true) return null;
  if (mode === "entry") {
    return (
      <section className="rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 p-5 text-lg leading-7 [&_button]:min-h-12 [&_button]:whitespace-normal [&_button]:px-5 [&_button]:text-lg [&_p]:leading-7 [&_p.text-sm]:text-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-extrabold text-slate-900">AAC Tracker</p>
            <p className="mt-1 text-sm text-slate-600">
              {enabled
                ? "Your AAC tracker is ready in its Class Admin tab."
                : "Optional teacher-led planning for assessed coursework. AAC is off for this class."}
            </p>
          </div>
          {enabled ? (
            <button type="button" onClick={onOpen} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white">
              Open AAC Tracker
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={enable} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">
              Enable AAC Tracker
            </button>
          )}
        </div>
      </section>
    );
  }
  return embedded ? (
    <section className="space-y-7 text-lg leading-7 [&_h1]:text-3xl [&_h1]:leading-tight [&_h2]:text-2xl [&_h2]:leading-tight [&_h3]:text-2xl [&_h3]:leading-tight [&_h4]:text-xl [&_h4]:leading-tight [&_p]:leading-7 [&_p.text-sm]:text-lg [&_li]:leading-7 [&_li.text-sm]:text-lg [&_label]:text-lg [&_label]:leading-7 [&_input]:min-h-12 [&_input]:text-lg [&_input]:leading-7 [&_select]:min-h-12 [&_select]:text-lg [&_select]:leading-7 [&_textarea]:min-h-12 [&_textarea]:text-lg [&_textarea]:leading-7 [&_button]:min-h-12 [&_button]:whitespace-normal [&_button]:px-4 [&_button]:text-lg [&_button]:leading-6 [&_summary]:text-lg [&_summary]:leading-7 [&_span.text-xs]:text-base [&_span.text-xs]:leading-6">{page}</section>
  ) : (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-emerald-50 p-5 text-slate-800">
      <section className="mx-auto max-w-5xl space-y-7 text-lg leading-7 [&_h1]:text-3xl [&_h1]:leading-tight [&_h2]:text-2xl [&_h2]:leading-tight [&_h3]:text-2xl [&_h3]:leading-tight [&_h4]:text-xl [&_h4]:leading-tight [&_p]:leading-7 [&_p.text-sm]:text-lg [&_li]:leading-7 [&_li.text-sm]:text-lg [&_label]:text-lg [&_label]:leading-7 [&_input]:min-h-12 [&_input]:text-lg [&_input]:leading-7 [&_select]:min-h-12 [&_select]:text-lg [&_select]:leading-7 [&_textarea]:min-h-12 [&_textarea]:text-lg [&_textarea]:leading-7 [&_button]:min-h-12 [&_button]:whitespace-normal [&_button]:px-4 [&_button]:text-lg [&_button]:leading-6 [&_summary]:text-lg [&_summary]:leading-7 [&_span.text-xs]:text-base [&_span.text-xs]:leading-6">{page}</section>
    </main>
  );
}

function DateField({
  label,
  value,
  onChange,
  help,
  emphasis = false,
  error,
  inputRef,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  help?: string;
  emphasis?: boolean;
  error?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const errorId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-error`;
  return (
    <label className={`text-lg font-semibold leading-7 ${emphasis ? "rounded-2xl border-2 border-teal-300 bg-teal-50 p-4 text-teal-950" : ""}`}>
      <span>{label}{help && <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-teal-400 text-base" tabIndex={0} aria-label={help}>?</span>}</span>
      {help && <span className="mt-2 block text-base font-normal leading-6 text-slate-700">{help}</span>}
      <input
        ref={inputRef}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        type="date"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block min-h-12 w-full rounded-xl border p-3 text-lg font-normal leading-7"
      />
      {error && <span id={errorId} role="alert" className="mt-2 block rounded-xl bg-red-50 p-3 text-base font-bold text-red-900">{error}</span>}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string | number | null | undefined; onChange: (value: number | "") => void }) {
  return <label className="text-lg font-semibold leading-7">{label}<input aria-label={label} type="number" min="0" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} className="mt-2 block min-h-12 w-full rounded-xl border p-3 text-lg font-normal leading-7" /></label>;
}

function PlanComparison({
  draft,
  approved,
}: {
  draft: Stage[];
  approved: Stage[];
}) {
  const approvedById = new Map(approved.map((stage) => [stage.id, stage]));
  const draftIds = new Set(draft.map((stage) => stage.id));
  const added = draft.filter((stage) => !approvedById.has(stage.id));
  const removed = approved.filter((stage) => !draftIds.has(stage.id));
  const changed = draft.filter((stage) => {
    const previous = approvedById.get(stage.id);
    return (
      previous &&
      (previous.name !== stage.name ||
        previous.estimated_minutes !== stage.estimated_minutes ||
        previous.completion_date !== stage.completion_date)
    );
  });
  return (
    <div className="mt-5 rounded-xl bg-white p-4 text-lg leading-7">
      <b>Current approved plan is retained.</b>
      <p className="mt-1">
        Draft comparison: {added.length} added, {removed.length} removed,{" "}
        {changed.length} changed stage{changed.length === 1 ? "" : "s"}.
      </p>
      {[
        ...added.map((stage) => `Added: ${stage.name}`),
        ...removed.map((stage) => `Removed: ${stage.name}`),
        ...changed.map((stage) => `Changed: ${stage.name}`),
      ]
        .slice(0, 8)
        .map((line) => (
          <div key={line} className="mt-1 text-slate-700">
            {line}
          </div>
        ))}
    </div>
  );
}
