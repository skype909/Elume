import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const API_BASE = "/api";

function resolveFileUrl(u: string) {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`; // /uploads/... -> /api/uploads/...
  return `${API_BASE}/${u}`;
}

// Same idea as ClassPage: links might be array OR JSON string OR comma/newline separated
function normalizeLinks(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {}
    return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

// Pull URLs out of the post content too (handles http(s) and /uploads/..)
function extractLinksFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  (text.match(/https?:\/\/[^\s)]+/gi) || []).forEach((m) => found.add(m));
  (text.match(/\/uploads\/[^\s)]+/gi) || []).forEach((m) => found.add(m));

  // Trim trailing punctuation that often breaks URLs (.,) etc.
  return Array.from(found).map((u) => u.replace(/[),.]+$/g, ""));
}

export default function StudentClassPage() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setErr(null);
    fetch(`/api/student/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        setErr(e?.message || "Failed to load");
        setData(null);
      });
  }, [token]);

  const posts = useMemo(() => (Array.isArray(data?.posts) ? data.posts : []), [data]);
  const notes = useMemo(() => (Array.isArray(data?.notes) ? data.notes : []), [data]);
  const tests = useMemo(() => (Array.isArray(data?.tests) ? data.tests : []), [data]);

  if (err) return <div className="p-6 text-red-700">{err}</div>;
  if (!data) return <div className="p-6">Loading…</div>;

  const chip =
    "inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:translate-y-[1px]";

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{data.class_name}</h1>
      <p className="text-slate-500 mb-6">{data.subject}</p>

      <h2 className="font-bold mt-6 mb-2">Announcements</h2>

      {posts.map((p: any) => {
        const fromLinksField = normalizeLinks(p?.links);
        const fromText = extractLinksFromText(String(p?.content || ""));
        const allLinks = Array.from(new Set([...fromLinksField, ...fromText]));

        return (
          <div key={p.id} className="border rounded-xl p-3 mb-2 bg-white">
            <div className="text-sm text-slate-500">{p.author}</div>
            <div className="whitespace-pre-wrap">{p.content}</div>

            {allLinks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {allLinks.map((l, i) => (
                  <a
                    key={`${p.id}-l-${i}`}
                    href={resolveFileUrl(l)}
                    target="_blank"
                    rel="noreferrer"
                    className={chip}
                  >
                    🔗 Open
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <h2 className="font-bold mt-6 mb-2">Resources</h2>
      {notes.map((n: any) => (
        <a
          key={n.id}
          href={resolveFileUrl(n.file_url)}
          target="_blank"
          rel="noreferrer"
          className="block text-emerald-700 underline"
        >
          {n.filename}
        </a>
      ))}

      <h2 className="font-bold mt-6 mb-2">Tests & Papers</h2>
      {tests.map((t: any) => (
        <a
          key={t.id}
          href={resolveFileUrl(t.file_url)}
          target="_blank"
          rel="noreferrer"
          className="block text-blue-700 underline"
        >
          {t.title}
        </a>
      ))}
    </div>
  );
}