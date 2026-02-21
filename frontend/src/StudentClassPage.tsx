import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

export default function StudentClassPage() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/student/${token}`)
      .then(r => r.json())
      .then(setData);
  }, [token]);

  if (!data) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">{data.class_name}</h1>
      <p className="text-slate-500 mb-6">{data.subject}</p>

      <h2 className="font-bold mt-6 mb-2">Announcements</h2>
      {data.posts.map((p:any)=>(
        <div key={p.id} className="border rounded-xl p-3 mb-2">
          <div className="text-sm text-slate-500">{p.author}</div>
          <div>{p.content}</div>
        </div>
      ))}

      <h2 className="font-bold mt-6 mb-2">Resources</h2>
      {data.notes.map((n:any)=>(
        <a key={n.id} href={n.file_url} className="block text-emerald-700 underline">
          {n.filename}
        </a>
      ))}

      <h2 className="font-bold mt-6 mb-2">Tests & Papers</h2>
      {data.tests.map((t:any)=>(
        <a key={t.id} href={t.file_url} className="block text-blue-700 underline">
          {t.title}
        </a>
      ))}
    </div>
  );
}
