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
  student_id: number;
  student_name: string;
  profile_label?: string | null;
  baseline_percentile?: number | null;
  latest_term_percentile?: number | null;
  previous_term_percentile?: number | null;
  value_added_delta?: number | null;
  trend_delta?: number | null;
  latest_average_percent?: number | null;
  previous_average_percent?: number | null;
  status: "at_risk" | "excelling" | "within_expected_range";
  reasons: string[];
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
  domain_commentary: { domain: string; average_movement: number; commentary: string }[];
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
    .split(/\r?\n/)
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
      parseOptionalInt(parts[1]) ?? "",
      parseOptionalInt(parts[2]) ?? "",
      parseOptionalInt(parts[3]) ?? "",
      parseOptionalInt(parts[4]) ?? "",
      parseOptionalInt(parts[5]) ?? "",
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
      const studentName = parts[headerMap.get("student_name") ?? 0] || "";
      const academicYear = (parts[headerMap.get("academic_year") ?? -1] || "").trim();
      const termKey = (parts[headerMap.get("term_key") ?? -1] || "").trim();
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

function pct(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function signed(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
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
            <th className="px-4 py-3 font-semibold">Baseline %ile</th>
            <th className="px-4 py-3 font-semibold">Latest %ile</th>
            <th className="px-4 py-3 font-semibold">Value Added</th>
            <th className="px-4 py-3 font-semibold">Reasons</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={`${row.student_id}-${row.status}`}>
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
              <td className="px-4 py-3 text-slate-600">{pct(row.baseline_percentile)}</td>
              <td className="px-4 py-3 text-slate-600">{pct(row.latest_term_percentile)}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{signed(row.value_added_delta)}</td>
              <td className="px-4 py-3 text-slate-600">{row.reasons.join(" • ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [workbookPreview, setWorkbookPreview] = useState<Cat4WorkbookPreview | null>(null);
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
    setSelectedBaselineId((prev) => prev || data.baseline_sets[0]?.id || "");
    setSelectedTermSetId((prev) => prev || data.term_sets[0]?.id || "");
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
      } catch (e: any) {
        setError(e?.message || "Failed to load CAT4 insights");
        setMeta(null);
        setReport(null);
        setStudents([]);
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
    writeLine("Domain Commentary", 14, "bold");
    report.domain_commentary.forEach((item) => writeLine(`${item.domain}: ${item.commentary} (avg movement ${item.average_movement})`));
    writeLine("");
    writeLine("At Risk", 14, "bold");
    (report.at_risk.length ? report.at_risk : [{ student_name: "None", reasons: [] }] as any[]).forEach((row: any) =>
      writeLine(`${row.student_name}${row.reasons?.length ? ` - ${row.reasons.join("; ")}` : ""}`)
    );
    writeLine("");
    writeLine("Excelling", 14, "bold");
    (report.excelling.length ? report.excelling : [{ student_name: "None", reasons: [] }] as any[]).forEach((row: any) =>
      writeLine(`${row.student_name}${row.reasons?.length ? ` - ${row.reasons.join("; ")}` : ""}`)
    );
    writeLine("");
    writeLine("Within Expected Range", 14, "bold");
    (report.within_expected_range.length ? report.within_expected_range : [{ student_name: "None", reasons: [] }] as any[]).forEach((row: any) =>
      writeLine(`${row.student_name}${row.reasons?.length ? ` - ${row.reasons.join("; ")}` : ""}`)
    );

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
    } catch (e: any) {
      setError(e?.message || "Failed to save term results");
    } finally {
      setSavingTerm(false);
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
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-sm text-slate-600">Loading CAT4 insights…</div>
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
                    {validatingWorkbook || importingWorkbook ? "Uploading…" : "Upload Tracking Workbook"}
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
                      Baseline rows: <span className="font-semibold text-slate-900">{workbookPreview.baseline_rows.length}</span> · Term sets:{" "}
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
                            <span className="font-semibold text-slate-900">{item.title}</span> · {item.rows.length} rows
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
                    Version: <span className="font-semibold text-slate-900">{meta.active_workbook?.version_number ?? "—"}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Term sheets detected: <span className="font-semibold text-slate-900">{meta.active_workbook?.validation_summary?.term_sheet_names?.length || 0}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Matched students: <span className="font-semibold text-slate-900">{meta.active_workbook?.validation_summary?.matched_student_count ?? 0}</span>
                  </div>
                </div>
                {!!meta.active_workbook?.validation_summary?.warnings?.length && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Warnings: {meta.active_workbook.validation_summary.warnings.join(" • ")}
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
                          {item.title} {item.test_date ? `• ${item.test_date}` : ""}
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
                          {item.title} {item.academic_year ? `• ${item.academic_year}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Baseline matched: <span className="font-semibold text-slate-900">{meta.matched_counts.baseline_rows}</span> · Unmatched:{" "}
                    <span className="font-semibold text-slate-900">{meta.matched_counts.baseline_unmatched}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Term matched: <span className="font-semibold text-slate-900">{meta.matched_counts.term_rows}</span> · Unmatched:{" "}
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
                              Version {item.version_number} {item.is_active ? "• Active" : ""}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {item.workbook_name} • {item.uploaded_at ? item.uploaded_at.slice(0, 16).replace("T", " ") : "Unknown time"} • {item.uploaded_by_email}
                            </div>
                            <div className="mt-2 text-sm text-slate-700">
                              Baseline {item.validation_summary?.baseline_locked ? "locked" : "not locked"} • Term sheets {item.validation_summary?.term_sheet_names?.length || 0} • Matched {item.validation_summary?.matched_student_count || 0}
                            </div>
                            {!!item.validation_summary?.warnings?.length && (
                              <div className="mt-1 text-xs text-amber-800">
                                Warnings: {item.validation_summary.warnings.join(" • ")}
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
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Domain Commentary</div>
                <div className="mt-1 text-sm text-slate-600">Class-level commentary from the structured CAT4 domain movement calculations.</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(report?.domain_commentary || []).length ? (
                    report?.domain_commentary.map((item) => (
                      <div key={item.domain} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">{item.domain}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Avg movement {item.average_movement}
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
