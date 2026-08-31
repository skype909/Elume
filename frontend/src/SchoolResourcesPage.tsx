import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

type Department = { id: number; name: string };
type Resource = { id: number; resource_type: "collaboration_template" | "quiz"; title: string; shared_by: string; departments: Department[]; category?: string };
type TeacherClass = { id: number; name: string; subject?: string };

export default function SchoolResourcesPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [copying, setCopying] = useState<Resource | null>(null);
  const [destinationClassId, setDestinationClassId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (departmentId) params.set("department_id", departmentId);
    if (resourceType) params.set("resource_type", resourceType);
    const [departmentData, resourceData, classData] = await Promise.all([
      apiFetch("/school-resources/departments"), apiFetch(`/school-resources?${params.toString()}`), apiFetch("/classes"),
    ]);
    setDepartments((departmentData as any).departments || []);
    setResources((resourceData as any).resources || []);
    setClasses(Array.isArray(classData) ? classData : []);
  }, [departmentId, resourceType]);
  useEffect(() => { void load().catch((err: any) => setError(err?.message || "Could not load School Resources.")); }, [load]);

  async function launchBoard(resource: Resource) {
    const target = classes[0];
    if (!target) { setError("Create a class before using a shared board."); return; }
    try { const data: any = await apiFetch(`/collab/templates/${resource.id}/use-shared`, { method: "POST", body: { class_id: target.id } }); navigate(`/class/${target.id}/collaboration?session=${encodeURIComponent(data.session_code)}`); }
    catch (err: any) { setError(err?.message || "Could not start the shared board."); }
  }
  async function copyQuiz() {
    if (!copying || !destinationClassId) return;
    try { await apiFetch(`/quizzes/${copying.id}/copy-shared`, { method: "POST", body: { destination_class_id: Number(destinationClassId) } }); setNotice(`“${copying.title}” was added to your class quizzes.`); setCopying(null); }
    catch (err: any) { setError(err?.message || "Could not add the quiz."); }
  }

  return <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-7 sm:px-6"><div className="mx-auto max-w-5xl"><header className="rounded-[28px] border border-white bg-white/90 p-6 shadow-sm"><div className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">School Resources</div><h1 className="mt-1 text-3xl font-black text-slate-900">Shared teaching resources</h1><p className="mt-2 text-sm text-slate-600">Resources shared through your departments. Using one always creates your own fresh copy.</p></header>{error && <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}{notice && <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}<section className="mt-5 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4"><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">All my departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><select value={resourceType} onChange={(event) => setResourceType(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">All resource types</option><option value="collaboration_template">Collaboration Boards</option><option value="quiz">Quizzes</option></select></section><section className="mt-5 grid gap-4 md:grid-cols-2">{resources.map((resource) => <article key={`${resource.resource_type}-${resource.id}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold uppercase tracking-wide text-violet-700">{resource.resource_type === "quiz" ? "Quiz" : "Collaboration Board"}</div><h2 className="mt-1 text-xl font-black text-slate-900">{resource.title}</h2><p className="mt-2 text-sm text-slate-600">Shared by {resource.shared_by} · {resource.departments.map((department) => department.name).join(", ")}</p><button type="button" onClick={() => resource.resource_type === "quiz" ? setCopying(resource) : void launchBoard(resource)} className="mt-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-bold text-white">{resource.resource_type === "quiz" ? "Add to My Quizzes" : "Use for Collaboration"}</button></article>)}{resources.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600 md:col-span-2">No shared resources in your departments yet.</div>}</section>{copying && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-900">Add quiz to a class</h2><p className="mt-2 text-sm text-slate-600">This creates your own copy of “{copying.title}”.</p><select value={destinationClassId} onChange={(event) => setDestinationClassId(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 p-3"><option value="">Choose your class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.subject ? ` · ${item.subject}` : ""}</option>)}</select><div className="mt-5 flex justify-end gap-3"><button onClick={() => setCopying(null)} className="rounded-xl px-3 py-2 font-bold text-slate-600">Cancel</button><button disabled={!destinationClassId} onClick={() => void copyQuiz()} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">Add quiz</button></div></div></div>}</div></main>;
}
