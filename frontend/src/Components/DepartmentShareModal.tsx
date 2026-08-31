import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type Department = { id: number; name: string };

export default function DepartmentShareModal({ resource, resourceId, onClose }: { resource: "template" | "quiz"; resourceId: number; onClose: () => void }) {
  const base = resource === "template" ? `/collab/templates/${resourceId}/department-shares` : `/quizzes/${resourceId}/department-shares`;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void Promise.all([apiFetch("/school-resources/departments"), apiFetch(base)]).then(([items, shares]: any[]) => { setDepartments(items.departments || []); setSelected(shares.department_ids || []); }).catch((err: any) => setError(err?.message || "Could not load departments.")); }, [base]);
  async function save() { setSaving(true); try { await apiFetch(base, { method: "PUT", body: { department_ids: selected } }); onClose(); } catch (err: any) { setError(err?.message || "Could not update sharing."); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-900">Share with departments</h2><p className="mt-2 text-sm text-slate-600">Members can discover this resource and create their own fresh copy.</p>{error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}<div className="mt-4 space-y-2">{departments.map((department) => <label key={department.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={selected.includes(department.id)} onChange={() => setSelected((current) => current.includes(department.id) ? current.filter((id) => id !== department.id) : [...current, department.id])} /><span className="font-semibold text-slate-800">{department.name}</span></label>)}{!departments.length && <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">You are not in a department yet. Ask your School Admin to add you.</div>}</div><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl px-3 py-2 font-bold text-slate-600">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-50">Save sharing</button></div></div></div>;
}
