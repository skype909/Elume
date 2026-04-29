import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import ELogo2 from "./assets/ELogo2.png";

const API_BASE = "/api";

type Cat4SetSummary = {
  id: number;
  title: string;
  cohort_key?: string | null;
  cohort_name?: string | null;
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

type Cat4CohortSummary = {
  key: string;
  name: string;
  baseline_count?: number;
  term_count?: number;
  workbook_count?: number;
};

type Cat4MetaPayload = {
  feature_enabled: boolean;
  selected_cohort?: Cat4CohortSummary | null;
  cohorts?: Cat4CohortSummary[];
  active_workbook?: {
    id: number;
    version_number: number;
    workbook_name: string;
    uploaded_by_email: string;
    uploaded_at?: string | null;
    cohort_key?: string | null;
    cohort_name?: string | null;
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
    cohort_key?: string | null;
    cohort_name?: string | null;
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
  current_overall_average?: number | null;
  previous_overall_average?: number | null;
  like_for_like_latest_average?: number | null;
  like_for_like_previous_average?: number | null;
  latest_subject_count?: number | null;
  previous_subject_count?: number | null;
  like_for_like_subject_count?: number | null;
  subject_basket_changed?: boolean;
  low_coverage_flag?: boolean;
  level_change_detected?: boolean;
  missed_results_flag?: boolean;
  comparison_confidence?: "High" | "Moderate" | "Low" | null;
  movement_score?: number | null;
  baseline_to_date_label?: string | null;
  major_attainment_improver?: boolean;
  major_attainment_decliner?: boolean;
  recovering_toward_cat4?: boolean;
  declining_despite_cat4_alignment?: boolean;
  primary_concern_domain?: string | null;
  primary_strength_domain?: string | null;
  largest_negative_domain_delta?: number | null;
  largest_positive_domain_delta?: number | null;
  discrepancy_label?: string | null;
  status: "at_risk" | "excelling" | "within_expected_range";
  reasons: string[];
  domain_movements?: Record<string, number | null>;
};

type Cat4ReportPayload = {
  feature_enabled: boolean;
  baseline_set: { id: number; title: string; test_date?: string | null; is_locked?: boolean; locked_at?: string | null } | null;
  latest_term_set: { id: number; title: string; academic_year?: string | null; term_key?: string | null } | null;
  previous_term_set: { id: number; title: string; academic_year?: string | null; term_key?: string | null } | null;
  selected_threshold_percent?: number | null;
  summary_cards: { key: string; label: string; value: number }[];
  at_risk: Cat4StudentReportRow[];
  excelling: Cat4StudentReportRow[];
  within_expected_range: Cat4StudentReportRow[];
  all_matched_students: Cat4StudentReportRow[];
  bottom_10_percent?: Cat4StudentReportRow[];
  top_5_percent?: Cat4StudentReportRow[];
  biggest_downward_movers?: Cat4StudentReportRow[];
  biggest_upward_movers?: Cat4StudentReportRow[];
  biggest_attainment_improvers?: Cat4StudentReportRow[];
  biggest_attainment_decliners?: Cat4StudentReportRow[];
  discrepancy_cases?: Cat4StudentReportRow[];
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
  concern_distribution?: { domain: string; count: number }[];
  strength_distribution?: { domain: string; count: number }[];
  domain_commentary: {
    domain: string;
    average_movement?: number | null;
    average_negative_movement?: number | null;
    average_upward_movement?: number | null;
    movement_spread?: number | null;
    movement_spread_label?: "Low" | "Moderate" | "High" | string;
    primary_concern_count?: number;
    primary_strength_count?: number;
    commentary: string;
  }[];
  domain_concern_summary?: {
    domain: string;
    primary_concern_count: number;
    primary_strength_count?: number;
    average_movement?: number | null;
    average_negative_movement?: number | null;
    average_downward_movement?: number | null;
    average_upward_movement?: number | null;
    movement_spread?: number | null;
    movement_spread_label?: "Low" | "Moderate" | "High" | string;
    most_affected_students?: {
      student_id?: number | null;
      student_name: string;
      movement_score?: number | null;
      largest_negative_domain_delta?: number | null;
      latest_average_percent?: number | null;
    }[];
  }[];
};

type Cat4StudentHistoryPoint = {
  term_set_id: number;
  title: string;
  date: string | null;
  student: number | null;
  cohort_avg: number | null;
};

type Cat4StudentHistoryResp = {
  student: { raw_name: string };
  points: Cat4StudentHistoryPoint[];
};

type Cat4StudentInterpretationFacts = {
  student_name: string;
  student_id?: number | null;
  latest_average_percent?: number | null;
  previous_average_percent?: number | null;
  trend_delta?: number | null;
  movement_score?: number | null;
  baseline_percentile?: number | null;
  latest_term_percentile?: number | null;
  primary_concern_domain?: string | null;
  primary_strength_domain?: string | null;
  subject_basket_changed: boolean;
  level_change_detected: boolean;
  missed_results_flag: boolean;
  low_coverage_flag: boolean;
  comparison_confidence?: "High" | "Moderate" | "Low" | null;
  discrepancy_label?: string | null;
  major_attainment_improver: boolean;
  major_attainment_decliner: boolean;
  recovering_toward_cat4: boolean;
  declining_despite_cat4_alignment: boolean;
};

type Cat4StudentInterpretationResp = {
  explanation: string;
  facts: Cat4StudentInterpretationFacts;
  source: "ai" | "fallback";
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

type TeacherAdminBrandingState = {
  state?: {
    profile?: {
      schoolName?: string | null;
    } | null;
  } | null;
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
  subject_levels?: Record<string, "Higher" | "Ordinary" | null>;
  has_baseline: boolean;
};

type Cat4TermEntryPayload = {
  feature_enabled: boolean;
  baseline_set: { id: number; title: string; test_date?: string | null; is_locked?: boolean; locked_at?: string | null } | null;
  term_set: { id: number; title: string; academic_year?: string | null; term_key?: string | null; created_at?: string | null } | null;
  rows: Cat4TermEntryRow[];
};

type Cat4InsightsPageProps = {
  publicDemo?: boolean;
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

const LEVEL_SENSITIVE_SUBJECTS = new Set([
  "english",
  "irish",
  "mathematics",
]);

type TermSubjectLevel = "Higher" | "Ordinary" | null;

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

function buildCat4CohortKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "default";
}

function buildCat4CohortName(value: string, fallbackKey?: string) {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  const key = buildCat4CohortKey(fallbackKey || "");
  if (key === "default") return "Default Cohort";
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rowHasSavedLevels(row: Cat4TermEntryRow) {
  return Object.values(row.subject_levels || {}).some((value) => value === "Higher" || value === "Ordinary");
}

function buildEmptySubjectScores() {
  return Object.fromEntries(TERM_SUBJECT_COLUMNS.map((subject) => [subject, null])) as Record<string, number | null>;
}

function buildEmptySubjectLevels() {
  return Object.fromEntries(
    TERM_SUBJECT_COLUMNS.map((subject) => [subject, LEVEL_SENSITIVE_SUBJECTS.has(subject) ? null : null])
  ) as Record<string, TermSubjectLevel>;
}

function mergeSubjectScores(value: Record<string, number | null> | null | undefined) {
  return {
    ...buildEmptySubjectScores(),
    ...(value || {}),
  };
}

function normaliseSubjectLevel(value?: string | null): TermSubjectLevel {
  if (value === "Higher" || value === "Ordinary") return value;
  return null;
}

function mergeSubjectLevels(value: Record<string, string | null> | null | undefined) {
  const base = buildEmptySubjectLevels();
  Object.entries(value || {}).forEach(([subject, level]) => {
    if (!LEVEL_SENSITIVE_SUBJECTS.has(subject)) return;
    base[subject] = normaliseSubjectLevel(level);
  });
  return base;
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
    const subject_levels = mergeSubjectLevels(row.subject_levels);
    const metrics = termMetricsFromSubjectScores(subject_scores);
    return {
      ...row,
      subject_scores,
      subject_levels,
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

function signedPct(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function statusPill(status: Cat4StudentReportRow["status"]) {
  if (status === "at_risk") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "excelling") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function statusLabel(status: Cat4StudentReportRow["status"]) {
  if (status === "at_risk") return "At Risk";
  if (status === "excelling") return "Excelling";
  return "Within Expected Range";
}

function StudentTable({
  rows,
  empty,
  onStudentClick,
  showComparisonContext = false,
}: {
  rows: Cat4StudentReportRow[];
  empty: string;
  onStudentClick: (row: Cat4StudentReportRow) => void;
  showComparisonContext?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filteredRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return rows;
    return rows.filter((row) => row.student_name.toLowerCase().includes(trimmed));
  }, [query, rows]);

  if (!rows.length) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{empty}</div>;
  }

  return (
    <div className="rounded-3xl border-2 border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:max-w-sm"
        />
      </div>
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-3 font-semibold">Student</th>
            <th className="w-40 px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Latest</th>
            <th className="px-4 py-3 font-semibold">Previous</th>
            <th className="px-4 py-3 font-semibold">Change</th>
            <th className="px-4 py-3 font-semibold">Movement</th>
            <th className="px-4 py-3 font-semibold">Baseline %ile</th>
            <th className="px-4 py-3 font-semibold">Latest %ile</th>
            <th className="px-4 py-3 font-semibold">Value Added</th>
            <th className="px-4 py-3 font-semibold">Primary Domains</th>
            <th className="px-4 py-3 font-semibold">Reasons</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {filteredRows.map((row) => (
            <tr key={`${row.student_id || row.student_name}-${row.status}`}>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onStudentClick(row)}
                  className="font-semibold text-slate-900 transition hover:text-emerald-700 hover:underline"
                >
                  {row.student_name}
                </button>
                {!!row.profile_label && <div className="text-xs text-slate-500">{row.profile_label}</div>}
                {showComparisonContext ? (
                  <>
                    <div className="mt-1 text-xs font-medium text-slate-500">
                      Subjects {row.latest_subject_count ?? 0} · Like-for-like {row.like_for_like_subject_count ?? 0} · Confidence {row.comparison_confidence || "-"}
                    </div>
                    {row.baseline_to_date_label ? (
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        Since baseline: {row.baseline_to_date_label}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {row.major_attainment_improver ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                          Major Gain
                        </span>
                      ) : null}
                      {row.major_attainment_decliner ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800">
                          Major Decline
                        </span>
                      ) : null}
                      {row.recovering_toward_cat4 ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                          Recovering toward CAT4
                        </span>
                      ) : null}
                      {row.declining_despite_cat4_alignment ? (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                          Declining despite CAT4 alignment
                        </span>
                      ) : null}
                      {row.subject_basket_changed ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                          Basket changed
                        </span>
                      ) : null}
                      {row.level_change_detected ? (
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-900">
                          Level changed
                        </span>
                      ) : null}
                      {row.missed_results_flag ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800">
                          Missing results
                        </span>
                      ) : null}
                      {row.low_coverage_flag ? (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          Low coverage
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${statusPill(row.status)}`}>
                  {statusLabel(row.status)}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-900">{pct(row.latest_average_percent)}</td>
              <td className="px-4 py-3 text-slate-600">{pct(row.previous_average_percent)}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{signedPct(row.trend_delta)}</td>
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
      {!filteredRows.length ? (
        <div className="border-t border-slate-200 px-4 py-4 text-sm text-slate-600">No students match that search.</div>
      ) : null}
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
  if (normalized === "verbal") return "border-violet-200 bg-violet-50 text-violet-800";
  if (normalized === "quantitative") return "border-sky-200 bg-sky-50 text-sky-800";
  if (normalized === "non-verbal") return "border-lime-200 bg-lime-50 text-lime-800";
  if (normalized === "spatial") return "border-orange-200 bg-orange-50 text-orange-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function domainChartColor(domain?: string | null) {
  const normalized = (domain || "").trim().toLowerCase();
  if (normalized === "verbal") return "#7c3aed";
  if (normalized === "quantitative") return "#0ea5e9";
  if (normalized === "non-verbal") return "#84cc16";
  if (normalized === "spatial") return "#f97316";
  return "#94a3b8";
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function DoughnutSummary({
  items,
  title,
}: {
  items: { domain: string; count: number }[];
  title: string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  if (!total) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No {title.toLowerCase()} data is available yet.
      </div>
    );
  }

  let angle = 0;
  const arcs = items
    .filter((item) => item.count > 0)
    .map((item) => {
      const slice = (item.count / total) * 360;
      const start = angle;
      const end = angle + slice;
      angle = end;
      return { ...item, start, end };
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        {arcs.map((item) => (
          <path
            key={`${title}-${item.domain}`}
            d={describeArc(center, center, radius, item.start, item.end)}
            fill="none"
            stroke={domainChartColor(item.domain)}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        ))}
        <circle cx={center} cy={center} r={radius - strokeWidth / 1.6} fill="white" />
        <text x={center} y={center - 6} textAnchor="middle" className="fill-slate-900 text-[18px] font-extrabold">
          {total}
        </text>
        <text x={center} y={center + 14} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold uppercase tracking-[0.18em]">
          {title}
        </text>
      </svg>

      <div className="space-y-2">
        {items
          .filter((item) => item.count > 0)
          .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
          .map((item) => (
            <div key={`${title}-${item.domain}-legend`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: domainChartColor(item.domain) }} />
                <span className="font-semibold text-slate-800">{item.domain}</span>
              </div>
              <span className="text-slate-600">{item.count}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function StudentDomainDoughnut({ row }: { row: Cat4StudentReportRow }) {
  const domainItems = [
    { key: "verbal", label: "Verbal" },
    { key: "quantitative", label: "Quantitative" },
    { key: "non_verbal", label: "Non-Verbal" },
    { key: "spatial", label: "Spatial" },
  ]
    .map((item) => {
      const value = row.domain_movements?.[item.key] ?? row.domain_movements?.[item.label];
      return {
        ...item,
        value: typeof value === "number" && Number.isFinite(value) ? value : null,
        magnitude: typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : 0,
      };
    })
    .filter((item) => item.value !== null);

  if (!domainItems.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Domain picture will appear once CAT4 domain movement values are available.
      </div>
    );
  }
  const maxMagnitude = Math.max(...domainItems.map((item) => item.magnitude), 1);

  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        {domainItems.map((item) => (
          <div key={`student-domain-legend-${item.key}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: domainChartColor(item.label) }} />
                <span className="font-semibold text-slate-800">{item.label}</span>
              </div>
              <span className={item.value && item.value >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                {signedOneDecimal(item.value)}
              </span>
            </div>
            <div className="relative mt-2 h-4 rounded-full bg-slate-100">
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400" />
              <div
                className="absolute inset-y-[2px] rounded-full"
                style={
                  item.value && item.value >= 0
                    ? {
                        left: "50%",
                        width: `${(Math.abs(item.value) / maxMagnitude) * 50}%`,
                        backgroundColor: domainChartColor(item.label),
                      }
                    : {
                        right: "50%",
                        width: `${(Math.abs(item.value || 0) / maxMagnitude) * 50}%`,
                        backgroundColor: domainChartColor(item.label),
                      }
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleCard({
  title,
  description,
  defaultOpen,
  className,
  sectionRef,
  headerActions,
  children,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  defaultOpen: boolean;
  className: string;
  sectionRef?: (node: HTMLDivElement | null) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div ref={sectionRef} className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold tracking-tight text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{description}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {open ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function compactStudentInsight(row: Cat4StudentReportRow) {
  return [
    `Latest ${pct(row.latest_average_percent)}`,
    `Change ${signedPct(row.trend_delta)}`,
    `Movement ${signedOneDecimal(row.movement_score || row.value_added_delta)}`,
  ].join(" | ");
}

function normaliseCat4HistoryName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cat4HistoryCacheKey(baselineId: number, rawName: string) {
  return `${baselineId}:${normaliseCat4HistoryName(rawName)}`;
}

function cat4InterpretationCacheKey(baselineId: number, termSetId: number, rawName: string) {
  return `${baselineId}:${termSetId}:${normaliseCat4HistoryName(rawName)}`;
}

function hasMeaningfulFact(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function hasUsableDomainMovements(row?: Cat4StudentReportRow | null) {
  if (!row?.domain_movements) return false;
  return Object.values(row.domain_movements).some((value) => typeof value === "number" && Number.isFinite(value));
}

type RankedCardDomainMode = "default" | "concerns" | "strength-watch";

function rankedCardDomainChips(row: Cat4StudentReportRow, mode: RankedCardDomainMode) {
  const movementEntries = Object.entries(row.domain_movements || {})
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    .map(([domain, value]) => ({
      domain,
      value: Number(value),
    }));

  const negativeDomains = movementEntries
    .filter((entry) => entry.value < 0)
    .sort((a, b) => a.value - b.value);

  if (mode === "concerns") {
    return [
      negativeDomains[0] ? { label: "Main concern", domain: negativeDomains[0].domain } : null,
      negativeDomains[1] ? { label: "Next concern", domain: negativeDomains[1].domain } : null,
    ].filter((item): item is { label: string; domain: string } => Boolean(item));
  }

  if (mode === "strength-watch") {
    const chips: { label: string; domain: string }[] = [];
    if (row.primary_strength_domain) {
      chips.push({ label: "Primary strength", domain: row.primary_strength_domain });
    }
    if (negativeDomains[0]?.domain) {
      chips.push({ label: "Watch area", domain: negativeDomains[0].domain });
    } else if (row.primary_concern_domain) {
      chips.push({ label: "Watch area", domain: row.primary_concern_domain });
    }
    return chips;
  }

  const chips: { label: string; domain: string }[] = [];
  if (row.primary_concern_domain) {
    chips.push({ label: "Primary concern", domain: row.primary_concern_domain });
  }
  if (row.primary_strength_domain) {
    chips.push({ label: "Primary strength", domain: row.primary_strength_domain });
  }
  return chips;
}

function RankedStudentCards({
  rows,
  empty,
  onStudentClick,
  domainMode = "default",
}: {
  rows: Cat4StudentReportRow[];
  empty: string;
  onStudentClick: (row: Cat4StudentReportRow) => void;
  domainMode?: RankedCardDomainMode;
}) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{empty}</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const domainChips = rankedCardDomainChips(row, domainMode);
        return (
        <div key={`${row.student_id || row.student_name}-${index}`} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start gap-3 pr-28">
            <div>
              <button
                type="button"
                onClick={() => onStudentClick(row)}
                className="font-semibold text-slate-900 transition hover:text-emerald-700 hover:underline"
              >
                {row.student_name}
              </button>
              {!!row.profile_label && <div className="mt-1 text-xs text-slate-500">{row.profile_label}</div>}
              <div className="mt-2 text-sm text-slate-600">{compactStudentInsight(row)}</div>
              {row.baseline_to_date_label ? (
                <div className="mt-1 text-xs font-medium text-slate-500">Since baseline: {row.baseline_to_date_label}</div>
              ) : null}
            </div>
          </div>
          {row.status ? (
            <span className={`absolute right-4 top-4 rounded-full border px-3 py-1 text-xs font-semibold ${statusPill(row.status)}`}>
              {row.status.replace("_", " ")}
            </span>
          ) : null}
          {row.discrepancy_label ? (
            <div className="mt-3">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {row.discrepancy_label}
              </span>
            </div>
          ) : null}
          {domainChips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {domainChips.map((chip, chipIndex) => (
                <span key={`${row.student_id || row.student_name}-${chip.label}-${chipIndex}`} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(chip.domain)}`}>
                  {chip.label}: {chip.domain}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )})}
    </div>
  );
}

function Sparkline({ points }: { points: Cat4StudentHistoryPoint[] }) {
  const width = 360;
  const height = 132;
  const pad = 10;

  const vals = points
    .flatMap((point) => [point.student, point.cohort_avg])
    .filter((value): value is number => typeof value === "number");

  const maxY = Math.max(100, ...vals);
  const minY = 0;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const xTo = (index: number) => pad + (points.length <= 1 ? 0 : (index / (points.length - 1)) * w);
  const yTo = (value: number) => pad + (1 - (value - minY) / (maxY - minY || 1)) * h;

  const poly = (getter: (point: Cat4StudentHistoryPoint) => number | null) =>
    points
      .map((point, index) => {
        const value = getter(point);
        return typeof value === "number" ? `${xTo(index)},${yTo(value)}` : null;
      })
      .filter(Boolean)
      .join(" ");

  return (
    <svg width={width} height={height} className="max-w-full">
      <polyline
        points={poly((point) => point.cohort_avg)}
        fill="none"
        strokeWidth="2"
        strokeDasharray="4 4"
        className="stroke-red-500"
      />
      <polyline
        points={poly((point) => point.student)}
        fill="none"
        strokeWidth="2.5"
        className="stroke-slate-900"
      />
    </svg>
  );
}

export default function Cat4InsightsPage({ publicDemo = false }: Cat4InsightsPageProps) {
  const { id } = useParams<{ id: string }>();
  const classId = useMemo(() => Number(id), [id]);
  const validClassId = Number.isFinite(classId) && classId > 0;
  const canLoadCat4 = publicDemo || validClassId;
  const navigate = useNavigate();
  const cat4ApiBase = publicDemo ? `${API_BASE}/public/demo/cat4` : `${API_BASE}/classes/${classId}/cat4`;

  const card = "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)]";
  const cardPad = "p-4 md:p-5";

  const [meta, setMeta] = useState<Cat4MetaPayload | null>(null);
  const [report, setReport] = useState<Cat4ReportPayload | null>(null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<string, Cat4StudentHistoryResp | null>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState<Cat4StudentReportRow | null>(null);
  const [interpretationCache, setInterpretationCache] = useState<Record<string, Cat4StudentInterpretationResp | null>>({});
  const [interpretationLoading, setInterpretationLoading] = useState<Record<string, boolean>>({});
  const [interpretationError, setInterpretationError] = useState<Record<string, string | null>>({});
  const [selectedBaselineId, setSelectedBaselineId] = useState<number | "">("");
  const [selectedTermSetId, setSelectedTermSetId] = useState<number | "">("");
  const [selectedCohortKey, setSelectedCohortKey] = useState("default");
  const [cohortDraftName, setCohortDraftName] = useState("");
  const [selectedThresholdPercent, setSelectedThresholdPercent] = useState<number | "">("");
  const [domainChartMode, setDomainChartMode] = useState<"concerns" | "strengths">("concerns");
  const [manualLevelsEnabled, setManualLevelsEnabled] = useState(false);
  const [teacherSchoolName, setTeacherSchoolName] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [baselineTitle, setBaselineTitle] = useState("");
  const [baselineDate, setBaselineDate] = useState("");
  const [baselineRowsText, setBaselineRowsText] = useState("");
  const [termTitle, setTermTitle] = useState("");
  const [termAcademicYear, setTermAcademicYear] = useState("");
  const [termKey, setTermKey] = useState("");
  const [termRowsText, setTermRowsText] = useState("");
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [savingTerm, setSavingTerm] = useState(false);
  const [deletingTermSet, setDeletingTermSet] = useState(false);
  const [loadingTermEntry, setLoadingTermEntry] = useState(false);
  const [savingNativeTermRows, setSavingNativeTermRows] = useState(false);
  const [termEntryCollapsed, setTermEntryCollapsed] = useState(true);
  const [workbookPreview, setWorkbookPreview] = useState<Cat4WorkbookPreview | null>(null);
  const [termEntryRows, setTermEntryRows] = useState<Cat4TermEntryRow[]>([]);
  const [termEntryStatus, setTermEntryStatus] = useState<string | null>(null);
  const [termEntrySearch, setTermEntrySearch] = useState("");
  const [termPasteText, setTermPasteText] = useState("");
  const [validatingWorkbook, setValidatingWorkbook] = useState(false);
  const [importingWorkbook, setImportingWorkbook] = useState(false);
  const baselineCsvInputRef = useRef<HTMLInputElement | null>(null);
  const termCsvInputRef = useRef<HTMLInputElement | null>(null);
  const workbookInputRef = useRef<HTMLInputElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const baselineDraftRows = useMemo(() => parseBaselineRows(baselineRowsText), [baselineRowsText]);
  const termDraftRows = useMemo(() => parseTermRows(termRowsText), [termRowsText]);
  const baselinePreview = useMemo(() => buildImportPreview(baselineDraftRows, students, "baseline"), [baselineDraftRows, students]);
  const termPreview = useMemo(() => buildImportPreview(termDraftRows, students, "term"), [termDraftRows, students]);
  const activeHistoryBaselineId = useMemo(
    () => (typeof selectedBaselineId === "number" && selectedBaselineId > 0 ? selectedBaselineId : report?.baseline_set?.id ?? null),
    [selectedBaselineId, report]
  );
  const selectedHistoryKey = useMemo(
    () =>
      selectedHistoryStudent && activeHistoryBaselineId
        ? cat4HistoryCacheKey(activeHistoryBaselineId, selectedHistoryStudent.student_name)
        : null,
    [selectedHistoryStudent, activeHistoryBaselineId]
  );
  const selectedHistory = selectedHistoryKey ? historyCache[selectedHistoryKey] ?? null : null;
  const selectedHistoryBusy = selectedHistoryKey ? Boolean(historyLoading[selectedHistoryKey]) : false;
  const activeInterpretationTermSetId = useMemo(
    () => (typeof selectedTermSetId === "number" && selectedTermSetId > 0 ? selectedTermSetId : report?.latest_term_set?.id ?? null),
    [selectedTermSetId, report]
  );
  const selectedInterpretationKey = useMemo(
    () =>
      selectedHistoryStudent && activeHistoryBaselineId && activeInterpretationTermSetId
        ? cat4InterpretationCacheKey(activeHistoryBaselineId, activeInterpretationTermSetId, selectedHistoryStudent.student_name)
        : null,
    [selectedHistoryStudent, activeHistoryBaselineId, activeInterpretationTermSetId]
  );
  const selectedInterpretation = selectedInterpretationKey ? interpretationCache[selectedInterpretationKey] ?? null : null;
  const selectedInterpretationBusy = selectedInterpretationKey ? Boolean(interpretationLoading[selectedInterpretationKey]) : false;
  const selectedInterpretationError = selectedInterpretationKey ? interpretationError[selectedInterpretationKey] ?? null : null;
  const selectedTermSet = useMemo(
    () =>
      typeof selectedTermSetId === "number" && meta
        ? meta.term_sets.find((item) => item.id === selectedTermSetId) ?? null
        : null,
    [meta, selectedTermSetId]
  );
  const selectedCohort = useMemo(
    () => meta?.cohorts?.find((item) => item.key === selectedCohortKey) ?? null,
    [meta, selectedCohortKey]
  );
  const requestedCohort = useMemo(() => {
    const draft = cohortDraftName.trim();
    if (draft) {
      const key = buildCat4CohortKey(draft);
      return { key, name: buildCat4CohortName(draft, key) };
    }
    const key = buildCat4CohortKey(selectedCohortKey);
    return {
      key,
      name: selectedCohort?.name || buildCat4CohortName("", key),
    };
  }, [cohortDraftName, selectedCohort, selectedCohortKey]);
  const filteredTermEntryRows = useMemo(() => {
    const query = termEntrySearch.trim().toLowerCase();
    return termEntryRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => (!query ? true : row.raw_name.toLowerCase().includes(query)));
  }, [termEntryRows, termEntrySearch]);
  const rankedThresholdLabel = report?.selected_threshold_percent ? `${report.selected_threshold_percent}%` : null;
  const modalStudentRow = useMemo(() => {
    if (!selectedHistoryStudent) return null;
    if (hasUsableDomainMovements(selectedHistoryStudent)) {
      return selectedHistoryStudent;
    }

    const rows = report?.all_matched_students || [];
    if (selectedHistoryStudent.student_id != null) {
      const byId = rows.find((row) => row.student_id === selectedHistoryStudent.student_id);
      if (hasUsableDomainMovements(byId)) {
        return byId;
      }
    }

    const targetName = normaliseCat4HistoryName(selectedHistoryStudent.student_name);
    const byName = rows.find((row) => normaliseCat4HistoryName(row.student_name) === targetName);
    if (hasUsableDomainMovements(byName)) {
      return byName;
    }

    return selectedHistoryStudent;
  }, [selectedHistoryStudent, report]);

  function setSectionRef(key: string) {
    return (node: HTMLDivElement | null) => {
      sectionRefs.current[key] = node;
    };
  }

  function renderSectionExportButton(key: string, title: string) {
    if (publicDemo) return null;
    return (
      <button
        type="button"
        onClick={() => void exportSectionPdf(key, title)}
        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Export PDF
      </button>
    );
  }

  async function exportStudentModalPdf(title: string) {
    const headerNode = sectionRefs.current["student-modal-export-header"];
    const interpretationNode = sectionRefs.current["student-modal-export-interpretation"];
    const visualsNode = sectionRefs.current["student-modal-export-visuals"];
    const exportNodes = [headerNode, interpretationNode, visualsNode].filter(
      (node): node is HTMLDivElement => Boolean(node),
    );

    if (exportNodes.length !== 3) {
      setError("Could not prepare the CAT4 student report export");
      return;
    }

    const captureOptions = {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    } as const;

    const capturedSections = await Promise.all(
      exportNodes.map(async (node) => {
        const imageData = await toPng(node, captureOptions);
        const img = new Image();
        img.src = imageData;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("student-export-image-load-failed"));
        });
        return { imageData, width: img.width, height: img.height };
      }),
    );

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 32;
    const headerHeight = 74;
    const footerHeight = 26;
    const sectionGap = 18;
    const contentWidth = pageWidth - margin * 2;
    const maxSectionHeight = pageHeight - headerHeight - footerHeight - margin;
    const exportDate = new Date().toLocaleDateString("en-IE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const reportTitle = teacherSchoolName || "Elume CAT4 Report";
    let logo: HTMLImageElement | null = null;

    try {
      logo = await loadBrandLogo();
    } catch {
      logo = null;
    }

    const drawHeader = () => {
      if (logo) {
        doc.addImage(logo, "PNG", margin, 18, 26, 26);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(15, 23, 42);
      doc.text(reportTitle, margin + (logo ? 36 : 0), 34);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text(title, margin, 58);
    };

    const drawFooter = (pageNumber: number) => {
      const footerY = pageHeight - 18;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      if (logo) {
        doc.addImage(logo, "PNG", margin, pageHeight - 30, 12, 12);
      }
      doc.text("Elume", margin + (logo ? 18 : 0), footerY);
      doc.text(`Exported ${exportDate}`, pageWidth / 2, footerY, { align: "center" });
      doc.text(`Page ${pageNumber}`, pageWidth - margin, footerY, { align: "right" });
    };

    let pageNumber = 1;
    let cursorY = headerHeight;
    drawHeader();
    drawFooter(pageNumber);

    capturedSections.forEach((section) => {
      const scale = Math.min(contentWidth / section.width, maxSectionHeight / section.height);
      const drawWidth = section.width * scale;
      const drawHeight = section.height * scale;

      if (cursorY > headerHeight && cursorY + drawHeight > pageHeight - footerHeight - margin) {
        doc.addPage();
        pageNumber += 1;
        drawHeader();
        drawFooter(pageNumber);
        cursorY = headerHeight;
      }

      doc.addImage(section.imageData, "PNG", margin, cursorY, drawWidth, drawHeight);
      cursorY += drawHeight + sectionGap;
    });

    doc.save(`elume-cat4-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
  }

  async function loadBrandLogo() {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("logo-load-failed"));
      image.src = ELogo2;
    });
  }

  async function loadTeacherBranding() {
    if (publicDemo) {
      setTeacherSchoolName("Elume Demo School");
      return;
    }
    try {
      const data = (await apiFetch("/teacher-admin/state")) as TeacherAdminBrandingState;
      setTeacherSchoolName(String(data?.state?.profile?.schoolName ?? "").trim());
    } catch {
      setTeacherSchoolName("");
    }
  }

  async function exportSectionPdf(sectionKey: string, title: string) {
    if (sectionKey === "student-modal-report") {
      try {
        setError(null);
        await exportStudentModalPdf(title);
      } catch {
        setError("Could not export this CAT4 student report to PDF");
      }
      return;
    }

    const node = sectionRefs.current[sectionKey];
    if (!node) {
      setError("Could not find that CAT4 section to export");
      return;
    }

    try {
      setError(null);
      const imageData = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 32;
      const headerHeight = 74;
      const contentWidth = pageWidth - margin * 2;
      const imageProps = doc.getImageProperties(imageData);
      const imageHeight = (imageProps.height * contentWidth) / imageProps.width;
      const exportDate = new Date().toLocaleDateString("en-IE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const reportTitle = teacherSchoolName || "Elume CAT4 Report";
      const footerHeight = 26;
      const availableHeight = pageHeight - headerHeight - footerHeight - margin;
      let logo: HTMLImageElement | null = null;

      try {
        logo = await loadBrandLogo();
      } catch {
        logo = null;
      }

      const drawHeader = () => {
        if (logo) {
          doc.addImage(logo, "PNG", margin, 18, 26, 26);
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.setTextColor(15, 23, 42);
        doc.text(reportTitle, margin + (logo ? 36 : 0), 34);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105);
        doc.text(title, margin, 58);
      };

      const drawFooter = (pageNumber: number) => {
        const footerY = pageHeight - 18;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        if (logo) {
          doc.addImage(logo, "PNG", margin, pageHeight - 30, 12, 12);
        }
        doc.text("Elume", margin + (logo ? 18 : 0), footerY);
        doc.text(`Exported ${exportDate}`, pageWidth / 2, footerY, { align: "center" });
        doc.text(`Page ${pageNumber}`, pageWidth - margin, footerY, { align: "right" });
      };

      drawHeader();
      drawFooter(1);
      doc.addImage(imageData, "PNG", margin, headerHeight, contentWidth, imageHeight);

      let remainingHeight = imageHeight - availableHeight;
      let offsetY = availableHeight;
      let pageNumber = 1;

      while (remainingHeight > 0) {
        doc.addPage();
        pageNumber += 1;
        drawHeader();
        drawFooter(pageNumber);
        doc.addImage(imageData, "PNG", margin, headerHeight - offsetY, contentWidth, imageHeight);
        remainingHeight -= availableHeight;
        offsetY += availableHeight;
      }

      doc.save(`elume-cat4-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
    } catch {
      setError("Could not export this CAT4 section to PDF");
    }
  }

  async function loadMeta(nextCohortKey?: string): Promise<Cat4MetaPayload | null> {
    if (!canLoadCat4) return null;
    const params = new URLSearchParams();
    const cohortKey = buildCat4CohortKey(nextCohortKey || selectedCohortKey || "default");
    if (!publicDemo && cohortKey) params.set("cohort_key", cohortKey);
    const query = params.toString();
    const data = (await apiFetch(`${cat4ApiBase}/meta${query ? `?${query}` : ""}`)) as Cat4MetaPayload;
    setMeta(data);
    const resolvedCohortKey =
      (data.cohorts || []).some((item) => item.key === cohortKey)
        ? cohortKey
        : data.selected_cohort?.key || data.cohorts?.[0]?.key || cohortKey;
    setSelectedCohortKey((prev) => (prev === resolvedCohortKey ? prev : resolvedCohortKey));
    setSelectedBaselineId((prev) => (prev && data.baseline_sets.some((item) => item.id === prev) ? prev : data.baseline_sets[0]?.id || ""));
    setSelectedTermSetId((prev) => (prev && data.term_sets.some((item) => item.id === prev) ? prev : data.term_sets[0]?.id || ""));
    return data;
  }

  async function loadReport(nextBaselineId?: number | "", nextTermSetId?: number | "") {
    if (!canLoadCat4) return;
    const params = new URLSearchParams();
    const baselineId = nextBaselineId === undefined ? selectedBaselineId : nextBaselineId;
    const termSetId = nextTermSetId === undefined ? selectedTermSetId : nextTermSetId;
    if (baselineId) params.set("baseline_id", String(baselineId));
    if (termSetId) params.set("term_set_id", String(termSetId));
    if (!publicDemo && selectedCohortKey) params.set("cohort_key", buildCat4CohortKey(selectedCohortKey));
    if (selectedThresholdPercent) params.set("threshold_percent", String(selectedThresholdPercent));
    const query = params.toString();
    const data = (await apiFetch(`${cat4ApiBase}/report${query ? `?${query}` : ""}`)) as Cat4ReportPayload;
    setReport(data);
  }

  async function loadTermEntry(nextBaselineId?: number | "", nextTermSetId?: number | "") {
    if (publicDemo) {
      setTermEntryRows([]);
      return;
    }
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
      if (selectedCohortKey) params.set("cohort_key", buildCat4CohortKey(selectedCohortKey));
      const data = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/term-entry?${params.toString()}`)) as Cat4TermEntryPayload;
      const preparedRows = prepareTermEntryRows(data.rows || []);
      setTermEntryRows(preparedRows);
      if (preparedRows.some((row) => rowHasSavedLevels(row))) {
        setManualLevelsEnabled(true);
      }
    } finally {
      setLoadingTermEntry(false);
    }
  }

  async function fetchStudentHistory(rawName: string) {
    if (!canLoadCat4 || !activeHistoryBaselineId) return;

    const key = cat4HistoryCacheKey(activeHistoryBaselineId, rawName);
    if (Object.prototype.hasOwnProperty.call(historyCache, key) || historyLoading[key]) return;

    setHistoryLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const params = new URLSearchParams({
        baseline_id: String(activeHistoryBaselineId),
        raw_name: rawName,
      });
      const data = (await apiFetch(
        `${cat4ApiBase}/student-history?${params.toString()}`
      )) as Cat4StudentHistoryResp;
      setHistoryCache((prev) => ({ ...prev, [key]: data }));
    } catch {
      setHistoryCache((prev) => ({ ...prev, [key]: null }));
    } finally {
      setHistoryLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function fetchStudentInterpretation(student: Cat4StudentReportRow) {
    if (!canLoadCat4 || !activeHistoryBaselineId || !activeInterpretationTermSetId) return;

    const key = cat4InterpretationCacheKey(activeHistoryBaselineId, activeInterpretationTermSetId, student.student_name);
    if (Object.prototype.hasOwnProperty.call(interpretationCache, key) || interpretationLoading[key]) return;

    setInterpretationLoading((prev) => ({ ...prev, [key]: true }));
    setInterpretationError((prev) => ({ ...prev, [key]: null }));

    try {
      const data = (await apiFetch(`${cat4ApiBase}/student-interpretation`, {
        method: "POST",
        body: JSON.stringify({
          baseline_id: activeHistoryBaselineId,
          term_set_id: activeInterpretationTermSetId,
          student_id: student.student_id ?? null,
          raw_name: student.student_name,
        }),
      })) as Cat4StudentInterpretationResp;
      setInterpretationCache((prev) => ({ ...prev, [key]: data }));
    } catch {
      setInterpretationCache((prev) => ({ ...prev, [key]: null }));
      setInterpretationError((prev) => ({
        ...prev,
        [key]: "The explanation could not be generated just now. You can try again, and the structured CAT4 facts below remain available for review.",
      }));
    } finally {
      setInterpretationLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function openStudentHistoryModal(student: Cat4StudentReportRow) {
    setSelectedHistoryStudent(student);
    await fetchStudentHistory(student.student_name);
  }

  useEffect(() => {
    if (!canLoadCat4) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [metaData, studentsData] = await Promise.all([
          loadMeta(),
          publicDemo ? Promise.resolve([] as ClassStudent[]) : (apiFetch(`${API_BASE}/classes/${classId}/students`) as Promise<ClassStudent[]>),
          loadTeacherBranding(),
        ]);
        setStudents(Array.isArray(studentsData) ? studentsData : []);
        await loadReport(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
        if (!publicDemo) {
          await loadTermEntry(metaData?.baseline_sets[0]?.id || "", metaData?.term_sets[0]?.id || "");
        }
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
  }, [classId, validClassId, canLoadCat4, publicDemo, selectedCohortKey]);

  useEffect(() => {
    if (!selectedBaselineId && !selectedTermSetId) return;
    if (!meta) return;
    void loadReport();
    if (!publicDemo) {
      void loadTermEntry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicDemo, selectedBaselineId, selectedTermSetId, selectedThresholdPercent]);

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
      form.append("cohort_key", requestedCohort.key);
      const preview = (await apiFetch(`${API_BASE}/classes/${classId}/cat4/workbook/validate`, {
        method: "POST",
        body: form,
      })) as Cat4WorkbookPreview;
      setWorkbookPreview(preview);
      if (!preview.ok) return;

      setImportingWorkbook(true);
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("cohort_key", requestedCohort.key);
      uploadForm.append("cohort_name", requestedCohort.name);
      await apiFetch(`${API_BASE}/classes/${classId}/cat4/workbooks`, {
        method: "POST",
        body: uploadForm,
      });
      if (selectedCohortKey !== requestedCohort.key) {
        setSelectedCohortKey(requestedCohort.key);
      }
      setCohortDraftName("");
      const metaData = await loadMeta(requestedCohort.key);
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

    setError(null);
    try {
      setImportingWorkbook(true);
      const params = new URLSearchParams({ cohort_key: buildCat4CohortKey(selectedCohortKey) });
      await apiFetch(`${API_BASE}/classes/${classId}/cat4/reset?${params.toString()}`, {
        method: "POST",
      });
      setWorkbookPreview(null);
      setSelectedBaselineId("");
      setSelectedTermSetId("");
      setShowResetConfirm(false);
      const metaData = await loadMeta(selectedCohortKey);
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

    writeStudentSection("Bottom 10% by Latest Academic Average", report.bottom_10_percent);
    writeStudentSection("Top 5% by Latest Academic Average", report.top_5_percent);
    writeStudentSection("Biggest Downward Movers vs CAT4 Baseline", report.biggest_downward_movers);
    writeStudentSection("Biggest Upward Movers vs CAT4 Baseline", report.biggest_upward_movers);
    writeStudentSection("Biggest Academic Improvers", report.biggest_attainment_improvers);
    writeStudentSection("Biggest Academic Decliners", report.biggest_attainment_decliners);
    writeStudentSection("Mixed Signals / Requires Interpretation", report.discrepancy_cases);

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

    doc.save(publicDemo ? "elume-cat4-demo-report.pdf" : `elume-cat4-report-class-${classId}.pdf`);
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
          cohort_key: requestedCohort.key,
          cohort_name: requestedCohort.name,
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
      if (selectedCohortKey !== requestedCohort.key) {
        setSelectedCohortKey(requestedCohort.key);
      }
      setCohortDraftName("");
      const metaData = await loadMeta(requestedCohort.key);
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
          cohort_key: requestedCohort.key,
          cohort_name: requestedCohort.name,
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
      if (selectedCohortKey !== requestedCohort.key) {
        setSelectedCohortKey(requestedCohort.key);
      }
      setCohortDraftName("");
      const metaData = await loadMeta(requestedCohort.key);
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

  async function deleteSelectedTermSet() {
    if (!validClassId || typeof selectedTermSetId !== "number" || selectedTermSetId <= 0) {
      setError("Select a term set before deleting");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${selectedTermSet?.title || "this term set"}"?\n\nThis will remove the term set and its saved CAT4 term rows. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingTermSet(true);
    setError(null);
    setTermEntryStatus(null);

    try {
      await apiFetch(`${API_BASE}/classes/${classId}/cat4/term-sets/${selectedTermSetId}`, {
        method: "DELETE",
      });

      const metaData = await loadMeta();
      const nextBaselineId =
        (typeof selectedBaselineId === "number" && selectedBaselineId > 0
          ? selectedBaselineId
          : metaData?.baseline_sets[0]?.id) || "";
      const nextTermSetId = metaData?.term_sets[0]?.id || "";

      setSelectedTermSetId(nextTermSetId);
      await loadReport(nextBaselineId, nextTermSetId);
      await loadTermEntry(nextBaselineId, nextTermSetId);
      setTermEntryStatus(
        nextTermSetId
          ? "Term set deleted. The next available term set is now selected."
          : "Term set deleted. No term sets remain."
      );
    } catch (e: any) {
      setError(e?.message || "Could not delete the selected term set");
    } finally {
      setDeletingTermSet(false);
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

  function updateTermEntryLevel(rowIndex: number, subject: string, value: string) {
    setTermEntryRows((prev) =>
      prev.map((row, index) => {
        if (index !== rowIndex) return row;
        return {
          ...row,
          subject_levels: {
            ...mergeSubjectLevels(row.subject_levels),
            [subject]: normaliseSubjectLevel(value),
          },
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
      setError("Create or select a term set before saving manual results");
      return;
    }

    setSavingNativeTermRows(true);
    setError(null);
    setTermEntryStatus(null);
    try {
      const rows = termEntryRows
        .map((row) => {
          const subject_scores = mergeSubjectScores(row.subject_scores);
          const subject_levels = mergeSubjectLevels(row.subject_levels);
          const subjectValues = Object.entries(subject_scores).filter(([, value]) => typeof value === "number");
          const metrics = termMetricsFromSubjectScores(subject_scores);
          const subjectPayload = TERM_SUBJECT_COLUMNS.reduce<Record<string, number | { score: number | null; level: TermSubjectLevel }>>((acc, subject) => {
            const score = subject_scores[subject];
            const level = subject_levels[subject];
            if (LEVEL_SENSITIVE_SUBJECTS.has(subject)) {
              if (typeof score === "number" || level) {
                acc[subject] = {
                  score: typeof score === "number" ? score : null,
                  level,
                };
              }
              return acc;
            }
            if (typeof score === "number") {
              acc[subject] = score;
            }
            return acc;
          }, {});
          return {
            raw_name: row.raw_name,
            average_percent: subjectValues.length ? metrics.average_percent : row.average_percent ?? null,
            subject_count: subjectValues.length ? metrics.subject_count : row.subject_count ?? null,
            raw_subjects_json: Object.keys(subjectPayload).length ? subjectPayload : null,
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
      setTermEntryStatus(`Saved ${rows.length} manual result row${rows.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      setError(e?.message || "Could not save manual results");
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
              {!publicDemo && (
                <button
                  type="button"
                  onClick={exportPdfReport}
                  className="rounded-2xl border-2 border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
                >
                  Export PDF
                </button>
              )}
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
              {!publicDemo && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Back to Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="rounded-2xl border-2 border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Reset CAT4 Data
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!publicDemo && !loading && !teacherSchoolName && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div>Add your school name in Teacher Admin to personalise CAT4 PDF exports.</div>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Open Teacher Admin
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-sm text-slate-600">Loading CAT4 insights...</div>
        ) : !meta ? (
          <div className="mt-6 rounded-3xl border-2 border-slate-200 bg-white p-6 text-sm text-slate-600">
            CAT4 data could not be loaded. Please refresh and try again.
          </div>
        ) : (
          <>
            {!publicDemo && (
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
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">Manual Results Entry</div>
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
                  A locked CAT4 baseline is needed before manual results entry can begin.
                </div>
              ) : termEntryCollapsed ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Manual results entry is collapsed. Expand it when you need to edit or paste CAT4 term results.
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

                  {selectedTermSet && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                      <div className="text-sm text-rose-900">
                        Current term set: <span className="font-semibold">{selectedTermSet.title}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteSelectedTermSet()}
                        disabled={deletingTermSet}
                        className="rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingTermSet ? "Deleting..." : "Delete Term Set"}
                      </button>
                    </div>
                  )}

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
                        The manual results grid below always follows the selected baseline and term.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Quick paste</div>
                          <div className="mt-1 text-sm text-slate-600">Paste a term spreadsheet block here and apply it into the manual grid.</div>
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

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Levels</div>
                      <div className="mt-1 text-sm text-slate-600">Turn level entry on only when Irish, English, and Maths need Higher or Ordinary labels for this session.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManualLevelsEnabled((prev) => !prev)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${manualLevelsEnabled ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {manualLevelsEnabled ? "Levels On" : "Levels Off"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-800">Find a student in the manual results grid</div>
                    <input
                      value={termEntrySearch}
                      onChange={(e) => setTermEntrySearch(e.target.value)}
                      placeholder="Search student name"
                      className="mt-3 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:max-w-sm"
                    />
                  </div>

                  {!selectedTermSetId ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Create a term set to start entering manual CAT4 results.
                    </div>
                  ) : loadingTermEntry ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Loading manual results grid...
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
                                  {manualLevelsEnabled && LEVEL_SENSITIVE_SUBJECTS.has(subject) ? (
                                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Score + Level</div>
                                  ) : null}
                                </th>
                              ))}
                              <th className="px-3 py-3 font-semibold">Avg</th>
                              <th className="px-3 py-3 font-semibold">Count</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredTermEntryRows.map(({ row, index: rowIndex }) => (
                              <tr key={`${row.raw_name}-${rowIndex}`}>
                                <td className="px-3 py-3">
                                  <div className="font-semibold text-slate-900">{row.raw_name}</div>
                                  {!row.has_baseline && <div className="mt-1 text-xs text-amber-800">Extra term row</div>}
                                  {!!row.confidence_note && <div className="mt-1 text-xs text-slate-500">{row.confidence_note}</div>}
                                </td>
                                <td className="px-3 py-3 text-slate-600">{row.profile_label || "-"}</td>
                                {TERM_SUBJECT_COLUMNS.map((subject) => (
                                  <td key={`${row.raw_name}-${subject}`} className="px-2 py-2">
                                    <div className="flex flex-col gap-2">
                                      <input
                                        value={row.subject_scores?.[subject] ?? ""}
                                        onChange={(e) => updateTermEntryScore(rowIndex, subject, e.target.value)}
                                        inputMode="numeric"
                                        className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
                                        placeholder="-"
                                      />
                                      {manualLevelsEnabled && LEVEL_SENSITIVE_SUBJECTS.has(subject) ? (
                                        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                                          {(["Higher", "Ordinary"] as const).map((level) => {
                                            const active = row.subject_levels?.[subject] === level;
                                            return (
                                              <button
                                                key={`${row.raw_name}-${subject}-${level}`}
                                                type="button"
                                                onClick={() => updateTermEntryLevel(rowIndex, subject, level)}
                                                className={[
                                                  "rounded-lg px-2 py-1 text-[11px] font-semibold transition",
                                                  active
                                                    ? level === "Higher"
                                                      ? "bg-emerald-600 text-white"
                                                      : "bg-amber-500 text-white"
                                                    : "text-slate-600 hover:bg-slate-50",
                                                ].join(" ")}
                                              >
                                                {level === "Higher" ? "H" : "O"}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                ))}
                                <td className="px-3 py-3 font-semibold text-slate-900">{pct(row.average_percent)}</td>
                                <td className="px-3 py-3 text-slate-600">{row.subject_count || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!filteredTermEntryRows.length ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                          No students match that search.
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-600">
                          {filteredTermEntryRows.length} of {termEntryRows.length} cohort row{termEntryRows.length === 1 ? "" : "s"} shown in the manual results grid.
                        </div>
                        <button
                          type="button"
                          onClick={() => void saveNativeTermRows()}
                          disabled={savingNativeTermRows}
                          className="rounded-2xl border-2 border-emerald-700 bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingNativeTermRows ? "Saving..." : "Save Manual Results"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            </>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {(report?.summary_cards || []).map((cardItem) => (
                <div key={cardItem.key} className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-600">{cardItem.label}</div>
                  <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">{cardItem.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-6">
              <div ref={setSectionRef("domain-concern-summary")} className={`${card} ${cardPad}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold tracking-tight text-slate-900">Domain Concern Summary</div>
                    <div className="mt-1 text-sm text-slate-600">Shows where concern is most common, where strengths are also appearing, and how varied each CAT4 area is across the cohort.</div>
                  </div>
                  {renderSectionExportButton("domain-concern-summary", "Domain Concern Summary")}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">Cohort Domain Distribution</div>
                      <div className="mt-1 text-sm text-slate-600">A quick visual summary of where the main CAT4 pattern is showing most often.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDomainChartMode("concerns")}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${domainChartMode === "concerns" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        Main concerns
                      </button>
                      <button
                        type="button"
                        onClick={() => setDomainChartMode("strengths")}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${domainChartMode === "strengths" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        Main strengths
                      </button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <DoughnutSummary
                      title={domainChartMode === "concerns" ? "Concerns" : "Strengths"}
                      items={domainChartMode === "concerns" ? report?.concern_distribution || [] : report?.strength_distribution || []}
                    />
                  </div>
                </div>
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
                          Primary strengths {item.primary_strength_count || 0}
                        </div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Movement spread: {item.movement_spread_label || "Low"}
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

              <div className={`grid gap-4 ${publicDemo ? "" : "xl:grid-cols-2"}`}>
                <div className={`${card} ${cardPad}`}>
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">{publicDemo ? "Demo Workbook Summary" : "Active Workbook Summary"}</div>
                  <div className="mt-1 text-sm text-slate-600">{publicDemo ? "This read-only CAT4 analysis is loaded from Elume's generated demo workbook." : "Current active workbook version driving the structured CAT4 report."}</div>
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

                {!publicDemo && <div className={`${card} ${cardPad}`}>
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
                </div>}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
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

              <div className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Ranked Group Threshold</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Apply one cohort threshold across top/bottom academic and CAT4-relative movement groups.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedThresholdPercent("")}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${selectedThresholdPercent === "" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      Default
                    </button>
                    {[5, 10, 15].map((value) => (
                      <button
                        key={`threshold-${value}`}
                        type="button"
                        onClick={() => setSelectedThresholdPercent(value)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${selectedThresholdPercent === value ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-900">Current subject mapping used for CAT4 domain analysis</div>
                <div className="mt-1 text-sm text-slate-600">Default subject-to-domain mapping used for Elume&apos;s current CAT4 domain analysis.</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Verbal:</span> English, Irish, French, Spanish, History, Geography, Business Studies
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Quantitative:</span> Mathematics, Science, Business Studies, Graphics
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Non-Verbal:</span> Science, Graphics, Geography, Visual Art
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Spatial:</span> Graphics, Geography, Visual Art, Home Economics, Science
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Some subjects contribute to more than one CAT4 domain. This overlap is intentional in the current default mapping.
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title={rankedThresholdLabel ? `Bottom ${rankedThresholdLabel} Academically` : "Bottom 10% Academically"}
                  description="Students with the lowest latest academic averages. The domain labels highlight the CAT4 areas showing the strongest concern signals, to help guide support."
                  defaultOpen
                  sectionRef={setSectionRef("bottom-attainment")}
                  headerActions={renderSectionExportButton("bottom-attainment", rankedThresholdLabel ? `Bottom ${rankedThresholdLabel}` : "Bottom Attainment")}
                >
                  <RankedStudentCards rows={report?.bottom_10_percent || []} empty="No bottom 10% cohort section is available yet." onStudentClick={openStudentHistoryModal} domainMode="concerns" />
                </CollapsibleCard>

                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title={rankedThresholdLabel ? `Top ${rankedThresholdLabel} Academically` : "Top 5% Academically"}
                  description="Students with the highest latest academic averages. The labels show one CAT4 strength and one watch area, so strong performance is viewed alongside the area that may still need attention."
                  defaultOpen
                  sectionRef={setSectionRef("top-attainment")}
                  headerActions={renderSectionExportButton("top-attainment", rankedThresholdLabel ? `Top ${rankedThresholdLabel}` : "Top Attainment")}
                >
                  <RankedStudentCards rows={report?.top_5_percent || []} empty="No top 5% cohort section is available yet." onStudentClick={openStudentHistoryModal} domainMode="strength-watch" />
                </CollapsibleCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title={rankedThresholdLabel ? `Downward Movers ${rankedThresholdLabel}` : "Biggest Downward Movers"}
                  description="Students showing the sharpest negative CAT4-relative movement. The domain labels show the areas contributing most to the decline, to help target support."
                  defaultOpen
                  sectionRef={setSectionRef("downward-movers")}
                  headerActions={renderSectionExportButton("downward-movers", rankedThresholdLabel ? `Downward Movers ${rankedThresholdLabel}` : "Downward Movers")}
                >
                  <RankedStudentCards rows={report?.biggest_downward_movers || []} empty="No downward movement section is available yet." onStudentClick={openStudentHistoryModal} domainMode="concerns" />
                </CollapsibleCard>

                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title={rankedThresholdLabel ? `Upward Movers ${rankedThresholdLabel}` : "Biggest Upward Movers"}
                  description="Students showing the strongest positive CAT4-relative movement. The labels show the main area of strength and one watch area, so improvement is viewed with balance."
                  defaultOpen
                  sectionRef={setSectionRef("upward-movers")}
                  headerActions={renderSectionExportButton("upward-movers", rankedThresholdLabel ? `Upward Movers ${rankedThresholdLabel}` : "Upward Movers")}
                >
                  <RankedStudentCards rows={report?.biggest_upward_movers || []} empty="No upward movement section is available yet." onStudentClick={openStudentHistoryModal} domainMode="strength-watch" />
                </CollapsibleCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title="Biggest Academic Improvers"
                  description="Students showing the strongest academic gains between the selected term and the previous comparable term."
                  defaultOpen={false}
                  sectionRef={setSectionRef("attainment-improvers")}
                  headerActions={renderSectionExportButton("attainment-improvers", "Biggest Academic Improvers")}
                >
                  <RankedStudentCards rows={report?.biggest_attainment_improvers || []} empty="No academic improvement section is available yet." onStudentClick={openStudentHistoryModal} />
                </CollapsibleCard>

                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title="Biggest Academic Decliners"
                  description="Students showing the sharpest academic decline between the selected term and the previous comparable term."
                  defaultOpen={false}
                  sectionRef={setSectionRef("attainment-decliners")}
                  headerActions={renderSectionExportButton("attainment-decliners", "Biggest Academic Decliners")}
                >
                  <RankedStudentCards rows={report?.biggest_attainment_decliners || []} empty="No academic decline section is available yet." onStudentClick={openStudentHistoryModal} />
                </CollapsibleCard>
              </div>

              <CollapsibleCard
                className={`${card} ${cardPad}`}
                title="Mixed Signals / Requires Interpretation"
                description="Cases where academic results changed sharply but CAT4-relative movement still points in the opposite direction."
                defaultOpen={false}
                sectionRef={setSectionRef("mixed-signals")}
                headerActions={renderSectionExportButton("mixed-signals", "Mixed Signals Requires Interpretation")}
              >
                <RankedStudentCards rows={report?.discrepancy_cases || []} empty="No mixed-signal cases are currently flagged." onStudentClick={openStudentHistoryModal} />
              </CollapsibleCard>

              <div className="grid gap-4 xl:grid-cols-2">
                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title="At Risk"
                  description="Bottom movement band relative to CAT4 baseline, with at least one student flagged in smaller cohorts."
                  defaultOpen={false}
                  sectionRef={setSectionRef("at-risk")}
                  headerActions={renderSectionExportButton("at-risk", "At Risk")}
                >
                  <StudentTable rows={report?.at_risk || []} empty="No students are flagged at risk in the selected CAT4 comparison." onStudentClick={openStudentHistoryModal} />
                </CollapsibleCard>

                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title="Excelling"
                  description="Top movement band relative to CAT4 baseline, with at least one student flagged in smaller cohorts."
                  defaultOpen={false}
                  sectionRef={setSectionRef("excelling")}
                  headerActions={renderSectionExportButton("excelling", "Excelling")}
                >
                  <StudentTable rows={report?.excelling || []} empty="No students are currently flagged as excelling." onStudentClick={openStudentHistoryModal} />
                </CollapsibleCard>

                <CollapsibleCard
                  className={`${card} ${cardPad}`}
                  title="Within Expected Range"
                  description="Students in the middle cohort band after structured movement scoring."
                  defaultOpen={false}
                  sectionRef={setSectionRef("within-expected-range")}
                  headerActions={renderSectionExportButton("within-expected-range", "Within Expected Range")}
                >
                  <StudentTable rows={report?.within_expected_range || []} empty="No students are currently flagged within the expected range." onStudentClick={openStudentHistoryModal} />
                </CollapsibleCard>
              </div>

              <CollapsibleCard
                className={`${card} ${cardPad}`}
                title="Full Student Comparison"
                description="Matched students only, comparing CAT4 cohort percentile against the selected named term set."
                defaultOpen={false}
                sectionRef={setSectionRef("full-student-comparison")}
                headerActions={renderSectionExportButton("full-student-comparison", "Full Student Comparison")}
              >
                <StudentTable rows={report?.all_matched_students || []} empty="Load at least one baseline set and one term set with matched students to see the report." onStudentClick={openStudentHistoryModal} showComparisonContext />
              </CollapsibleCard>
            </div>
          </>
        )}

        {selectedHistoryStudent && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
            onClick={() => setSelectedHistoryStudent(null)}
          >
            <div
              ref={setSectionRef("student-modal-report")}
              className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-extrabold tracking-tight text-slate-900">
                    {selectedHistoryStudent.student_name}
                  </div>
                  {!!selectedHistoryStudent.profile_label && (
                    <div className="mt-1 text-sm text-slate-500">{selectedHistoryStudent.profile_label}</div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedHistoryStudent(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                  title="Close"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Latest Average</div>
                  <div className="mt-1 text-xl font-extrabold text-slate-900">{pct(selectedHistoryStudent.latest_average_percent)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Previous Average</div>
                  <div className="mt-1 text-xl font-extrabold text-slate-900">{pct(selectedHistoryStudent.previous_average_percent)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Change</div>
                  <div className={`mt-1 text-xl font-extrabold ${typeof selectedHistoryStudent.trend_delta === "number" && selectedHistoryStudent.trend_delta < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {signedPct(selectedHistoryStudent.trend_delta)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">CAT4 Movement</div>
                  <div className={`mt-1 text-xl font-extrabold ${typeof (selectedHistoryStudent.movement_score ?? selectedHistoryStudent.value_added_delta) === "number" && (selectedHistoryStudent.movement_score ?? selectedHistoryStudent.value_added_delta)! < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {signedOneDecimal(selectedHistoryStudent.movement_score ?? selectedHistoryStudent.value_added_delta)}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Elume's Interpretation</div>
                    <div className="mt-1 text-xs text-slate-500">Plain-English interpretation of the current CAT4 picture, based on the available comparison data.</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {renderSectionExportButton("student-modal-report", `${selectedHistoryStudent.student_name} CAT4 Report`)}
                    <button
                      type="button"
                      onClick={() => void fetchStudentInterpretation(selectedHistoryStudent)}
                      disabled={selectedInterpretationBusy}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {publicDemo
                        ? selectedInterpretationBusy
                          ? "Loading..."
                          : selectedInterpretation
                            ? "Reload Demo Summary"
                            : "Load Demo Summary"
                        : selectedInterpretation
                          ? "Refresh Interpretation"
                          : selectedInterpretationBusy
                            ? "Generating..."
                            : "Generate Interpretation"}
                    </button>
                  </div>
                </div>

                {selectedInterpretation?.explanation ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${publicDemo || selectedInterpretation.source !== "fallback" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                        {publicDemo ? "Elume summary" : selectedInterpretation.source === "fallback" ? "Elume fallback summary" : "Elume summary"}
                      </span>
                    </div>
                    <div className="text-sm leading-6 text-slate-700">{selectedInterpretation.explanation}</div>
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Based on facts</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {hasMeaningfulFact(selectedInterpretation.facts.latest_average_percent) ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Latest {pct(selectedInterpretation.facts.latest_average_percent)}
                          </span>
                        ) : null}
                        {hasMeaningfulFact(selectedInterpretation.facts.previous_average_percent) ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Previous {pct(selectedInterpretation.facts.previous_average_percent)}
                          </span>
                        ) : null}
                        {hasMeaningfulFact(selectedInterpretation.facts.trend_delta) ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Change {signedPct(selectedInterpretation.facts.trend_delta)}
                          </span>
                        ) : null}
                        {hasMeaningfulFact(selectedInterpretation.facts.movement_score) ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            CAT4-relative movement {signedOneDecimal(selectedInterpretation.facts.movement_score)}
                          </span>
                        ) : null}
                        {hasMeaningfulFact(selectedInterpretation.facts.comparison_confidence) ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Confidence {selectedInterpretation.facts.comparison_confidence}
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.discrepancy_label ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            {selectedInterpretation.facts.discrepancy_label}
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.primary_concern_domain ? (
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(selectedInterpretation.facts.primary_concern_domain)}`}>
                            Concern {selectedInterpretation.facts.primary_concern_domain}
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.primary_strength_domain ? (
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(selectedInterpretation.facts.primary_strength_domain)}`}>
                            Strength {selectedInterpretation.facts.primary_strength_domain}
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.subject_basket_changed ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            Basket changed
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.level_change_detected ? (
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900">
                            Level changed
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.missed_results_flag ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                            Missing results
                          </span>
                        ) : null}
                        {selectedInterpretation.facts.low_coverage_flag ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Limited interpretation
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedInterpretationError ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    {selectedInterpretationError}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_260px] lg:items-start">
              <div className="rounded-2xl border border-slate-200 p-3">
                {selectedHistoryBusy && (
                  <div className="text-sm text-slate-500">Loading…</div>
                )}

                {!selectedHistoryBusy && selectedHistory?.points?.length ? (
                  <>
                    <div className="flex justify-center rounded-2xl border border-slate-100 bg-slate-50 px-3 py-5">
                      <Sparkline points={selectedHistory.points.slice(-8)} />
                    </div>

                    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      {selectedHistory.points
                        .slice()
                        .reverse()
                        .map((point) => {
                          const delta =
                            typeof point.student === "number" && typeof point.cohort_avg === "number"
                              ? Math.round((point.student - point.cohort_avg) * 10) / 10
                              : null;

                          return (
                            <div
                              key={point.term_set_id}
                              className="flex items-center justify-between gap-3 border-b border-slate-200/70 py-2 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-800">
                                  {point.title}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {point.date ? point.date.slice(0, 10) : ""}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <div className="text-sm font-extrabold text-slate-900">
                                  {point.student == null ? "—" : `${point.student}%`}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {typeof point.cohort_avg === "number" ? `cohort ${point.cohort_avg}%` : "cohort —"}
                                  {delta != null && (
                                    <span className={delta >= 0 ? "ml-1 text-emerald-700" : "ml-1 text-rose-700"}>
                                      ({delta >= 0 ? "+" : ""}
                                      {delta})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Solid = student average · Dotted red = cohort average
                    </div>
                  </>
                ) : null}

                {!selectedHistoryBusy && !selectedHistory?.points?.length && (
                  <div className="text-sm text-slate-500">No CAT4 cohort history available yet.</div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold text-slate-900">CAT4 Domain Profile</div>
                <div className="mt-1 text-xs text-slate-500">Shows which CAT4 areas are currently above or below expectation for this student.</div>
                <div className="mt-4">
                  <StudentDomainDoughnut row={modalStudentRow || selectedHistoryStudent} />
                </div>
              </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {selectedHistoryStudent && (
          <div className="pointer-events-none fixed -left-[10000px] top-0 z-[-1] w-[960px] bg-white p-6" aria-hidden="true">
            <div ref={setSectionRef("student-modal-export-header")} className="rounded-[28px] border-2 border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[28px] font-extrabold tracking-tight text-slate-900">{selectedHistoryStudent.student_name}</div>
                  {!!selectedHistoryStudent.profile_label && (
                    <div className="mt-1 text-sm text-slate-500">{selectedHistoryStudent.profile_label}</div>
                  )}
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">CAT4 Student Report</div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Latest Average</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-900">{pct(selectedHistoryStudent.latest_average_percent)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Previous Average</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-900">{pct(selectedHistoryStudent.previous_average_percent)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Change</div>
                  <div className={`mt-2 text-2xl font-extrabold ${typeof selectedHistoryStudent.trend_delta === "number" && selectedHistoryStudent.trend_delta < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {signedPct(selectedHistoryStudent.trend_delta)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">CAT4 Movement</div>
                  <div className={`mt-2 text-2xl font-extrabold ${typeof (selectedHistoryStudent.movement_score ?? selectedHistoryStudent.value_added_delta) === "number" && (selectedHistoryStudent.movement_score ?? selectedHistoryStudent.value_added_delta)! < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {signedOneDecimal(selectedHistoryStudent.movement_score ?? selectedHistoryStudent.value_added_delta)}
                  </div>
                </div>
              </div>
            </div>

            <div ref={setSectionRef("student-modal-export-interpretation")} className="mt-5 rounded-[28px] border-2 border-slate-200 bg-slate-50 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
              <div>
                <div className="text-sm font-bold text-slate-900">Elume's Interpretation</div>
                <div className="mt-1 text-xs text-slate-500">Plain-English interpretation of the current CAT4 picture, based on the available comparison data.</div>
              </div>

              {selectedInterpretation?.explanation ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedInterpretation.source === "fallback" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                      {selectedInterpretation.source === "fallback" ? "Elume fallback summary" : "Elume summary"}
                    </span>
                  </div>
                  <div className="text-sm leading-6 text-slate-700">{selectedInterpretation.explanation}</div>
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Based on facts</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {hasMeaningfulFact(selectedInterpretation.facts.latest_average_percent) ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Latest {pct(selectedInterpretation.facts.latest_average_percent)}
                        </span>
                      ) : null}
                      {hasMeaningfulFact(selectedInterpretation.facts.previous_average_percent) ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Previous {pct(selectedInterpretation.facts.previous_average_percent)}
                        </span>
                      ) : null}
                      {hasMeaningfulFact(selectedInterpretation.facts.trend_delta) ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Change {signedPct(selectedInterpretation.facts.trend_delta)}
                        </span>
                      ) : null}
                      {hasMeaningfulFact(selectedInterpretation.facts.movement_score) ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          CAT4-relative movement {signedOneDecimal(selectedInterpretation.facts.movement_score)}
                        </span>
                      ) : null}
                      {hasMeaningfulFact(selectedInterpretation.facts.comparison_confidence) ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Confidence {selectedInterpretation.facts.comparison_confidence}
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.discrepancy_label ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          {selectedInterpretation.facts.discrepancy_label}
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.primary_concern_domain ? (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(selectedInterpretation.facts.primary_concern_domain)}`}>
                          Concern {selectedInterpretation.facts.primary_concern_domain}
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.primary_strength_domain ? (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${domainPillTone(selectedInterpretation.facts.primary_strength_domain)}`}>
                          Strength {selectedInterpretation.facts.primary_strength_domain}
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.subject_basket_changed ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          Basket changed
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.level_change_detected ? (
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900">
                          Level changed
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.missed_results_flag ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                          Missing results
                        </span>
                      ) : null}
                      {selectedInterpretation.facts.low_coverage_flag ? (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Limited interpretation
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  {selectedInterpretationError || (publicDemo ? "Interpretation has not been generated yet. Use the button above to load the demo comment for this student." : "Interpretation has not been generated yet. Generate an interpretation in Elume to include the written comment in this report.")}
                </div>
              )}
            </div>

            <div ref={setSectionRef("student-modal-export-visuals")} className="mt-5 grid grid-cols-[minmax(0,1.7fr)_280px] gap-5">
              <div className="rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
                <div className="text-sm font-bold text-slate-900">Attainment History</div>
                <div className="mt-1 text-xs text-slate-500">Student average compared with cohort average across recorded CAT4 terms.</div>
                {selectedHistoryBusy && (
                  <div className="mt-4 text-sm text-slate-500">Loading...</div>
                )}

                {!selectedHistoryBusy && selectedHistory?.points?.length ? (
                  <>
                    <div className="mt-4 flex justify-center rounded-2xl border border-slate-100 bg-slate-50 px-3 py-5">
                      <Sparkline points={selectedHistory.points.slice(-8)} />
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      {selectedHistory.points
                        .slice()
                        .reverse()
                        .map((point) => {
                          const delta =
                            typeof point.student === "number" && typeof point.cohort_avg === "number"
                              ? Math.round((point.student - point.cohort_avg) * 10) / 10
                              : null;

                          return (
                            <div
                              key={`export-${point.term_set_id}`}
                              className="flex items-center justify-between gap-3 border-b border-slate-200/70 py-2 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-800">
                                  {point.title}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {point.date ? point.date.slice(0, 10) : ""}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <div className="text-sm font-extrabold text-slate-900">
                                  {point.student == null ? "-" : `${point.student}%`}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {typeof point.cohort_avg === "number" ? `cohort ${point.cohort_avg}%` : "cohort -"}
                                  {delta != null && (
                                    <span className={delta >= 0 ? "ml-1 text-emerald-700" : "ml-1 text-rose-700"}>
                                      ({delta >= 0 ? "+" : ""}
                                      {delta})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Solid = student average · Dotted red = cohort average
                    </div>
                  </>
                ) : null}

                {!selectedHistoryBusy && !selectedHistory?.points?.length && (
                  <div className="mt-4 text-sm text-slate-500">No CAT4 cohort history available yet.</div>
                )}
              </div>

              <div className="rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
                <div className="text-sm font-bold text-slate-900">CAT4 Domain Profile</div>
                <div className="mt-1 text-xs text-slate-500">Shows which CAT4 areas are currently above or below expectation for this student.</div>
                <div className="mt-4">
                  <StudentDomainDoughnut row={modalStudentRow || selectedHistoryStudent} />
                </div>
              </div>
            </div>
          </div>
        )}

        {showResetConfirm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="text-xl font-extrabold tracking-tight text-slate-900">Reset CAT4 data?</div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>This will remove workbook uploads, baseline sets, term sets, and generated CAT4 results for this cohort.</p>
                <p>This does not affect ordinary class assessment data.</p>
                <p className="font-semibold text-rose-700">This action cannot be undone.</p>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  disabled={importingWorkbook}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void resetCat4Data()}
                  disabled={importingWorkbook}
                  className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingWorkbook ? "Resetting..." : "Reset CAT4 Data"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
