import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiFetch } from "./api";

type GrantType = "pilot" | "reviewer" | "internal" | "complimentary" | "promotional_annual";
type AccessFilter = "all" | "allowed" | "denied";
type Grant = { id: number; grant_type: GrantType; reason: string; starts_at: string; expires_at?: string | null; granted_by_user_id: number; revoked_at?: string | null; revoked_by_user_id?: number | null; revocation_reason?: string | null; created_at: string };
type AccessUser = { user_id: number; email: string; role: string; is_active: boolean; email_verified: boolean; school_id?: number | null; school_name?: string | null; school_active?: boolean; subscription_status?: string | null; trial_ends_at?: string | null; paid_through_at?: string | null; payment_recovery_deadline_at?: string | null; active_grants: Grant[]; allowed: boolean; reason: string; access_until?: string | null };
type Report = { evaluated_at: string; total: number; matched: number; reason_counts: Record<string, number>; page: number; page_size: number; users: AccessUser[] };

const grantOptions: { value: GrantType; label: string; help: string }[] = [
  { value: "pilot", label: "Pilot access", help: "Time-limited access for a pilot." },
  { value: "reviewer", label: "Reviewer access", help: "Time-limited access for review." },
  { value: "internal", label: "Internal access", help: "Time-limited access for an internal colleague." },
  { value: "complimentary", label: "Complimentary access", help: "Time-limited complimentary access." },
  { value: "promotional_annual", label: "Promotional annual access", help: "Ends on 30 September 2027." },
];

export function accessReason(reason: string) {
  const labels: Record<string, string> = {
    platform_admin: "Platform administrator", active_school: "School access", trial_active: "Free trial",
    paid_subscription_active: "Paid subscription", payment_recovery_active: "Payment recovery period",
    pilot: "Pilot access", reviewer: "Reviewer access", internal: "Internal access", complimentary: "Complimentary access", promotional_annual: "Promotional annual access",
    account_inactive: "Account inactive", email_unverified: "Email not verified",
    subscription_canceled: "No current access", subscription_unpaid: "No current access", subscription_paused: "No current access", subscription_incomplete: "No current access", subscription_pending: "No current access", subscription_inactive: "No current access", subscription_past_due: "No current access", subscription_trialing: "No current access",
  };
  return labels[reason] || (reason.startsWith("subscription_") ? "No current access" : "Access needs review");
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" });
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Please log in again.";
    if (error.status === 403) return "Platform-admin access is required for Access & Billing.";
    const code = (error.response as { detail?: { code?: string } })?.detail?.code;
    if (code === "overlapping_grant_requires_resolution") return "This overlaps an existing grant of the same type. Review the existing access first.";
    if (code === "grant_already_revoked") return "This grant has already been revoked with different details.";
  }
  return "We could not load access information. Please try again.";
}

function Badge({ allowed, text }: { allowed?: boolean; text: string }) {
  const style = allowed === true ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : allowed === false ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-cyan-50 text-cyan-800 ring-cyan-200";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${style}`}>{text}</span>;
}

function grantState(grant: Grant) {
  if (grant.revoked_at) return "Revoked";
  const now = Date.now();
  if (new Date(grant.starts_at).getTime() > now) return "Starts later";
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= now) return "Expired";
  return "Current";
}

export default function PlatformAdminEntitlementsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AccessFilter>("all");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AccessUser | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [grantType, setGrantType] = useState<GrantType>("pilot");
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const [revoking, setRevoking] = useState<Grant | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReport = useCallback(async (nextFilter: AccessFilter, page = 1) => {
    setLoading(true); setError(null);
    try { setReport(await apiFetch(`/platform-admin/entitlements?access=${nextFilter}&page=${page}&page_size=25`) as Report); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { let cancelled = false; (async () => {
    try {
      const me = await apiFetch("/auth/me") as { role?: string };
      if (me.role !== "platform_admin") { navigate("/", { replace: true }); return; }
      if (!cancelled) await loadReport("all");
    } catch (err) { if (!cancelled) { setLoading(false); setError(errorMessage(err)); } }
  })(); return () => { cancelled = true; }; }, [loadReport, navigate]);

  const openUser = async (user: AccessUser) => {
    setSelected(user); setModalLoading(true); setActionError(null); setActionNotice(null); setGrants([]); setReason(""); setExpiry(""); setGrantType("pilot");
    try { const data = await apiFetch(`/platform-admin/users/${user.user_id}/access-grants`) as { grants: Grant[] }; setGrants(data.grants); }
    catch (err) { setActionError(errorMessage(err)); }
    finally { setModalLoading(false); }
  };
  const closeModal = () => { if (!submitting) { setSelected(null); setRevoking(null); } };
  const refreshSelected = async () => { if (!selected) return; const data = await apiFetch(`/platform-admin/users/${selected.user_id}/access-grants`) as { grants: Grant[] }; setGrants(data.grants); await loadReport(filter, report?.page || 1); };
  const submitGrant = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    const trimmed = reason.trim();
    if (!trimmed) { setActionError("Please add a meaningful reason for this access."); return; }
    if (grantType !== "promotional_annual" && (!expiry || new Date(expiry).getTime() <= Date.now())) { setActionError("Choose a future expiry date for this access."); return; }
    setSubmitting(true); setActionError(null);
    try {
      const body: Record<string, string> = { grant_type: grantType, reason: trimmed };
      if (grantType !== "promotional_annual") body.expires_at = new Date(expiry).toISOString();
      const result = await apiFetch(`/platform-admin/users/${selected.user_id}/access-grants`, { method: "POST", body }) as { changed: boolean };
      setReason(""); setExpiry(""); await refreshSelected(); setActionNotice(result.changed ? "Access grant recorded." : "That exact grant already exists; no duplicate was created.");
    } catch (err) { setActionError(errorMessage(err)); }
    finally { setSubmitting(false); }
  };
  const submitRevoke = async (event: FormEvent) => {
    event.preventDefault(); if (!revoking) return;
    if (!revokeReason.trim()) { setActionError("Please explain why this grant is being revoked."); return; }
    setSubmitting(true); setActionError(null);
    try { const result = await apiFetch(`/platform-admin/access-grants/${revoking.id}/revoke`, { method: "POST", body: { reason: revokeReason.trim() } }) as { changed: boolean }; setRevoking(null); setRevokeReason(""); await refreshSelected(); setActionNotice(result.changed ? "Grant revoked; its history has been retained." : "This grant was already revoked; no duplicate change was made."); }
    catch (err) { setActionError(errorMessage(err)); }
    finally { setSubmitting(false); }
  };
  const pages = useMemo(() => report ? Math.max(1, Math.ceil(report.matched / report.page_size)) : 1, [report]);

  return <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-4 py-8 sm:px-7">
    <div className="mx-auto max-w-7xl">
      <button onClick={() => navigate("/platform-admin/schools")} className="mb-5 text-sm font-bold text-teal-700 hover:text-teal-900">← Platform Admin</button>
      <section className="rounded-[30px] border border-cyan-100 bg-white p-6 shadow-sm sm:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.16em] text-teal-700">Platform Admin</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Access &amp; Billing</h1><p className="mt-2 max-w-2xl text-slate-600">A clear, local view of each account’s current access basis. Use this to review access and record time-limited complimentary support.</p></div><button onClick={() => void loadReport(filter, report?.page || 1)} className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 font-bold text-cyan-900 hover:bg-cyan-100">Refresh</button></div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-teal-50 p-5"><p className="text-sm font-bold text-teal-800">Accounts evaluated</p><p className="mt-1 text-3xl font-black text-slate-900">{report?.total ?? "—"}</p></div><div className="rounded-2xl bg-violet-50 p-5"><p className="text-sm font-bold text-violet-800">Shown in this view</p><p className="mt-1 text-3xl font-black text-slate-900">{report?.matched ?? "—"}</p></div></div>
        <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Access filter">{([['all','All accounts'],['allowed','Allowed'],['denied','No current access']] as [AccessFilter,string][]).map(([value,label]) => <button key={value} onClick={() => { setFilter(value); void loadReport(value,1); }} className={`rounded-full px-4 py-2 text-sm font-bold ${filter===value ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>)}</div>
        {error && <div role="alert" className="mt-6 rounded-2xl bg-rose-50 p-4 text-rose-900"><p className="font-bold">We need a moment</p><p className="mt-1 text-sm">{error}</p><button onClick={() => void loadReport(filter, report?.page || 1)} className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-rose-200">Try again</button></div>}
        {loading && <div aria-label="Loading access accounts" className="mt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>}
        {!loading && !error && report?.users.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600">No accounts match this view.</div>}
        {!loading && !error && report && report.users.length > 0 && <><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-4">Account</th><th className="p-4">Current access</th><th className="p-4">School &amp; timing</th><th className="p-4"><span className="sr-only">Actions</span></th></tr></thead><tbody>{report.users.map(user => <tr key={user.user_id} className="border-t border-slate-100"><td className="p-4"><p className="font-bold text-slate-900">{user.email}</p><p className="mt-1 text-xs text-slate-500">{user.role.replace('_',' ')} · {user.is_active ? 'Active account' : 'Inactive account'} · {user.email_verified ? 'Verified email' : 'Email not verified'}</p></td><td className="p-4"><Badge allowed={user.allowed} text={accessReason(user.reason)} /><p className="mt-2 text-xs text-slate-500">{user.subscription_status || 'No local subscription status'}</p></td><td className="p-4 text-slate-700"><p>{user.school_name || 'No school attached'}{user.school_name && !user.school_active ? ' (inactive)' : ''}</p><p className="mt-1 text-xs text-slate-500">Until: {formatDate(user.access_until || user.trial_ends_at || user.paid_through_at || user.payment_recovery_deadline_at)}</p></td><td className="p-4 text-right"><button onClick={() => void openUser(user)} className="rounded-xl bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800">Manage access</button></td></tr>)}</tbody></table></div><div className="space-y-3 p-3 md:hidden">{report.users.map(user => <article key={user.user_id} className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-900">{user.email}</p><div className="mt-2"><Badge allowed={user.allowed} text={accessReason(user.reason)} /></div><p className="mt-2 text-sm text-slate-600">{user.school_name || 'No school attached'} · Until {formatDate(user.access_until)}</p><button onClick={() => void openUser(user)} className="mt-3 rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold text-white">Manage access</button></article>)}</div></div><div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {report.page} of {pages}</span><div className="flex gap-2"><button disabled={report.page<=1} onClick={() => void loadReport(filter,report.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={report.page>=pages} onClick={() => void loadReport(filter,report.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div></>}
      </section>
    </div>
    {selected && <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/40 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-label="Manage access" className="mx-auto my-8 max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-wide text-teal-700">Manage access</p><h2 className="mt-1 text-xl font-black text-slate-900">{selected.email}</h2><p className="mt-1 text-sm text-slate-600">This changes access grants only. It does not change billing, roles, school membership or account status.</p></div><button onClick={closeModal} className="rounded-lg px-3 py-2 font-bold text-slate-600">Close</button></div>{actionError && <div role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{actionError}</div>}{actionNotice && <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{actionNotice}</div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><section><h3 className="font-black text-slate-900">Grant history</h3>{modalLoading ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100" /> : grants.length ? <ul className="mt-3 space-y-3">{grants.map(grant => <li key={grant.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-slate-900">{grantOptions.find(x=>x.value===grant.grant_type)?.label || grant.grant_type}</strong><Badge text={grantState(grant)} /></div><p className="mt-2 text-sm text-slate-700">{grant.reason}</p><p className="mt-2 text-xs text-slate-500">{formatDate(grant.starts_at)} → {formatDate(grant.expires_at)} · Recorded by user #{grant.granted_by_user_id}</p>{grant.revoked_at ? <p className="mt-1 text-xs text-rose-700">Revoked {formatDate(grant.revoked_at)}{grant.revocation_reason ? `: ${grant.revocation_reason}` : ''}</p> : <button onClick={() => {setRevoking(grant);setRevokeReason('');}} className="mt-3 text-sm font-bold text-rose-700">Revoke grant</button>}</li>)}</ul> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No grants have been recorded for this account.</p>}</section>
      <form onSubmit={submitGrant} className="rounded-2xl bg-cyan-50 p-5"><h3 className="font-black text-slate-900">Add time-limited access</h3><label className="mt-4 block text-sm font-bold text-slate-700">Access type<select value={grantType} onChange={e=>setGrantType(e.target.value as GrantType)} disabled={submitting} className="mt-1 w-full rounded-xl border border-cyan-200 bg-white p-3">{grantOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className="mt-2 text-xs text-slate-600">{grantOptions.find(x=>x.value===grantType)?.help}</p><label className="mt-4 block text-sm font-bold text-slate-700">Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} disabled={submitting} className="mt-1 w-full rounded-xl border border-cyan-200 bg-white p-3" rows={3} /></label>{grantType === 'promotional_annual' ? <p className="mt-4 rounded-xl bg-white p-3 text-sm text-teal-900">Promotional annual access ends on <strong>30 September 2027</strong>. This date is set safely by Elume.</p> : <label className="mt-4 block text-sm font-bold text-slate-700">Expiry<input type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)} disabled={submitting} className="mt-1 w-full rounded-xl border border-cyan-200 bg-white p-3" /></label>}<button disabled={submitting} className="mt-5 w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-50">{submitting ? 'Saving…' : 'Record access grant'}</button></form></div>
      {revoking && <form onSubmit={submitRevoke} className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5"><h3 className="font-black text-rose-900">Revoke this grant?</h3><p className="mt-1 text-sm text-rose-800">The grant history will be retained.</p><label className="mt-3 block text-sm font-bold text-rose-900">Revocation reason<textarea value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} disabled={submitting} className="mt-1 w-full rounded-xl border border-rose-200 bg-white p-3" rows={2} /></label><div className="mt-4 flex gap-3"><button type="button" onClick={()=>setRevoking(null)} className="rounded-xl bg-white px-4 py-2 font-bold text-slate-700">Cancel</button><button disabled={submitting} className="rounded-xl bg-rose-700 px-4 py-2 font-bold text-white disabled:opacity-50">{submitting ? 'Revoking…' : 'Confirm revocation'}</button></div></form>}</div></div>}
  </main>;
}
