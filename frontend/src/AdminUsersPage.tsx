import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, getToken } from "./api";

type UserRow = {
  id: number;
  email: string;
  created_at?: string | null;
  subscription_status?: string | null;
  billing_interval?: string | null;
  current_period_end?: string | null;
};

type OwnedClassSummary = {
  id: number;
  name: string;
  subject: string;
};

type DeleteConflictState = {
  email: string;
  classCount: number;
  classes: OwnedClassSummary[];
};

function statusPill(statusRaw?: string | null) {
  const status = (statusRaw || "inactive").trim().toLowerCase();

  if (status === "active") {
    return { label: "Active", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (status === "trialing") {
    return { label: "Trialing", className: "border-cyan-200 bg-cyan-50 text-cyan-800" };
  }
  if (status === "pending") {
    return { label: "Pending", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (status === "canceled" || status === "cancelled") {
    return { label: "Canceled", className: "border-slate-300 bg-slate-100 text-slate-700" };
  }
  if (status === "past_due" || status === "unpaid") {
    return { label: "Past due", className: "border-rose-200 bg-rose-50 text-rose-800" };
  }
  return { label: "Inactive", className: "border-slate-200 bg-slate-50 text-slate-700" };
}

function getEmailFromToken(): string | null {
  const t = localStorage.getItem("elume_token");
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return payload?.email ?? payload?.sub ?? payload?.username ?? null;
  } catch {
    return null;
  }
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<DeleteConflictState | null>(null);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const currentEmail = useMemo(() => getEmailFromToken(), []);
  const isSuperAdmin = (currentEmail || "").toLowerCase() === "admin@elume.ie";

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/admin/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      setError("Not authorised");
      return;
    }
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword.trim(),
        }),
      });

      setToast("User created ?");
      setNewEmail("");
      setNewPassword("");
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || "Failed to create user");
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 1800);
    }
  }

  async function resetUserPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiFetch("/admin/users/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: resetEmail.trim(),
          new_password: resetPassword.trim(),
        }),
      });

      setToast("Password reset ?");
      setResetEmail("");
      setResetPassword("");
    } catch (e: any) {
      setError(e?.message || "Failed to reset password");
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 1800);
    }
  }

  async function requestDeleteUser(email: string, hardDelete: boolean) {
    const token = getToken();
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, hard_delete: hardDelete }),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const detail = data?.detail;
      if (res.status === 409 && detail?.code === "USER_OWNS_CLASSES") {
        return {
          conflict: {
            email,
            classCount: Number(detail.class_count || 0),
            classes: Array.isArray(detail.classes) ? detail.classes : [],
          },
        };
      }

      const message =
        (typeof detail === "string" && detail) ||
        detail?.detail ||
        data?.message ||
        (typeof data === "string" && data) ||
        `Request failed (${res.status})`;
      throw new Error(message);
    }

    return { data };
  }

  async function deleteUser(email: string) {
    const targetEmail = (email || "").trim().toLowerCase();
    if (!targetEmail || targetEmail === "admin@elume.ie") return;

    setDeletingEmail(targetEmail);
    setDeleteModalError(null);
    setError(null);

    try {
      const result = await requestDeleteUser(targetEmail, false);
      if (result.conflict) {
        setDeleteConflict(result.conflict);
        return;
      }

      setUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== targetEmail));
      setToast(result.data?.message || `Deleted user ${targetEmail}`);
    } catch (e: any) {
      setError(e?.message || "Failed to delete user");
    } finally {
      setDeletingEmail(null);
      window.setTimeout(() => setToast(null), 1800);
    }
  }

  async function confirmHardDelete() {
    if (!deleteConflict) return;

    setDeletingEmail(deleteConflict.email.toLowerCase());
    setDeleteModalError(null);
    setError(null);

    try {
      const result = await requestDeleteUser(deleteConflict.email, true);
      setUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== deleteConflict.email.toLowerCase()));
      setToast(result.data?.message || `Deleted user ${deleteConflict.email}`);
      setDeleteConflict(null);
    } catch (e: any) {
      setDeleteModalError(e?.message || "Failed to hard delete user");
    } finally {
      setDeletingEmail(null);
      window.setTimeout(() => setToast(null), 1800);
    }
  }

  const card =
    "rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm";
  const input =
    "mt-1 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-300";
  const btn =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50";
  const primaryBtn =
    "rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 font-extrabold text-white shadow-sm disabled:opacity-60";

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-emerald-100 p-6">
        <div className="mx-auto max-w-4xl">
          <div className={card}>
            <div className="text-2xl font-extrabold tracking-tight text-slate-900">
              Super Admin
            </div>
            <div className="mt-2 text-sm text-red-700">
              You are not authorised to view this page.
            </div>
            <div className="mt-4">
              <button className={btn} onClick={() => navigate("/admin")}>
                Back to Teacher Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                Super Admin - User Management
              </div>
              <div className="text-sm text-slate-600">
                Create teacher accounts, reset passwords, and review billing status.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => navigate("/admin")}>
                Back to Teacher Admin
              </button>
              <button className={btn} onClick={loadUsers} disabled={loading || busy}>
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {toast && (
            <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {toast}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className={card}>
            <div className="text-lg font-extrabold text-slate-900">Create User</div>
            <div className="mt-1 text-sm text-slate-600">
              Add a new teacher account.
            </div>

            <form className="mt-4 space-y-3" onSubmit={createUser}>
              <label className="block text-sm font-semibold text-slate-800">
                Email
                <input
                  className={input}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="teacher@elume.ie"
                  autoComplete="off"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-slate-800">
                Temporary Password
                <input
                  className={input}
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete="off"
                  required
                />
              </label>

              <button type="submit" className={primaryBtn} disabled={busy}>
                {busy ? "Creating..." : "Create User"}
              </button>
            </form>
          </div>

          <div className={card}>
            <div className="text-lg font-extrabold text-slate-900">Reset Password</div>
            <div className="mt-1 text-sm text-slate-600">
              Set a new password for an existing user.
            </div>

            <form className="mt-4 space-y-3" onSubmit={resetUserPassword}>
              <label className="block text-sm font-semibold text-slate-800">
                User Email
                <input
                  className={input}
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="teacher@elume.ie"
                  autoComplete="off"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-slate-800">
                New Password
                <input
                  className={input}
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete="off"
                  required
                />
              </label>

              <button type="submit" className={primaryBtn} disabled={busy}>
                {busy ? "Saving..." : "Reset Password"}
              </button>
            </form>
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-slate-900">Current Users</div>
              <div className="text-sm text-slate-600">
                {loading ? "Loading users..." : `${users.length} user(s) found`}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-4 py-3 text-right w-[132px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const pill = statusPill(u.subscription_status);
                  const interval = (u.billing_interval || "").trim().toLowerCase();
                  const periodEnd = u.current_period_end ? new Date(u.current_period_end) : null;
                  const periodLabel =
                    periodEnd && !Number.isNaN(periodEnd.getTime())
                      ? periodEnd.toLocaleDateString()
                      : null;
                  const isProtected = u.email.toLowerCase() === "admin@elume.ie";
                  const isDeleting = deletingEmail === u.email.toLowerCase();

                  return (
                    <tr
                      key={u.id}
                      className="rounded-2xl border-2 border-slate-200 bg-slate-50 text-sm text-slate-800"
                    >
                      <td className="px-3 py-3 font-semibold">{u.id}</td>
                      <td className="px-3 py-3 font-semibold">{u.email}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] ${pill.className}`}
                          >
                            {pill.label}
                          </span>
                          {interval ? (
                            <div className="text-[11px] font-semibold capitalize text-slate-500">
                              {interval}
                              {periodLabel ? ` • until ${periodLabel}` : ""}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex justify-end">
                          {isProtected ? (
                            <span className="text-xs font-semibold text-slate-400">Protected</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteUser(u.email)}
                              disabled={deletingEmail === u.email.toLowerCase()}
                              className="inline-flex min-w-[88px] items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {deleteConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
            <div className="w-full max-w-lg rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="text-xl font-black tracking-tight text-slate-900">This user still owns classes</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                Deleting this account will also permanently remove the classes and their owned data.
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{deleteConflict.classCount}</span> class{deleteConflict.classCount === 1 ? "" : "es"} will be removed.
              </div>
              {deleteConflict.classes.length > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Owned classes</div>
                  <div className="mt-3 space-y-2">
                    {deleteConflict.classes.map((cls) => (
                      <div key={cls.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{cls.name}</span>
                        <span className="text-xs font-semibold text-slate-500">{cls.subject}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {deleteModalError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {deleteModalError}
                </div>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (deletingEmail) return;
                    setDeleteConflict(null);
                    setDeleteModalError(null);
                  }}
                  className="rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  disabled={!!deletingEmail}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmHardDelete}
                  className="rounded-full border border-rose-300 bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!!deletingEmail}
                >
                  {deletingEmail === deleteConflict.email.toLowerCase() ? "Deleting..." : "Hard Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
