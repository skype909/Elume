import React from "react";

type AiAssistanceNoticeProps = {
  variant: "input" | "output";
  className?: string;
};

export default function AiAssistanceNotice({ variant, className = "" }: AiAssistanceNoticeProps) {
  const input = variant === "input";
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs leading-5 text-slate-600 ${className}`}
    >
      <span aria-hidden="true" className="mt-0.5 text-sm leading-none">✨</span>
      <span>
        <span className="font-bold text-violet-900">{input ? "AI-assisted" : "AI-generated draft"}</span>
        {input
          ? " — Please avoid entering unnecessary personal or sensitive student information."
          : " — Please review and verify before use."}
      </span>
    </div>
  );
}
