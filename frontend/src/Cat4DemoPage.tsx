import { useState } from "react";
import Cat4InsightsPage from "./Cat4InsightsPage";
import { apiFetch } from "./api";
import ELogo2 from "./assets/ELogo2.png";

type DemoEnquiryResponse = {
  success?: boolean;
  message?: string;
};

export default function Cat4DemoPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");

  function openModal() {
    setSubmitError(null);
    setSubmitSuccess(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
  }

  async function submitEnquiry() {
    if (!schoolName.trim() || !contactName.trim() || !role.trim() || !email.trim()) {
      setSubmitError("Please complete school name, contact name, role, and email.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const resp = (await apiFetch("/demo-enquiries", {
        method: "POST",
        body: JSON.stringify({
          school_name: schoolName.trim(),
          contact_name: contactName.trim(),
          role: role.trim(),
          email: email.trim(),
          phone_number: phoneNumber.trim() || null,
          message: message.trim() || null,
        }),
      })) as DemoEnquiryResponse;
      setSubmitSuccess(resp?.message || "Thanks. We have your enquiry and will be in touch shortly.");
      setSchoolName("");
      setContactName("");
      setRole("");
      setEmail("");
      setPhoneNumber("");
      setMessage("");
    } catch (e: any) {
      setSubmitError(e?.message || "Your enquiry could not be sent just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.14),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f7fffd_0%,_#f8fafc_38%,_#ffffff_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={openModal}
              className="rounded-2xl p-2 transition hover:bg-slate-50"
              title="Book a CAT4 demo"
            >
              <img src={ELogo2} alt="Elume" className="h-10 w-10 object-contain" />
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openModal}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e,_#06b6d4)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(13,148,136,0.22)] transition hover:brightness-105"
              >
                Book a 15-minute demo
              </button>
              <a
                href="https://www.elume.ie"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Visit Elume.ie
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[36px] border border-emerald-100 bg-[linear-gradient(135deg,_rgba(16,185,129,0.12),_rgba(6,182,212,0.10)_50%,_rgba(139,92,246,0.08))] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="max-w-4xl">
            <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">Public Demo</div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Demo CAT4 Analysis Dashboard</h1>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700 md:text-[15px]">
              <p>This page is for demonstration purposes only. All student names, scores, results and school data shown here are generated demo data and do not relate to any real students or school.</p>
              <p>CAT4 data should be used alongside teacher judgement, attainment data and school context. Elume provides an interpretation layer to help schools identify patterns and support decision-making.</p>
              <p>Subject alignments are indicative, not prescriptive.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openModal}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e,_#06b6d4)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(13,148,136,0.22)] transition hover:brightness-105"
              >
                Book a 15-minute demo
              </button>
              <a
                href="https://www.elume.ie"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border-2 border-white/80 bg-white/90 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white"
              >
                Visit Elume.ie
              </a>
            </div>
          </div>
        </div>
      </div>

      <Cat4InsightsPage publicDemo />

      <div className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
        <div className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-xl font-extrabold tracking-tight text-slate-900">Want to see this with your own CAT4 context and leadership questions?</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                Book a short walkthrough to see how Elume can help your school turn CAT4 data into clear, practical insights for leadership, AEN teams, year heads and teachers.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openModal}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e,_#06b6d4)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(13,148,136,0.22)] transition hover:brightness-105"
              >
                Book a 15-minute demo
              </button>
              <a
                href="https://www.elume.ie"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Visit Elume.ie
              </a>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[34px] border border-white/80 bg-white p-6 shadow-[0_32px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-xl">
                <div className="text-2xl font-extrabold tracking-tight text-slate-900">Book a CAT4 Demo for Your School</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  See how Elume can help your school turn CAT4 data into clear, practical insights for leadership, AEN teams, year heads and teachers.
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {submitSuccess ? (
              <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="text-lg font-bold text-emerald-900">Thanks.</div>
                <div className="mt-2 text-sm text-emerald-900">{submitSuccess}</div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    School name
                    <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Contact name
                    <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Role
                    <input value={role} onChange={(e) => setRole(e.target.value)} className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" placeholder="e.g. Principal, Deputy Principal, AEN Coordinator" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Email
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                    Phone number optional
                    <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                    Message optional
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[120px] rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-sm text-slate-800" />
                  </label>
                </div>

                {submitError && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {submitError}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitEnquiry()}
                    disabled={submitting}
                    className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e,_#06b6d4)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(13,148,136,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Sending..." : "Send Enquiry"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
