import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import SchoolBrand from "./Components/SchoolBrand";

type SchoolSummary = {
  id: number;
  name: string;
  status: "active" | "suspended" | "inactive";
  seat_limit: number;
  active_teacher_count: number;
  school_admin_count: number;
  pending_invitation_count: number;
  created_at: string;
  slug?: string | null;
  logo_url?: string | null;
};

type SchoolAdmin = { id: number; email: string; first_name?: string | null; last_name?: string | null; is_active: boolean };
type SchoolDetail = SchoolSummary & { available_seats: number; school_admins: SchoolAdmin[] };

function friendlyError(error: unknown) {
  const message = String((error as { message?: string })?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("no elume account")) return "No existing Elume account was found for that email.";
  if (lower.includes("inactive")) return "That account is inactive and cannot be assigned.";
  if (lower.includes("verify")) return "That account must verify its email before it can be assigned.";
  if (lower.includes("already belongs")) return "That account is already attached to another school.";
  if (lower.includes("platform admin")) return "A platform admin cannot be assigned as a School Admin.";
  if (lower.includes("already exists")) return "A school with that name already exists.";
  if (lower.includes("platform admin access") || lower.includes("permission")) return "You do not have permission to manage Elume schools.";
  return message || "Something went wrong. Please try again.";
}

function seatLabel(school: SchoolSummary) {
  return `${school.active_teacher_count} / ${school.seat_limit}`;
}

function suggestSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export default function PlatformAdminSchoolsPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<SchoolSummary[]>([]);
  const [selected, setSelected] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [inviteAdminOpen, setInviteAdminOpen] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [seatLimit, setSeatLimit] = useState("20");
  const [adminEmail, setAdminEmail] = useState("");
  const [inviteAdminEmail, setInviteAdminEmail] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [action, setAction] = useState<"create" | "assign" | "invite-admin" | "branding" | "logo" | null>(null);

  const loadSchools = useCallback(async () => {
    const data = (await apiFetch("/platform-admin/schools")) as SchoolSummary[];
    setSchools(data);
  }, []);

  const openSchool = useCallback(async (schoolId: number) => {
    const data = (await apiFetch(`/platform-admin/schools/${schoolId}`)) as SchoolDetail;
    setSelected(data);
    setSchoolSlug(data.slug || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialise() {
      setLoading(true);
      setError(null);
      try {
        const me = (await apiFetch("/auth/me")) as { role?: string };
        if (me.role !== "platform_admin") {
          navigate("/", { replace: true });
          return;
        }
        await loadSchools();
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialise();
    return () => { cancelled = true; };
  }, [loadSchools, navigate]);

  async function selectSchool(schoolId: number) {
    setError(null);
    try {
      await openSchool(schoolId);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function refresh() {
    setError(null);
    try {
      await loadSchools();
      if (selected) await openSchool(selected.id);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function createSchool(event: React.FormEvent) {
    event.preventDefault();
    const name = schoolName.trim();
    const parsedSeatLimit = Number(seatLimit);
    if (!name || !Number.isInteger(parsedSeatLimit) || parsedSeatLimit < 0) {
      setError("Enter a school name and a whole-number teacher seat limit of zero or more.");
      return;
    }
    setAction("create");
    setError(null);
    try {
      const created = (await apiFetch("/platform-admin/schools", { method: "POST", body: { name, seat_limit: parsedSeatLimit, slug: schoolSlug } })) as SchoolSummary;
      setCreateOpen(false);
      setSchoolName("");
      setSchoolSlug("");
      setSeatLimit("20");
      setNotice(`${created.name} has been created. Assign its first School Admin to complete provisioning.`);
      await loadSchools();
      await openSchool(created.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAction(null);
    }
  }

  async function saveBranding(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !schoolSlug.trim()) return;
    setAction("branding");
    setError(null);
    try {
      const result = (await apiFetch(`/platform-admin/schools/${selected.id}/branding`, { method: "PATCH", body: { slug: schoolSlug } })) as { slug?: string };
      setNotice(`Branding slug saved as ${result.slug || schoolSlug}.`);
      await loadSchools();
      await openSchool(selected.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAction(null);
    }
  }

  async function uploadLogo(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !logoFile) return;
    setAction("logo");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", logoFile);
      await apiFetch(`/platform-admin/schools/${selected.id}/logo`, { method: "POST", body });
      setLogoFile(null);
      setNotice("School logo updated.");
      await loadSchools();
      await openSchool(selected.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAction(null);
    }
  }

  async function assignAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !adminEmail.trim()) return;
    setAction("assign");
    setError(null);
    try {
      const result = (await apiFetch(`/platform-admin/schools/${selected.id}/assign-admin`, {
        method: "POST",
        body: { email: adminEmail.trim().toLowerCase() },
      })) as { message: string };
      setAssignOpen(false);
      setAdminEmail("");
      setNotice(result.message);
      await loadSchools();
      await openSchool(selected.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAction(null);
    }
  }

  async function inviteSchoolAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !inviteAdminEmail.trim()) return;
    setAction("invite-admin");
    setError(null);
    try {
      const result = (await apiFetch(`/platform-admin/schools/${selected.id}/admin-invitations`, {
        method: "POST",
        body: { email: inviteAdminEmail.trim().toLowerCase() },
      })) as { message: string };
      setInviteAdminOpen(false);
      setInviteAdminEmail("");
      setNotice(result.message);
      await loadSchools();
      await openSchool(selected.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Elume Platform Admin</div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Schools</h1>
            <p className="mt-1 text-sm text-slate-600">Provision school access, teacher capacity, and the first School Admin.</p>
          </div>
          <button type="button" onClick={() => { setSchoolName(""); setSchoolSlug(""); setCreateOpen(true); }} disabled={loading} className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-base font-black text-white shadow-lg transition hover:shadow-xl disabled:opacity-60">Create School</button>
        </header>

        {error && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"><span>{error}</span><button type="button" onClick={refresh} className="rounded-xl border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700">Retry</button></div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}

        {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">Loading schools…</div> : (
          <div className="grid gap-7 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_35px_rgba(15,23,42,0.07)] sm:p-6">
              <h2 className="text-xl font-black tracking-tight text-slate-900">All schools</h2>
              <p className="mt-1 text-sm text-slate-600">Select a school to review its provisioning status.</p>
              <div className="mt-5 grid gap-3">
                {schools.length === 0 ? <Empty text="No schools have been provisioned yet." /> : schools.map((school) => (
                  <button key={school.id} type="button" onClick={() => selectSchool(school.id)} className={`rounded-2xl border p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 ${selected?.id === school.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><SchoolBrand name={school.name} logoUrl={school.logo_url} compact /><div className="mt-1 text-sm text-slate-600">{seatLabel(school)} teacher seats used</div></div><StatusBadge status={school.status} /></div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><Metric label="School Admins" value={school.school_admin_count} /><Metric label="Pending invites" value={school.pending_invitation_count} /><Metric label="Available seats" value={Math.max(school.seat_limit - school.active_teacher_count, 0)} /></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_35px_rgba(15,23,42,0.07)] sm:p-6">
              {!selected ? <Empty text="Select a school to view its detail and assign its first School Admin." /> : <>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">School detail</div><div className="mt-1"><SchoolBrand name={selected.name} logoUrl={selected.logo_url} /></div></div><StatusBadge status={selected.status} /></div>
                <div className="mt-5 grid grid-cols-2 gap-3"><Metric label="Teacher seats" value={`${selected.active_teacher_count} / ${selected.seat_limit}`} /><Metric label="Available seats" value={selected.available_seats} /><Metric label="School Admins" value={selected.school_admins.length} /><Metric label="Pending invites" value={selected.pending_invitation_count} /></div>
                <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="font-black text-slate-900">School branding</h3><form className="mt-3 space-y-3" onSubmit={saveBranding}><Field label="Stable school slug"><input required value={schoolSlug} onChange={(event) => setSchoolSlug(event.target.value)} placeholder="carlowcollege" className="input" /><span className="mt-1 block text-xs text-slate-500">Used for future school subdomains; letters, numbers, and hyphens only.</span></Field><button type="submit" disabled={action !== null} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">{action === "branding" ? "Saving…" : "Save slug"}</button></form><form className="mt-4 border-t border-slate-100 pt-4" onSubmit={uploadLogo}><Field label="School logo"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} className="input" /><span className="mt-1 block text-xs text-slate-500">PNG, JPEG, or WebP up to 2 MB.</span></Field><button type="submit" disabled={!logoFile || action !== null} className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800 disabled:opacity-50">{action === "logo" ? "Uploading…" : "Upload logo"}</button></form></div>
                <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="font-black text-slate-900">School Admins</h3>{selected.school_admins.length === 0 ? <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="font-bold text-violet-900">Assign the first School Admin</div><p className="mt-1 text-sm text-violet-800">Attach an existing verified account, or invite someone to create a new School Admin account.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setAssignOpen(true)} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">Assign existing account</button><button type="button" onClick={() => setInviteAdminOpen(true)} className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100">Invite new School Admin</button></div></div> : <><div className="mt-3 space-y-2">{selected.school_admins.map((admin) => <div key={admin.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="font-bold text-slate-900">{`${admin.first_name || ""} ${admin.last_name || ""}`.trim() || "School Admin"}</div><div className="text-sm text-slate-600">{admin.email}</div></div>)}</div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setAssignOpen(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100">Assign existing account</button><button type="button" onClick={() => setInviteAdminOpen(true)} className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100">Invite new School Admin</button></div></>}</div>
              </>}</section>
          </div>
        )}
      </div>

      {createOpen && <Modal title="Create a school" onClose={() => !action && setCreateOpen(false)}><form className="space-y-4" onSubmit={createSchool}><p className="text-sm leading-6 text-slate-600">Create the school first, then assign its first School Admin from an existing Elume account.</p><Field label="School name"><input required value={schoolName} onChange={(event) => { const name = event.target.value; setSchoolName(name); setSchoolSlug(suggestSlug(name)); }} className="input" autoFocus /></Field><Field label="Stable school slug"><input required value={schoolSlug} onChange={(event) => setSchoolSlug(event.target.value)} placeholder="carlowcollege" className="input" /><span className="mt-1 block text-xs text-slate-500">You can edit this before creating the school.</span></Field><Field label="Teacher seat limit"><input required type="number" min="0" step="1" value={seatLimit} onChange={(event) => setSeatLimit(event.target.value)} className="input" /></Field><ModalActions disabled={action === "create"} submitLabel={action === "create" ? "Creating…" : "Create School"} onCancel={() => setCreateOpen(false)} /></form></Modal>}
      {assignOpen && selected && <Modal title="Assign School Admin" onClose={() => !action && setAssignOpen(false)}><form className="space-y-4" onSubmit={assignAdmin}><p className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">This will attach the existing account to <strong>{selected.name}</strong> and give it School Admin access. Its password, classes, billing, and CAT4 access will not change.</p><Field label="Existing Elume account email"><input required type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} autoComplete="email" className="input" autoFocus /></Field><ModalActions disabled={action === "assign"} submitLabel={action === "assign" ? "Assigning…" : "Assign School Admin"} onCancel={() => setAssignOpen(false)} /></form></Modal>}
      {inviteAdminOpen && selected && <Modal title="Invite new School Admin" onClose={() => !action && setInviteAdminOpen(false)}><form className="space-y-4" onSubmit={inviteSchoolAdmin}><p className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">They’ll receive an invitation to create their Elume account and join <strong>{selected.name}</strong> as a School Admin.</p><Field label="New School Admin email"><input required type="email" value={inviteAdminEmail} onChange={(event) => setInviteAdminEmail(event.target.value)} autoComplete="email" className="input" autoFocus /></Field><ModalActions disabled={action === "invite-admin"} submitLabel={action === "invite-admin" ? "Sending…" : "Send invitation"} onCancel={() => setInviteAdminOpen(false)} /></form></Modal>}
    </main>
  );
}

function StatusBadge({ status }: { status: SchoolSummary["status"] }) {
  const style = status === "active" ? "bg-emerald-100 text-emerald-800" : status === "suspended" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${style}`}>{status}</span>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-0.5 font-black text-slate-800">{value}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">{text}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">{label}</span><div className="[&>input]:w-full [&>input]:rounded-2xl [&>input]:border [&>input]:border-slate-200 [&>input]:px-4 [&>input]:py-3 [&>input]:outline-none [&>input]:focus:border-emerald-400 [&>input]:focus:ring-4 [&>input]:focus:ring-emerald-100">{children}</div></label>; }
function ModalActions({ disabled, submitLabel, onCancel }: { disabled: boolean; submitLabel: string; onCancel: () => void }) { return <div className="flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={disabled} className="rounded-xl px-4 py-2 font-bold text-slate-600 disabled:opacity-50">Cancel</button><button type="submit" disabled={disabled} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{submitLabel}</button></div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[28px] border border-white/80 bg-white p-6 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-xl font-black text-slate-900">{title}</h2><button type="button" onClick={onClose} className="rounded-xl px-2 py-1 text-slate-500 hover:bg-slate-100">×</button></div>{children}</div></div>; }
