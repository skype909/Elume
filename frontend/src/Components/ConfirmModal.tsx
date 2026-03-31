import React, { useEffect } from "react";

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export default function ConfirmModal({
  open,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-6 mx-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-slate-700">{message}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-800 hover:bg-slate-50"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>

          <button
            className={[
              "px-4 py-2 rounded-xl text-white",
              danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800",
              loading ? "opacity-70 cursor-not-allowed" : "",
            ].join(" ")}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
