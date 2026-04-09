import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { jsPDF } from "jspdf";

const API_BASE = "/api";

type Cat4SetSummary = {
  id: number;
  title: string;
  test_date?: string | null;
  is_locked?: boolean;
  locked_at?: string | null;
  academic_year?: string | null;
  term_key?: string | null;
  created_at?: string | null;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
};

type Cat4MetaPayload = {
  feature_enabled: boolean;
  active_workbook?: {
    id: number;
    version_number: number;
    workbook_name: string;
    uploaded_by_email: string;
    uploaded_at?: string | null;
    validation_summary?: {
      baseline_sheet_name?: string | null;
      term_sheet_names?: string[];
      warnings?: string[];
      matched_student_count?: number;
      baseline_locked?: boolean;
    };
  } | null;
  workbook_versions: {
    id: number;
    version_number: number;
    workbook_name: string;
    uploaded_by_email: string;
    uploaded_at?: string | null;
    is_active: boolean;
    validation_summary?: {
      baseline_sheet_name?: string | null;
      term_sheet_names?: string[];
      warnings?: string[];
      matched_student_count?: number;
      baseline_locked?: boolean;
    };
  }[];
  baseline_sets: Cat4SetSummary[];
  term_sets: Cat4SetSummary[];
  matched_counts: {
    baseline_rows: number;
    baseline_unmatched: number;
    term_rows: number;
    term_unmatched: number;
  };
};

type Cat4StudentReportRow = {
  student_id?: number | null;
  student_name: string;
  profile_label?: string | null;
  baseline_percentile?: number | null;
  latest_term_percentile?: number | null;
  previous_term_percentile?: number | null;
  value_added_delta?: number | null;
  trend_delta?: number | null;
  latest_average_percent?: number | null;
  previous_average_percent?: number | null;
  movement_score?: number | null;
  primary_concern_domain?: string | null;
  primary_strength_domain?: string | null;
  largest_negative_domain_delta?: number | null;
  largest_positive_domain_delta?: number | null;
  status: "at_risk" | "excelling" | "within_expected_range";
  reasons: string[];
  domain_movements?: Record<string, number | null>;
};

type Cat4ReportPayload = {
  feature_enabled: boolean;
  baseline_set: { id: number; title: string; test_date?: string | null; is_locked?: boolean; locked_at?: string | null } | null;
  latest_term_set: { id: number; title: string; academic_year?: string | null; term_key?: string | null } | null;
  previous_term_set: { id: number; title: string; academic_year?: string | null; term_key?: string | null } | null;
  summary_cards: { key: string; label: string; value: number }[];
  at_risk: Cat4StudentReportRow[];
  excelling: Cat4StudentReportRow[];
  within_expected_range: Cat4StudentReportRow[];
  all_matched_students: Cat4StudentReportRow[];
  bottom_10_percent?: Cat4StudentReportRow[];
  top_5_percent?: Cat4StudentReportRow[];
  biggest_downward_movers?: Cat4StudentReportRow[];
  biggest_upward_movers?: Cat4StudentReportRow[];
  unmatched_cat4_rows: {
    id: number;
    raw_name: string;
    matched_name?: string | null;
    confidence_note?: string | null;
    overall_sas?: number | null;
    profile_label?: string | null;
  }[];
  unmatched_term_rows: {
    id: number;
    raw_name: string;
    matched_name?: string | null;
    average_percent?: number | null;
    subject_count?: number | null;
  }[];
  profile_distribution: { label: string; count: number }[];
  domain_commentary: {
    domain: string;
    average_movement?: number | null;
    overall_average_movement?: number | null;
    average_negative_movement?: number | null;
    commentary: string;
  }[];
  domain_concern_summary?: {
    domain: string;
    primary_concern_count: number;
    average_movement?: number | null;
    overall_average_movement?: number | null;
    average_negative_movement?: number | null;
    most_affected_students?: {
      student_id?: number | null;
      student_name: string;
      movement_score?: number | null;
      largest_negative_domain_delta?: number | null;
      latest_average_percent?: number | null;
    }[];
  }[];
};

type Cat4WorkbookPreview = {
  ok: boolean;
  workbook_name: string;
  baseline_locked: boolean;
  baseline_sheet_name?: string | null;
  cohort_sheet_name?: string | null;
  term_sheet_names: string[];
  baseline_rows: {
    raw_name: string;
    verbal_sas: number | null;
    quantitative_sas: number | null;
    non_verbal_sas: number | null;
    spatial_sas: number | null;
    overall_sas: number | null;
    profile_label?: string | null;
    confidence_note?: string | null;
  }[];
  term_sets: {
    title: string;
    academic_year?: string | null;
    term_key?: string | null;
    rows: {
      raw_name: string;
      average_percent?: number | null;
      subject_count?: number | null;
      raw_subjects_json?: string | null;
    }[];
  }[];
  errors: string[];
  warnings: string[];
};

type ClassStudent = {
  id: number;
  first_name: string;
  active: boolean;
};

type Cat4TermEntryRow = {
  raw_name: string;
  matched_name?: string | null;
  profile_label?: string | null;
  confidence_note?: string | null;
  average_percent?: number | null;
  subject_count?: number | null;
  subject_scores: Record<string, number | null>;
  has_baseline: boolean;
};

type Cat4TermEntryPayload = {
  feature_enabled: boolean;
  baseline_set: { id: number; title: string; test_date?: string | null; is_locked?: boolean; locked_at?: string | null } | null;
  term_set: { id: number; title: string; academic_year?: string | null; term_key?: string | null; created_at?: string | null } | null;
  rows: Cat4TermEntryRow[];
};

type ImportPreviewRow = {
  raw_name: string;
  matched_name: string | null;
  matched: boolean;
  note: string | null;
  warning?: string | null;
};

const TERM_SUBJECT_COLUMNS = [
  "irish",
  "english",
  "mathematics",
  "history",
  "geography",
  "french",
  "spanish",
  "business_studies",
  "music",
  "home_economics",
  "science",
  "graphics",
  "learning_support",
  "visual_art",
];

const CSV_HEADER_ALIASES: Record<string, string> = {
  name: "student_name",
  student: "student_name",
  maths: "mathematics",
  "home ec": "home_economics",
  home_ec: "home_economics",
  business: "business_studies",
  art: "visual_art",
};

const TERM_SUBJECT_LABELS: Record<string, string> = {
  irish: "Irish",
  english: "English",
  mathematics: "Maths",
  history: "History",
  geography: "Geog",
  french: "French",
  spanish: "Spanish",
  business_studies: "Business",
  music: "Music",
  home_economics: "Home Ec",
  science: "Science",
  graphics: "Graphics",
  learning_support: "Support",
  visual_art: "Art",
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseDelimitedRows(raw: string): string[][] {
  return raw
    .split(/\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("\t")) {
        return line.split("\t").map((part) => part.trim());
      }
      return parseCsvLine(line);
    });
}

function maybeSkipHeader(rows: string[][]) {
  if (!rows.length) return rows;
  const first = (rows[0]?.[0] || "").toLowerCase();
  if (first.includes("name")) return rows.slice(1);
  return rows;
}

function parseOptionalInt(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normaliseStudentName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseHeader(value: string) {
  const normalized = normaliseStudentName(value).replace(/[./-]+/g, " ").replace(/\s+/g, "_");
  return CSV_HEADER_ALIASES[normalized] || normalized;
}

function firstToken(value: string) {
  const normalized = normaliseStudentName(value);
  return normalized ? normalized.split(" ", 1)[0] : "";
}

function buildMatchIndex(students: ClassStudent[]) {
  const index = new Map<string, ClassStudent[]>();
  students
    .filter((student) => student.active)
    .forEach((student) => {
      const key = normaliseStudentName(student.first_name);
      if (!key) return;
      index.set(key, [...(index.get(key) || []), student]);
    });
  return index;
}

function buildImportPreview(
  rows: { raw_name: string; subject_count?: number | null }[],
  students: ClassStudent[],
  kind: "baseline" | "term"
): ImportPreviewRow[] {
  const index = buildMatchIndex(students);
  return rows.map((row) => {
    const key = normaliseStudentName(row.raw_name);
    if (!key) {
      return {
        raw_name: row.raw_name,
        matched_name: null,
        matched: false,
        note: "Missing student name",
        warning: kind === "term" && typeof row.subject_count === "number" && row.subject_count < 4 ? "Average based on fewer than 4 subjects" : null,
      };
    }

    const exactMatches = index.get(key) || [];
    if (exactMatches.length === 1) {
      return {
        raw_name: row.raw_name,
        matched_name: exactMatches[0].first_name,
        matched: true,
        note: null,
        warning: kind === "term" && typeof row.subject_count === "number" && row.subject_count < 4 ? "Average based on fewer than 4 subjects" : null,
      };
    }
    if (exactMatches.length > 1) {
      return {
        raw_name: row.raw_name,
        matched_name: null,
        matched: false,
        note: "Multiple class students matched",
        warning: kind === "term" && typeof row.subject_count === "number" && row.subject_count < 4 ? "Average based on fewer than 4 subjects" : null,
      };
    }

    const token = firstToken(row.raw_name);
    const tokenMatches = token ? index.get(token) || [] : [];
    if (tokenMatches.length === 1) {
      return {
        raw_name: row.raw_name,
        matched_name: tokenMatches[0].first_name,
        matched: true,
        note: "Matched on first name only",
        warning: kind === "term" && typeof row.subject_count === "number" && row.subject_count < 4 ? "Average based on fewer than 4 subjects" : null,
      };
    }
    if (tokenMatches.length > 1) {
      return {
        raw_name: row.raw_name,
        matched_name: null,
        matched: false,
        note: "Multiple class students matched on first name",
        warning: kind === "term" && typeof row.subject_count === "number" && row.subject_count < 4 ? "Average based on fewer than 4 subjects" : null,
      };
    }

    return {
      raw_name: row.raw_name,
      matched_name: null,
      matched: false,
      note: "No class student matched",
      warning: kind === "term" && typeof row.subject_count === "number" && row.subject_count < 4 ? "Average based on fewer than 4 subjects" : null,
    };
  });
}

function toDelimitedLine(parts: (string | number | null | undefined)[]) {
  return parts
    .map((part) => {
      const value = part == null ? "" : String(part);
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    })
    .join(",");
}

function parseBaselineRows(raw: string) {
  return maybeSkipHeader(parseDelimitedRows(raw))
    .map((parts) => ({
      raw_name: parts[0] || "",
      overall_sas: parseOptionalInt(parts[1]),
      verbal_sas: parseOptionalInt(parts[2]),
      quantitative_sas: parseOptionalInt(parts[3]),
      non_verbal_sas: parseOptionalInt(parts[4]),
      spatial_sas: parseOptionalInt(parts[5]),
      profile_label: parts[6] || null,
      confidence_note: parts.slice(7).join(",").trim() || null,
    }))
    .filter((row) => row.raw_name.trim());
}

function parseTermRows(raw: string) {
  return maybeSkipHeader(parseDelimitedRows(raw))
    .map((parts) => ({
      raw_name: parts[0] || "",
      average_percent: parseOptionalInt(parts[1]),
      subject_count: parseOptionalInt(parts[2]),
      raw_subjects_json: parts.slice(3).join(",").trim() || null,
    }))
    .filter((row) => row.raw_name.trim());
}

function parseCsvFileRows(raw: string) {
  return parseDelimitedRows(raw);
}

function convertBaselineCsvToNormalizedText(raw: string) {
  const rows = maybeSkipHeader(parseCsvFileRows(raw))
    .map((parts) => [
      parts[0] || "",
      parseOptionalInt(parts[1]) || "",
      parseOptionalInt(parts[2]) || "",
      parseOptionalInt(parts[3]) || "",
      parseOptionalInt(parts[4]) || "",
      parseOptionalInt(parts[5]) || "",
      parts[6] || "",
      parts[7] || "",
    ])
    .filter((parts) => String(parts[0]).trim());

  return rows.map((parts) => toDelimitedLine(parts)).join("\n");
}

function parseWideTermCsv(raw: string) {
  const rows = parseCsvFileRows(raw);
  if (!rows.length) return { normalizedText: "", academicYear: "", termKey: "" };

  const [headerRow, ...dataRows] = rows;
  const headerMap = new Map(headerRow.map((header, index) => [normaliseHeader(header), index]));

  const academicYears = new Set<string>();
  const termKeys = new Set<string>();

  const normalizedRows = dataRows
    .map((parts) => {
      const studentName = parts[headerMap.get("student_name") || 0] || "";
      const academicYear = (parts[headerMap.get("academic_year") || -1] || "").trim();
      const termKey = (parts[headerMap.get("term_key") || -1] || "").trim();
      if (academicYear) academicYears.add(academicYear);
      if (termKey) termKeys.add(termKey);

      const numericSubjects: Record<string, number> = {};
      TERM_SUBJECT_COLUMNS.forEach((subject) => {
        const idx = headerMap.get(subject);
        if (idx == null) return;
        const rawValue = (parts[idx] || "").trim();
        if (!rawValue || rawValue === "-" || rawValue.toLowerCase() === "n/a") return;
        const parsed = Number(rawValue);
        if (Number.isFinite(parsed)) {
          numericSubjects[subject] = Math.round(parsed);
        }
      });

      const values = Object.values(numericSubjects);
      const averagePercent = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : "";
      const subjectCount = values.length || "";

      return [
        studentName,
        averagePercent,
        subjectCount,
        values.length ? JSON.stringify(numericSubjects) : "",
      ];
    })
    .filter((parts) => String(parts[0]).trim());

  return {
    normalizedText: normalizedRows.map((parts) => toDelimitedLine(parts)).join("\n"),
    academicYear: academicYears.size === 1 ? Array.from(academicYears)[0] : "",
    termKey: termKeys.size === 1 ? Array.from(termKeys)[0] : "",
  };
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildEmptySubjectScores() {
  return Object.fromEntries(TERM_SUBJECT_COLUMNS.map((subject) => [subject, null])) as Record<string, number | null>;
}

function mergeSubjectScores(value: Record<string, number | null> | null | undefined) {
  return {
    ...buildEmptySubjectScores(),
    ...(value || {}),
  };
}

function termMetricsFromSubjectScores(subjectScores: Record<string, number | null>) {
  const values = Object.values(subjectScores).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    average_percent: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    subject_count: values.length || null,
  };
}

function prepareTermEntryRows(rows: Cat4TermEntryRow[]) {
  return rows.map((row) => {
    const subject_scores = mergeSubjectScores(row.subject_scores);
    const metrics = termMetricsFromSubjectScores(subject_scores);
    return {
      ...row,
      subject_scores,
      average_percent: metrics.average_percent ?? row.average_percent ?? null,
      subject_count: metrics.subject_count ?? row.subject_count ?? null,
    };
  });
}

function pct(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value)}%`;
}

function signed(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function statusPill(status: Cat4StudentReportRow["status"]) {
  if (status === "at_risk") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "excelling") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function StudentTable({
  rows,
  empty,
}: {
  rows: Cat4StudentReportRow[];
  empty: string;
}) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-3xl border-2 border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-3 font-semibold">Student</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Latest</th>
            <th className="px-4 py-3 font-semibold">Previous</th>
            <th className="px-4 py-3 font-semibold">Trend</th>
            <th className="px-4 py-3 font-semibold">Movement</th>
            <th className="px-4 py-3 font-semibold">Baseline %ile</th>
            <th className="px-4 py-3 font-semibold">Latest %ile</th>
            <th className="px-4 py-3 font-semibold">Value Added</th>
            <th className="px-4 py-3 font-semibold">Primary Domains</th>
            <th className="px-4 py-3 font-semibold">Reasons</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={`${row.student_id || row.student_name}-${row.status}`}>
              <td className="px-4 py-3">
                <div className="font-semibold text-slate-900">{row.student_name}</div>
                {!!row.profile_label && <div className="text-xs text-slate-500">{row.profile_label}</div>}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusPill(row.status)}`}>
                  {row.status.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-900">{pct(row.latest_average_percent)}</td>
              <td className="px-4 py-3 text-slate-600">{pct(row.previous_average_percent)}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{signed(row.trend_delta)}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{signedOneDecimal(row.movement_score || row.value_added_delta)}</td>
              <td className="px-4 py-3 text-slate-600">{pct(row.baseline_percentile)}</td>
              <td className="px-4 py-3 text-slate-600">{pct(row.latest_term_percentile)}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{signed(row.value_added_delta)}</td>
              <td className="px-4 py-3">
                <div className="flex min-w-[220px] flex-wrap gap-2">
                  {row.primary_concern_domain ? (
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(row.primary_concern_domain)}`}>
                      Concern: {row.primary_concern_domain} {signedOneDecimal(row.largest_negative_domain_delta)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                  {row.primary_strength_domain ? (
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(row.primary_strength_domain)}`}>
                      Strength: {row.primary_strength_domain} {signedOneDecimal(row.largest_positive_domain_delta)}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">{row.reasons.join(" | ") || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signedOneDecimal(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function domainPillTone(domain?: string | null) {
  const normalized = (domain || "").trim().toLowerCase();
  if (normalized === "verbal") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (normalized === "quantitative") return "border-blue-200 bg-blue-50 text-blue-800";
  if (normalized === "non-verbal") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "spatial") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function compactStudentInsight(row: Cat4StudentReportRow) {
  const parts = [
    `Latest ${pct(row.latest_average_percent)}`,
    `Trend ${signed(row.trend_delta)}`,
    `Movement ${signedOneDecimal(row.movement_score || row.value_added_delta)}`,
  ];
  if (row.primary_concern_domain) {
    parts.push(`${row.primary_concern_domain} ${signedOneDecimal(row.largest_negative_domain_delta)}`);
  }
  if (row.primary_strength_domain) {
    parts.push(`${row.primary_strength_domain} ${signedOneDecimal(row.largest_positive_domain_delta)}`);
  }
  return parts.join(" | ");
}

function RankedStudentCards({
  rows,
  empty,
}: {
  rows: Cat4StudentReportRow[];
  empty: string;
}) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{empty}</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`${row.student_id || row.student_name}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{row.student_name}</div>
              {!!row.profile_label && <div className="mt-1 text-xs text-slate-500">{row.profile_label}</div>}
              <div className="mt-2 text-sm text-slate-600">{compactStudentInsight(row)}</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusPill(row.status)}`}>
              {row.status.replace("_", " ")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.primary_concern_domain ? (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(row.primary_concern_domain)}`}>
                Primary concern: {row.primary_concern_domain}
              </span>
            ) : null}
            {row.primary_strength_domain ? (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(row.primary_strength_domain)}`}>
                Primary strength: {row.primary_strength_domain}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Cat4InsightsPage() {
  const { id } = useParams<{ id: string }>();
  const classId = useMemo(() => Number(id), [id]);
  const validClassId = Number.isFinite(classId) && classId > 0;
  const navigate = useNavigate();

  const card = "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const cardPad = "p-4 md:p-5";

  const [meta, setMeta] = useState<Cat4MetaPayload | null>(null);
  const [report, setReport] = useState<Cat4ReportPayload | null>(null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBaselineId, setSelectedBaselineId] = useState<number | "">("");
  const [selectedTermSetId, setSelectedTermSetId] = useState<number | "">("");

  const [baselineTitle, setBaselineTitle] = useState("");
  const [baselineDate, setBaselineDate] = useState("");
  const [baselineRowsText, setBaselineRowsText] = useState("");
  const [termTitle, setTermTitle] = useState("");
  const [termAcademicYear, setTermAcademicYear] = useState("");
  const [termKey, setTermKey] = useState("");
  const [termRowsText, setTermRowsText] = useState("");
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [savingTerm, setSavingTerm] = useState(false);
  const [loadingTermEntry, setLoadingTermEntry] = useState(false);
  const [savingNativeTermRows, setSavingNativeTermRows] = useState(false);
  const [termEntryCollapsed, setTermEntryCollapsed] = useState(true);
  const [workbookPreview, setWorkbookPreview] = useState<Cat4WorkbookPreview | null>(null);
  const [termEntryRows, setTermEntryRows] = useState<Cat4TermEntryRow[]>([]);
  const [termEntryStatus, setTermEntryStatus] = useState<string | null>(null);
  const [termPasteText, setTermPasteText] = useState("");
  const [validatingWorkbook, setValidatingWorkbook] = useState(false);
  const [importingWorkbook, setImportingWorkbook] = useState(false);
  const baselineCsvInputRef = useRef<HTMLInputElement | null>(null);
  const termCsvInputRef = useRef<HTMLInputElement | null>(null);
  const workbookInputRef = useRef<HTMLInputElement | null>(null);

  const baselineDraftRows = useMemo(() => parseBaselineRows(baselineRowsText), [baselineRowsText]);
  const termDraftRows = useMemo(() => parseTermRows(termRowsText), [termRowsText]);
  const baselinePreview = useMemo(() => buildImportPreview(baselineDraftRows, students, "baseline"), [baselineDraftRows, students]);
  const termPreview = useMemo(() => buildImportPreview(termDraftRows, students, "term"), [termDraftRows, students]);

  async function loadMeta(): Promise<Cat4MetaPayload | null> {
    if (!validClassId) return null;
    const data = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/meta`)) as Cat4MetaPayload;
    setMeta(data);
    setSelectedBaselineId((prev) => (prev && data.baseline_sets.some((item) => item.id === prev) ? prev : data.baseline_sets[0]?.id || ""));
    setSelectedTermSetId((prev) => (prev && data.term_sets.some((item) => item.id === prev) ? prev : data.term_sets[0]?.id || ""));
    return data;
  }

  async function loadReport(nextBaselineId?: number | "", nextTermSetId?: number | "") {
    if (!validClassId) return;
    const params = new URLSearchParams();
    const baselineId = nextBaselineId === undefined ? selectedBaselineId : nextBaselineId;
    const termSetId = nextTermSetId === undefined ? selectedTermSetId : nextTermSetId;
    if (baselineId) params.set("baseline_id", String(baselineId));
    if (termSetId) params.set("term_set_id", String(termSetId));
    const query = params.toString();
    const data = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/report${query ? `?${query}` : ""}`)) as Cat4ReportPayload;
    setReport(data);
  }

  async function loadTermEntry(nextBaselineId?: number | "", nextTermSetId?: number | "") {
    if (!validClassId) return;
    const baselineId = nextBaselineId === undefined ? selectedBaselineId : nextBaselineId;
    const termSetId = nextTermSetId === undefined ? selectedTermSetId : nextTermSetId;
    if (!baselineId) {
      setTermEntryRows([]);
      return;
    }

    setLoadingTermEntry(true);
    try {
      const params = new URLSearchParams();
      params.set("baseline_id", String(baselineId));
      if (termSetId) params.set("term_set_id", String(termSetId));
      const data = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/term-entry?${params.toString()}`)) as Cat4TermEntryPayload;
      setTermEntryRows(prepareTermEntryRows(data.rows || []));
    } finally {
      setLoadingTermEntry(false);
    }
  }

  useEffect(() => {
    if (!validClassId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [metaData, studentsData] = await Promise.all([
          loadMeta(),
          apiFetch(`${API_BASE}/classes/${classId}/students`) as Promise<ClassStudent[]>,
        ]);
        setStudents(Array.isArray(studentsData) ? studentsData : []);
        await loadReport(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
        await loadTermEntry(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
      } catch (e: any) {
        setError(e?.message || "Failed to load CAT4 insights");
        setMeta(null);
        setReport(null);
        setStudents([]);
        setTermEntryRows([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, validClassId]);

  useEffect(() => {
    if (!selectedBaselineId && !selectedTermSetId) return;
    if (!meta) return;
    void loadReport();
    void loadTermEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBaselineId, selectedTermSetId]);

  async function onBaselineCsvSelected(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setBaselineRowsText(convertBaselineCsvToNormalizedText(text));
    } catch {
      setError("Could not read CAT4 baseline CSV");
    }
  }

  async function onTermCsvSelected(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseWideTermCsv(text);
      setTermRowsText(parsed.normalizedText);
      if (!termAcademicYear && parsed.academicYear) setTermAcademicYear(parsed.academicYear);
      if (!termKey && parsed.termKey) setTermKey(parsed.termKey);
    } catch {
      setError("Could not read term results CSV");
    }
  }

  function downloadBaselineTemplate() {
    downloadTextFile(
      "cat4-baseline-template.csv",
      "student_name,overall_sas,verbal_sas,quantitative_sas,non_verbal_sas,spatial_sas,profile_label,note\nAoife,110,108,112,105,109,Verbal bias,\nLiam,95,97,92,94,96,Balanced,\n"
    );
  }

  function downloadTermTemplate() {
    downloadTextFile(
      "cat4-term-results-template.csv",
      "student_name,academic_year,term_key,irish,english,mathematics,history,geography,french,spanish,business_studies,music,home_economics,science,graphics,learning_support,visual_art\nAoife,2025/26,christmas,72,78,81,75,74,70,,,,,79,,,\nLiam,2025/26,christmas,60,58,55,62,59,-,N/A,,,,61,,,\n"
    );
  }

  async function onWorkbookSelected(file: File | null) {
    if (!file || !validClassId) return;
    setValidatingWorkbook(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const preview = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/workbook/validate`, {
        method: "POST",
        body: form,
      })) as Cat4WorkbookPreview;
      setWorkbookPreview(preview);
      if (!preview.ok) return;

      setImportingWorkbook(true);
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      await apiFetch(`${API_BASE}/classes/${classId}/cat4/workbooks`, {
        method: "POST",
        body: uploadForm,
      });
      const metaData = await loadMeta();
      await loadReport(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
    } catch (e: any) {
      setError(e?.message || "Could not validate workbook");
      setWorkbookPreview(null);
    } finally {
      setImportingWorkbook(false);
      setValidatingWorkbook(false);
    }
  }

  async function restoreWorkbookVersion(versionId: number) {
    if (!validClassId) return;
    setError(null);
    try {
      setImportingWorkbook(true);
      await apiFetch(`${API_BASE}/classes/${classId}/cat4/workbooks/${versionId}/restore`, {
        method: "POST",
      });
      const metaData = await loadMeta();
      await loadReport(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
    } catch (e: any) {
      setError(e?.message || "Could not restore workbook version");
    } finally {
      setImportingWorkbook(false);
    }
  }

  async function resetCat4Data() {
    if (!validClassId) return;
    const confirmed = window.confirm(
      "Reset CAT4 data for this cohort... This will remove workbook uploads, baseline sets, term sets, and generated CAT4 results for this cohort."
    );
    if (!confirmed) return;

    setError(null);
    try {
      setImportingWorkbook(true);
      await apiFetch(`${API_BASE}/classes/${classId}/cat4/reset`, {
        method: "POST",
      });
      setWorkbookPreview(null);
      setSelectedBaselineId("");
      setSelectedTermSetId("");
      const metaData = await loadMeta();
      await loadReport(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
    } catch (e: any) {
      setError(e?.message || "Could not reset CAT4 data");
    } finally {
      setImportingWorkbook(false);
    }
  }

  function exportPdfReport() {
    if (!report) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 48;
    const lineGap = 18;

    const writeLine = (text: string, size = 11, weight: "normal" | "bold" = "normal") => {
      doc.setFont("helvetica", weight);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, 500);
      doc.text(lines, 48, y);
      y += lines.length * lineGap;
      if (y > 760) {
        doc.addPage();
        y = 48;
      }
    };

    writeLine("Elume CAT4 Insights Report", 18, "bold");
    writeLine(`Baseline: ${report.baseline_set?.title || "Not set"}`);
    writeLine(`Latest term: ${report.latest_term_set?.title || "Not set"}`);
    writeLine("");
    report.summary_cards.forEach((item) => writeLine(`${item.label}: ${item.value}`, 12, "bold"));
    writeLine("");
    const writeStudentSection = (title: string, rows?: Cat4StudentReportRow[]) => {
      writeLine(title, 14, "bold");
      (
        rows?.length
          ? rows
          : [
              {
                student_name: "None",
                reasons: [],
                status: "within_expected_range" as const,
              },
            ]
      ).forEach((row) =>
        writeLine(
          `${row.student_name} - ${compactStudentInsight(row)}${row.reasons?.length ? ` - ${row.reasons.join("; ")}` : ""}`
        )
      );
      writeLine("");
    };

    writeStudentSection("Bottom 10% by Latest Attainment", report.bottom_10_percent);
    writeStudentSection("Top 5% by Latest Attainment", report.top_5_percent);
    writeStudentSection("Biggest Downward Movers vs CAT4 Baseline", report.biggest_downward_movers);
    writeStudentSection("Biggest Upward Movers vs CAT4 Baseline", report.biggest_upward_movers);

    writeLine("Domain Concern Summary", 14, "bold");
    (report.domain_concern_summary?.length ? report.domain_concern_summary : [{ domain: "None", primary_concern_count: 0, most_affected_students: [] }] as any[]).forEach((item: any) => {
      writeLine(`${item.domain}: ${item.primary_concern_count || 0} primary concerns, avg movement ${signedOneDecimal(item.average_movement)}`);
      (item.most_affected_students || []).slice(0, 3).forEach((student: any) =>
        writeLine(`  ${student.student_name} - latest ${pct(student.latest_average_percent)}, domain ${signedOneDecimal(student.largest_negative_domain_delta)}`)
      );
    });
    writeLine("");

    writeLine("Domain Commentary", 14, "bold");
    (report.domain_commentary || []).forEach((item) => writeLine(`${item.domain}: ${item.commentary} (avg movement ${item.average_movement})`));
    writeLine("");
    writeStudentSection("Appendix: Full Student Comparison", report.all_matched_students);

    doc.save(`elume-cat4-report-class-${classId}.pdf`);
  }

  const baselineMatchedPreview = baselinePreview.filter((row) => row.matched).slice(0, 5);
  const baselineUnmatchedPreview = baselinePreview.filter((row) => !row.matched).slice(0, 5);
  const termMatchedPreview = termPreview.filter((row) => row.matched).slice(0, 5);
  const termUnmatchedPreview = termPreview.filter((row) => !row.matched).slice(0, 5);
  const lowSubjectWarnings = termPreview.filter((row) => row.warning).slice(0, 5);

  async function createBaselineSet() {
    if (!baselineTitle.trim()) return;
    setSavingBaseline(true);
    setError(null);
    try {
      const created = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/baselines`, {
        method: "POST",
        body: JSON.stringify({
          title: baselineTitle,
          test_date: baselineDate || null,
        }),
      })) as { id: number };

      const rows = parseBaselineRows(baselineRowsText);
      if (rows.length) {
        await apiFetch(`${API_BASE}/classes/${classId}/cat4/baselines/${created.id}/rows`, {
          method: "POST",
          body: JSON.stringify({ rows }),
        });
      }

      setBaselineTitle("");
      setBaselineDate("");
      setBaselineRowsText("");
      const metaData = await loadMeta();
      setSelectedBaselineId(created.id);
      await loadReport(created.id, selectedTermSetId || metaData?.term_sets[0]?.id || "");
    } catch (e: any) {
      setError(e?.message || "Failed to save CAT4 baseline");
    } finally {
      setSavingBaseline(false);
    }
  }

  async function createTermSet() {
    if (!termTitle.trim()) return;
    setSavingTerm(true);
    setError(null);
    setTermEntryStatus(null);
    try {
      const created = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/term-sets`, {
        method: "POST",
        body: JSON.stringify({
          title: termTitle,
          academic_year: termAcademicYear || null,
          term_key: termKey || null,
        }),
      })) as { id: number };

      const rows = parseTermRows(termRowsText);
      if (rows.length) {
        await apiFetch(`${API_BASE}/classes/${classId}/cat4/term-sets/${created.id}/rows`, {
          method: "POST",
          body: JSON.stringify({ rows }),
        });
      }

      setTermTitle("");
      setTermAcademicYear("");
      setTermKey("");
      setTermRowsText("");
      const metaData = await loadMeta();
      setSelectedTermSetId(created.id);
      await loadReport(selectedBaselineId || metaData?.baseline_sets[0]?.id || "", created.id);
      await loadTermEntry(selectedBaselineId || metaData?.baseline_sets[0]?.id || "", created.id);
      setTermEntryStatus("Term set created. You can enter results below.");
    } catch (e: any) {
      setError(e?.message || "Failed to save term results");
    } finally {
      setSavingTerm(false);
    }
  }

  function updateTermEntryScore(rowIndex: number, subject: string, value: string) {
    const trimmed = value.trim();
    const numeric = trimmed === "" ? null : Number(trimmed);
    setTermEntryRows((prev) =>
      prev.map((row, index) => {
        if (index !== rowIndex) return row;
        const nextValue = trimmed === "" || numeric == null || Number.isNaN(numeric) ? null : Math.round(numeric);
        const nextScores = {
          ...mergeSubjectScores(row.subject_scores),
          [subject]: nextValue,
        };
        const metrics = termMetricsFromSubjectScores(nextScores);
        return {
          ...row,
          subject_scores: nextScores,
          average_percent: metrics.average_percent,
          subject_count: metrics.subject_count,
        };
      })
    );
    setTermEntryStatus(null);
  }

  function applyPastedTermResults() {
    const raw = termPasteText.trim();
    if (!raw) return;
    const parsed = parseTermRows(parseWideTermCsv(raw).normalizedText);
    if (!parsed.length) {
      setError("Could not find any student term rows in the pasted data");
      return;
    }

    const parsedByName = new Map(parsed.map((row) => [normaliseStudentName(row.raw_name), row]));
    let matched = 0;
    let added = 0;

    setTermEntryRows((prev) => {
      const next = prev.map((row) => {
        const incoming = parsedByName.get(normaliseStudentName(row.raw_name));
        if (!incoming) return row;
        matched += 1;
        const nextScores = mergeSubjectScores(
          incoming.raw_subjects_json ? JSON.parse(String(incoming.raw_subjects_json)) : {}
        );
        const metrics = termMetricsFromSubjectScores(nextScores);
        return {
          ...row,
          subject_scores: nextScores,
          average_percent: metrics.average_percent ?? incoming.average_percent ?? null,
          subject_count: metrics.subject_count ?? incoming.subject_count ?? null,
        };
      });

      parsed.forEach((row) => {
        const key = normaliseStudentName(row.raw_name);
        if (!key || next.some((item) => normaliseStudentName(item.raw_name) === key)) return;
        const nextScores = mergeSubjectScores(
          row.raw_subjects_json ? JSON.parse(String(row.raw_subjects_json)) : {}
        );
        const metrics = termMetricsFromSubjectScores(nextScores);
        next.push({
          raw_name: row.raw_name,
          matched_name: null,
          profile_label: null,
          confidence_note: "Present in the pasted term data but not in the selected CAT4 baseline.",
          subject_scores: nextScores,
          average_percent: metrics.average_percent ?? row.average_percent ?? null,
          subject_count: metrics.subject_count ?? row.subject_count ?? null,
          has_baseline: false,
        });
        added += 1;
      });

      return next;
    });

    setTermEntryStatus(`Applied pasted term data to ${matched} cohort rows${added ? ` and added ${added} extra term rows` : ""}.`);
    setTermPasteText("");
    setError(null);
  }

  async function saveNativeTermRows() {
    if (!selectedTermSetId) {
      setError("Create or select a term set before saving native term results");
      return;
    }

    setSavingNativeTermRows(true);
    setError(null);
    setTermEntryStatus(null);
    try {
      const rows = termEntryRows
        .map((row) => {
          const subject_scores = mergeSubjectScores(row.subject_scores);
          const subjectValues = Object.entries(subject_scores).filter(([, value]) => typeof value === "number");
          const metrics = termMetricsFromSubjectScores(subject_scores);
          return {
            raw_name: row.raw_name,
            average_percent: subjectValues.length ? metrics.average_percent : row.average_percent ?? null,
            subject_count: subjectValues.length ? metrics.subject_count : row.subject_count ?? null,
            raw_subjects_json: subjectValues.length
              ? Object.fromEntries(subjectValues)
              : null,
          };
        })
        .filter((row) => row.raw_name.trim() && (row.raw_subjects_json || row.average_percent != null || row.subject_count != null));

      await apiFetch(`${API_BASE}/classes/${classId}/cat4/term-sets/${selectedTermSetId}/rows`, {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      const metaData = await loadMeta();
      await loadReport(selectedBaselineId || metaData?.baseline_sets[0]?.id || "", selectedTermSetId);
      await loadTermEntry(selectedBaselineId || metaData?.baseline_sets[0]?.id || "", selectedTermSetId);
      setTermEntryStatus(`Saved ${rows.length} native term result rows.`);
    } catch (e: any) {
      setError(e?.message || "Could not save native term results");
    } finally {
      setSavingNativeTermRows(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className={`${card} ${cardPad}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-600">Insights</div>
              <div className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">CAT4 Insights</div>
              <div className="mt-2 text-sm text-slate-600">
                Compare CAT4 baseline ability against named term result sets without touching ordinary assessment data.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(`/class/${classId}/admin`)}
                className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Back to Class Admin
              </button>
              <button
                type="button"
                onClick={exportPdfReport}
                className="rounded-2xl border-2 border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadMeta();
                  void loadReport();
                }}
                className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void resetCat4Data()}
                className="rounded-2xl border-2 border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                Reset CAT4 Data
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-sm text-slate-600">Loading CAT4 insights...</div>
        ) : !meta ? (
          <div className="mt-6 rounded-3xl border-2 border-slate-200 bg-white p-6 text-sm text-slate-600">
            CAT4 Insights is not enabled for this account yet.
          </div>
        ) : (
          <>
            <div className={`${card} ${cardPad} mt-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">Structured Workbook Upload</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Validate a cohort workbook first, then import the locked CAT4 baseline and named term sheets.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={workbookInputRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      void onWorkbookSelected(e.target.files?.[0] || null);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => workbookInputRef.current?.click()}
                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    {validatingWorkbook || importingWorkbook ? "Uploading..." : "Upload CAT4 Workbook (.xlsx)"}
                  </button>
                </div>
              </div>

              {workbookPreview && (
                <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-3xl border-2 border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Validation Preview</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Workbook: <span className="font-semibold text-slate-900">{workbookPreview.workbook_name}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Baseline rows: <span className="font-semibold text-slate-900">{workbookPreview.baseline_rows.length}</span> | Term sets:{" "}
                      <span className="font-semibold text-slate-900">{workbookPreview.term_sets.length}</span>
                    </div>
                    {workbookPreview.baseline_locked && (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        A CAT4 baseline is already locked for this class. Workbook import should be used for new term sheets only.
                      </div>
                    )}
                    {workbookPreview.errors.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                        <div className="text-sm font-semibold text-rose-900">Errors</div>
                        <div className="mt-2 space-y-1 text-sm text-rose-800">
                          {workbookPreview.errors.map((item, index) => (
                            <div key={`err-${index}`}>{item}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {workbookPreview.warnings.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                        <div className="text-sm font-semibold text-amber-950">Warnings</div>
                        <div className="mt-2 space-y-1 text-sm text-amber-900">
                          {workbookPreview.warnings.map((item, index) => (
                            <div key={`warn-${index}`}>{item}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                    <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Sheet Summary</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>Cohort sheet: <span className="font-semibold text-slate-900">{workbookPreview.cohort_sheet_name || "Not provided"}</span></div>
                      <div>Baseline sheet: <span className="font-semibold text-slate-900">{workbookPreview.baseline_sheet_name || "Not provided"}</span></div>
                      <div>Term sheets:</div>
                      <div className="space-y-1 pl-0">
                        {workbookPreview.term_sets.map((item) => (
                          <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <span className="font-semibold text-slate-900">{item.title}</span> | {item.rows.length} rows
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`${card} ${cardPad} mt-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">Native Term Entry</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Keep the CAT4 baseline from the original workbook, then enter ongoing term results directly in Elume.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                    {selectedTermSetId
                      ? `Term: ${meta.term_sets.find((item) => item.id === selectedTermSetId)?.title || "Selected"}`
                      : selectedBaselineId
                        ? "Baseline cohort ready"
                        : "Select a CAT4 baseline first"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTermEntryCollapsed((prev) => !prev)}
                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    {termEntryCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>

              {!meta.baseline_sets.length ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  A locked CAT4 baseline is needed before native term entry can begin.
                </div>
              ) : termEntryCollapsed ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Native term entry is collapsed. Expand it when you need to edit or paste CAT4 term results.
                </div>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      CAT4 baseline set
                      <select
                        value={selectedBaselineId}
                        onChange={(e) => setSelectedBaselineId(e.target.value ? Number(e.target.value) : "")}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                      >
                        {meta.baseline_sets.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} {item.test_date ? ` | ${item.test_date}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Term result set
                      <select
                        value={selectedTermSetId}
                        onChange={(e) => setSelectedTermSetId(e.target.value ? Number(e.target.value) : "")}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                      >
                        <option value="">Select a term set</option>
                        {meta.term_sets.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} {item.academic_year ? ` | ${item.academic_year}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      New term set title
                      <input
                        value={termTitle}
                        onChange={(e) => setTermTitle(e.target.value)}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                        placeholder="e.g. Christmas 2026"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Academic year
                      <input
                        value={termAcademicYear}
                        onChange={(e) => setTermAcademicYear(e.target.value)}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                        placeholder="e.g. 2026/27"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Term key
                      <input
                        value={termKey}
                        onChange={(e) => setTermKey(e.target.value)}
                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                        placeholder="e.g. christmas"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void createTermSet()}
                        disabled={savingTerm || !termTitle.trim()}
                        className="rounded-2xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingTerm ? "Creating..." : "Create Term Set"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Current term context</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-600">
                          Baseline: <span className="font-semibold text-slate-900">{meta.baseline_sets.find((item) => item.id === selectedBaselineId)?.title || "Not selected"}</span>
                        </div>
                        <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-600">
                          Term set: <span className="font-semibold text-slate-900">{meta.term_sets.find((item) => item.id === selectedTermSetId)?.title || "Create or select one"}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-xs leading-5 text-slate-500">
                        The native grid below always follows the selected baseline and term.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Quick paste</div>
                          <div className="mt-1 text-sm text-slate-600">Paste a term spreadsheet block here and apply it into the native grid.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyPastedTermResults()}
                          disabled={!termPasteText.trim()}
                          className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Apply Pasted Values
                        </button>
                      </div>
                      <textarea
                        value={termPasteText}
                        onChange={(e) => setTermPasteText(e.target.value)}
                        className="mt-3 min-h-[120px] w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
                        placeholder="Paste student_name, academic_year, term_key, subject columns here..."
                      />
                    </div>
                  </div>

                  {termEntryStatus && (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      {termEntryStatus}
                    </div>
                  )}

                  {!selectedTermSetId ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Create a term set to start entering native CAT4 term results.
                    </div>
                  ) : loadingTermEntry ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Loading native term entry grid...
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 overflow-x-auto rounded-3xl border-2 border-slate-200 bg-white">
                        <table className="min-w-[1400px] w-full text-sm">
                          <thead className="bg-slate-50 text-left text-slate-600">
                            <tr>
                              <th className="px-3 py-3 font-semibold">Student</th>
                              <th className="px-3 py-3 font-semibold">Profile</th>
                              {TERM_SUBJECT_COLUMNS.map((subject) => (
                                <th key={subject} className="px-3 py-3 font-semibold">
                                  {TERM_SUBJECT_LABELS[subject] || subject}
                                </th>
                              ))}
                              <th className="px-3 py-3 font-semibold">Avg</th>
                              <th className="px-3 py-3 font-semibold">Count</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {termEntryRows.map((row, rowIndex) => (
                              <tr key={`${row.raw_name}-${rowIndex}`}>
                                <td className="px-3 py-3">
                                  <div className="font-semibold text-slate-900">{row.raw_name}</div>
                                  {!row.has_baseline && <div className="mt-1 text-xs text-amber-800">Extra term row</div>}
                                  {!!row.confidence_note && <div className="mt-1 text-xs text-slate-500">{row.confidence_note}</div>}
                                </td>
                                <td className="px-3 py-3 text-slate-600">{row.profile_label || "-"}</td>
                                {TERM_SUBJECT_COLUMNS.map((subject) => (
                                  <td key={`${row.raw_name}-${subject}`} className="px-2 py-2">
                                    <input
                                      value={row.subject_scores?.[subject] ?? ""}
                                      onChange={(e) => updateTermEntryScore(rowIndex, subject, e.target.value)}
                                      inputMode="numeric"
                                      className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
                                      placeholder="-"
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-3 font-semibold text-slate-900">{pct(row.average_percent)}</td>
                                <td className="px-3 py-3 text-slate-600">{row.subject_count || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-600">
                          {termEntryRows.length} cohort row{termEntryRows.length === 1 ? "" : "s"} loaded for native term entry.
                        </div>
                        <button
                          type="button"
                          onClick={() => void saveNativeTermRows()}
                          disabled={savingNativeTermRows}
                          className="rounded-2xl border-2 border-emerald-700 bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingNativeTermRows ? "Saving..." : "Save Native Term Results"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {(report?.summary_cards || []).map((cardItem) => (
                <div key={cardItem.key} className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-600">{cardItem.label}</div>
                  <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">{cardItem.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Bottom 10%</div>
                <div className="mt-1 text-sm text-slate-600">Students with the lowest latest overall attainment across the selected term results.</div>
                <div className="mt-4">
                  <RankedStudentCards rows={report?.bottom_10_percent || []} empty="No bottom 10% cohort section is available yet." />
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Top 5%</div>
                <div className="mt-1 text-sm text-slate-600">Students with the highest latest overall attainment across the selected term results.</div>
                <div className="mt-4">
                  <RankedStudentCards rows={report?.top_5_percent || []} empty="No top 5% cohort section is available yet." />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Biggest Downward Movers</div>
                <div className="mt-1 text-sm text-slate-600">Students showing the sharpest negative CAT4-relative movement, with the key domain driving concern.</div>
                <div className="mt-4">
                  <RankedStudentCards rows={report?.biggest_downward_movers || []} empty="No downward movement section is available yet." />
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Biggest Upward Movers</div>
                <div className="mt-1 text-sm text-slate-600">Students showing the strongest positive CAT4-relative movement, with the domain of greatest strength.</div>
                <div className="mt-4">
                  <RankedStudentCards rows={report?.biggest_upward_movers || []} empty="No upward movement section is available yet." />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Active Workbook Summary</div>
                <div className="mt-1 text-sm text-slate-600">Current active workbook version driving the structured CAT4 report.</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${report?.baseline_set?.is_locked ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    {report?.baseline_set?.is_locked ? "Baseline locked" : "Baseline not locked"}
                  </div>
                  {report?.baseline_set?.locked_at && (
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      Locked {report.baseline_set.locked_at.slice(0, 10)}
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Active workbook: <span className="font-semibold text-slate-900">{meta.active_workbook?.workbook_name || "None"}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Version: <span className="font-semibold text-slate-900">{meta.active_workbook?.version_number || "-"}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Term sheets detected: <span className="font-semibold text-slate-900">{meta.active_workbook?.validation_summary?.term_sheet_names?.length || 0}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Matched students: <span className="font-semibold text-slate-900">{meta.active_workbook?.validation_summary?.matched_student_count || 0}</span>
                  </div>
                </div>
                {!!meta.active_workbook?.validation_summary?.warnings?.length && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Warnings: {meta.active_workbook.validation_summary.warnings.join(" | ")}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    CAT4 baseline set
                    <select
                      value={selectedBaselineId}
                      onChange={(e) => setSelectedBaselineId(e.target.value ? Number(e.target.value) : "")}
                      className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                    >
                      {meta.baseline_sets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} {item.test_date ? ` | ${item.test_date}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Term result set
                    <select
                      value={selectedTermSetId}
                      onChange={(e) => setSelectedTermSetId(e.target.value ? Number(e.target.value) : "")}
                      className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2"
                    >
                      {meta.term_sets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} {item.academic_year ? ` | ${item.academic_year}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Baseline matched: <span className="font-semibold text-slate-900">{meta.matched_counts.baseline_rows}</span> | Unmatched:{" "}
                    <span className="font-semibold text-slate-900">{meta.matched_counts.baseline_unmatched}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Term matched: <span className="font-semibold text-slate-900">{meta.matched_counts.term_rows}</span> | Unmatched:{" "}
                    <span className="font-semibold text-slate-900">{meta.matched_counts.term_unmatched}</span>
                  </div>
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Workbook Version History</div>
                <div className="mt-1 text-sm text-slate-600">Latest valid upload is active. Previous versions stay archived and can be restored.</div>
                <div className="mt-4 space-y-3">
                  {meta.workbook_versions.length ? (
                    meta.workbook_versions.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              Version {item.version_number} {item.is_active ? " | Active" : ""}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {item.workbook_name} | {item.uploaded_at ? item.uploaded_at.slice(0, 16).replace("T", " ") : "Unknown time"} | {item.uploaded_by_email}
                            </div>
                            <div className="mt-2 text-sm text-slate-700">
                              Baseline {item.validation_summary?.baseline_locked ? "locked" : "not locked"} | Term sheets {item.validation_summary?.term_sheet_names?.length || 0} | Matched {item.validation_summary?.matched_student_count || 0}
                            </div>
                            {!!item.validation_summary?.warnings?.length && (
                              <div className="mt-1 text-xs text-amber-800">
                                Warnings: {item.validation_summary.warnings.join(" | ")}
                              </div>
                            )}
                          </div>
                          {!item.is_active && (
                            <button
                              type="button"
                              onClick={() => void restoreWorkbookVersion(item.id)}
                              className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      No workbook versions saved yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Unmatched CAT4 Rows</div>
                <div className="mt-1 text-sm text-slate-600">Review these names first if the cohort looks lower than expected.</div>
                <div className="mt-4 space-y-3">
                  {(report?.unmatched_cat4_rows || []).length ? (
                    report?.unmatched_cat4_rows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="font-semibold text-amber-950">{row.raw_name}</div>
                        <div className="mt-1 text-amber-900">{row.confidence_note || "No confident class match yet."}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      All selected CAT4 rows are matched.
                    </div>
                  )}
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Unmatched Term Rows</div>
                <div className="mt-1 text-sm text-slate-600">Use this as the review step before trusting the comparison groups.</div>
                <div className="mt-4 space-y-3">
                  {(report?.unmatched_term_rows || []).length ? (
                    report?.unmatched_term_rows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="font-semibold text-amber-950">{row.raw_name}</div>
                        <div className="mt-1 text-amber-900">
                          Average {pct(row.average_percent)}{row.subject_count ? ` across ${row.subject_count} subjects` : ""}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      All selected term rows are matched.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Domain Concern Summary</div>
                <div className="mt-1 text-sm text-slate-600">Shows which CAT4 domains are driving concern across the cohort and who is most affected in each one.</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(report?.domain_concern_summary || []).length ? (
                    report?.domain_concern_summary?.map((item) => (
                      <div key={item.domain} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">{item.domain}</div>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(item.domain)}`}>
                            {item.primary_concern_count} primary concerns
                          </span>
                        </div>
                        <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Overall Avg Movement {signedOneDecimal(item.overall_average_movement)}
                        </div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Average Downward Movement {signedOneDecimal(item.average_negative_movement ?? item.average_movement)}
                        </div>
                        <div className="mt-3 space-y-2">
                          {(item.most_affected_students || []).length ? (
                            item.most_affected_students?.slice(0, 3).map((student, index) => (
                              <div key={`${item.domain}-${student.student_name}-${index}`} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-700">
                                <span className="font-semibold text-slate-900">{student.student_name}</span>
                                <span className="ml-2">Latest {pct(student.latest_average_percent)} | Domain {signedOneDecimal(student.largest_negative_domain_delta)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-slate-500">No students are currently clustered here.</div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Domain concern summary will appear once a locked baseline and a structured term upload are available.
                    </div>
                  )}
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Domain Commentary</div>
                <div className="mt-1 text-sm text-slate-600">Supporting commentary from the structured CAT4 domain movement calculations.</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(report?.domain_commentary || []).length ? (
                    report?.domain_commentary.map((item) => (
                      <div key={item.domain} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">{item.domain}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Overall Avg Movement {signedOneDecimal(item.overall_average_movement)}
                        </div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Average Downward Movement {signedOneDecimal(item.average_negative_movement ?? item.average_movement)}
                        </div>
                        <div className="mt-2 text-sm text-slate-700">{item.commentary}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Domain commentary will appear once a locked baseline and a structured term upload are available.
                    </div>
                  )}
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">At Risk</div>
                <div className="mt-1 text-sm text-slate-600">Bottom movement band relative to CAT4 baseline, with at least one student flagged in smaller cohorts.</div>
                <div className="mt-4">
                  <StudentTable rows={report?.at_risk || []} empty="No students are flagged at risk in the selected CAT4 comparison." />
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Excelling</div>
                <div className="mt-1 text-sm text-slate-600">Top movement band relative to CAT4 baseline, with at least one student flagged in smaller cohorts.</div>
                <div className="mt-4">
                  <StudentTable rows={report?.excelling || []} empty="No students are currently flagged as excelling." />
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Within Expected Range</div>
                <div className="mt-1 text-sm text-slate-600">Students in the middle cohort band after structured movement scoring.</div>
                <div className="mt-4">
                  <StudentTable rows={report?.within_expected_range || []} empty="No students are currently flagged within the expected range." />
                </div>
              </div>

              <div className={`${card} ${cardPad}`}>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Full Student Comparison</div>
                <div className="mt-1 text-sm text-slate-600">Matched students only, comparing CAT4 cohort percentile against the selected named term set.</div>
                <div className="mt-4">
                  <StudentTable rows={report?.all_matched_students || []} empty="Load at least one baseline set and one term set with matched students to see the report." />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
