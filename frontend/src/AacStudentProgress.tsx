import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";

// Grid/check-in presentation adapted from AacStudentProgressDemo. No demo storage
// keys or records are read: authenticated server data is the sole saved state.
type Status = "not_started" | "in_progress" | "ready_for_review" | "teacher_reviewed";
type Stage = { id: string; name: string; completion_date?: string | null };
type Entry = { version: number; stages: Record<string, { status: Status; target: string | null; name?: string }>; note: string; follow_up: string | null };
type Student = { id: number; first_name: string; active: boolean; check_in: Entry };
type Workspace = { tracker_id: string; read_only: boolean; stages: Stage[]; retired_stages: Stage[]; students: Student[]; trackers: { id: string; title: string; current: boolean }[] };
const statuses: { value: Status; label: string; className: string }[] = [
  { value: "not_started", label: "Not started", className: "bg-slate-100 text-slate-800" },
  { value: "in_progress", label: "In progress", className: "bg-amber-100 text-amber-900" },
  { value: "ready_for_review", label: "Ready for teacher review", className: "bg-violet-100 text-violet-900" },
  { value: "teacher_reviewed", label: "Teacher reviewed", className: "bg-teal-100 text-teal-900" },
];
const defaultStage = { status: "not_started" as Status, target: null };

export default function AacStudentProgress({ classId, onBack }: { classId: number; onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);
  const [data, setData] = useState<Workspace | null>(null);
  const [edits, setEdits] = useState<Record<number, Entry>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [error, setError] = useState("");
  const [tracker, setTracker] = useState("");
  const [reload, setReload] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const dirty = Object.keys(edits).length > 0;
  const mayLeave = () => !dirty || window.confirm("Discard unsaved check-in input? Saved server records will be kept.");
  useEffect(() => {
    let active = true; setData(null); setError("");
    apiFetch(`/classes/${classId}/aac/students${tracker ? `?tracker_id=${encodeURIComponent(tracker)}` : ""}`)
      .then((result) => { if (active) { setData(result); setEdits({}); setFeedback({}); setSelected(null); } })
      .catch((err) => { if (active) setError(err?.message || "The server grid could not be loaded. Retry without changing saved records."); });
    return () => { active = false; };
  }, [classId, tracker, reload]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const entry = (student: Student) => edits[student.id] || student.check_in;
  const update = (student: Student, change: Partial<Entry>) => {
    setEdits((current) => ({ ...current, [student.id]: { ...(current[student.id] || student.check_in), ...change } }));
    setFeedback((current) => ({ ...current, [student.id]: "Unsaved changes" }));
  };
  const updateStage = (student: Student, stage: Stage, change: Partial<Entry["stages"][string]>) => update(student, {
    stages: { ...entry(student).stages, [stage.id]: { ...(entry(student).stages[stage.id] || defaultStage), ...change } },
  });
  const save = async (student: Student) => {
    if (!data || pending[student.id] || data.read_only || !student.active) return;
    const value = entry(student);
    setPending((current) => ({ ...current, [student.id]: true }));
    setFeedback((current) => ({ ...current, [student.id]: "Saving…" }));
    try {
      const response = await apiFetch(`/classes/${classId}/aac/students/${student.id}`, { method: "PUT", body: {
        tracker_id: data.tracker_id, expected_version: value.version, note: value.note, follow_up: value.follow_up || null,
        stages: Object.fromEntries(data.stages.map((stage) => { const item = value.stages[stage.id] || defaultStage; return [stage.id, { status: item.status, target: item.target || null }]; })),
      } });
      setData((current) => current ? { ...current, students: current.students.map((s) => s.id === student.id ? { ...s, check_in: response.check_in } : s) } : current);
      setEdits((current) => { const next = { ...current }; delete next[student.id]; return next; });
      setFeedback((current) => ({ ...current, [student.id]: "Saved to server" }));
    } catch (err: any) {
      setFeedback((current) => ({ ...current, [student.id]: `Not saved: ${err?.message || "Please retry."} Your input is retained.` }));
    } finally { setPending((current) => ({ ...current, [student.id]: false })); }
  };
  const selectedStudent = data?.students.find((s) => s.id === selected);
  const statusControl = (student: Student, stage: Stage, panel = false) => {
    const value = entry(student).stages[stage.id]?.status || "not_started";
    return <select aria-label={`${student.first_name}: ${stage.name} ${panel ? "check-in status" : "progress"}`} value={value}
      disabled={data?.read_only || !student.active || pending[student.id]} onChange={(event) => updateStage(student, stage, { status: event.target.value as Status })}
      className={`min-h-12 w-full rounded-xl border p-2 text-base font-bold ${statuses.find((s) => s.value === value)?.className}`}>
      {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
    </select>;
  };
  const saveButton = (student: Student, panel = false) => <button type="button" disabled={!edits[student.id] || pending[student.id] || data?.read_only || !student.active}
    onClick={() => void save(student)} className="rounded-xl bg-violet-700 px-4 py-2 font-bold text-white disabled:opacity-50">{pending[student.id] ? "Saving…" : panel ? "Save check-in" : `Save ${student.first_name}`}</button>;
  return <section className="space-y-5" aria-label="AAC student progress">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-teal-200 bg-teal-50 p-5">
      <div><h2 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-teal-950">Student progress</h2><p className="mt-1 text-base text-teal-900">Private teacher check-ins, saved to this class on the server. Dates never mark work complete.</p></div>
      <button type="button" disabled={Object.values(pending).some(Boolean)} onClick={() => { if (mayLeave()) onBack(); }} className="rounded-xl border border-teal-300 bg-white px-4 py-2 font-bold">Plan</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={Object.values(pending).some(Boolean)} onClick={() => { if (mayLeave()) setReload((n) => n + 1); }} className="rounded-xl border px-4 py-2 font-bold">Reload saved grid</button>
    {!data && !error && <p role="status">Loading saved progress…</p>}
    {data && <>
      <label className="block font-bold">Tracker history <select aria-label="Tracker history" value={data.tracker_id} disabled={Object.values(pending).some(Boolean)} onChange={(event) => { if (mayLeave()) setTracker(event.target.value); }} className="rounded-xl border p-2">
        {data.trackers.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.current ? "Current" : "History"} · {t.id.slice(0, 12)}</option>)}
      </select></label>
      {data.read_only && <p role="status">Historical tracker — read-only. Prior check-ins are preserved.</p>}
      <label className="block"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived students with history</label>
      {!data.stages.length && <p>Save named tracker stages in the Plan to begin tracking.</p>}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white"><table className="min-w-[780px] w-full border-collapse text-left"><thead><tr>
        <th className="sticky left-0 z-10 bg-white p-4 text-lg font-black">Student</th>
        {data.stages.map((stage) => <th key={stage.id} className="min-w-48 border-l p-4 align-top"><div className="font-bold">{stage.name}</div><div className="mt-1 text-sm font-normal text-slate-600">{stage.completion_date || "Class date to confirm"}<br />{data.students.filter((s) => s.active && s.check_in.stages[stage.id]?.status === "teacher_reviewed").length} teacher reviewed (saved)</div></th>)}
        <th className="p-4">Save</th></tr></thead><tbody>
        {data.students.filter((s) => s.active || showArchived).map((student) => <tr key={student.id} className="border-t"><th className="sticky left-0 z-10 bg-white p-4 align-top"><button type="button" onClick={() => setSelected(student.id)} className="text-left text-lg font-bold text-teal-800 underline underline-offset-4">{student.first_name}</button>{!student.active && <span className="block text-sm">Archived — history only</span>}</th>
          {data.stages.map((stage) => <td key={stage.id} className="border-l p-3">{statusControl(student, stage)}</td>)}
          <td className="p-3">{saveButton(student)}<p role={feedback[student.id]?.startsWith("Not saved") ? "alert" : "status"}>{feedback[student.id]}</p></td>
        </tr>)}
      </tbody></table></div>
      {selectedStudent && <aside aria-label={`${selectedStudent.first_name} check-in`} className="rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h3 className="text-2xl font-black text-violet-950">{selectedStudent.first_name}’s check-in</h3><button type="button" onClick={() => setSelected(null)} className="rounded-xl border bg-white px-3 py-2 font-bold">Close</button></div>
        <fieldset disabled={data.read_only || !selectedStudent.active || pending[selectedStudent.id]}>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{data.stages.map((stage) => <label key={stage.id} className="rounded-2xl bg-white p-3 text-base font-bold">{stage.name}<span className="mt-1 block text-sm font-normal text-slate-600">Class target: {stage.completion_date || "Not set"}</span>
            {statusControl(selectedStudent, stage, true)}<span className="mt-2 block text-sm">Individual target (optional; blank uses class target)</span>
            <input aria-label={`${selectedStudent.first_name}: ${stage.name} individual target`} type="date" value={entry(selectedStudent).stages[stage.id]?.target || ""} onChange={(event) => updateStage(selectedStudent, stage, { target: event.target.value || null })} onInput={(event) => updateStage(selectedStudent, stage, { target: event.currentTarget.value || null })} className="mt-1 min-h-12 w-full rounded-xl border p-2" />
            <span className="text-sm">Effective target: {entry(selectedStudent).stages[stage.id]?.target || stage.completion_date || "Not set"}</span>
          </label>)}</div>
          <label className="mt-4 block text-lg font-bold">Teacher note / next action<textarea aria-label="Teacher note / next action" maxLength={500} value={entry(selectedStudent).note} onChange={(event) => update(selectedStudent, { note: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border p-3 font-normal" /></label>
          <label className="mt-3 block text-lg font-bold">Follow-up date (optional)<input aria-label="Follow-up date" type="date" value={entry(selectedStudent).follow_up || ""} onChange={(event) => update(selectedStudent, { follow_up: event.target.value || null })} onInput={(event) => update(selectedStudent, { follow_up: event.currentTarget.value || null })} className="mt-2 min-h-12 rounded-xl border p-2 font-normal" /></label>
        </fieldset>
        <div className="mt-4">{saveButton(selectedStudent, true)}{feedback[selectedStudent.id] && <p aria-live="polite">Check-in: {feedback[selectedStudent.id]}</p>}</div>
        {data.retired_stages.length > 0 && <details className="mt-4"><summary className="font-bold">Removed stages — retained history</summary>{data.retired_stages.map((stage) => <p key={stage.id}>{stage.name}: {statuses.find((s) => s.value === selectedStudent.check_in.stages[stage.id]?.status)?.label || "No check-in recorded"} · Individual target: {selectedStudent.check_in.stages[stage.id]?.target || "Class target"}</p>)}</details>}
      </aside>}
    </>}
  </section>;
}
