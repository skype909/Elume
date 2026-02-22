import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import ELogo2 from "./assets/ELogo2.png"; // adjust if your logo import differs

const API_BASE = "/api";

function resolveFileUrl(u: string) {
    if (!u) return u;
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (u.startsWith("/")) return `${API_BASE}${u}`; // IMPORTANT: /uploads/... => /api/uploads/...
    return `${API_BASE}/${u}`;
}

function extractLinksFromText(text: string): string[] {
    if (!text) return [];
    const found = new Set<string>();

    // Match http(s) links
    (text.match(/https?:\/\/[^\s)]+/gi) || []).forEach((m) => found.add(m));

    // Match /uploads/... links (common for saved whiteboards)
    (text.match(/\/uploads\/[^\s)]+/gi) || []).forEach((m) => found.add(m));

    return Array.from(found);
}

type StudentPost = { id: number; author: string; content: string };
type StudentNote = { id: number; filename: string; file_url: string; topic_name?: string };
type StudentTest = { id: number; title: string; file_url: string; description?: string };

type StudentPayload = {
    class_name: string;
    subject: string;
    posts: StudentPost[];
    notes: StudentNote[];
    tests: StudentTest[];
};

type Panel = "home" | "resources" | "tests";

export default function StudentClassPage() {
    const { token } = useParams();
    const [data, setData] = useState<StudentPayload | null>(null);
    const [panel, setPanel] = useState<Panel>("home");

    useEffect(() => {
        if (!token) return;
        fetch(`/api/student/${token}`)
            .then((r) => r.json())
            .then(setData)
            .catch(() => setData(null));
    }, [token]);

    const notesByTopic = useMemo(() => {
        const map = new Map<string, StudentNote[]>();
        (data?.notes ?? []).forEach((n) => {
            const k = (n.topic_name || "Resources").trim() || "Resources";
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(n);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [data]);

    if (!data) {
        return (
            <div className="min-h-screen bg-slate-50 p-5">
                <div className="mx-auto max-w-md rounded-3xl border-2 border-slate-200 bg-white p-5">
                    <div className="text-lg font-extrabold">Loading…</div>
                    <div className="mt-1 text-sm text-slate-600">Opening your class view.</div>
                </div>
            </div>
        );
    }

    const card = "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
    const pill =
        "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 active:translate-y-[1px]";
    const bigBtn =
        "w-full rounded-3xl border-2 px-4 py-4 text-left shadow-sm active:translate-y-[1px] hover:brightness-110";

    const Top = (
        <div className="mx-auto max-w-md px-4 pt-5">
            <div className={`${card} p-4`}>
                <div className="flex items-center gap-3">
                    <img src={ELogo2} alt="ELume" className="h-14 w-14 rounded-2xl object-cover" />
                    <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-500">ELume</div>
                        <div className="text-lg font-extrabold leading-tight">{data.class_name}</div>
                        <div className="text-sm text-slate-600">{data.subject}</div>
                        <div className="mt-1 text-xs text-slate-500">Learn, Grow, Succeed</div>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <button className={pill} type="button" onClick={() => setPanel("home")}>
                        Home
                    </button>
                    <div className="text-xs font-semibold text-slate-500">Student View</div>
                </div>
            </div>
        </div>
    );

    const Home = (
        <div className="mx-auto max-w-md px-4 pb-10">
            <div className="mt-4 grid gap-3">
                <button
                    className={`${bigBtn} border-blue-600 bg-blue-500 text-white`}
                    type="button"
                    onClick={() => setPanel("resources")}
                >
                    <div className="text-base font-extrabold">Resources</div>
                    <div className="mt-1 text-xs opacity-90">Notes, PDFs, handouts</div>
                </button>

                <button
                    className={`${bigBtn} border-red-700 bg-red-600 text-white`}
                    type="button"
                    onClick={() => setPanel("tests")}
                >
                    <div className="text-base font-extrabold">Tests & Papers</div>
                    <div className="mt-1 text-xs opacity-90">Class tests & exam papers</div>
                </button>
            </div>

            <div className="mt-5">
                <div className="mb-2 text-sm font-extrabold text-slate-800">Announcements</div>
                <div className="grid gap-2">
                    {(data.posts ?? []).length === 0 ? (
                        <div className={`${card} p-4 text-sm text-slate-600`}>No announcements yet.</div>
                    ) : (
                        data.posts.map((p) => {
                            const links = extractLinksFromText(p.content || "");
                            return (
                                <div key={p.id} className={`${card} p-4`}>
                                    <div className="text-xs font-semibold text-slate-500">{p.author || "Teacher"}</div>

                                    <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{p.content}</div>

                                    {links.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {links.map((l, i) => (
                                                <a
                                                    key={`${p.id}-link-${i}`}
                                                    href={resolveFileUrl(l)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:translate-y-[1px]"
                                                >
                                                    🔗 Open
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );

    const Resources = (
        <div className="mx-auto max-w-md px-4 pb-10">
            <div className="mt-4 flex items-center justify-between">
                <div className="text-base font-extrabold">Resources</div>
                <button className={pill} type="button" onClick={() => setPanel("home")}>
                    Back
                </button>
            </div>

            <div className="mt-3 grid gap-4">
                {notesByTopic.length === 0 ? (
                    <div className={`${card} p-4 text-sm text-slate-600`}>No resources uploaded yet.</div>
                ) : (
                    notesByTopic.map(([topic, items]) => (
                        <div key={topic} className={`${card} p-4`}>
                            <div className="text-sm font-extrabold text-slate-800">{topic}</div>
                            <div className="mt-3 grid gap-2">
                                {items.map((n) => {
                                    const href = resolveFileUrl(n.file_url);
                                    return (
                                        <a
                                            key={n.id}
                                            href={href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-white"
                                        >
                                            {n.filename}
                                            <div className="mt-1 text-[11px] font-semibold text-slate-500">Tap to open</div>
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const Tests = (
        <div className="mx-auto max-w-md px-4 pb-10">
            <div className="mt-4 flex items-center justify-between">
                <div className="text-base font-extrabold">Tests & Papers</div>
                <button className={pill} type="button" onClick={() => setPanel("home")}>
                    Back
                </button>
            </div>

            <div className="mt-3 grid gap-2">
                {(data.tests ?? []).length === 0 ? (
                    <div className={`${card} p-4 text-sm text-slate-600`}>No tests/papers uploaded yet.</div>
                ) : (
                    data.tests.map((t) => {
                        const href = resolveFileUrl(t.file_url);
                        return (
                            <a
                                key={t.id}
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className={`${card} p-4 hover:bg-slate-50`}
                            >
                                <div className="text-sm font-extrabold text-slate-800">{t.title}</div>
                                {t.description ? (
                                    <div className="mt-1 text-xs text-slate-600">{t.description}</div>
                                ) : (
                                    <div className="mt-1 text-xs text-slate-500">Tap to open</div>
                                )}
                            </a>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f3f8ff]">
            {Top}
            {panel === "home" && Home}
            {panel === "resources" && Resources}
            {panel === "tests" && Tests}
        </div>
    );
}