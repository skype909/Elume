import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

type UserRow = {
  id: number;
  email: string;
  created_at?: string | null;
};

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

      setToast("User created ✓");
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

      setToast("Password reset ✓");
      setResetEmail("");
      setResetPassword("");
    } catch (e: any) {
      setError(e?.message || "Failed to reset password");
    } finally {
      setBusy(false);
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
                Super Admin — User Management
              </div>
              <div className="text-sm text-slate-600">
                Create teacher accounts and reset passwords without SSH.
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
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50 text-sm text-slate-800"
                  >
                    <td className="px-3 py-3 font-semibold">{u.id}</td>
                    <td className="px-3 py-3 font-semibold">{u.email}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}

                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}