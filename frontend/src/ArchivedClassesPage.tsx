import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

type ArchivedClassItem = {
  id: number;
  name: string;
  subject: string;
  stream?: string | null;
  color?: string | null;
  archived_at?: string | null;
};

type StreamGroup =
  | "Junior Cycle"
  | "Senior Cycle"
  | "Transition Year (TY)"
  | "LCA"
  | "LCVP"
  | "SEN"
  | "Clubs";

const STREAM_ORDER: StreamGroup[] = [
  "Junior Cycle",
  "Senior Cycle",
  "Transition Year (TY)",
  "LCA",
  "LCVP",
  "SEN",
  "Clubs",
];

function inferStream(item: ArchivedClassItem): StreamGroup {
  const stream = String(item.stream ?? "").trim();
  if (STREAM_ORDER.includes(stream as StreamGroup)) return stream as StreamGroup;

  const name = `${item.name} ${item.subject}`.toLowerCase();
  if (name.includes("ty") || name.includes("transition year")) return "Transition Year (TY)";
  if (name.includes("lca")) return "LCA";
  if (name.includes("lcvp")) return "LCVP";
  if (name.includes("sen") || name.includes("resource") || name.includes("support")) return "SEN";
  if (name.includes("club") || name.includes("debating") || name.includes("coding") || name.includes("sports")) return "Clubs";
  if (name.includes("5th year") || name.includes("6th year")) return "Senior Cycle";
  return "Junior Cycle";
}

export default function ArchivedClassesPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ArchivedClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch("/classes/archived")
      .then((data) => {
        if (cancelled) return;
        setClasses(Array.isArray(data) ? (data as ArchivedClassItem[]) : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Could not load archived classes.");
        setClasses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const initial = Object.fromEntries(STREAM_ORDER.map((group) => [group, [] as ArchivedClassItem[]])) as Record<StreamGroup, ArchivedClassItem[]>;
    for (const item of classes) {
      initial[inferStream(item)].push(item);
    }
    return initial;
  }, [classes]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eefbf0,_#def3e4_45%,_#d8eef1_100%)] px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.88),rgba(236,254,255,0.86))] p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                Archived Classes
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Archived Classes</div>
              <div className="mt-2 max-w-2xl text-sm text-slate-600">
                Archived classes are stored here to keep your active dashboard tidy. You can keep up to 20 archived classes per teacher account.
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {loading && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              Loading archived classes...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 shadow-sm">
              {error}
            </div>
          )}

          {!loading && !error && classes.length === 0 && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              No archived classes yet.
            </div>
          )}

          {!loading && !error && classes.length > 0 &&
            STREAM_ORDER.map((group) => {
              const items = grouped[group];
              if (items.length === 0) return null;

              return (
                <section key={group} className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_16px_44px_rgba(15,23,42,0.08)]">
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">{group}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <div key={item.id} className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-sm">
                        <div className="text-lg font-extrabold tracking-tight text-slate-900">{item.name}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-600">{item.subject}</div>
                        {item.archived_at && (
                          <div className="mt-3 text-xs text-slate-500">
                            Archived {new Date(item.archived_at).toLocaleDateString("en-IE")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>
      </div>
    </div>
  );
}
