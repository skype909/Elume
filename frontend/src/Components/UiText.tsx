import { useEffect, useState } from "react";
import InlineNotice from "./InlineNotice";
import { userFacingError } from "../userFacingError";
import { useUiLanguage } from "../i18n/UiLanguageContext";
import { translationSource } from "../i18n/translations";

type UiTextProps = {
  translationKey: string;
  className?: string;
};

export default function UiText({ translationKey, className }: UiTextProps) {
  const { language, t, isGaeilgeReviewer, saveGaeilgeOverride } = useUiLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = translationSource(translationKey);
  const current = t(translationKey);
  const canReview = language === "ga" && isGaeilgeReviewer;

  useEffect(() => {
    if (isOpen) setDraft(current);
  }, [current, isOpen]);

  if (!canReview) return <span className={className}>{current}</span>;

  async function save() {
    const value = draft.trim();
    if (!value || value === current || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveGaeilgeOverride(translationKey, value, source.gaeilge);
      setIsOpen(false);
    } catch (caught) {
      setError(userFacingError(caught, "We couldn’t save that Gaeilge translation just now. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        <span>{current}</span>
        <button
          type="button"
          onClick={() => { setError(null); setIsOpen(true); }}
          className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] text-emerald-700 opacity-65 transition hover:bg-emerald-100 hover:text-emerald-900 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          aria-label={`Review Gaeilge translation: ${translationKey}`}
          title="Review Gaeilge translation"
        >
          ✎
        </button>
      </span>

      {isOpen && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/30 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="gaeilge-review-title" className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="gaeilge-review-title" className="text-lg font-extrabold tracking-tight text-slate-900">Review Gaeilge translation</h2>
                <p className="mt-1 text-sm text-slate-600">Suggest a clearer Gaeilge version for this UI label.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>
            </div>

            {error && <div className="mt-4"><InlineNotice variant="error" title="That didn’t quite work">{error}</InlineNotice></div>}

            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="font-bold text-slate-700">Translation key</dt><dd className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{translationKey}</dd></div>
              <div><dt className="font-bold text-slate-700">English</dt><dd className="mt-1 text-slate-600">{source.english}</dd></div>
              <div><dt className="font-bold text-slate-700">Built-in Gaeilge</dt><dd className="mt-1 text-slate-600">{source.gaeilge}</dd></div>
              <div><dt className="font-bold text-slate-700">Current Gaeilge</dt><dd className="mt-1 text-slate-600">{current}</dd></div>
            </dl>

            <label className="mt-5 block text-sm font-bold text-slate-700">
              Better Gaeilge
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-3 py-2 font-normal text-slate-800 outline-none focus:border-emerald-500" />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsOpen(false)} disabled={saving} className="rounded-xl border-2 border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
              <button type="button" onClick={save} disabled={saving || !draft.trim() || draft.trim() === current} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
