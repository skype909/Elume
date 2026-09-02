import type { ReactNode } from "react";

type InlineNoticeVariant = "error" | "warning" | "success" | "info";

type InlineNoticeProps = {
  variant?: InlineNoticeVariant;
  title?: string;
  message?: ReactNode;
  children?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

const variantClasses: Record<InlineNoticeVariant, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-cyan-200 bg-cyan-50 text-cyan-900",
};

const actionClasses: Record<InlineNoticeVariant, string> = {
  error: "border-rose-200 text-rose-800 hover:bg-rose-100",
  warning: "border-amber-200 text-amber-800 hover:bg-amber-100",
  success: "border-emerald-200 text-emerald-800 hover:bg-emerald-100",
  info: "border-cyan-200 text-cyan-800 hover:bg-cyan-100",
};

export default function InlineNotice({
  variant = "info",
  title,
  message,
  children,
  actionLabel,
  onAction,
  className = "",
}: InlineNoticeProps) {
  const content = message ?? children;
  const isError = variant === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${variantClasses[variant]} ${className}`}
    >
      <div className="min-w-0">
        {title && <div className="font-bold">{title}</div>}
        {content && <div className={title ? "mt-0.5 leading-5" : "leading-5"}>{content}</div>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`shrink-0 rounded-xl border bg-white px-3 py-1.5 font-semibold transition ${actionClasses[variant]}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
