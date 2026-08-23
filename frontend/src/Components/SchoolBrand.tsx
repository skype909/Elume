type Props = {
  name?: string | null;
  logoUrl?: string | null;
  compact?: boolean;
  poweredByElume?: boolean;
  heading?: boolean;
};

function publicApiUrl(value: string) {
  return value.startsWith("/api/") ? value : `/api${value.startsWith("/") ? "" : "/"}${value}`;
}

export default function SchoolBrand({ name, logoUrl, compact = false, poweredByElume = false, heading = false }: Props) {
  if (!name) return null;
  const NameTag = heading ? "h1" : "div";
  return (
    <div className={`flex min-w-0 items-center gap-2 ${compact ? "" : "rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2"}`}>
      {logoUrl && <img src={publicApiUrl(logoUrl)} alt="" className={`${compact ? "h-7 w-7" : "h-10 w-10"} shrink-0 rounded-xl border border-white bg-white object-contain p-0.5`} />}
      <div className="min-w-0"><NameTag className={`${heading ? "text-3xl font-black tracking-tight" : compact ? "text-xs" : "text-sm font-bold"} truncate text-slate-800`}>{name}</NameTag>{poweredByElume && <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Powered by Elume</div>}</div>
    </div>
  );
}
