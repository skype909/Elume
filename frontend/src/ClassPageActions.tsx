import React from "react";
import { useNavigate } from "react-router-dom";

type BackToClassButtonProps = {
  classId: number;
  onClick?: () => void;
  className?: string;
};

type ClassPageActionBarProps = {
  children: React.ReactNode;
  className?: string;
};

export function ClassPageActionBar({ children, className = "" }: ClassPageActionBarProps) {
  return <div className={`mb-4 flex items-center justify-between gap-3 ${className}`.trim()}>{children}</div>;
}

export function BackToClassButton({ classId, onClick, className = "" }: BackToClassButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={onClick ?? (() => navigate(`/class/${classId}`))}
      className={`inline-flex items-center gap-3 rounded-full border border-emerald-100 bg-white/95 px-4 py-2.5 text-sm font-bold text-slate-800 shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:bg-white ${className}`.trim()}
      title="Back to Class"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full border border-emerald-200 bg-gradient-to-br from-emerald-500 via-cyan-500 to-sky-500 text-base text-white shadow-sm">
        ←
      </span>
      <span>Back to Class</span>
    </button>
  );
}
