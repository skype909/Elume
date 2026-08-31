import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import SchoolBrand from "./Components/SchoolBrand";

type CurrentUser = { role?: string };
type Overview = {
  id: number;
  name: string;
  status: string;
  seat_limit: number;
  active_teacher_count: number;
  available_seats: number;
  pending_invitation_count: number;
  disabled_teacher_count: number;
  slug?: string | null;
  logo_url?: string | null;
};
type Teacher = { id: number; email: string; first_name?: string | null; last_name?: string | null; is_active: boolean };
type Invitation = { id: number; email: string; status: "pending" | "accepted" | "revoked" | "expired"; created_at: string; expires_at: string };
type AuditItem = { id: number; action: string; created_at: string };
type Department = { id: number; name: string; school_id: number; members: Teacher[] };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium" }).format(new Date(value));
}

function activityLabel(action: string) {
  return ({
    invitation_created: "Invitation sent",
    invitation_resent: "Invitation resent",
    invitation_revoked: "Invitation revoked",
    invitation_accepted: "Teacher joined school",
    school_admin_invitation_created: "School Admin invitation sent",
    school_admin_invitation_accepted: "School Admin joined school",
    teacher_deactivated: "Teacher disabled",
    teacher_reactivated: "Teacher reactivated",
  } as Record<string, string>)[action] || "School access updated";
}

function friendlyError(error: any) {
  const message = String(error?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("pending invitation")) return "There is already a pending invitation for this email.";
  if (lower.includes("already belongs")) return "This teacher is already connected to a school.";
  if (lower.includes("no available teacher seats")) return "There are no teacher seats available. Disable a teacher or increase the school licence before continuing.";
  if (lower.includes("school is not active")) return "This school is not currently active. Please contact Elume support.";
  if (lower.includes("school admin") || lower.includes("not authorised")) return "You do not have permission to manage this school.";
  return message || "Something went wrong. Please try again.";
}

export default function SchoolAdminPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<AuditItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentMembersOpen, setDepartmentMembersOpen] = useState<Department | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "disable" | "revoke"; id: number; label: string } | null>(null);

  const loadData = useCallback(async () => {
    const [overviewData, teachersData, invitationsData, auditData, departmentsData] = await Promise.all([
      apiFetch("/school-admin/overview"),
      apiFetch("/school-admin/teachers"),
      apiFetch("/school-admin/invitations"),
      apiFetch("/school-admin/audit-log?limit=20"),
      apiFetch("/school-admin/departments"),
    ]);
    setOverview(overviewData as Overview);
    setTeachers(teachersData as Teacher[]);
    setInvitations(invitationsData as Invitation[]);
    setActivity(auditData as AuditItem[]);
    setDepartments(departmentsData as Department[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialise() {
      setLoading(true);
      setError(null);
      try {
        const me = (await apiFetch("/auth/me")) as CurrentUser;
        if (me.role !== "school_admin") {
          navigate("/", { replace: true });
          return;
        }
        await loadData();
      } catch (err: any) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialise();
    return () => { cancelled = true; };
  }, [loadData, navigate]);

  async function refresh() {
    setError(null);
    try {
      await loadData();
    } catch (err: any) {
      setError(friendlyError(err));
    }
  }

  async function inviteTeacher(event: React.FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setActionKey("invite");
    setNotice(null);
    try {
      await apiFetch("/school-admin/invitations", { method: "POST", body: { email } });
      setInviteEmail("");
      setInviteOpen(false);
      setNotice(`Invitation sent to ${email}.`);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setActionKey(null);
    }
  }

  async function invitationAction(id: number, action: "resend" | "revoke") {
    setActionKey(`${action}-${id}`);
    setNotice(null);
    try {
      await apiFetch(`/school-admin/invitations/${id}/${action}`, { method: "POST" });
      setNotice(action === "resend" ? "Invitation resent." : "Invitation revoked.");
      setConfirm(null);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setActionKey(null);
    }
  }

  async function teacherAction(teacher: Teacher, action: "deactivate" | "reactivate") {
    setActionKey(`${action}-${teacher.id}`);
    setNotice(null);
    try {
      await apiFetch(`/school-admin/teachers/${teacher.id}/${action}`, { method: "POST" });
      setNotice(action === "deactivate" ? "Teacher access disabled. Their classes and data are preserved." : "Teacher access reactivated.");
      setConfirm(null);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setActionKey(null);
    }
  }

  async function saveDepartment(event: React.FormEvent) {
    event.preventDefault();
    const name = departmentName.trim();
    if (!name) return;
    setActionKey("department");
    try {
      if (editingDepartment) await apiFetch(`/school-admin/departments/${editingDepartment.id}`, { method: "PATCH", body: { name } });
      else await apiFetch("/school-admin/departments", { method: "POST", body: { name } });
      setDepartmentName(""); setEditingDepartment(null); await refresh();
    } catch (err: any) { setError(friendlyError(err)); } finally { setActionKey(null); }
  }

  async function saveDepartmentMembers() {
    if (!departmentMembersOpen) return;
    setActionKey(`members-${departmentMembersOpen.id}`);
    try {
      await apiFetch(`/school-admin/departments/${departmentMembersOpen.id}/members`, { method: "PUT", body: { user_ids: departmentMembersOpen.members.map((teacher) => teacher.id) } });
      setDepartmentMembersOpen(null); await refresh();
    } catch (err: any) { setError(friendlyError(err)); } finally { setActionKey(null); }
  }

  async function deleteDepartment(department: Department) {
    if (!window.confirm(`Delete ${department.name}? This removes department memberships and sharing permissions, but never teachers or original resources.`)) return;
    setActionKey(`delete-department-${department.id}`);
    try { await apiFetch(`/school-admin/departments/${department.id}`, { method: "DELETE" }); await refresh(); }
    catch (err: any) { setError(friendlyError(err)); } finally { setActionKey(null); }
  }

  const usedSeats = overview ? `${overview.active_teacher_count} / ${overview.seat_limit}` : "—";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">School Admin</div>
            <div className="mt-1"><SchoolBrand name={overview?.name || "Your school"} logoUrl={overview?.logo_url} heading poweredByElume /></div>
            <p className="mt-1 text-sm text-slate-600">Manage teacher access and invitations with confidence.</p>
          </div>
          <button type="button" onClick={() => setInviteOpen(true)} disabled={loading} className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-base font-black text-white shadow-lg transition hover:shadow-xl disabled:opacity-60">Invite Teacher</button>
        </header>

        {error && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"><span>{error}</span><button type="button" onClick={refresh} className="rounded-xl border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700">Retry</button></div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}

        {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">Loading school information…</div> : overview && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-5 shadow-sm xl:col-span-2"><div className="text-sm font-bold text-emerald-800">Teacher seats</div><div className="mt-2 text-3xl font-black text-slate-900">{usedSeats} <span className="text-base font-semibold text-slate-600">used</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${overview.seat_limit ? Math.min((overview.active_teacher_count / overview.seat_limit) * 100, 100) : 0}%` }} /></div></div>
            <Metric label="Available seats" value={overview.available_seats} accent="text-cyan-700" />
            <Metric label="Pending invitations" value={overview.pending_invitation_count} accent="text-violet-700" />
            <Metric label="Disabled teachers" value={overview.disabled_teacher_count} accent="text-slate-700" />
          </section>

          <section className="mt-7 grid gap-7 xl:grid-cols-[1.45fr_0.9fr]">
            <div className="space-y-7">
              <Panel title="Teachers" subtitle="Teacher data and classes are preserved when access is disabled.">
                {teachers.length === 0 ? <Empty text="No teachers have joined this school yet." /> : <div className="divide-y divide-slate-100">{teachers.map((teacher) => <div key={teacher.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold text-slate-900">{`${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || "Teacher"}</div><div className="text-sm text-slate-600">{teacher.email}</div></div><div className="flex items-center gap-3"><StatusBadge active={teacher.is_active} label={teacher.is_active ? "Active" : "Disabled"} /><button type="button" disabled={actionKey !== null} onClick={() => teacher.is_active ? setConfirm({ kind: "disable", id: teacher.id, label: teacher.email }) : teacherAction(teacher, "reactivate")} className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${teacher.is_active ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{actionKey === `reactivate-${teacher.id}` ? "Reactivating…" : teacher.is_active ? "Disable" : "Reactivate"}</button></div></div>)}</div>}
              </Panel>

              <Panel title="Invitations" subtitle="Pending invitations do not reserve a teacher seat.">
                {invitations.length === 0 ? <Empty text="No invitations have been sent yet." /> : <div className="divide-y divide-slate-100">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold text-slate-900">{invitation.email}</div><div className="mt-1 text-xs text-slate-500">Sent {formatDate(invitation.created_at)}{invitation.status === "pending" ? ` · Expires ${formatDate(invitation.expires_at)}` : ""}</div></div><div className="flex items-center gap-2"><InvitationBadge status={invitation.status} />{invitation.status === "pending" && <><button type="button" disabled={actionKey !== null} onClick={() => invitationAction(invitation.id, "resend")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{actionKey === `resend-${invitation.id}` ? "Sending…" : "Resend"}</button><button type="button" disabled={actionKey !== null} onClick={() => setConfirm({ kind: "revoke", id: invitation.id, label: invitation.email })} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">Revoke</button></>}</div></div>)}</div>}
              </Panel>

              <Panel title="Departments" subtitle="Teachers can belong to more than one department. Sharing never changes ownership of original resources.">
                <form onSubmit={saveDepartment} className="flex flex-wrap gap-2"><input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder={editingDepartment ? "Rename department" : "e.g. Science"} className="min-w-[190px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="submit" disabled={actionKey !== null} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">{editingDepartment ? "Save name" : "Create Department"}</button>{editingDepartment && <button type="button" onClick={() => { setEditingDepartment(null); setDepartmentName(""); }} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-600">Cancel</button>}</form>
                {departments.length === 0 ? <div className="mt-4"><Empty text="No departments yet. Create one to organise sharing." /></div> : <div className="mt-4 divide-y divide-slate-100">{departments.map((department) => <div key={department.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold text-slate-900">{department.name}</div><div className="text-sm text-slate-600">{department.members.length ? `${department.members.length} teacher${department.members.length === 1 ? "" : "s"}` : "No teachers assigned yet"}</div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setDepartmentMembersOpen({ ...department, members: [...department.members] })} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Teachers</button><button type="button" onClick={() => { setEditingDepartment(department); setDepartmentName(department.name); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">Rename</button><button type="button" onClick={() => void deleteDepartment(department)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">Delete</button></div></div>)}</div>}
              </Panel>
            </div>

            <Panel title="Recent activity" subtitle="A simple record of recent school access changes.">
              {activity.length === 0 ? <Empty text="Activity will appear here as you manage school access." /> : <ol className="space-y-4">{activity.map((item) => <li key={item.id} className="flex gap-3"><div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500" /><div><div className="font-semibold text-slate-800">{activityLabel(item.action)}</div><div className="text-xs text-slate-500">{formatDate(item.created_at)}</div></div></li>)}</ol>}
            </Panel>
          </section>
        </>}
      </div>

      {inviteOpen && <Modal title="Invite a teacher" onClose={() => !actionKey && setInviteOpen(false)}><form onSubmit={inviteTeacher} className="space-y-4"><p className="text-sm leading-6 text-slate-600">We’ll send a secure invitation link. A teacher seat is checked when the invitation is accepted.</p><label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">Teacher email</span><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} autoComplete="email" className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setInviteOpen(false)} disabled={actionKey !== null} className="rounded-xl px-4 py-2 font-bold text-slate-600">Cancel</button><button type="submit" disabled={actionKey !== null} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">{actionKey === "invite" ? "Sending…" : "Send invitation"}</button></div></form></Modal>}
      {confirm && <Modal title={confirm.kind === "disable" ? "Disable teacher access?" : "Revoke invitation?"} onClose={() => !actionKey && setConfirm(null)}><p className="text-sm leading-6 text-slate-600">{confirm.kind === "disable" ? `${confirm.label} will no longer be able to use protected Elume features. Their classes and data will remain intact.` : `The invitation for ${confirm.label} will stop working immediately.`}</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirm(null)} disabled={actionKey !== null} className="rounded-xl px-4 py-2 font-bold text-slate-600">Cancel</button><button type="button" disabled={actionKey !== null} onClick={() => confirm.kind === "disable" ? teacherAction(teachers.find((teacher) => teacher.id === confirm.id)!, "deactivate") : invitationAction(confirm.id, "revoke")} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">{actionKey ? "Working…" : confirm.kind === "disable" ? "Disable teacher" : "Revoke invitation"}</button></div></Modal>}
      {departmentMembersOpen && <Modal title={`${departmentMembersOpen.name} teachers`} onClose={() => !actionKey && setDepartmentMembersOpen(null)}><p className="mb-3 text-sm text-slate-600">Select active teachers. A teacher can appear in several departments.</p><div className="max-h-72 space-y-2 overflow-auto">{teachers.filter((teacher) => teacher.is_active).map((teacher) => { const checked = departmentMembersOpen.members.some((member) => member.id === teacher.id); return <label key={teacher.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={checked} onChange={() => setDepartmentMembersOpen((current) => current ? { ...current, members: checked ? current.members.filter((member) => member.id !== teacher.id) : [...current.members, teacher] } : current)} /><span className="text-sm font-semibold text-slate-800">{`${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email}</span></label>; })}</div><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setDepartmentMembersOpen(null)} className="rounded-xl px-3 py-2 font-bold text-slate-600">Cancel</button><button type="button" onClick={() => void saveDepartmentMembers()} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">Save teachers</button></div></Modal>}
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) { return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm font-semibold text-slate-600">{label}</div><div className={`mt-2 text-3xl font-black ${accent}`}>{value}</div></div>; }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_35px_rgba(15,23,42,0.07)] sm:p-6"><h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-600">{subtitle}</p><div className="mt-4">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">{text}</div>; }
function StatusBadge({ active, label }: { active: boolean; label: string }) { return <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{label}</span>; }
function InvitationBadge({ status }: { status: Invitation["status"] }) { const styles = status === "pending" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"; return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${styles}`}>{status}</span>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[28px] border border-white/80 bg-white p-6 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-xl font-black text-slate-900">{title}</h2><button type="button" onClick={onClose} className="rounded-xl px-2 py-1 text-slate-500 hover:bg-slate-100">×</button></div>{children}</div></div>; }
