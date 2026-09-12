import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, clearToken, INVITATION_LOGIN_NOTICE_KEY } from "./api";
import elumeLogo from "./assets/ELogo2.png";
import LanguageSwitch from "./Components/LanguageSwitch";
import { useUiLanguage } from "./i18n/UiLanguageContext";

type InvitationInfo = {
  school_name: string;
  email: string;
  expires_at: string;
  has_existing_account: boolean;
  intended_role: "teacher" | "school_admin";
  inviter_name?: string | null;
  inviter_email?: string | null;
};

function passwordPolicyError(password: string, t: (key: string) => string) {
  if (password.length < 8) return t("register.passwordMinimum");
  if (!/[A-Z]/.test(password)) return t("register.passwordUppercase");
  if (!/[a-z]/.test(password)) return t("register.passwordLowercase");
  if (!/[0-9]/.test(password)) return t("register.passwordNumber");
  return null;
}

function inviterLabel(invitation: InvitationInfo, fallback: string) {
  const name = invitation.inviter_name?.trim() || "";
  const email = invitation.inviter_email?.trim() || "";
  if (name && email && name.toLowerCase() !== email.toLowerCase()) return `${name} (${email})`;
  return name || email || fallback;
}

function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), template);
}

export default function SchoolInvitationPage() {
  const { t } = useUiLanguage();
  const { token = "" } = useParams();
  const invitationToken = useMemo(() => token.trim(), [token]);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [existingPassword, setExistingPassword] = useState("");
  const isSchoolAdminInvitation = invitation?.intended_role === "school_admin";

  useEffect(() => {
    let cancelled = false;

    async function validateInvitation() {
      if (!invitationToken) {
        setError(t("schoolInvite.invalid"));
        setLoading(false);
        return;
      }
      try {
        const data = (await apiFetch(`/school-invite/${encodeURIComponent(invitationToken)}`)) as InvitationInfo;
        if (!cancelled) setInvitation(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || t("schoolInvite.unavailable"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void validateInvitation();
    return () => {
      cancelled = true;
    };
  }, [invitationToken]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!invitation) return;

    setError(null);
    setSuccess(null);
    if (invitation.has_existing_account) {
      if (!existingPassword) {
        setError(t("schoolInvite.existingPasswordRequired"));
        return;
      }
    } else {
      const passwordError = passwordPolicyError(password, t);
      if (passwordError) {
        setError(passwordError);
        return;
      }
      if (password !== confirmPassword) {
        setError(t("register.passwordMismatch"));
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiFetch(`/school-invite/${encodeURIComponent(invitationToken)}/accept`, {
        method: "POST",
        body: {
          email: invitation.email,
          first_name: firstName,
          last_name: lastName,
          password,
          existing_password: existingPassword,
        },
      });
      const successMessage = interpolate(
        t(isSchoolAdminInvitation ? "schoolInvite.successAdmin" : "schoolInvite.successTeacher"),
        { school: invitation.school_name },
      );
      try {
        sessionStorage.setItem(INVITATION_LOGIN_NOTICE_KEY, successMessage);
      } catch {
        // The login redirect still safely clears the existing session if storage is unavailable.
      }
      clearToken();
      setSuccess(successMessage);
      window.setTimeout(() => {
        window.location.replace(`${window.location.origin}${window.location.pathname}#/`);
      }, 1200);
    } catch (err: any) {
      setError(err?.message || t("schoolInvite.failure"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="absolute right-4 top-4 z-20"><LanguageSwitch /></div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[-60px] h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="absolute right-[-80px] top-24 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-7">
          <div className="mb-6 flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/70 bg-white/80 shadow-xl ring-1 ring-emerald-100 backdrop-blur">
              <img src={elumeLogo} alt="Elume" className="h-12 w-12 object-contain" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{t("schoolInvite.label")}</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">{t("schoolInvite.title")}</h1>
            </div>
          </div>

          {loading && <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{t("schoolInvite.checking")}</p>}

          {!loading && !invitation && error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

          {!loading && invitation && (
            <>
              <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-slate-700">
                <div className="font-bold text-slate-900">{invitation.school_name}</div>
                <div className="mt-2 leading-6">{interpolate(t(isSchoolAdminInvitation ? "schoolInvite.invitedAdmin" : "schoolInvite.invitedTeacher"), { inviter: inviterLabel(invitation, t("schoolInvite.defaultInviter")), school: invitation.school_name })}</div>
                <div className="mt-2 text-xs font-semibold text-emerald-700">{t("schoolInvite.sent")}</div>
              </div>

              <form className="space-y-4" onSubmit={submit}>
                {invitation.has_existing_account ? (
                  <>
                    <p className="text-sm leading-6 text-slate-600">{interpolate(t("schoolInvite.existingAccountHelp"), { action: t(isSchoolAdminInvitation ? "schoolInvite.joinSchoolAdmin" : "schoolInvite.joinSchool") })}</p>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-800">Existing Elume password</span>
                      <input type="password" value={existingPassword} onChange={(event) => setExistingPassword(event.target.value)} autoComplete="current-password" required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
                    </label>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-6 text-slate-600">{interpolate(t(isSchoolAdminInvitation ? "schoolInvite.setupAdmin" : "schoolInvite.setupTeacher"), { school: invitation.school_name })}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">{t("schoolInvite.firstName")}</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" /></label>
                      <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">{t("schoolInvite.lastName")}</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" /></label>
                    </div>
                    <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">{t("schoolInvite.password")}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" /></label>
                    <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">{t("schoolInvite.confirmPassword")}</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" /></label>
                    <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">{t("register.passwordHelp")}</p>
                  </>
                )}

                {success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</p>}
                {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

                <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3 text-base font-black text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? t("schoolInvite.accepting") : isSchoolAdminInvitation ? t("schoolInvite.acceptAdmin") : t("schoolInvite.accept")}
                </button>
              </form>
            </>
          )}

          <div className="mt-5 text-center text-sm text-slate-600"><Link to="/" className="font-semibold text-emerald-700 hover:underline">{t("schoolInvite.back")}</Link></div>
        </div>
      </div>
    </div>
  );
}
