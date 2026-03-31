import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import {
  EXAM_LIBRARY_CYCLES,
  EXAM_LIBRARY_SUBJECTS,
  type ExamLibraryItem,
  type ExamLibrarySubject,
  examLibraryLevelOptions,
  normalizeExamLibrarySubject,
} from "./examLibrary";

const API_BASE = "/api";

function resolveFileUrl(u: string) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/api/")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return `${API_BASE}/${u}`;
}

type Tool = "pen" | "eraser" | "line" | "hand";

type NoteItem = {
  id: number;
  class_id: number;
  topic_id: number;
  filename: string;
  file_url: string;
  whiteboard_state_id?: number | null;
  uploaded_at: string;
  topic_name: string;
};

type SharedExamImportItem = {
  id: string;
  filename: string;
  file_url: string;
  topic_name: string;
  cycle: string;
  subject: string;
  level: string;
  year: string;
};

const PEN_COLORS = ["#111827", "#ef4444", "#3b82f6", "#22c55e", "#a855f7"];
const PEN_SIZES = [2, 6, 12];
const ERASER_SIZES = [10, 24, 40];
const VISIBLE_RESIZE_HANDLE_SIZE = 14;
const RESIZE_HIT_SIZE = 28;

function formatKindLabel(kind: "notes" | "exam" | "exam-library") {
  if (kind === "notes") return "Notes";
  if (kind === "exam") return "Exam Papers";
  return "Exam Library";
}

type WhiteboardDraftState = {
  boardTitle: string;
  canvasHeight: number;
  boardWidth?: number | null;
  boardDpr?: number | null;
  placedImages: Array<{
    id: string;
    src: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  tool?: Tool;
  penColor?: string;
  penSize?: number;
  eraserSize?: number;
  gridMode?: "full" | "half";
  gridX?: number;
  gridY?: number;
  gridTop?: number | null;
  gridApplied?: boolean;
  axesMode?: "full" | "half";
  domMin?: number;
  domMax?: number;
  domStep?: number;
  rngMin?: number;
  rngMax?: number;
  rngStep?: number;
  axesApplied?: boolean;
  axesTop?: number | null;
  bgDataUrl?: string | null;
  inkDataUrl?: string | null;
};

type RecentWhiteboardListItem = {
  id: number;
  title?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

/**
 * Dynamically load PDF.js from CDN (no npm install).
 */
async function loadPdfJs(): Promise<any> {
  // @ts-ignore
  if (window.pdfjsLib) return (window as any).pdfjsLib;

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(s);
  });

  // @ts-ignore
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) throw new Error("PDF.js not available after load");

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  return pdfjsLib;
}

/* =========================
   Calculator (no deps)
   - FRAC mode: rationals + simple surds + special-angle trig
   - DEC mode: numeric Math.* evaluation
   ========================= */

type Rat = { n: bigint; d: bigint }; // reduced, d>0
type Exact = {
  rat: Rat; // rational part
  surds: Map<number, Rat>; // radicand -> coeff (coeff * √rad)
  sym?: string; // if exact not supported, keep symbolic
};

function bgcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}
function normRat(n: bigint, d: bigint): Rat {
  if (d === 0n) throw new Error("Divide by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d);
  return { n: n / g, d: d / g };
}
function rat(n: bigint | number, d: bigint | number = 1): Rat {
  const nn = typeof n === "number" ? BigInt(Math.trunc(n)) : n;
  const dd = typeof d === "number" ? BigInt(Math.trunc(d)) : d;
  return normRat(nn, dd);
}
function ratAdd(a: Rat, b: Rat): Rat {
  return normRat(a.n * b.d + b.n * a.d, a.d * b.d);
}
function ratSub(a: Rat, b: Rat): Rat {
  return normRat(a.n * b.d - b.n * a.d, a.d * b.d);
}
function ratMul(a: Rat, b: Rat): Rat {
  return normRat(a.n * b.n, a.d * b.d);
}
function ratDiv(a: Rat, b: Rat): Rat {
  return normRat(a.n * b.d, a.d * b.n);
}
function ratNeg(a: Rat): Rat {
  return { n: -a.n, d: a.d };
}
function ratIsZero(a: Rat) {
  return a.n === 0n;
}

function exactZero(): Exact {
  return { rat: rat(0n), surds: new Map() };
}
function exactFromRat(r: Rat): Exact {
  return { rat: r, surds: new Map() };
}
function exactClone(x: Exact): Exact {
  const m = new Map<number, Rat>();
  x.surds.forEach((v, k) => m.set(k, v));
  return { rat: x.rat, surds: m, sym: x.sym };
}
function addSurd(out: Exact, rad: number, coeff: Rat) {
  if (ratIsZero(coeff)) return;
  const prev = out.surds.get(rad);
  if (!prev) out.surds.set(rad, coeff);
  else {
    const next = ratAdd(prev, coeff);
    if (ratIsZero(next)) out.surds.delete(rad);
    else out.surds.set(rad, next);
  }
}

function simplifyRadicand(n: bigint): { rad: number; outside: bigint } {
  if (n === 0n) return { rad: 0, outside: 0n };
  let outside = 1n;
  let inside = n;

  for (let p = 2n; p * p <= inside; p++) {
    let count = 0n;
    while (inside % p === 0n) {
      inside /= p;
      count++;
    }
    if (count >= 2n) {
      const pairs = count / 2n;
      let mult = 1n;
      for (let i = 0n; i < pairs; i++) mult *= p;
      outside *= mult;
    }
  }

  const radNum = Number(inside);
  return { rad: radNum, outside };
}

function exactToString(x: Exact): string {
  if (x.sym) return x.sym;

  const parts: string[] = [];

  if (!ratIsZero(x.rat)) {
    if (x.rat.d === 1n) parts.push(x.rat.n.toString());
    else parts.push(`${x.rat.n.toString()}/${x.rat.d.toString()}`);
  }

  const keys = Array.from(x.surds.keys()).sort((a, b) => a - b);
  for (const k of keys) {
    const c = x.surds.get(k)!;
    if (ratIsZero(c)) continue;

    const sign = c.n < 0n ? "-" : "+";
    const abs = c.n < 0n ? rat(-c.n, c.d) : c;

    let coeff = "";
    if (abs.d === 1n && abs.n === 1n) coeff = "";
    else if (abs.d === 1n) coeff = abs.n.toString();
    else coeff = `${abs.n.toString()}/${abs.d.toString()}`;

    const term = `${coeff}${coeff ? "*" : ""}√${k}`;
    if (parts.length === 0) parts.push(c.n < 0n ? `-${term}` : term);
    else parts.push(` ${sign} ${term}`);
  }

  return parts.length ? parts.join("") : "0";
}

function exactAdd(a: Exact, b: Exact): Exact {
  if (a.sym || b.sym) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(a)})+(${exactToString(b)})` };
  const out = exactClone(a);
  out.rat = ratAdd(out.rat, b.rat);
  b.surds.forEach((v, k) => addSurd(out, k, v));
  return out;
}
function exactSub(a: Exact, b: Exact): Exact {
  if (a.sym || b.sym) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(a)})-(${exactToString(b)})` };
  const out = exactClone(a);
  out.rat = ratSub(out.rat, b.rat);
  b.surds.forEach((v, k) => addSurd(out, k, ratNeg(v)));
  return out;
}
function exactMul(a: Exact, b: Exact): Exact {
  if (a.sym || b.sym) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(a)})*(${exactToString(b)})` };

  const out = exactZero();
  out.rat = ratMul(a.rat, b.rat);

  a.surds.forEach((ci, ai) => addSurd(out, ai, ratMul(ci, b.rat)));
  b.surds.forEach((dj, bj) => addSurd(out, bj, ratMul(dj, a.rat)));

  a.surds.forEach((ci, ai) => {
    b.surds.forEach((dj, bj) => {
      const prod = ratMul(ci, dj);
      const radBig = BigInt(ai) * BigInt(bj);
      const { rad, outside } = simplifyRadicand(radBig);
      const coeff = ratMul(prod, rat(outside));
      if (rad === 1) out.rat = ratAdd(out.rat, coeff);
      else addSurd(out, rad, coeff);
    });
  });

  return out;
}
function exactDiv(a: Exact, b: Exact): Exact {
  if (a.sym || b.sym) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(a)})/(${exactToString(b)})` };
  if (b.surds.size !== 0) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(a)})/(${exactToString(b)})` };
  const out = exactClone(a);
  out.rat = ratDiv(out.rat, b.rat);
  out.surds.forEach((v, k) => out.surds.set(k, ratDiv(v, b.rat)));
  return out;
}
function exactPow(base: Exact, exp: Exact): Exact {
  if (exp.sym || base.sym) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(base)})^(${exactToString(exp)})` };
  if (exp.surds.size !== 0) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(base)})^(${exactToString(exp)})` };
  if (exp.rat.d !== 1n) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(base)})^(${exactToString(exp)})` };

  const e = exp.rat.n;
  if (e === 0n) return exactFromRat(rat(1n));
  if (e < 0n) return { rat: rat(0n), surds: new Map(), sym: `(${exactToString(base)})^(${e.toString()})` };

  let out = exactFromRat(rat(1n));
  let cur = exactClone(base);
  let k = e;

  while (k > 0n) {
    if (k % 2n === 1n) out = exactMul(out, cur);
    k = k / 2n;
    if (k > 0n) cur = exactMul(cur, cur);
  }
  return out;
}

function exactSqrt(x: Exact): Exact {
  if (x.sym) return { ...x, sym: `sqrt(${x.sym})` };
  if (x.surds.size !== 0) return { ...x, sym: `sqrt(${exactToString(x)})` };
  if (x.rat.d !== 1n) return { ...x, sym: `sqrt(${exactToString(x)})` };
  if (x.rat.n < 0n) return { ...x, sym: `sqrt(${exactToString(x)})` };

  const n = x.rat.n;
  if (n === 0n) return exactZero();

  const { rad, outside } = simplifyRadicand(n);
  if (rad === 1) return exactFromRat(rat(outside));

  const out = exactZero();
  addSurd(out, rad, rat(outside));
  return out;
}

type Tok =
  | { t: "num"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" };

function isDigit(ch: string) {
  return ch >= "0" && ch <= "9";
}
function isAlpha(ch: string) {
  return /[a-zA-Z]/.test(ch);
}

function tokenize(input: string): Tok[] {
  const s = input.replace(/\s+/g, "");
  const out: Tok[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (isDigit(ch) || (ch === "." && i + 1 < s.length && isDigit(s[i + 1]))) {
      let j = i + 1;
      while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
      out.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }

    if (isAlpha(ch)) {
      let j = i + 1;
      while (j < s.length && (isAlpha(s[j]) || isDigit(s[j]))) j++;
      out.push({ t: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }

    if ("+-*/^".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }

    if (ch === "√") {
      out.push({ t: "id", v: "sqrt" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  // unary minus -> insert 0
  const fixed: Tok[] = [];
  for (let k = 0; k < out.length; k++) {
    const tok = out[k];
    if (tok.t === "op" && tok.v === "-") {
      const prev = fixed[fixed.length - 1];
      const isUnary = !prev || prev.t === "op" || prev.t === "lp";
      if (isUnary) fixed.push({ t: "num", v: "0" });
    }
    fixed.push(tok);
  }

  return fixed;
}

type Assoc = "L" | "R";
const PREC: Record<string, { p: number; a: Assoc }> = {
  "^": { p: 4, a: "R" },
  "*": { p: 3, a: "L" },
  "/": { p: 3, a: "L" },
  "+": { p: 2, a: "L" },
  "-": { p: 2, a: "L" },
};

type RPN =
  | { k: "num"; v: string }
  | { k: "const"; v: "pi" | "e" }
  | { k: "fn"; v: "sin" | "cos" | "tan" | "sqrt" | "ln" | "log" }
  | { k: "op"; v: string };

function toRpn(tokens: Tok[]): RPN[] {
  const output: RPN[] = [];
  const stack: Array<Tok | { t: "fn"; v: string }> = [];

  for (const tok of tokens) {
    if (tok.t === "num") {
      output.push({ k: "num", v: tok.v });
      continue;
    }

    if (tok.t === "id") {
      const id = tok.v.toLowerCase();
      if (id === "pi" || id === "e") {
        output.push({ k: "const", v: id as any });
        continue;
      }
      if (["sin", "cos", "tan", "sqrt", "ln", "log"].includes(id)) {
        stack.push({ t: "fn", v: id });
        continue;
      }
      output.push({ k: "num", v: "0" });
      continue;
    }

    if (tok.t === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1] as any;
        if (top.t === "op") {
          const o1 = tok.v;
          const o2 = top.v;
          const p1 = PREC[o1].p;
          const p2 = PREC[o2].p;
          if ((PREC[o1].a === "L" && p1 <= p2) || (PREC[o1].a === "R" && p1 < p2)) {
            output.push({ k: "op", v: o2 });
            stack.pop();
            continue;
          }
        }
        break;
      }
      stack.push(tok);
      continue;
    }

    if (tok.t === "lp") {
      stack.push(tok);
      continue;
    }

    if (tok.t === "rp") {
      while (stack.length && (stack[stack.length - 1] as any).t !== "lp") {
        const top = stack.pop() as any;
        if (top.t === "op") output.push({ k: "op", v: top.v });
        else if (top.t === "fn") output.push({ k: "fn", v: top.v });
      }
      const lp = stack.pop();
      if (!lp || (lp as any).t !== "lp") throw new Error("Mismatched parentheses");

      const maybeFn = stack[stack.length - 1] as any;
      if (maybeFn && maybeFn.t === "fn") {
        output.push({ k: "fn", v: maybeFn.v });
        stack.pop();
      }
      continue;
    }
  }

  while (stack.length) {
    const top = stack.pop() as any;
    if (top.t === "lp") throw new Error("Mismatched parentheses");
    if (top.t === "op") output.push({ k: "op", v: top.v });
    if (top.t === "fn") output.push({ k: "fn", v: top.v });
  }

  return output;
}

function parseNumberToRat(s: string): Rat {
  if (s.includes(".")) {
    const [a, b] = s.split(".");
    const sign = a.startsWith("-") ? -1n : 1n;
    const aa = BigInt(a || "0");
    const bb = BigInt(b || "0");
    const denom = 10n ** BigInt(b.length);
    const numer = aa * denom + sign * bb;
    return normRat(numer, denom);
  }
  return rat(BigInt(s), 1n);
}

function trigExactDegrees(fn: "sin" | "cos" | "tan", deg: number): Exact | null {
  let a = deg % 360;
  if (a < 0) a += 360;

  const Z = exactZero();
  const ONE = exactFromRat(rat(1n));
  const MONE = exactFromRat(rat(-1n));
  const HALF = exactFromRat(rat(1n, 2n));
  const MHALF = exactFromRat(rat(-1n, 2n));

  const sqrt2over2 = () => {
    const out = exactZero();
    addSurd(out, 2, rat(1n, 2n)); // √2/2
    return out;
  };
  const sqrt3over2 = () => {
    const out = exactZero();
    addSurd(out, 3, rat(1n, 2n)); // √3/2
    return out;
  };

  const neg = (x: Exact): Exact => {
    if (x.sym) return { rat: rat(0n), surds: new Map(), sym: `-(${x.sym})` };
    const out = exactClone(x);
    out.rat = ratNeg(out.rat);
    out.surds.forEach((v, k) => out.surds.set(k, ratNeg(v)));
    return out;
  };

  const sinTable: Record<number, Exact> = {
    0: Z,
    30: HALF,
    45: sqrt2over2(),
    60: sqrt3over2(),
    90: ONE,
    120: sqrt3over2(),
    135: sqrt2over2(),
    150: HALF,
    180: Z,
    210: MHALF,
    225: neg(sqrt2over2()),
    240: neg(sqrt3over2()),
    270: MONE,
    300: neg(sqrt3over2()),
    315: neg(sqrt2over2()),
    330: MHALF,
  };

  const cosTable: Record<number, Exact> = {
    0: ONE,
    30: sqrt3over2(),
    45: sqrt2over2(),
    60: HALF,
    90: Z,
    120: MHALF,
    135: neg(sqrt2over2()),
    150: neg(sqrt3over2()),
    180: MONE,
    210: neg(sqrt3over2()),
    225: neg(sqrt2over2()),
    240: MHALF,
    270: Z,
    300: HALF,
    315: sqrt2over2(),
    330: sqrt3over2(),
  };

  if (!(a in sinTable) || !(a in cosTable)) return null;

  const s = sinTable[a];
  const c = cosTable[a];

  if (fn === "sin") return s;
  if (fn === "cos") return c;

  // tan exact only if cos is a pure rational non-zero
  if (c.sym || c.surds.size !== 0 || c.rat.n === 0n) return { rat: rat(0n), surds: new Map(), sym: `tan(${deg})` };
  return exactDiv(s, c);
}

function evalExactRpn(rpn: RPN[], degMode: boolean): Exact {
  const st: Exact[] = [];
  const pop = () => {
    const v = st.pop();
    if (!v) throw new Error("Bad expression");
    return v;
  };

  for (const t of rpn) {
    if (t.k === "num") {
      st.push(exactFromRat(parseNumberToRat(t.v)));
      continue;
    }
    if (t.k === "const") {
      st.push({ rat: rat(0n), surds: new Map(), sym: t.v });
      continue;
    }
    if (t.k === "op") {
      const b = pop();
      const a = pop();
      if (t.v === "+") st.push(exactAdd(a, b));
      if (t.v === "-") st.push(exactSub(a, b));
      if (t.v === "*") st.push(exactMul(a, b));
      if (t.v === "/") st.push(exactDiv(a, b));
      if (t.v === "^") st.push(exactPow(a, b));
      continue;
    }
    if (t.k === "fn") {
      const x = pop();
      if (t.v === "sqrt") {
        st.push(exactSqrt(x));
        continue;
      }
      if (t.v === "ln" || t.v === "log") {
        st.push({ rat: rat(0n), surds: new Map(), sym: `${t.v}(${exactToString(x)})` });
        continue;
      }
      if (t.v === "sin" || t.v === "cos" || t.v === "tan") {
        if (degMode && !x.sym && x.surds.size === 0 && x.rat.d === 1n) {
          const deg = Number(x.rat.n);
          const got = trigExactDegrees(t.v, deg);
          if (got) {
            st.push(got);
            continue;
          }
        }
        st.push({ rat: rat(0n), surds: new Map(), sym: `${t.v}(${exactToString(x)})` });
        continue;
      }
    }
  }

  if (st.length !== 1) throw new Error("Bad expression");
  return st[0];
}

function evalDecRpn(rpn: RPN[], degMode: boolean): number {
  const st: number[] = [];
  const pop = () => {
    const v = st.pop();
    if (v === undefined) throw new Error("Bad expression");
    return v;
  };

  for (const t of rpn) {
    if (t.k === "num") {
      st.push(Number(t.v));
      continue;
    }
    if (t.k === "const") {
      st.push(t.v === "pi" ? Math.PI : Math.E);
      continue;
    }
    if (t.k === "op") {
      const b = pop();
      const a = pop();
      if (t.v === "+") st.push(a + b);
      if (t.v === "-") st.push(a - b);
      if (t.v === "*") st.push(a * b);
      if (t.v === "/") st.push(a / b);
      if (t.v === "^") st.push(Math.pow(a, b));
      continue;
    }
    if (t.k === "fn") {
      const x = pop();
      const arg = degMode ? (x * Math.PI) / 180 : x;
      if (t.v === "sqrt") st.push(Math.sqrt(x));
      if (t.v === "sin") st.push(Math.sin(arg));
      if (t.v === "cos") st.push(Math.cos(arg));
      if (t.v === "tan") st.push(Math.tan(arg));
      if (t.v === "ln") st.push(Math.log(x));
      if (t.v === "log") st.push(Math.log10 ? Math.log10(x) : Math.log(x) / Math.LN10);
      continue;
    }
  }

  if (st.length !== 1) throw new Error("Bad expression");
  return st[0];
}

function formatDec(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const s = n.toFixed(12);
  return s.replace(/\.?0+$/, "");
}

export default function WhiteBoardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const classId = useMemo(() => Number(id), [id]);
  const requestedWhiteboardId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("whiteboardId");
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const draftKey = useMemo(
    () => (Number.isFinite(classId) && classId > 0 ? `elume_whiteboard_draft_v1__${classId}` : null),
    [classId]
  );

  // Scroll container
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boardSurfaceRef = useRef<HTMLDivElement | null>(null);
  const viewportRedrawRafRef = useRef<number | null>(null);
  const canvasMetricsRef = useRef<{ width: number; height: number; ratio: number } | null>(null);
  const lockedBoardWidthRef = useRef<number | null>(null);
  const lockedBoardDprRef = useRef<number | null>(null);
  const autoOpenedWhiteboardRef = useRef<number | null>(null);
  const pendingPageSeparatorRedrawRef = useRef(false);
  const [lockedBoardWidth, setLockedBoardWidth] = useState<number | null>(null);
  const [showHorizontalScrollHint, setShowHorizontalScrollHint] = useState(false);
  const syncTimeoutRef = useRef<number | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const pendingForceRedrawRef = useRef(false);
  const horizontalScrollHintTimerRef = useRef<number | null>(null);

  // ✅ Unsaved-changes guard
  const dirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = () => {
    lockBoardWidthIfNeeded();
    lockBoardDprIfNeeded();
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setIsDirty(true);
    }
  };

  const markClean = () => {
    dirtyRef.current = false;
    setIsDirty(false);
  };

  // ✅ Confirm modal when leaving via UI buttons (e.g., Back to Class)
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingNavRef = useRef<string | null>(null);
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const pendingDraftRef = useRef<WhiteboardDraftState | null>(null);

  function requestLeave(to: string) {
    if (dirtyRef.current) {
      pendingNavRef.current = to;
      setLeaveOpen(true);
      return;
    }
    navigate(to);
  }

  function confirmLeave() {
    const to = pendingNavRef.current;
    pendingNavRef.current = null;
    setLeaveOpen(false);
    saveDraftToLocalStorage();
    if (to) navigate(to);
  }

  function cancelLeave() {
    pendingNavRef.current = null;
    setLeaveOpen(false);
  }

  // Fullscreen
  const fsRootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);


  // Four-layer canvases (background + images + ink + preview)
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);   // NEW
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const previewCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const inkCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const imgCtxRef = useRef<CanvasRenderingContext2D | null>(null);



  // Drawing / hand tool refs
  const drawingRef = useRef(false);
  const handDragRef = useRef(false);
  const handStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const lineStartRef = useRef<{ x: number; y: number } | null>(null);
  // Pen smoothing (prevents “snapped” handwriting)
  const penPrevRef = useRef<{ x: number; y: number } | null>(null);
  const snappedThisStrokeRef = useRef(false);
  const penPendingRef = useRef<{ x: number; y: number }[]>([]);
  const penRafRef = useRef<number | null>(null);
  const lastPenXYRef = useRef<{ x: number; y: number } | null>(null);



  // Whiteboard state
  const [boardTitle, setBoardTitle] = useState<string>("Class Whiteboard");
  type Tool = "pen" | "eraser" | "line" | "hand";
  const [tool, setTool] = useState<Tool>("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[0]);
  const [eraserSize, setEraserSize] = useState(ERASER_SIZES[1]);

  type PlacedImage = {
    id: string;
    src: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };

  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const handModeRef = useRef<"none" | "pan" | "img">("none");


  const imgDragRef = useRef<
    | null
    | {
      id: string;
      mode: "move" | "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      orig: { x: number; y: number; w: number; h: number };
    }
  >(null);


  // Long page + pages
  const PAGE_HEIGHT = 2400;
  const [canvasHeight, setCanvasHeight] = useState(2400);

  // Modals
  const [showTitleModal, setShowTitleModal] = useState(true);
  const [titleDraft, setTitleDraft] = useState("Class Whiteboard");
  const [currentWhiteboardId, setCurrentWhiteboardId] = useState<number | null>(null);
  const [entryMode, setEntryMode] = useState<"menu" | "new" | "recent">("menu");
  const [recentWhiteboards, setRecentWhiteboards] = useState<RecentWhiteboardListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [openingRecentId, setOpeningRecentId] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Import list
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importList, setImportList] = useState<Array<{ kind: "notes" | "exam"; item: NoteItem }>>([]);
  const [importSource, setImportSource] = useState<"class" | "exam-library">("class");
  const [examLibraryItems, setExamLibraryItems] = useState<ExamLibraryItem[]>([]);
  const [examLibraryLoading, setExamLibraryLoading] = useState(false);
  const [examLibraryError, setExamLibraryError] = useState<string | null>(null);
  const [preferredExamSubject, setPreferredExamSubject] = useState<ExamLibrarySubject>("Maths");
  const [examLibrarySubject, setExamLibrarySubject] = useState<ExamLibrarySubject>("Maths");
  const [examLibraryCycle, setExamLibraryCycle] = useState<string>(EXAM_LIBRARY_CYCLES[1]);
  const [examLibraryLevel, setExamLibraryLevel] = useState<string>(examLibraryLevelOptions(EXAM_LIBRARY_CYCLES[1])[0]);
  const [importedPdf, setImportedPdf] = useState<{ kind: "notes" | "exam" | "exam-library"; item: NoteItem | SharedExamImportItem } | null>(null);
  const [showPdfPanel, setShowPdfPanel] = useState(true);

  // Insert PDF as image controls
  const [pdfInsertScale, setPdfInsertScale] = useState(1.0);
  const [bgUndoStack, setBgUndoStack] = useState<ImageData[]>([]);

  type InkSnap = { y: number; h: number; data: ImageData };

  const [inkUndoStack, setInkUndoStack] = useState<InkSnap[]>([]);
  const [inkRedoStack, setInkRedoStack] = useState<InkSnap[]>([]);

  const [objUndoStack, setObjUndoStack] = useState<PlacedImage[][]>([]);
  const [objRedoStack, setObjRedoStack] = useState<PlacedImage[][]>([]);

  // Ink-only undo/redo (pen + eraser)

  const [lastInsertInfo, setLastInsertInfo] = useState<string | null>(null);

  // --- PDF snipping tool (right-side viewer) ---
  const [pdfPageNum, setPdfPageNum] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(1);
  const [pdfViewScale, setPdfViewScale] = useState(1);

  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfViewerRef = useRef<HTMLDivElement | null>(null); // ✅ the overflow-auto viewer container
  const pdfOverlayRef = useRef<HTMLDivElement | null>(null);
  const [pdfCanvasSize, setPdfCanvasSize] = useState({ w: 0, h: 0 });
  const pdfPanelRef = useRef<HTMLDivElement | null>(null); // ✅ the scroll viewer container
  const pdfBlobUrlRef = useRef<string | null>(null);
  const pdfSourceUrlRef = useRef<string | null>(null);

  const clipDragRef = useRef(false);
  const clipStartRef = useRef<{ x: number; y: number } | null>(null);
  const [clipRect, setClipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [snipMode, setSnipMode] = useState(false);

  const [classLabel, setClassLabel] = useState<string>("");


  // Grid / XY modals + state
  const [showGridModal, setShowGridModal] = useState(false);
  const [gridMode, setGridMode] = useState<"full" | "half">("full");
  const [gridX, setGridX] = useState(24);
  const [gridY, setGridY] = useState(24);
  const [gridTop, setGridTop] = useState<number | null>(null);
  const [gridApplied, setGridApplied] = useState(false);

  const [showAxesModal, setShowAxesModal] = useState(false);
  const [axesMode, setAxesMode] = useState<"full" | "half">("full");
  const [domMin, setDomMin] = useState(-10);
  const [domMax, setDomMax] = useState(10);
  const [domStep, setDomStep] = useState(1);
  const [rngMin, setRngMin] = useState(-50);
  const [rngMax, setRngMax] = useState(50);
  const [rngStep, setRngStep] = useState(5);
  const [axesApplied, setAxesApplied] = useState(false);
  const [axesTop, setAxesTop] = useState<number | null>(null);

  // Styles
  const pill =
    "rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-slate-800 " +
    "shadow-sm backdrop-blur hover:bg-slate-100 hover:shadow transition active:translate-y-[1px] disabled:opacity-60";

  const pillOn =
    "rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-[13px] font-semibold text-white " +
    "shadow-sm hover:bg-slate-800 transition active:translate-y-[1px] disabled:opacity-60";

  /* ---------- Calculator widget state ---------- */
  const [showCalc, setShowCalc] = useState(false);
  const [calcExpr, setCalcExpr] = useState("");
  const [calcResult, setCalcResult] = useState<string>("");
  const [calcMode, setCalcMode] = useState<"exact" | "dec">("exact");
  const [degMode, setDegMode] = useState(true);

  const [calcPos, setCalcPos] = useState({ x: 24, y: 120 });
  const calcDragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  function evalCalc(mode: "exact" | "dec" = calcMode) {
    const expr = (calcExpr || "").trim();
    if (!expr) {
      setCalcResult("");
      return;
    }

    try {
      const tokens = tokenize(expr);
      const rpn = toRpn(tokens);

      if (mode === "exact") {
        const out = evalExactRpn(rpn, degMode);
        setCalcResult(exactToString(out));
      } else {
        const out = evalDecRpn(rpn, degMode);
        setCalcResult(formatDec(out));
      }
    } catch {
      setCalcResult("Error");
    }
  }

  useEffect(() => {
    if (!classId) return;

    apiFetch(`${API_BASE}/classes/${classId}`)
      .then((data) => {
        const name = String(data?.name || "").trim();
        const subject = String(data?.subject || "").trim();
        const preferred = normalizeExamLibrarySubject(data?.preferred_exam_subject ?? subject);

        // If name already includes the subject, don't duplicate it
        const label =
          subject && !name.toLowerCase().includes(subject.toLowerCase())
            ? `${name} ${subject}`.trim()
            : name;

        setClassLabel(label);
        setPreferredExamSubject(preferred);
        setExamLibrarySubject(preferred);
      })
      .catch(() => {
        setClassLabel("");
        setPreferredExamSubject("Maths");
        setExamLibrarySubject("Maths");
      });
  }, [classId]);

  function forceBoardRedraw() {
    requestAnimationFrame(() => {
      void redrawImages();
      if (gridApplied) drawGridOverlay();
      else if (axesApplied) drawAxesOverlay();
    });
  }

  function scheduleViewportRedraw() {
    if (viewportRedrawRafRef.current != null) return;
    viewportRedrawRafRef.current = requestAnimationFrame(() => {
      viewportRedrawRafRef.current = null;
      void redrawImages();
      if (gridApplied) drawGridOverlay();
      else if (axesApplied) drawAxesOverlay();
    });
  }

  function getBoardWidthCss() {
    return (
      lockedBoardWidthRef.current ??
      boardSurfaceRef.current?.clientWidth ??
      canvasMetricsRef.current?.width ??
      containerRef.current?.clientWidth ??
      0
    );
  }

  const boardWidthCss =
    lockedBoardWidth ??
    canvasMetricsRef.current?.width ??
    boardSurfaceRef.current?.clientWidth ??
    containerRef.current?.clientWidth ??
    undefined;

  function lockBoardWidthIfNeeded() {
    if (lockedBoardWidthRef.current) return lockedBoardWidthRef.current;
    const width = containerRef.current?.clientWidth ?? canvasMetricsRef.current?.width ?? 0;
    if (width >= 20) {
      lockedBoardWidthRef.current = width;
      setLockedBoardWidth(width);
    }
    return lockedBoardWidthRef.current;
  }

  function lockBoardDprIfNeeded() {
    if (lockedBoardDprRef.current) return lockedBoardDprRef.current;
    const dpr = getBoardDpr();
    if (dpr > 0) lockedBoardDprRef.current = dpr;
    return lockedBoardDprRef.current;
  }

  function stabilizeBoardGeometryIfNeeded() {
    lockBoardWidthIfNeeded();
    lockBoardDprIfNeeded();
  }

  function isBoardGeometryLocked() {
    return Boolean(lockedBoardWidthRef.current && lockedBoardDprRef.current);
  }

  function scheduleCanvasSync(forceRedraw = false, delay = 120) {
    pendingForceRedrawRef.current = pendingForceRedrawRef.current || forceRedraw;
    if (syncTimeoutRef.current != null) {
      window.clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = window.setTimeout(() => {
      syncTimeoutRef.current = null;
      if (syncRafRef.current != null) {
        cancelAnimationFrame(syncRafRef.current);
      }
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null;
        syncCanvasSize();
        if (pendingForceRedrawRef.current) {
          pendingForceRedrawRef.current = false;
          forceBoardRedraw();
        }
      });
    }, delay);
  }

  function serializeWhiteboardState(): WhiteboardDraftState | null {
    const bgCanvas = bgCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    if (!bgCanvas || !inkCanvas) return null;
    return {
      boardTitle,
      canvasHeight,
      boardWidth: lockedBoardWidthRef.current ?? getBoardWidthCss(),
      boardDpr: lockedBoardDprRef.current ?? getBoardDpr(),
      placedImages,
      tool,
      penColor,
      penSize,
      eraserSize,
      gridMode,
      gridX,
      gridY,
      gridTop,
      gridApplied,
      axesMode,
      domMin,
      domMax,
      domStep,
      rngMin,
      rngMax,
      rngStep,
      axesApplied,
      axesTop,
      bgDataUrl: bgCanvas.toDataURL("image/png"),
      inkDataUrl: inkCanvas.toDataURL("image/png"),
    };
  }

  async function drawDataUrlToCanvas(
    dataUrl: string | null | undefined,
    ctx: CanvasRenderingContext2D | null,
    width: number,
    height: number
  ) {
    if (!dataUrl || !ctx) return;
    const img = new Image();
    img.src = dataUrl;
    try {
      await img.decode();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
    } catch {
      ctx.clearRect(0, 0, width, height);
    }
  }

  function restoreWhiteboardState(draft: WhiteboardDraftState) {
    if (typeof draft.boardWidth === "number" && draft.boardWidth > 0) {
      lockedBoardWidthRef.current = draft.boardWidth;
      setLockedBoardWidth(draft.boardWidth);
    }
    if (typeof draft.boardDpr === "number" && draft.boardDpr > 0) {
      lockedBoardDprRef.current = draft.boardDpr;
    }
    setBoardTitle(draft.boardTitle || "Class Whiteboard");
    setTitleDraft(draft.boardTitle || "Class Whiteboard");
    setCanvasHeight(Math.max(PAGE_HEIGHT, draft.canvasHeight || PAGE_HEIGHT));
    setPlacedImages(Array.isArray(draft.placedImages) ? draft.placedImages : []);
    setSelectedImageId(null);
    setTool(draft.tool ?? "pen");
    setPenColor(draft.penColor ?? PEN_COLORS[0]);
    setPenSize(draft.penSize ?? PEN_SIZES[0]);
    setEraserSize(draft.eraserSize ?? ERASER_SIZES[1]);
    setGridMode(draft.gridMode ?? "full");
    setGridX(draft.gridX ?? 24);
    setGridY(draft.gridY ?? 24);
    setGridTop(draft.gridTop ?? null);
    setGridApplied(Boolean(draft.gridApplied));
    setAxesMode(draft.axesMode ?? "full");
    setDomMin(draft.domMin ?? -10);
    setDomMax(draft.domMax ?? 10);
    setDomStep(draft.domStep ?? 1);
    setRngMin(draft.rngMin ?? -50);
    setRngMax(draft.rngMax ?? 50);
    setRngStep(draft.rngStep ?? 5);
    setAxesTop(draft.axesTop ?? null);
    setAxesApplied(Boolean(draft.axesApplied));
    setShowTitleModal(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        lockBoardWidthIfNeeded();
        lockBoardDprIfNeeded();
        const width = getBoardWidthCss();
        if (width < 20) return;
        const height = Math.max(PAGE_HEIGHT, draft.canvasHeight || PAGE_HEIGHT);
        await drawDataUrlToCanvas(draft.bgDataUrl, bgCtxRef.current, width, height);
        await drawDataUrlToCanvas(draft.inkDataUrl, inkCtxRef.current, width, height);
        scheduleViewportRedraw();
        markDirty();
      });
    });
  }

  function saveDraftToLocalStorage() {
    if (!draftKey || !dirtyRef.current) return;
    try {
      const draft = serializeWhiteboardState();
      if (!draft) return;
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Ignore local draft save failures.
    }
  }

  function clearDraftFromLocalStorage() {
    if (!draftKey) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore local draft clear failures.
    }
  }

  async function loadRecentWhiteboards() {
    if (!classId) return;
    setRecentLoading(true);
    setRecentError(null);
    try {
      const data = await apiFetch(`${API_BASE}/classes/${classId}/whiteboards?limit=5`);
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setRecentWhiteboards(items);
    } catch (e: any) {
      setRecentWhiteboards([]);
      setRecentError(e?.message || "Recent editable whiteboards are not available yet.");
    } finally {
      setRecentLoading(false);
    }
  }

  async function openRecentWhiteboard(whiteboardId: number) {
    setOpeningRecentId(whiteboardId);
    setRecentError(null);
    try {
      const data = await apiFetch(`${API_BASE}/whiteboards/${whiteboardId}`);
      const rawState = data?.state ?? data?.state_json ?? data?.whiteboard_state ?? null;
      const parsedState =
        typeof rawState === "string" ? (JSON.parse(rawState) as WhiteboardDraftState) : (rawState as WhiteboardDraftState | null);
      if (!parsedState) throw new Error("This whiteboard does not include editable state yet.");
      restoreWhiteboardState(parsedState);
      setCurrentWhiteboardId(Number(data?.id || whiteboardId));
      if (typeof data?.title === "string" && data.title.trim()) {
        setBoardTitle(data.title.trim());
        setTitleDraft(data.title.trim());
      }
      setShowTitleModal(false);
      setEntryMode("menu");
    } catch (e: any) {
      setRecentError(e?.message || "Could not open that whiteboard yet.");
    } finally {
      setOpeningRecentId(null);
    }
  }

  function pressCalc(k: string) {
    if (k === "C") {
      setCalcExpr("");
      setCalcResult("");
      setCalcMode("exact");
      return;
    }
    if (k === "⌫") {
      setCalcExpr((p) => p.slice(0, -1));
      return;
    }
    if (k === "=") {
      evalCalc();
      return;
    }

    // Output toggles
    if (k === "FRAC") {
      setCalcMode("exact");
      evalCalc("exact");
      return;
    }
    if (k === "DEC") {
      setCalcMode("dec");
      evalCalc("dec");
      return;
    }

    // DEG/RAD
    if (k === "DRG") {
      setDegMode((v) => !v);
      return;
    }

    // convenience powers
    if (k === "x^2") {
      setCalcExpr((p) => (p ? `(${p})^2` : "^2"));
      return;
    }
    if (k === "x^3") {
      setCalcExpr((p) => (p ? `(${p})^3` : "^3"));
      return;
    }

    // sqrt inserts as function
    if (k === "√") {
      setCalcExpr((p) => `${p}sqrt(`);
      return;
    }

    // constants
    if (k === "π") {
      setCalcExpr((p) => `${p}${p && /[0-9)\w]$/.test(p) ? "*" : ""}pi`);
      return;
    }
    if (k === "e") {
      setCalcExpr((p) => `${p}${p && /[0-9)\w]$/.test(p) ? "*" : ""}e`);
      return;
    }

    // function keys insert with "("
    if (["sin", "cos", "tan", "sqrt", "ln", "log"].includes(k)) {
      setCalcExpr((p) => `${p}${k}(`);
      return;
    }

    setCalcExpr((p) => p + k);
  }

  function startCalcDrag(e: React.PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const tag = t?.tagName?.toLowerCase();
    if (tag === "button" || tag === "input") return;

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    calcDragRef.current = { startX: e.clientX, startY: e.clientY, x: calcPos.x, y: calcPos.y };
  }
  function moveCalcDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = calcDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setCalcPos({ x: d.x + dx, y: d.y + dy });
  }
  function endCalcDrag() {
    calcDragRef.current = null;
  }
  function snapshotInkViewport(pad = 200) {
    const ink = inkCanvasRef.current;
    const ctx = inkCtxRef.current;
    const container = containerRef.current;
    if (!ink || !ctx || !container) return;

    const dpr = getBoardDpr();

    // Visible viewport in CSS px
    const yCss = Math.max(0, Math.floor(container.scrollTop - pad));
    const hCss = Math.min(
      canvasHeight - yCss,
      Math.floor(container.clientHeight + pad * 2)
    );

    // Convert to canvas pixel coords (since canvas is scaled by dpr)
    const yPx = Math.floor(yCss * dpr);
    const hPx = Math.max(1, Math.floor(hCss * dpr));

    // Full width in pixels
    const wPx = ink.width;

    const snap = ctx.getImageData(0, yPx, wPx, hPx);

    setInkUndoStack((s) => [...s, { y: yPx, h: hPx, data: snap }]);
    setInkRedoStack([]); // clear redo on new action
  }

  function snapshotObjects() {
    setObjUndoStack((s) => [...s, placedImages.map((p) => ({ ...p }))]);
    setObjRedoStack([]); // clear redo on new action
  }


  async function insertPastedImageFromFile(file: File): Promise<void> {
    const container = containerRef.current;
    if (!container) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read pasted image"));
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read pasted image"));
      };
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("Could not load pasted image"));
      next.src = dataUrl;
    });

    const naturalWidth = Math.max(1, img.naturalWidth || 1);
    const naturalHeight = Math.max(1, img.naturalHeight || 1);
    const maxDefaultWidth = 520;
    const scale = Math.min(1, maxDefaultWidth / naturalWidth);
    const scaledWidth = Math.max(80, Math.round(naturalWidth * scale));
    const scaledHeight = Math.max(80, Math.round(naturalHeight * scale));
    const id = `paste_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const x = 24;
    const y = Math.max(24, (container.scrollTop ?? 0) + 48);

    snapshotObjects();
    markDirty();
    setPlacedImages((arr) => [
      ...arr,
      {
        id,
        src: dataUrl,
        x,
        y,
        w: scaledWidth,
        h: scaledHeight,
      },
    ]);
    setSelectedImageId(id);
    setLastInsertInfo("Pasted image from clipboard");

    const neededHeight = y + scaledHeight + 120;
    if (neededHeight > canvasHeight) {
      setCanvasHeight((h) => Math.min(Math.max(h, neededHeight + 500), 30000));
    }
  }

  // ✅ One DPR rule for the whole whiteboard (performance + consistent coordinates)
  function getBoardDpr() {
    if (lockedBoardDprRef.current) return lockedBoardDprRef.current;
    return 1.0;
  }

  /* ---------- Canvas sizing ---------- */
  const syncCanvasSize = () => {
    const container = containerRef.current;
    const bgCanvas = bgCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    const imgCanvas = imgCanvasRef.current;
    if (!container || !bgCanvas || !previewCanvas || !inkCanvas || !imgCanvas)
      return;

    const widthCss = getBoardWidthCss();
    const ratio = getBoardDpr();
    const width = widthCss;
    const heightCss = canvasHeight;

    // ✅ During fullscreen/tablet transitions the container can momentarily be 0px.
    // If we resize the imgCanvas to 0, it wipes snips and redraw() can't paint.
    if (widthCss < 20 || heightCss < 20) {
      scheduleCanvasSync(true, 80);
      return;
    }

    const nextMetrics = { width: widthCss, height: heightCss, ratio };
    const prevMetrics = canvasMetricsRef.current;
    if (
      prevMetrics &&
      prevMetrics.width === nextMetrics.width &&
      prevMetrics.height === nextMetrics.height &&
      prevMetrics.ratio === nextMetrics.ratio
    ) {
      return;
    }
    canvasMetricsRef.current = nextMetrics;
    const heightOnlyGrowth =
      !!prevMetrics &&
      prevMetrics.width === nextMetrics.width &&
      prevMetrics.ratio === nextMetrics.ratio &&
      nextMetrics.height > prevMetrics.height;

    // Overlay canvas (grid/axes layer)
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      overlayCanvas.style.width = `${width}px`;
      overlayCanvas.style.height = `${canvasHeight}px`;
      overlayCanvas.width = Math.floor(width * ratio);
      overlayCanvas.height = Math.floor(canvasHeight * ratio);

      const octx = overlayCanvas.getContext("2d");
      if (octx) {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.scale(ratio, ratio);
        overlayCtxRef.current = octx;

        // Important: clear overlay on resize so it doesn't smear
        octx.clearRect(0, 0, width, canvasHeight);
      }
    }

    const copyOld = (c: HTMLCanvasElement) => {
      const tmp = document.createElement("canvas");
      tmp.width = c.width;
      tmp.height = c.height;
      const tctx = tmp.getContext("2d");
      if (tctx) tctx.drawImage(c, 0, 0);
      return tmp;
    };

    const oldBg = copyOld(bgCanvas);
    const oldInk = copyOld(inkCanvas);

    // Background canvas
    bgCanvas.style.width = `${width}px`;
    bgCanvas.style.height = `${canvasHeight}px`;
    bgCanvas.width = Math.floor(width * ratio);
    bgCanvas.height = Math.floor(canvasHeight * ratio);

    const bgCtx = bgCanvas.getContext("2d");
    if (!bgCtx) return;
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.scale(ratio, ratio);
    bgCtxRef.current = bgCtx;

    // Preview canvas (for line tool)
    previewCanvas.style.width = `${width}px`;
    previewCanvas.style.height = `${canvasHeight}px`;
    previewCanvas.width = Math.floor(width * ratio);
    previewCanvas.height = Math.floor(canvasHeight * ratio);

    const previewCtx = previewCanvas.getContext("2d");
    if (!previewCtx) return;
    previewCtx.setTransform(1, 0, 0, 1, 0, 0);
    previewCtx.scale(ratio, ratio);
    previewCtx.lineCap = "round";
    previewCtx.lineJoin = "round";
    previewCtxRef.current = previewCtx;

    // Ink canvas
    inkCanvas.style.width = `${width}px`;
    inkCanvas.style.height = `${canvasHeight}px`;
    inkCanvas.width = Math.floor(width * ratio);
    inkCanvas.height = Math.floor(canvasHeight * ratio);

    const inkCtx = inkCanvas.getContext("2d");
    if (!inkCtx) return;
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.scale(ratio, ratio);

    inkCtx.lineCap = "round";
    inkCtx.lineJoin = "round";
    inkCtxRef.current = inkCtx;

    imgCanvas.style.width = `${widthCss}px`;
    imgCanvas.style.height = `${heightCss}px`;
    imgCanvas.width = Math.floor(widthCss * ratio);
    imgCanvas.height = Math.floor(heightCss * ratio);

    const imgCtx = imgCanvas.getContext("2d");
    if (!imgCtx) return;

    imgCtx.setTransform(1, 0, 0, 1, 0, 0);
    imgCtx.scale(ratio, ratio);
    imgCtx.lineCap = "round";
    imgCtx.lineJoin = "round";

    imgCtxRef.current = imgCtx;
    imgCtx.clearRect(0, 0, widthCss, heightCss);


    const restoreWidth = prevMetrics ? prevMetrics.width : width;
    const restoreHeight = prevMetrics ? Math.min(prevMetrics.height, canvasHeight) : canvasHeight;

    // redraw old content (best-effort)
    try {
      bgCtx.drawImage(oldBg, 0, 0, restoreWidth, restoreHeight);
      inkCtx.drawImage(oldInk, 0, 0, restoreWidth, restoreHeight);
    } catch { }

    // always clear preview
    previewCtx.clearRect(0, 0, width, canvasHeight);

    // ✅ Resizing clears canvases → redraw snips + overlays
    if (!heightOnlyGrowth) {
      void redrawImages();
      if (gridApplied) drawGridOverlay();
      else if (axesApplied) drawAxesOverlay();
    } else {
      scheduleViewportRedraw();
    }
  };

  useEffect(() => {
    syncCanvasSize();
    if (pendingPageSeparatorRedrawRef.current) {
      pendingPageSeparatorRedrawRef.current = false;
      drawPageSeparators();
    }
    scheduleViewportRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasHeight]);

  // 🔥 Warm up canvas so first stroke feels instant
  useEffect(() => {
    const ctx = inkCtxRef.current;
    if (!ctx) return;

    ctx.save();
    ctx.globalAlpha = 0.001;   // invisible stroke
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1, 1);
    ctx.stroke();
    ctx.restore();
  }, []);

  // ✅ Warn if leaving with unsaved whiteboard changes (refresh/close/tab)
  // ✅ Also catches browser Back/Forward gestures (popstate)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      saveDraftToLocalStorage();
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = ""; // required for Chrome/Edge
    };

    const onPopState = () => {
      if (!dirtyRef.current) return;

      const ok = window.confirm(
        "You have unsaved whiteboard changes. Leave this page and lose them?"
      );

      if (!ok) {
        window.setTimeout(() => window.history.go(1), 0);
      }
      // if ok, allow navigation naturally
    };
    const onPageHide = () => {
      saveDraftToLocalStorage();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (requestedWhiteboardId) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      pendingDraftRef.current = JSON.parse(raw) as WhiteboardDraftState;
      setDraftPromptOpen(true);
    } catch {
      clearDraftFromLocalStorage();
    }
  }, [draftKey, requestedWhiteboardId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      saveDraftToLocalStorage();
    }, 25000);
    return () => window.clearInterval(timer);
  }, [draftKey]);

  useEffect(() => {
    if (!showTitleModal || entryMode !== "recent") return;
    void loadRecentWhiteboards();
  }, [showTitleModal, entryMode, classId]);

  useEffect(() => {
    if (!classId || !requestedWhiteboardId) return;
    if (autoOpenedWhiteboardRef.current === requestedWhiteboardId) return;
    autoOpenedWhiteboardRef.current = requestedWhiteboardId;
    void openRecentWhiteboard(requestedWhiteboardId);
  }, [classId, requestedWhiteboardId]);

  // ✅ Prevent horizontal swipe gestures from triggering browser Back/Forward
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let sx = 0;
    let sy = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;

      // If the user is swiping more horizontally than vertically → block it
      if (Math.abs(dx) > Math.abs(dy) + 6) {
        if (e.cancelable) e.preventDefault();
      }
    };

    // passive:false is REQUIRED or preventDefault() is ignored
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart as any);
      el.removeEventListener("touchmove", onTouchMove as any);
    };
  }, []);


  useEffect(() => {
    const onResize = () => {
      if (isBoardGeometryLocked()) {
        scheduleViewportRedraw();
        return;
      }
      scheduleCanvasSync(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const updateHint = () => {
      const container = containerRef.current;
      if (!container || !lockedBoardWidth) {
        setShowHorizontalScrollHint(false);
        return;
      }

      const shouldShow =
        lockedBoardWidth - container.clientWidth > 24 && container.scrollLeft <= 8;

      setShowHorizontalScrollHint(shouldShow);

      if (horizontalScrollHintTimerRef.current != null) {
        window.clearTimeout(horizontalScrollHintTimerRef.current);
        horizontalScrollHintTimerRef.current = null;
      }

      if (shouldShow) {
        horizontalScrollHintTimerRef.current = window.setTimeout(() => {
          setShowHorizontalScrollHint(false);
          horizontalScrollHintTimerRef.current = null;
        }, 4200);
      }
    };

    updateHint();
    window.addEventListener("resize", updateHint);
    return () => {
      window.removeEventListener("resize", updateHint);
      if (horizontalScrollHintTimerRef.current != null) {
        window.clearTimeout(horizontalScrollHintTimerRef.current);
        horizontalScrollHintTimerRef.current = null;
      }
    };
  }, [lockedBoardWidth, isFullscreen]);

  useEffect(() => {
    return () => {
      if (viewportRedrawRafRef.current != null) {
        cancelAnimationFrame(viewportRedrawRafRef.current);
      }
      if (syncTimeoutRef.current != null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
      if (syncRafRef.current != null) {
        cancelAnimationFrame(syncRafRef.current);
      }
      if (horizontalScrollHintTimerRef.current != null) {
        window.clearTimeout(horizontalScrollHintTimerRef.current);
      }
    };
  }, []);

  /* ---------- Helpers ---------- */
  function getBoardViewportRect() {
    return (
      boardSurfaceRef.current?.getBoundingClientRect() ??
      inkCanvasRef.current?.getBoundingClientRect() ??
      containerRef.current?.getBoundingClientRect() ??
      null
    );
  }

  function getBoardCoordsFromClient(clientX: number, clientY: number) {
    const rect = getBoardViewportRect();
    const width = getBoardWidthCss();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(width || 0, clientX - rect.left)),
      y: Math.max(0, Math.min(canvasHeight, clientY - rect.top)),
    };
  }

  function getLocalXY(e: React.PointerEvent<HTMLCanvasElement>) {
    return getBoardCoordsFromClient(e.clientX, e.clientY);
  }

  function pushBgUndo() {
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCtxRef.current;
    if (!bgCanvas || !bgCtx) return;

    // snapshot in CSS pixels (we draw in CSS px because ctx scaled by ratio)
    const ratio = canvasMetricsRef.current?.ratio ?? getBoardDpr();
    const w = Math.floor(bgCanvas.width / ratio);
    const h = Math.floor(bgCanvas.height / ratio);
    const img = bgCtx.getImageData(0, 0, w, h);

    setBgUndoStack((s) => [...s.slice(-4), img]); // keep last 5
  }

  function popBgUndo() {
    const bgCtx = bgCtxRef.current;
    if (!bgCtx) return;

    setBgUndoStack((s) => {
      const next = [...s];
      const last = next.pop();
      if (last) bgCtx.putImageData(last, 0, 0);
      return next;
    });
  }

  function hitHandle(px: number, py: number, img: PlacedImage) {
    const s = 10;
    const corners = [
      { k: "nw" as const, x: img.x, y: img.y },
      { k: "ne" as const, x: img.x + img.w, y: img.y },
      { k: "sw" as const, x: img.x, y: img.y + img.h },
      { k: "se" as const, x: img.x + img.w, y: img.y + img.h },
    ];
    for (const c of corners) {
      if (Math.abs(px - c.x) <= s && Math.abs(py - c.y) <= s) return c.k;
    }
    return null;
  }

  async function getCachedImage(src: string) {
    const cached = imageCacheRef.current.get(src);
    if (cached) return cached;
    const img = new Image();
    img.src = src;
    await img.decode();
    imageCacheRef.current.set(src, img);
    return img;
  }

  async function redrawImages() {
    const imgCanvas = imgCanvasRef.current;
    const container = containerRef.current;
    if (!imgCanvas || !container) return;

    const ctx = imgCanvas.getContext("2d");
    if (!ctx) return;

    const widthCss = getBoardWidthCss();
    const pad = 400;

    const y0 = Math.max(0, container.scrollTop - pad);
    const y1 = Math.min(
      canvasHeight,
      container.scrollTop + container.clientHeight + pad
    );

    if (widthCss < 20 || y1 - y0 < 20) return;

    ctx.clearRect(0, y0, widthCss, y1 - y0);

    for (const p of placedImages) {
      if (p.y + p.h < y0 || p.y > y1) continue;

      try {
        const img = await getCachedImage(p.src);
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
        if (p.id === selectedImageId) {
          const handle = VISIBLE_RESIZE_HANDLE_SIZE;
          const xBox = 22;
          ctx.save();
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(p.x, p.y, p.w, p.h);
          ctx.setLineDash([]);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#1d4ed8";
          for (const [hx, hy] of [
            [p.x, p.y],
            [p.x + p.w, p.y],
            [p.x, p.y + p.h],
            [p.x + p.w, p.y + p.h],
          ]) {
            ctx.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
            ctx.strokeRect(hx - handle / 2, hy - handle / 2, handle, handle);
          }
          ctx.fillStyle = "#dc2626";
          ctx.fillRect(p.x + p.w - xBox, p.y - xBox, xBox, xBox);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 16px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("×", p.x + p.w - xBox / 2, p.y - xBox / 2 + 1);
          ctx.restore();
        }
      } catch { }
    }
  }
  
  useEffect(() => {
    scheduleViewportRedraw();
  }, [placedImages, selectedImageId]);


  useEffect(() => {
    function handlePaste(event: Event) {
      const clipboardEvent = event as ClipboardEvent;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName?.toLowerCase();
        const isEditable = active.isContentEditable || active.getAttribute("contenteditable") === "true";
        if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) {
          return;
        }
      }

      const items = clipboardEvent.clipboardData?.items;
      if (!items?.length) return;

      const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      clipboardEvent.preventDefault();
      void insertPastedImageFromFile(file).catch(() => {
        // Ignore clipboard paste failures to avoid interrupting board work.
      });
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canvasHeight, placedImages]);

  function stampTextToBoard(text: string) {
    const bgCtx = bgCtxRef.current;
    const container = containerRef.current;
    if (!bgCtx || !container) return;

    pushBgUndo();

    const x = 24;
    const y = Math.max(0, container.scrollTop + 56);

    bgCtx.save();
    bgCtx.globalCompositeOperation = "source-over";
    bgCtx.fillStyle = "#111827";
    bgCtx.font = "28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    bgCtx.fillText(text, x, y);
    bgCtx.restore();
    markDirty();
  }
  /* ---------- Ink drawing + Hand tool ---------- */
  function getBoardPoint(e: React.PointerEvent) {
    return getBoardCoordsFromClient(e.clientX, e.clientY);
  }

  function findTopImageAt(x: number, y: number) {
    for (let i = placedImages.length - 1; i >= 0; i--) {
      const p = placedImages[i];
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
    }
    return null;
  }

  function beginImageInteraction(x: number, y: number) {
    const hit = findTopImageAt(x, y);
    if (!hit) {
      setSelectedImageId(null);
      return false;
    }

    setSelectedImageId(hit.id);

    const inRect = (px: number, py: number, rx: number, ry: number, rw: number, rh: number) =>
      px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;

    const visibleHandleHalf = VISIBLE_RESIZE_HANDLE_SIZE / 2;
    const resizeHitHalf = RESIZE_HIT_SIZE / 2;
    const XBOX = 22;
    const xbx = hit.x + hit.w - XBOX;
    const xby = hit.y - XBOX;

    if (inRect(x, y, xbx, xby, XBOX, XBOX)) {
      snapshotObjects();
      markDirty();
      setPlacedImages((arr) => arr.filter((p) => p.id !== hit.id));
      setSelectedImageId(null);
      return true;
    }

    const corners = {
      nw: { cx: hit.x, cy: hit.y },
      ne: { cx: hit.x + hit.w, cy: hit.y },
      sw: { cx: hit.x, cy: hit.y + hit.h },
      se: { cx: hit.x + hit.w, cy: hit.y + hit.h },
    } as const;

    const didHitHandle = (cx: number, cy: number) =>
      inRect(
        x,
        y,
        cx - Math.max(visibleHandleHalf, resizeHitHalf),
        cy - Math.max(visibleHandleHalf, resizeHitHalf),
        Math.max(VISIBLE_RESIZE_HANDLE_SIZE, RESIZE_HIT_SIZE),
        Math.max(VISIBLE_RESIZE_HANDLE_SIZE, RESIZE_HIT_SIZE)
      );

    let mode: "move" | "nw" | "ne" | "sw" | "se" = "move";
    if (didHitHandle(corners.nw.cx, corners.nw.cy)) mode = "nw";
    else if (didHitHandle(corners.ne.cx, corners.ne.cy)) mode = "ne";
    else if (didHitHandle(corners.sw.cx, corners.sw.cy)) mode = "sw";
    else if (didHitHandle(corners.se.cx, corners.se.cy)) mode = "se";

    snapshotObjects();
    imgDragRef.current = {
      id: hit.id,
      mode,
      startX: x,
      startY: y,
      orig: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
    };
    return true;
  }

  const onImgPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "hand") return;
    const { x, y } = getBoardPoint(e);
    if (beginImageInteraction(x, y)) {
      handModeRef.current = "img";
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    setSelectedImageId(null);
    handModeRef.current = "pan";
    handDragRef.current = true;
    handStartRef.current = { y: e.clientY, scrollTop: containerRef.current?.scrollTop ?? 0 };
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onImgPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    if (!container) return;

    if (handModeRef.current === "pan" && handDragRef.current && handStartRef.current) {
      const dy = e.clientY - handStartRef.current.y;
      container.scrollTop = handStartRef.current.scrollTop - dy;
      return;
    }

    if (!imgDragRef.current) return;

    markDirty();
    const { x, y } = getBoardPoint(e);
    const dx = x - imgDragRef.current.startX;
    const dy = y - imgDragRef.current.startY;

    const { id, mode, orig } = imgDragRef.current;

    const MIN = 40; // minimum size so it never collapses

    setPlacedImages((arr) =>
      arr.map((p) => {
        if (p.id !== id) return p;

        // MOVE
        if (mode === "move") {
          return { ...p, x: orig.x + dx, y: orig.y + dy };
        }

        // RESIZE
        let nx = orig.x;
        let ny = orig.y;
        let nw = orig.w;
        let nh = orig.h;

        if (mode === "se") {
          nw = Math.max(MIN, orig.w + dx);
          nh = Math.max(MIN, orig.h + dy);
        } else if (mode === "ne") {
          nw = Math.max(MIN, orig.w + dx);
          nh = Math.max(MIN, orig.h - dy);
          ny = orig.y + (orig.h - nh);
        } else if (mode === "sw") {
          nw = Math.max(MIN, orig.w - dx);
          nh = Math.max(MIN, orig.h + dy);
          nx = orig.x + (orig.w - nw);
        } else if (mode === "nw") {
          nw = Math.max(MIN, orig.w - dx);
          nh = Math.max(MIN, orig.h - dy);
          nx = orig.x + (orig.w - nw);
          ny = orig.y + (orig.h - nh);
        }

        return { ...p, x: nx, y: ny, w: nw, h: nh };
      })
    );
  };


  const onImgPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    handModeRef.current = "none";
    handDragRef.current = false;
    handStartRef.current = null;
    imgDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { }
  };


  const onHandDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== "hand") return;

    const container = containerRef.current;
    if (!container) return;

    // otherwise pan
    setSelectedImageId(null);
    handModeRef.current = "pan";

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    handDragRef.current = true;
    handStartRef.current = { y: e.clientY, scrollTop: container.scrollTop };
  };

  const onHandMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== "hand") return;

    const container = containerRef.current;
    if (!container) return;

    // Image drag/resize
    if (handModeRef.current === "img" && imgDragRef.current) {
      markDirty();
      const { x, y } = getBoardPoint(e);
      const dx = x - imgDragRef.current.startX;
      const dy = y - imgDragRef.current.startY;

      const { id, mode, orig } = imgDragRef.current;
      const MIN = 40;

      setPlacedImages((arr) =>
        arr.map((p) => {
          if (p.id !== id) return p;

          if (mode === "move") {
            return { ...p, x: orig.x + dx, y: orig.y + dy };
          }

          let nx = orig.x;
          let ny = orig.y;
          let nw = orig.w;
          let nh = orig.h;

          if (mode === "se") {
            nw = Math.max(MIN, orig.w + dx);
            nh = Math.max(MIN, orig.h + dy);
          } else if (mode === "ne") {
            nw = Math.max(MIN, orig.w + dx);
            nh = Math.max(MIN, orig.h - dy);
            ny = orig.y + (orig.h - nh);
          } else if (mode === "sw") {
            nw = Math.max(MIN, orig.w - dx);
            nh = Math.max(MIN, orig.h + dy);
            nx = orig.x + (orig.w - nw);
          } else if (mode === "nw") {
            nw = Math.max(MIN, orig.w - dx);
            nh = Math.max(MIN, orig.h - dy);
            nx = orig.x + (orig.w - nw);
            ny = orig.y + (orig.h - nh);
          }

          return { ...p, x: nx, y: ny, w: nw, h: nh };
        })
      );
      return;
    }

    // Pan
    if (handModeRef.current === "pan" && handDragRef.current && handStartRef.current) {
      const dy = e.clientY - handStartRef.current.y;
      container.scrollTop = handStartRef.current.scrollTop - dy;
    }
  };

  const onHandUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== "hand") return;

    handModeRef.current = "none";
    imgDragRef.current = null;

    handDragRef.current = false;
    handStartRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { }
  };



  const beginStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const inkCanvas = inkCanvasRef.current;
    const inkCtx = inkCtxRef.current;
    const previewCtx = previewCtxRef.current;
    const container = containerRef.current;
    if (!inkCanvas || !container) return;

    inkCanvas.setPointerCapture(e.pointerId);

    if (tool === "hand") {
      handDragRef.current = true;
      handStartRef.current = { y: e.clientY, scrollTop: container.scrollTop };
      return;
    }

    if (!inkCtx) return;

    // Snapshot for undo (pen/eraser/line)
    snappedThisStrokeRef.current = false;
    drawingRef.current = true;
    const { x, y } = getLocalXY(e);

    penPrevRef.current = null;

    // LINE TOOL: store start, clear preview (no ink changes until release)
    if (tool === "line") {
      lineStartRef.current = { x, y };
      if (previewCtx) {
        previewCtx.clearRect(0, 0, getBoardWidthCss(), canvasHeight);
        previewCtx.globalCompositeOperation = "source-over";
        previewCtx.strokeStyle = penColor;
        previewCtx.lineWidth = penSize;
        previewCtx.lineCap = "round";
        previewCtx.lineJoin = "round";
      }
      return;
    }

    // Normal pen / eraser drawing
    if (tool === "eraser") {
      inkCtx.globalCompositeOperation = "destination-out";
      inkCtx.strokeStyle = "rgba(0,0,0,1)";
      inkCtx.lineWidth = eraserSize;
      inkCtx.lineCap = "round";
      inkCtx.lineJoin = "round";
    } else {
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.strokeStyle = penColor;
      inkCtx.lineWidth = penSize;
      inkCtx.lineCap = "round";
      inkCtx.lineJoin = "round";
    }

    inkCtx.beginPath();
    inkCtx.moveTo(x, y);

    if (tool === "pen") {
      penPrevRef.current = { x, y };
    }

  };

  const drawStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    const inkCtx = inkCtxRef.current;
    const previewCtx = previewCtxRef.current;
    if (!container) return;

    if (tool === "hand") {
      if (!handDragRef.current || !handStartRef.current) return;
      const dy = e.clientY - handStartRef.current.y;
      container.scrollTop = handStartRef.current.scrollTop - dy;
      return;
    }

    if (!drawingRef.current) return;

    if (!snappedThisStrokeRef.current) {
      snappedThisStrokeRef.current = true;
      snapshotInkViewport();
      markDirty();
    }

    const { x, y } = getLocalXY(e);

    // LINE TOOL: draw ONLY on preview canvas while moving
    if (tool === "line") {
      const start = lineStartRef.current;
      if (!start || !previewCtx) return;

      previewCtx.clearRect(0, 0, getBoardWidthCss(), canvasHeight);
      previewCtx.beginPath();
      previewCtx.moveTo(start.x, start.y);
      previewCtx.lineTo(x, y);
      previewCtx.stroke();
      return;
    }

    // Pen / Eraser
    if (!inkCtx) return;

    // Eraser stays as-is (straight segments are fine)
    if (tool === "eraser") {
      inkCtx.lineTo(x, y);
      inkCtx.stroke();
      return;
    }

    // Pen smoothing: quadratic midpoint curve
    if (tool === "pen") {
      // Buffer points; actual drawing happens in flushPen() at most once per frame
      penPendingRef.current.push({ x, y });

      if (penRafRef.current == null) {
        penRafRef.current = requestAnimationFrame(flushPen);
      }
      return;
    }

    // Any other tool fallback
    inkCtx.lineTo(x, y);
    inkCtx.stroke();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const inkCanvas = inkCanvasRef.current;
    const inkCtx = inkCtxRef.current;
    const previewCtx = previewCtxRef.current;
    const container = containerRef.current;
    if (!inkCanvas || !container) return;

    // Commit line to ink on release
    if (tool === "line") {
      const start = lineStartRef.current;
      if (start && inkCtx) {
        const { x, y } = getLocalXY(e);

        inkCtx.save();
        inkCtx.globalCompositeOperation = "source-over";
        inkCtx.strokeStyle = penColor;
        inkCtx.lineWidth = penSize;
        inkCtx.lineCap = "round";
        inkCtx.lineJoin = "round";
        inkCtx.beginPath();
        inkCtx.moveTo(start.x, start.y);
        inkCtx.lineTo(x, y);
        inkCtx.stroke();
        inkCtx.restore();
      }

      lineStartRef.current = null;

      if (previewCtx) {
        previewCtx.clearRect(0, 0, getBoardWidthCss(), canvasHeight);
      }
    }

    drawingRef.current = false;
    handDragRef.current = false;
    handStartRef.current = null;

    try {
      inkCanvas.releasePointerCapture(e.pointerId);
    } catch { }

    penPrevRef.current = null;

  };

  const clearInk = () => {
    const inkCanvas = inkCanvasRef.current;
    const inkCtx = inkCtxRef.current;
    if (!inkCanvas || !inkCtx) return;

    inkCtx.save();
    inkCtx.globalCompositeOperation = "source-over";
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    inkCtx.restore();
  };

  const clearAll = () => {
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCtxRef.current;
    const previewCanvas = previewCanvasRef.current;
    const previewCtx = previewCtxRef.current;

    if (bgCanvas && bgCtx) bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    if (previewCanvas && previewCtx) previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    clearInk();

    // ALSO remove all inserted/snipped PDF images
    setPlacedImages([]);
    setSelectedImageId(null);
    markDirty();

  };
  function undo() {
    const ink = inkCanvasRef.current;
    const ctx = inkCtxRef.current;
    if (!ink || !ctx) return;

    setInkUndoStack((u) => {
      if (u.length === 0) return u;

      const prev = u[u.length - 1];

      // Save current region into redo
      const curImg = ctx.getImageData(0, prev.y, ink.width, prev.h);
      setInkRedoStack((r) => [...r, { y: prev.y, h: prev.h, data: curImg }]);

      // Restore previous region
      ctx.putImageData(prev.data, 0, prev.y);

      return u.slice(0, -1);
    });
  }

  function redo() {
    const ink = inkCanvasRef.current;
    const ctx = inkCtxRef.current;
    if (!ink || !ctx) return;

    setInkRedoStack((r) => {
      if (r.length === 0) return r;

      const next = r[r.length - 1];

      // Save current region into undo
      const curImg = ctx.getImageData(0, next.y, ink.width, next.h);
      setInkUndoStack((u) => [...u, { y: next.y, h: next.h, data: curImg }]);

      // Restore redo region
      ctx.putImageData(next.data, 0, next.y);

      return r.slice(0, -1);
    });
  }

  const repaintAfterLayout = () => {
    requestAnimationFrame(() => {
      // same as scroll repaint, but without changing scrollTop
      if (gridApplied) drawGridOverlay();
      else if (axesApplied) drawAxesOverlay();
      if (placedImages.length) void redrawImages();
    });
  };

  /* ---------- Infinite-ish scroll / add pages ---------- */
  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollLeft > 8 && showHorizontalScrollHint) {
      setShowHorizontalScrollHint(false);
      if (horizontalScrollHintTimerRef.current != null) {
        window.clearTimeout(horizontalScrollHintTimerRef.current);
        horizontalScrollHintTimerRef.current = null;
      }
    }
    scheduleViewportRedraw();
  };

  function addPage() {
    lockBoardWidthIfNeeded();
    lockBoardDprIfNeeded();
    pendingPageSeparatorRedrawRef.current = true;
    setCanvasHeight((h) => Math.min(h + PAGE_HEIGHT, 30000));
  }

  function drawPageSeparators() {
    const bgCtx = bgCtxRef.current;
    const container = containerRef.current;
    if (!bgCtx || !container) return;

    bgCtx.save();
    bgCtx.globalCompositeOperation = "source-over";
    bgCtx.strokeStyle = "rgba(15,23,42,0.12)";
    bgCtx.lineWidth = 1;

    const width = getBoardWidthCss();
    for (let y = PAGE_HEIGHT; y < canvasHeight; y += PAGE_HEIGHT) {
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(width, y);
      bgCtx.stroke();
    }
    bgCtx.restore();
  }

  // 🔥 draw buffered pen points once per animation frame
  function flushPen() {
    penRafRef.current = null;

    const inkCtx = inkCtxRef.current;
    if (!inkCtx) {
      penPendingRef.current = [];
      return;
    }

    const pts = penPendingRef.current;
    penPendingRef.current = [];
    if (pts.length === 0) return;

    for (const p of pts) {
      const prev = penPrevRef.current;

      if (!prev) {
        penPrevRef.current = { x: p.x, y: p.y };
        inkCtx.lineTo(p.x, p.y);
        continue;
      }

      const midX = (prev.x + p.x) / 2;
      const midY = (prev.y + p.y) / 2;

      inkCtx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      penPrevRef.current = { x: p.x, y: p.y };
    }

    inkCtx.stroke();
  }

  /* ---------- Save ---------- */
  async function doSave() {
    const bg = bgCanvasRef.current;
    const ink = inkCanvasRef.current;
    const container = containerRef.current;

    if (!bg || !ink || !container) return;

    setSaving(true);

    try {
      const out = document.createElement("canvas");

      // Use the REAL internal canvas size to avoid distortion
      out.width = bg.width;
      out.height = bg.height;

      const outCtx = out.getContext("2d");
      if (!outCtx) throw new Error("Could not create export canvas");

      // Match live board coordinate system
      const boardWidth = getBoardWidthCss();
      const scaleX = out.width / boardWidth;
      const scaleY = out.height / canvasHeight;

      outCtx.save();
      outCtx.scale(scaleX, scaleY);

      // 1) Background
      outCtx.drawImage(bg, 0, 0, boardWidth, canvasHeight);

      // 2) Placed images (PDF inserts + snips)
      for (const p of placedImages) {
        try {
          const img = await getCachedImage(p.src);
          outCtx.drawImage(img, p.x, p.y, p.w, p.h);
        } catch {
          // ignore one broken image
        }
      }

      // 3) Grid / XY overlays
      if (gridApplied) {
        const fullW = boardWidth;
        const top = gridTop ?? 0;
        const viewH = container.clientHeight;

        const drawW = gridMode === "half" ? Math.floor(fullW / 2) : fullW;
        const left = gridMode === "half" ? Math.floor(fullW / 2) : 0;

        const cols = Math.max(2, Math.min(80, Math.floor(gridX)));
        const rows = Math.max(2, Math.min(80, Math.floor(gridY)));

        const cellW = drawW / cols;
        const cellH = viewH / rows;

        outCtx.save();
        outCtx.globalCompositeOperation = "source-over";
        outCtx.strokeStyle = "rgba(15,23,42,0.18)";
        outCtx.lineWidth = 1;

        for (let c = 0; c <= cols; c++) {
          const x = left + c * cellW;
          outCtx.beginPath();
          outCtx.moveTo(x, top);
          outCtx.lineTo(x, top + viewH);
          outCtx.stroke();
        }

        for (let r = 0; r <= rows; r++) {
          const y = top + r * cellH;
          outCtx.beginPath();
          outCtx.moveTo(left, y);
          outCtx.lineTo(left + drawW, y);
          outCtx.stroke();
        }

        outCtx.restore();
      } else if (axesApplied) {
        const fullW = boardWidth;
        const viewH = container.clientHeight;
        const top = axesTop ?? 0;

        const left = axesMode === "half" ? Math.floor(fullW / 2) : 0;
        const drawW = axesMode === "half" ? Math.floor(fullW / 2) : fullW;

        const x0 = left;
        const y0 = top;
        const x1 = left + drawW;
        const y1 = top + viewH;

        const mapX = (x: number) =>
          x0 + ((x - domMin) / (domMax - domMin)) * (x1 - x0);
        const mapY = (y: number) =>
          y1 - ((y - rngMin) / (rngMax - rngMin)) * (y1 - y0);

        outCtx.save();
        outCtx.globalCompositeOperation = "source-over";

        outCtx.fillStyle = "rgba(15,23,42,0.25)";
        const dotR = 1.2;
        for (let x = domMin; x <= domMax + 1e-9; x += domStep) {
          for (let y = rngMin; y <= rngMax + 1e-9; y += rngStep) {
            const px = mapX(x);
            const py = mapY(y);
            outCtx.beginPath();
            outCtx.arc(px, py, dotR, 0, Math.PI * 2);
            outCtx.fill();
          }
        }

        outCtx.strokeStyle = "rgba(15,23,42,0.6)";
        outCtx.lineWidth = 2;
        outCtx.fillStyle = "#0f172a";
        outCtx.font = "12px sans-serif";

        const xAxisY = Math.min(y1 - 18, Math.max(y0 + 2, mapY(0)));
        const yAxisX = Math.min(x1 - 6, Math.max(x0 + 18, mapX(0)));

        outCtx.textAlign = "center";
        outCtx.textBaseline = "top";
        for (let x = domMin; x <= domMax + 1e-9; x += domStep) {
          if (Math.abs(x) < 1e-9) continue;
          const px = mapX(x);
          outCtx.fillText(String(x), px, xAxisY + 6);
        }

        outCtx.textAlign = "right";
        outCtx.textBaseline = "middle";
        for (let y = rngMin; y <= rngMax + 1e-9; y += rngStep) {
          if (Math.abs(y) < 1e-9) continue;
          const py = mapY(y);
          outCtx.fillText(String(y), yAxisX - 8, py);
        }

        const zeroYPx = mapY(0);

        if (domMin <= 0 && 0 <= domMax) {
          const px = mapX(0);
          outCtx.fillText("0", px, zeroYPx + 4);
          outCtx.beginPath();
          outCtx.moveTo(px, y0);
          outCtx.lineTo(px, y1);
          outCtx.stroke();
        }

        if (rngMin <= 0 && 0 <= rngMax) {
          const py = mapY(0);
          outCtx.beginPath();
          outCtx.moveTo(x0, py);
          outCtx.lineTo(x1, py);
          outCtx.stroke();
        }

        outCtx.restore();
      }

      // 4) Ink
      outCtx.drawImage(ink, 0, 0, boardWidth, canvasHeight);

      outCtx.restore();

      const blob: Blob = await new Promise((resolve, reject) => {
        out.toBlob((b) => {
          if (!b) reject(new Error("Could not export image"));
          else resolve(b);
        }, "image/png");
      });

      const form = new FormData();
      const safeTitle =
        boardTitle?.trim() || `Whiteboard ${new Date().toISOString().slice(0, 10)}`;

      form.append("class_id", String(classId));
      form.append("title", safeTitle);
      form.append("image", blob, "whiteboard.png");
      form.append("file", blob, "whiteboard.png");

      const saveRes = await apiFetch(`${API_BASE}/whiteboard/save`, {
        method: "POST",
        body: form,
      });
      const savedPostId = Number(saveRes?.id);

      try {
        const editableState = serializeWhiteboardState();
        if (editableState) {
          const whiteboardRes = await apiFetch(`${API_BASE}/whiteboards`, {
            method: "POST",
            body: JSON.stringify({
              whiteboard_id: currentWhiteboardId ?? undefined,
              class_id: classId,
              title: boardTitle,
              state: editableState,
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });
          const nextId = Number(whiteboardRes?.id);
          if (Number.isFinite(nextId) && nextId > 0) {
            setCurrentWhiteboardId(nextId);

            if (Number.isFinite(savedPostId) && savedPostId > 0) {
              await apiFetch(`${API_BASE}/whiteboards/${nextId}/link-note`, {
                method: "POST",
                body: JSON.stringify({
                  class_id: classId,
                  post_id: savedPostId,
                }),
                headers: {
                  "Content-Type": "application/json",
                },
              });
            }
          }
        }
      } catch (e) {
        console.warn("Editable whiteboard state was not saved.", e);
      }

      clearDraftFromLocalStorage();
      markClean();
      navigate(`/class/${classId}`);
    } catch (e: any) {
      alert(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }
  /* ---------- Import list ---------- */
  async function loadImportList() {
    setImportLoading(true);
    setImportError(null);

    try {
      const [notes, exams] = (await Promise.all([
        apiFetch(`${API_BASE}/notes/${classId}?kind=notes`),
        apiFetch(`${API_BASE}/notes/${classId}?kind=exam`),
      ])) as [NoteItem[], NoteItem[]];

      const combined: Array<{ kind: "notes" | "exam"; item: NoteItem }> = [
        ...notes.map((n) => ({ kind: "notes" as const, item: n })),
        ...exams.map((n) => ({ kind: "exam" as const, item: n })),
      ];


      setImportList(combined);
    } catch (e: any) {
      setImportError(e?.message ?? "Could not load PDFs");
    } finally {
      setImportLoading(false);
    }
  }

  async function loadExamLibraryList() {
    setExamLibraryLoading(true);
    setExamLibraryError(null);

    try {
      const params = new URLSearchParams();
      if (examLibrarySubject) params.set("subject", examLibrarySubject);
      if (examLibraryCycle) params.set("cycle", examLibraryCycle);
      if (examLibraryLevel) params.set("level", examLibraryLevel);

      const items = (await apiFetch(`${API_BASE}/exam-library/items?${params.toString()}`)) as ExamLibraryItem[];
      setExamLibraryItems(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setExamLibraryError(e?.message ?? "Could not load exam library");
    } finally {
      setExamLibraryLoading(false);
    }
  }

  useEffect(() => {
    if (showImportModal && importList.length === 0 && !importLoading) loadImportList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImportModal]);

  useEffect(() => {
    const allowed = examLibraryLevelOptions(examLibraryCycle);
    if (!allowed.includes(examLibraryLevel)) {
      setExamLibraryLevel(allowed[0]);
    }
  }, [examLibraryCycle, examLibraryLevel]);

  useEffect(() => {
    if (!showImportModal || importSource !== "exam-library") return;
    void loadExamLibraryList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImportModal, importSource, examLibrarySubject, examLibraryCycle, examLibraryLevel]);

  useEffect(() => {
    if (!importedPdf || !showPdfPanel) return;

    let rafId: number | null = null;
    let tId: number | null = null;
    let ro: ResizeObserver | null = null;

    const schedule = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (tId != null) window.clearTimeout(tId);
        tId = window.setTimeout(() => {
          renderPdfToViewer(pdfPageNum);
        }, 60);
      });
    };

    const onResize = () => schedule();
    const onFs = () => {
      schedule();
      // ✅ keepalive burst (panels can miss resize events)
      let n = 0;
      const burst = window.setInterval(() => {
        n += 1;
        renderPdfToViewer(pdfPageNum);
        if (n >= 10) window.clearInterval(burst);
      }, 120);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("fullscreenchange", onFs);
    window.visualViewport?.addEventListener("resize", onResize);

    // ✅ Observe the actual overflow-auto viewer (the thing renderPdfToViewer measures)
    if (pdfViewerRef.current) {
      ro = new ResizeObserver(() => schedule());
      ro.observe(pdfViewerRef.current);
    }

    // initial
    schedule();

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("fullscreenchange", onFs);
      window.visualViewport?.removeEventListener("resize", onResize);
      if (rafId != null) cancelAnimationFrame(rafId);
      if (tId != null) window.clearTimeout(tId);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedPdf, showPdfPanel, pdfPageNum, pdfViewScale]);
  /* ---------- Insert PDF onto board (page 1 as image) ---------- */
  async function insertPdfPage1() {
    if (!importedPdf) return;

    const bgCtx = bgCtxRef.current;
    const container = containerRef.current;
    if (!bgCtx || !container) return;

    try {
      setLastInsertInfo(null);
      pushBgUndo();
      lockBoardWidthIfNeeded();
      lockBoardDprIfNeeded();

      const pdfjsLib = await loadPdfJs();
      const pdfUrl = await getAuthenticatedPdfUrl(importedPdf.item.file_url);
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const width = getBoardWidthCss();
      const viewport0 = page.getViewport({ scale: 1.0 });
      const fitScale = (width / viewport0.width) * pdfInsertScale;
      const dpr = getBoardDpr();// cap to avoid huge memory use
      const viewportCss = page.getViewport({ scale: fitScale });          // size you want on the board
      const viewportHiDpi = page.getViewport({ scale: fitScale * dpr });  // extra pixels for sharpness

      const tmp = document.createElement("canvas");
      tmp.width = Math.floor(viewportHiDpi.width);
      tmp.height = Math.floor(viewportHiDpi.height);

      const tmpCtx = tmp.getContext("2d");
      if (!tmpCtx) throw new Error("Could not render PDF");

      // render at higher resolution
      await page.render({ canvasContext: tmpCtx, viewport: viewportHiDpi }).promise;

      // IMPORTANT: keep your placed image size in CSS pixels (so it doesn't appear huge)
      const wCss = Math.floor(viewportCss.width);
      const hCss = Math.floor(viewportCss.height);


      const y = Math.max(0, container.scrollTop + 20);

      const dataUrl = tmp.toDataURL("image/png");

      markDirty();
      setPlacedImages((arr) => [
        ...arr,
        {
          id: `pdf_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          src: dataUrl,
          x: 20,
          y,
          w: wCss,
          h: hCss,
        },
      ]);


      setLastInsertInfo(`Inserted: ${importedPdf.item.filename} (page 1)`);

      const needed = y + tmp.height + 60;
      if (needed > canvasHeight) setCanvasHeight((h) => Math.min(Math.max(h, needed + 500), 30000));
    } catch (e: any) {
      popBgUndo();
      alert(e?.message || "Could not insert PDF onto board");
    }
  }

  // Cache the currently loaded PDF doc so resize/fullscreen rerenders are instant
  const pdfDocRef = useRef<any>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const pdfRenderTokenRef = useRef(0); // cancels stale async renders

  async function getAuthenticatedPdfUrl(fileUrl: string): Promise<string> {
    const resolvedUrl = resolveFileUrl(fileUrl);
    if (!resolvedUrl) throw new Error("Missing PDF URL");

    if (pdfBlobUrlRef.current && pdfSourceUrlRef.current === resolvedUrl) {
      return pdfBlobUrlRef.current;
    }

    if (pdfBlobUrlRef.current) {
      window.URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }

    pdfDocRef.current = null;
    pdfUrlRef.current = null;
    pdfSourceUrlRef.current = resolvedUrl;

    const token = (() => {
      try {
        return localStorage.getItem("elume_token");
      } catch {
        return null;
      }
    })();

    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(resolvedUrl, { method: "GET", headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed (${res.status})`);
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    pdfBlobUrlRef.current = blobUrl;
    return blobUrl;
  }

  async function renderPdfToViewer(pageNum: number) {
    if (!importedPdf) return;

    const canvas = pdfCanvasRef.current;
    if (!canvas) return;

    const viewer = pdfViewerRef.current;
    if (!viewer) return;

    // During fullscreen/orientation/tablet-mode transitions the panel can be 0px for a moment.
    // If we render then, the canvas gets cleared and stays blank.
    const parentW = viewer.clientWidth;
    const parentH = viewer.clientHeight;
    if (parentW < 20 || parentH < 20) {
      // Fullscreen/tablet/orientation transitions often make the panel 0px temporarily.
      // Retry a few times so the PDF reappears once layout stabilises.
      const tries = 10;
      let n = 0;

      const retry = () => {
        n += 1;

        const c = pdfCanvasRef.current;
        const v = pdfViewerRef.current;
        if (!c || !v) return;

        if (v.clientWidth >= 20 && v.clientHeight >= 20) {
          renderPdfToViewer(pageNum);
          return;
        }
        if (n < tries) {
          setTimeout(retry, 80);
        }
      };

      setTimeout(retry, 80);
      return;
    }

    const token = ++pdfRenderTokenRef.current;

    const pdfjsLib = await loadPdfJs();
    const pdfUrl = await getAuthenticatedPdfUrl(importedPdf.item.file_url);

    // Load once per PDF
    if (!pdfDocRef.current || pdfUrlRef.current !== pdfUrl) {
      pdfUrlRef.current = pdfUrl;
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      pdfDocRef.current = await loadingTask.promise;
    }

    if (token !== pdfRenderTokenRef.current) return;

    const pdf = pdfDocRef.current;
    setPdfNumPages(pdf.numPages);

    const p = Math.max(1, Math.min(pageNum, pdf.numPages));
    const page = await pdf.getPage(p);

    // Fit to panel width but keep your zoom control (pdfViewScale)
    const viewport1 = page.getViewport({ scale: 1 });
    const fitScale = (parentW / viewport1.width) * pdfViewScale;

    const dpr = getBoardDpr();
    const viewportCss = page.getViewport({ scale: fitScale });
    const viewportHiDpi = page.getViewport({ scale: fitScale * dpr });

    canvas.style.width = `${Math.floor(viewportCss.width)}px`;
    canvas.style.height = `${Math.floor(viewportCss.height)}px`;
    canvas.width = Math.floor(viewportHiDpi.width);
    canvas.height = Math.floor(viewportHiDpi.height);

    setPdfCanvasSize({ w: Math.floor(viewportCss.width), h: Math.floor(viewportCss.height) });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: viewportHiDpi }).promise;

    if (token !== pdfRenderTokenRef.current) return;

    setPdfPageNum(p);
    setClipRect(null);
  }

  useEffect(() => {
    pdfRenderTokenRef.current += 1;
    pdfDocRef.current = null;
    pdfUrlRef.current = null;
    setPdfPageNum(1);
    setPdfNumPages(1);
    setClipRect(null);
    if (pdfBlobUrlRef.current) {
      window.URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }
    pdfSourceUrlRef.current = null;
  }, [importedPdf]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        window.URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
      pdfSourceUrlRef.current = null;
    };
  }, []);

  function overlayXY(e: React.PointerEvent) {
    const el = pdfOverlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const onClipDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // only left click / primary touch
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();

    // capture pointer so move events keep firing even if pointer leaves overlay
    e.currentTarget.setPointerCapture(e.pointerId);

    clipDragRef.current = true;
    const p = overlayXY(e);
    clipStartRef.current = p;

    setClipRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onClipMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!clipDragRef.current || !clipStartRef.current) return;
    e.preventDefault();

    const p = overlayXY(e);
    const s = clipStartRef.current;

    const x = Math.min(s.x, p.x);
    const y = Math.min(s.y, p.y);
    const w = Math.abs(p.x - s.x);
    const h = Math.abs(p.y - s.y);

    setClipRect({ x, y, w, h });
  };

  const onClipUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();

    clipDragRef.current = false;
    clipStartRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { }
  };


  async function snipToBoardAndClose() {
    if (!clipRect) return;

    const src = pdfCanvasRef.current;
    const container = containerRef.current;
    if (!src || !container) return;
    lockBoardWidthIfNeeded();
    lockBoardDprIfNeeded();

    const min = 12;
    if (clipRect.w < min || clipRect.h < min) {
      alert("Drag a bigger selection box.");
      return;
    }

    const crop = document.createElement("canvas");

    // 🔹 calculate scale FIRST
    const scaleX = src.width / pdfCanvasSize.w;
    const scaleY = src.height / pdfCanvasSize.h;

    // 🔹 then set crop resolution
    crop.width = Math.floor(clipRect.w * scaleX);
    crop.height = Math.floor(clipRect.h * scaleY);

    const cctx = crop.getContext("2d");
    if (!cctx) return;

    // 🔹 draw using scaled coordinates
    cctx.drawImage(
      src,
      clipRect.x * scaleX,
      clipRect.y * scaleY,
      clipRect.w * scaleX,
      clipRect.h * scaleY,
      0,
      0,
      crop.width,
      crop.height
    );

    const dataUrl = crop.toDataURL("image/png");

    const y = Math.max(0, container.scrollTop + 20);
    const x = 20;

    const maxW = Math.max(200, getBoardWidthCss() - 60);
    let w = crop.width;
    let h = crop.height;
    if (w > maxW) {
      const s = maxW / w;
      w = Math.floor(w * s);
      h = Math.floor(h * s);
    }
    snapshotObjects();
    markDirty();
    setPlacedImages((arr) => [
      ...arr,
      {
        id: `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        src: dataUrl,
        x,
        y,
        w,
        h,
      },
    ]);

    // AUTO-CLOSE after snip
    setShowPdfPanel(false);
    setClipRect(null);
    setSnipMode(false);
  }

  function clearOverlay() {
    const ctx = overlayCtxRef.current;
    const container = containerRef.current;
    if (!ctx || !container) return;

    // Only clear the visible area (+ padding) instead of the full tall canvas
    const pad = 300;
    const y0 = Math.max(0, Math.floor(container.scrollTop - pad));
    const h = Math.floor(container.clientHeight + pad * 2);

    ctx.clearRect(0, y0, getBoardWidthCss(), h);
  }

  function drawGridOverlay() {
    const ctx = overlayCtxRef.current;
    const container = containerRef.current;
    if (!ctx || !container) return;

    clearOverlay();

    const boardWidth = getBoardWidthCss();
    const width = gridMode === "half" ? Math.floor(boardWidth / 2) : boardWidth;
    const left = gridMode === "half" ? Math.floor(boardWidth / 2) : 0;

    const viewH = container.clientHeight;
    const top = gridTop ?? container.scrollTop;
    const h = viewH;

    const cols = Math.max(2, Math.min(80, Math.floor(gridX)));
    const rows = Math.max(2, Math.min(80, Math.floor(gridY)));

    const cellW = width / cols;
    const cellH = h / rows;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(15,23,42,0.18)";
    ctx.lineWidth = 1;

    for (let c = 0; c <= cols; c++) {
      const x = left + c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + h);
      ctx.stroke();
    }

    for (let r = 0; r <= rows; r++) {
      const y = top + r * cellH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawAxesOverlay() {
    const ctx = overlayCtxRef.current;
    const container = containerRef.current;
    if (!ctx || !container) return;

    clearOverlay();

    const fullW = getBoardWidthCss();
    const viewH = container.clientHeight;
    const top = axesTop ?? container.scrollTop;

    const left = axesMode === "half" ? Math.floor(fullW / 2) : 0;
    const width = axesMode === "half" ? Math.floor(fullW / 2) : fullW;

    const x0 = left;
    const y0 = top;
    const x1 = left + width;
    const y1 = top + viewH;

    const mapX = (x: number) => x0 + ((x - domMin) / (domMax - domMin)) * (x1 - x0);
    const mapY = (y: number) => y1 - ((y - rngMin) / (rngMax - rngMin)) * (y1 - y0);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    // dots
    ctx.fillStyle = "rgba(15,23,42,0.25)";
    const dotR = 1.2;
    for (let x = domMin; x <= domMax + 1e-9; x += domStep) {
      for (let y = rngMin; y <= rngMax + 1e-9; y += rngStep) {
        const px = mapX(x);
        const py = mapY(y);
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // axes + labels
    ctx.strokeStyle = "rgba(15,23,42,0.6)";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px sans-serif";

    const xAxisY = Math.min(y1 - 18, Math.max(y0 + 2, mapY(0)));
    const yAxisX = Math.min(x1 - 6, Math.max(x0 + 18, mapX(0)));

    // x labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = domMin; x <= domMax + 1e-9; x += domStep) {
      if (Math.abs(x) < 1e-9) continue;
      const px = mapX(x);
      ctx.fillText(String(x), px, xAxisY + 6);
    }

    // y labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = rngMin; y <= rngMax + 1e-9; y += rngStep) {
      if (Math.abs(y) < 1e-9) continue;
      const py = mapY(y);
      ctx.fillText(String(y), yAxisX - 8, py);
    }

    const zeroYPx = mapY(0);

    // vertical axis (x=0)
    if (domMin <= 0 && 0 <= domMax) {
      const px = mapX(0);
      ctx.fillText("0", px, zeroYPx + 4);
      ctx.beginPath();
      ctx.moveTo(px, y0);
      ctx.lineTo(px, y1);
      ctx.stroke();
    }

    // horizontal axis (y=0)
    if (rngMin <= 0 && 0 <= rngMax) {
      const py = mapY(0);
      ctx.beginPath();
      ctx.moveTo(x0, py);
      ctx.lineTo(x1, py);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ---------- Grid overlay ---------- */
  function applyGrid() {
    const ctx = overlayCtxRef.current;
    const container = containerRef.current;
    if (!ctx || !container) return;

    setAxesApplied(false);

    // ✅ remember where it was applied
    setGridTop(container.scrollTop);

    drawGridOverlay();
    setGridApplied(true);
    setShowGridModal(false);
  }

  function removeGrid() {
    if (!gridApplied) return;
    clearOverlay();
    setGridApplied(false);
    setGridTop(null); // ✅ reset snap position
  }


  /* ---------- XY Plane ---------- */
  function applyAxes() {
    const ctx = overlayCtxRef.current;
    const container = containerRef.current;
    if (!ctx || !container) return;

    if (domMax <= domMin || rngMax <= rngMin) {
      alert("Domain/Range max must be greater than min.");
      return;
    }
    if (domStep <= 0 || rngStep <= 0) {
      alert("Increments must be > 0");
      return;
    }

    // XY and Grid share the same overlay, so make them mutually exclusive
    setGridApplied(false);

    // ✅ remember where it was applied
    setAxesTop(container.scrollTop);

    drawAxesOverlay();
    setAxesApplied(true);
    setShowAxesModal(false);
  }

  function removeAxes() {
    if (!axesApplied) return;
    clearOverlay();
    setAxesApplied(false);
    setAxesTop(null);
  }

  async function toggleFullscreen() {
    const el = fsRootRef.current;
    if (!el) return;
    if (dirtyRef.current) stabilizeBoardGeometryIfNeeded();

    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen failed:", err);
    }
  }

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (isBoardGeometryLocked()) {
        scheduleViewportRedraw();
        return;
      }
      scheduleCanvasSync(true, 140);
    };

    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onVV = () => {
      if (isBoardGeometryLocked()) {
        scheduleViewportRedraw();
        return;
      }
      scheduleCanvasSync(true, 140);
    };

    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);

    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure scrolling still works in fullscreen (some layouts/global css can force overflow hidden)
  useEffect(() => {
    if (isFullscreen) {
      document.documentElement.style.overflow = "auto";
      document.body.style.overflow = "auto";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [isFullscreen]);

  function DotSizeButton({
    value,
    active,
    onClick,
  }: {
    value: number;
    active: boolean;
    onClick: () => void;
  }) {
    const d = Math.max(6, Math.min(18, value));
    return (
      <button
        type="button"
        onClick={onClick}
        className={`h-10 w-10 rounded-xl border-2 ${active ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
          } hover:bg-slate-50 grid place-items-center`}
        title={`Size ${value}`}
      >
        <span className="rounded-full" style={{ width: d, height: d, background: active ? "white" : "#111827" }} />
      </button>
    );
  }

  return (
    <div ref={fsRootRef} className="min-h-screen bg-[#dff3df]">
      <div className="mx-auto max-w-9xl px-3 pt-1">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
            <span className="text-base font-semibold text-slate-900">
              Whiteboard
            </span>

            {classLabel && (
              <>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-700 font-semibold truncate">
                  {classLabel}
                </span>
              </>
            )}

            {boardTitle && (
              <>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500 truncate">
                  {boardTitle}
                </span>
              </>
            )}

            {lastInsertInfo && (
              <span className="hidden md:inline text-xs text-slate-400 truncate max-w-[28vw]">
                · {lastInsertInfo}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button className={pill} type="button" onClick={toggleFullscreen}>
              {isFullscreen ? "Exit full screen" : "Full screen"}
            </button>
            <button
              className={pill}
              type="button"
              onClick={() => {
                stabilizeBoardGeometryIfNeeded();
                setShowImportModal(true);
              }}
            >
              Import PDF
            </button>
            <button
              className={pill}
              type="button"
              onClick={() => requestLeave(`/class/${classId}`)}
            >
              Back to Class
            </button>
            <button
              type="button"
              onClick={() => setShowSaveModal(true)}
              disabled={saving}
              className="rounded-xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>

        {/* Tools */}
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
            <button type="button" className={tool === "pen" ? pillOn : pill} onClick={() => setTool("pen")}>
              Pen
            </button>
            <button type="button" className={tool === "eraser" ? pillOn : pill} onClick={() => setTool("eraser")}>
              Eraser
            </button>
            <button type="button" className={tool === "line" ? pillOn : pill} onClick={() => setTool("line")}>
              Line
            </button>
            <button type="button" className={tool === "hand" ? pillOn : pill} onClick={() => setTool("hand")}>
              Select
            </button>

            <div className="mx-2 h-6 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setPenColor(c);
                  }}
                  className={`h-9 w-9 rounded-xl border-2 ${penColor === c ? "border-slate-900" : "border-slate-200"}`}
                  style={{ background: c }}
                  title="Pen colour"
                />
              ))}
            </div>

            <div className="mx-2 h-6 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
              {(tool === "pen" ? PEN_SIZES : ERASER_SIZES).map((s) => (
                <DotSizeButton
                  key={s}
                  value={s}
                  active={tool === "pen" ? penSize === s : eraserSize === s}
                  onClick={() => {
                    if (tool === "pen") setPenSize(s);
                    else setEraserSize(s);
                  }}
                />
              ))}
            </div>

            <div className="ml-auto flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
              <button type="button" className={pill} onClick={undo} disabled={inkUndoStack.length === 0}>
                Undo
              </button>
              <button type="button" className={pill} onClick={redo} disabled={inkRedoStack.length === 0}>
                Redo
              </button>
              <button type="button" className={pill} onClick={() => addPage()}>
                + Add Page
              </button>
              <button type="button" className={pill} onClick={() => setShowGridModal(true)}>
                Grid
              </button>
              <button type="button" className={pill} onClick={() => setShowAxesModal(true)}>
                XY Plane
              </button>
              <button type="button" className={pill} onClick={() => setShowCalc((s) => !s)}>
                Calculator
              </button>
              <button
                type="button"
                className={pill}
                onClick={() => {
                  stabilizeBoardGeometryIfNeeded();
                  setShowPdfPanel((v) => !v);
                }}
              >
                {showPdfPanel ? "Hide PDF" : "Show PDF"}
              </button>
              <button type="button" className={pill} onClick={() => clearInk()}>
                Clear Ink
              </button>
              <button type="button" className={pill} onClick={() => clearAll()}>
                Erase All
              </button>
            </div>
          </div>

          {/* Imported PDF panel */}
          {/* Board + (optional) PDF viewer side-by-side */}
          {/* Board + (optional) PDF viewer side-by-side */}
          <div className="mt-2 flex w-full gap-3">
            {/* LEFT: Whiteboard */}
            <div className="flex-1 min-w-0">
              {/* Scrollable OneNote-style page */}
              <div
                ref={containerRef}
                onScroll={onScroll}
                onPointerDown={tool === "hand" ? onHandDown : undefined}
                onPointerMove={tool === "hand" ? onHandMove : undefined}
                onPointerUp={tool === "hand" ? onHandUp : undefined}
                onPointerCancel={tool === "hand" ? onHandUp : undefined}

                className="h-[78vh] overflow-y-scroll overflow-x-auto overscroll-contain overscroll-x-none touch-pan-y rounded-2xl border border-slate-200 bg-white relative"
              >
                <div
                  ref={boardSurfaceRef}
                  className="relative"
                  style={{ width: boardWidthCss ?? "100%", height: canvasHeight }}
                >
                  <canvas ref={bgCanvasRef} className="absolute left-0 top-0 z-0 pointer-events-none" />

                  <canvas ref={overlayCanvasRef} className="absolute left-0 top-0 z-[5] pointer-events-none" />

                  <canvas
                    ref={imgCanvasRef}
                    className={`absolute left-0 top-0 z-10 ${tool === "hand" ? "touch-none" : "pointer-events-none"}`}
                    style={{ touchAction: tool === "hand" ? "none" : "auto" }}
                    onPointerDown={onImgPointerDown}
                    onPointerMove={onImgPointerMove}
                    onPointerUp={onImgPointerUp}
                    onPointerCancel={onImgPointerUp}
                    onPointerLeave={onImgPointerUp}
                  />


                  <canvas
                    ref={inkCanvasRef}
                    className={`absolute left-0 top-0 z-20 ${tool === "hand" ? "pointer-events-none" : "touch-none"}`}
                    onPointerDown={beginStroke}
                    onPointerMove={drawStroke}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    onPointerLeave={endStroke}
                    style={{ cursor: tool === "hand" ? "grab" : "crosshair" }}
                  />

                  <canvas ref={previewCanvasRef} className="absolute left-0 top-0 z-30 pointer-events-none" />

                  {showHorizontalScrollHint && (
                    <div className="pointer-events-none absolute right-4 top-4 z-40 rounded-full border border-slate-200/90 bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
                      Scroll to view full board
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button type="button" className={pill} onClick={() => removeGrid()} disabled={!gridApplied}>
                  Remove grid
                </button>
                <button type="button" className={pill} onClick={() => removeAxes()} disabled={!axesApplied}>
                  Remove XY
                </button>
              </div>
            </div>

            {/* RIGHT: PDF snipping viewer */}
            {importedPdf && showPdfPanel && (
              <div className="w-[44%] max-w-[720px] min-w-[360px]">
                <div className="h-[70vh] overflow-hidden rounded-2xl border-2 border-slate-200 bg-white flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {importedPdf.item.filename}
                      </div>
                      <div className="text-xs text-slate-600 tabular-nums">
                        page {pdfPageNum}/{pdfNumPages}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50"
                        onClick={() => {
                          stabilizeBoardGeometryIfNeeded();
                          setClipRect(null);
                          setShowPdfPanel(false);
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {/* Viewer + controls */}
                  <div className="flex-1 min-h-0 p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                        disabled={pdfPageNum <= 1}
                        onClick={() => setPdfPageNum((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </button>

                      <button
                        type="button"
                        className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                        disabled={pdfPageNum >= pdfNumPages}
                        onClick={() => setPdfPageNum((p) => Math.min(pdfNumPages, p + 1))}
                      >
                        Next
                      </button>

                      <div className="ml-2 flex items-center gap-2 text-xs text-slate-600">
                        <span>Zoom</span>
                        <input
                          type="range"
                          min={0.8}
                          max={2.2}
                          step={0.05}
                          value={pdfViewScale}
                          onChange={(e) => setPdfViewScale(Number(e.target.value))}
                        />
                        <span className="tabular-nums">{pdfViewScale.toFixed(2)}×</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          // If not in snip mode -> start snipping
                          if (!snipMode) {
                            setSnipMode(true);
                            setClipRect(null);
                            return;
                          }

                          // If in snip mode but no rectangle yet -> cancel snip mode
                          if (snipMode && !clipRect) {
                            setSnipMode(false);
                            setClipRect(null);
                            return;
                          }

                          // If in snip mode and rectangle exists -> snip
                          if (clipRect) snipToBoardAndClose();
                        }}
                        className="ml-auto rounded-xl border-2 border-slate-900 bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
                        title={
                          !snipMode
                            ? "Click to start snipping, then drag a rectangle."
                            : clipRect
                              ? "Click to snip this selection onto the board."
                              : "Drag a rectangle to select (click again to cancel)."
                        }
                      >
                        {!snipMode ? "Start snip" : clipRect ? "Snip to board" : "Drag to select… (click to cancel)"}
                      </button>
                    </div>

                    <div
                      ref={pdfViewerRef}
                      className="relative flex-1 min-h-0 overflow-auto overscroll-contain rounded-xl border border-slate-200 bg-white"
                      onWheel={(e) => {
                        // Ensure trackpad/mouse wheel scrolls THIS viewer, not the page behind it
                        const el = e.currentTarget;
                        el.scrollTop += e.deltaY;
                        el.scrollLeft += e.deltaX;
                      }}
                    >
                      <canvas ref={pdfCanvasRef} className="block" />

                      <div
                        ref={pdfOverlayRef}
                        className="absolute left-0 top-0"
                        style={{
                          width: pdfCanvasSize.w,
                          height: pdfCanvasSize.h,
                          cursor: snipMode ? "crosshair" : "default",
                          pointerEvents: snipMode ? "auto" : "none",
                          zIndex: 50,
                          touchAction: "none",
                          userSelect: "none",
                        }}
                        onPointerDown={snipMode ? onClipDown : undefined}
                        onPointerMove={snipMode ? onClipMove : undefined}
                        onPointerUp={snipMode ? onClipUp : undefined}
                        onPointerCancel={snipMode ? onClipUp : undefined}
                      >
                        {clipRect && (
                          <div
                            className="absolute border-2 border-blue-500 bg-blue-200/20"
                            style={{
                              left: clipRect.x,
                              top: clipRect.y,
                              width: clipRect.w,
                              height: clipRect.h,
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">
                      Drag a rectangle to select, then click <span className="font-semibold">Snip to board</span>.
                      (Viewer auto-closes.)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Calculator Widget */}
          {showCalc && (
            <div
              className="fixed z-40 select-none"
              style={{
                left: Math.max(8, calcPos.x),
                top: Math.max(8, calcPos.y),
                width: "min(320px, 20vw)",
              }}
            >
              <div className="rounded-2xl border-2 border-slate-200 bg-white shadow-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 border-b border-slate-200 cursor-move"
                  onPointerDown={startCalcDrag}
                  onPointerMove={moveCalcDrag}
                  onPointerUp={endCalcDrag}
                  onPointerCancel={endCalcDrag}
                >
                  <div className="text-sm font-semibold text-slate-800">
                    Calculator{" "}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {degMode ? "DEG" : "RAD"} • {calcMode === "exact" ? "FRAC" : "DEC"}
                    </span>
                  </div>
                  <button className={pill} type="button" onClick={() => setShowCalc(false)}>
                    Close
                  </button>
                </div>

                <div className="p-3">
                  <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs text-slate-500">Expression</div>
                    <div className="mt-1 font-mono text-sm text-slate-900 break-words min-h-[20px]">{calcExpr || " "}</div>
                    <div className="mt-2 text-xs text-slate-500">Result</div>
                    <div className="mt-1 font-mono text-base font-semibold text-slate-900">{calcResult || " "}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      "sin",
                      "cos",
                      "tan",
                      "√",
                      "x^2",
                      "x^3",
                      "(",
                      ")",
                      "7",
                      "8",
                      "9",
                      "/",
                      "4",
                      "5",
                      "6",
                      "*",
                      "1",
                      "2",
                      "3",
                      "-",
                      "0",
                      ".",
                      "+",
                      "^",
                    ].map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50"
                        onClick={() => pressCalc(k)}
                      >
                        {k}
                      </button>
                    ))}

                    <button type="button" className="rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50" onClick={() => pressCalc("π")}>
                      π
                    </button>
                    <button type="button" className="rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50" onClick={() => pressCalc("e")}>
                      e
                    </button>

                    <button type="button" className="rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50" onClick={() => pressCalc("DRG")}>
                      DRG
                    </button>
                    <button type="button" className="rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50" onClick={() => pressCalc(calcMode === "exact" ? "DEC" : "FRAC")}>
                      {calcMode === "exact" ? "DEC" : "FRAC"}
                    </button>

                    <button type="button" className="col-span-2 rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50" onClick={() => pressCalc("⌫")}>
                      ⌫
                    </button>
                    <button type="button" className="rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50" onClick={() => pressCalc("C")}>
                      C
                    </button>
                    <button type="button" className="rounded-xl border-2 border-slate-200 bg-slate-900 px-2 py-2 text-sm text-white hover:bg-slate-800" onClick={() => pressCalc("=")}>
                      =
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1" />

                    <button
                      type="button"
                      className="rounded-xl border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      onClick={() => {
                        const toSend = calcResult && calcResult !== "Error" ? calcResult : "";
                        if (!toSend) return;
                        stampTextToBoard(toSend);
                      }}
                      disabled={!calcResult || calcResult === "Error"}
                    >
                      Send to board
                    </button>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    FRAC = exact (rationals/surds + special trig). Press DEC when you want a decimal answer.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Title Modal */}
          {showTitleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
              <div className="w-full max-w-2xl rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                <div className="text-xl font-semibold">Open whiteboard</div>
                <div className="mt-1 text-sm text-slate-600">
                  Start a fresh board for this lesson or reopen one of your recent editable whiteboards.
                </div>

                {entryMode === "menu" && (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      className="rounded-3xl border-2 border-slate-200 bg-white p-5 text-left hover:bg-slate-50"
                      onClick={() => setEntryMode("new")}
                    >
                      <div className="text-lg font-semibold text-slate-900">Start new whiteboard</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Open a blank teaching board and save it to the class feed when you are ready.
                      </div>
                    </button>
                    <button
                      type="button"
                      className="rounded-3xl border-2 border-slate-200 bg-white p-5 text-left hover:bg-slate-50"
                      onClick={() => setEntryMode("recent")}
                    >
                      <div className="text-lg font-semibold text-slate-900">Open recent whiteboard</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Continue from one of the most recent editable whiteboards for this class.
                      </div>
                    </button>
                  </div>
                )}

                {entryMode === "new" && (
                  <>
                    <input
                      className="mt-4 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      autoFocus
                    />
                    <div className="mt-2 text-sm text-slate-600">
                      Give it a clear title so it saves cleanly and posts to the class feed.
                    </div>
                    <div className="mt-5 flex justify-between gap-2">
                      <button className={pill} type="button" onClick={() => setEntryMode("menu")}>
                        Back
                      </button>
                      <div className="flex gap-2">
                        <button className={pill} type="button" onClick={() => navigate(`/class/${classId}`)}>
                          Cancel
                        </button>
                        <button
                          className={pill}
                          type="button"
                          onClick={() => {
                            const finalTitle = titleDraft.trim() || "Class Whiteboard";
                            setBoardTitle(finalTitle);
                            setTool("pen");
                            setPenSize(PEN_SIZES[0]);
                            setShowTitleModal(false);
                            setEntryMode("menu");
                          }}
                        >
                          Start
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {entryMode === "recent" && (
                  <>
                    <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50">
                      {recentLoading ? (
                        <div className="p-4 text-sm text-slate-600">Loading recent whiteboards…</div>
                      ) : recentWhiteboards.length === 0 ? (
                        <div className="p-4 text-sm text-slate-600">
                          {recentError || "No recent editable whiteboards are available for this class yet."}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {recentWhiteboards.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="w-full px-4 py-3 text-left hover:bg-white"
                              disabled={openingRecentId === item.id}
                              onClick={() => void openRecentWhiteboard(item.id)}
                            >
                              <div className="font-semibold text-slate-900">
                                {item.title?.trim() || "Untitled whiteboard"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.updated_at || item.created_at || "Recently saved"}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {recentError && recentWhiteboards.length > 0 && (
                      <div className="mt-3 text-sm text-amber-700">{recentError}</div>
                    )}
                    <div className="mt-5 flex justify-between gap-2">
                      <button className={pill} type="button" onClick={() => setEntryMode("menu")}>
                        Back
                      </button>
                      <div className="flex gap-2">
                        <button className={pill} type="button" onClick={() => void loadRecentWhiteboards()} disabled={recentLoading}>
                          Refresh
                        </button>
                        <button className={pill} type="button" onClick={() => navigate(`/class/${classId}`)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Save Modal */}
          {showSaveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
              <div className="w-full max-w-lg rounded-2xl border-2 border-slate-200 bg-white p-5">
                <div className="text-xl font-semibold">Save whiteboard</div>
                <div className="mt-1 text-sm text-slate-600">This will save an image and create a post in the class feed.</div>

                <div className="mt-4 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="font-semibold text-slate-800">{boardTitle}</div>
                  <div className="text-xs text-slate-600">File name will include today’s date.</div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button className={pill} type="button" onClick={() => setShowSaveModal(false)} disabled={saving}>
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="rounded-xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                    disabled={saving}
                    onClick={async () => {
                      setShowSaveModal(false);
                      await doSave();
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {draftPromptOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4">
              <div className="w-full max-w-lg rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xl">
                <div className="text-xl font-semibold">Restore whiteboard draft?</div>
                <div className="mt-1 text-sm text-slate-600">
                  A local draft was found for this class. You can restore it or discard it and start fresh.
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className={pill}
                    onClick={() => {
                      pendingDraftRef.current = null;
                      clearDraftFromLocalStorage();
                      setDraftPromptOpen(false);
                    }}
                  >
                    Discard draft
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    onClick={() => {
                      const draft = pendingDraftRef.current;
                      pendingDraftRef.current = null;
                      setDraftPromptOpen(false);
                      if (draft) restoreWhiteboardState(draft);
                    }}
                  >
                    Restore draft
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Modal */}
          {showImportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
              <div className="w-full max-w-2xl rounded-2xl border-2 border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold">Import a PDF</div>
                    <div className="mt-1 text-sm text-slate-600">Choose a class PDF or a shared exam paper, then use the existing PDF viewer and snip tools.</div>
                  </div>
                  <button type="button" className={pill} onClick={() => setShowImportModal(false)}>
                    Close
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={importSource === "class" ? pillOn : pill}
                    onClick={() => setImportSource("class")}
                  >
                    Class PDFs
                  </button>
                  <button
                    type="button"
                    className={importSource === "exam-library" ? pillOn : pill}
                    onClick={() => setImportSource("exam-library")}
                  >
                    Exam Library
                  </button>
                </div>

                {importSource === "class" ? (
                  <>
                    <div className="mt-4">
                      <button type="button" className={pill} onClick={() => loadImportList()} disabled={importLoading}>
                        {importLoading ? "Loading…" : "Refresh list"}
                      </button>
                    </div>

                    {importError && <div className="mt-3 rounded-xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">{importError}</div>}

                    <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-2xl border-2 border-slate-200">
                      {importLoading ? (
                        <div className="p-4 text-sm text-slate-600">Loading…</div>
                      ) : importList.length === 0 ? (
                        <div className="p-4 text-sm text-slate-600">No PDFs found yet. Upload some Notes/Exam PDFs first.</div>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {importList.map(({ kind, item }) => (
                            <button
                              key={`${kind}-${item.id}`}
                              type="button"
                              className="w-full text-left p-3 hover:bg-slate-50"
                              onClick={() => {
                                setImportedPdf({ kind, item });
                                setShowImportModal(false);
                                stabilizeBoardGeometryIfNeeded();
                                setShowPdfPanel(true);
                              }}
                            >
                              <div className="text-sm font-semibold text-slate-800">
                                {formatKindLabel(kind)} • {item.topic_name}
                              </div>
                              <div className="text-xs text-slate-600 truncate">{item.filename}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-600">Subject</label>
                        <select
                          className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                          value={examLibrarySubject}
                          onChange={(e) => setExamLibrarySubject(normalizeExamLibrarySubject(e.target.value))}
                        >
                          {EXAM_LIBRARY_SUBJECTS.map((subject) => (
                            <option key={subject} value={subject}>
                              {subject}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Defaulted from this class: {preferredExamSubject}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-600">Cycle</label>
                        <select
                          className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                          value={examLibraryCycle}
                          onChange={(e) => setExamLibraryCycle(e.target.value)}
                        >
                          {EXAM_LIBRARY_CYCLES.map((cycle) => (
                            <option key={cycle} value={cycle}>
                              {cycle}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-600">Level</label>
                        <select
                          className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                          value={examLibraryLevel}
                          onChange={(e) => setExamLibraryLevel(e.target.value)}
                        >
                          {examLibraryLevelOptions(examLibraryCycle).map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <button type="button" className={pill} onClick={() => loadExamLibraryList()} disabled={examLibraryLoading}>
                        {examLibraryLoading ? "Loading…" : "Refresh library"}
                      </button>
                    </div>

                    {examLibraryError && <div className="mt-3 rounded-xl border-2 border-red-200 bg-white p-3 text-sm text-red-700">{examLibraryError}</div>}

                    <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-2xl border-2 border-slate-200">
                      {examLibraryLoading ? (
                        <div className="p-4 text-sm text-slate-600">Loading…</div>
                      ) : examLibraryItems.length === 0 ? (
                        <div className="p-4 text-sm text-slate-600">No shared exam papers match these filters yet.</div>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {examLibraryItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="w-full text-left p-3 hover:bg-slate-50"
                              onClick={() => {
                                setImportedPdf({
                                  kind: "exam-library",
                                  item: {
                                    id: item.id,
                                    filename: item.title,
                                    file_url: item.file_url,
                                    topic_name: `${item.subject} • ${item.cycle} • ${item.level} • ${item.year}`,
                                    cycle: item.cycle,
                                    subject: item.subject,
                                    level: item.level,
                                    year: item.year,
                                  },
                                });
                                setShowImportModal(false);
                                stabilizeBoardGeometryIfNeeded();
                                setShowPdfPanel(true);
                              }}
                            >
                              <div className="text-sm font-semibold text-slate-800">
                                {formatKindLabel("exam-library")} • {item.subject}
                              </div>
                              <div className="mt-1 text-xs text-slate-600 truncate">{item.title}</div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {item.cycle} • {item.level} • {item.year}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Grid Modal */}
          {showGridModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
              <div className="w-full max-w-lg rounded-2xl border-2 border-slate-200 bg-white p-5">
                <div className="text-xl font-semibold">Insert Grid</div>
                <div className="mt-1 text-sm text-slate-600">Draws a grid onto the background in your current viewport.</div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Mode
                    <select className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={gridMode} onChange={(e) => setGridMode(e.target.value as any)}>
                      <option value="full">Full screen</option>
                      <option value="half">Half screen</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    Boxes X
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={gridX} onChange={(e) => setGridX(Number(e.target.value))} min={2} max={80} />
                  </label>

                  <label className="text-sm">
                    Boxes Y
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={gridY} onChange={(e) => setGridY(Number(e.target.value))} min={2} max={80} />
                  </label>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button className={pill} type="button" onClick={() => setShowGridModal(false)}>
                    Cancel
                  </button>
                  <button className={pill} type="button" onClick={() => removeGrid()} disabled={!gridApplied}>
                    Remove Grid
                  </button>
                  <button type="button" className="rounded-xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800" onClick={() => applyGrid()}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* XY Plane Modal */}
          {showAxesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
              <div className="w-full max-w-2xl rounded-2xl border-2 border-slate-200 bg-white p-5">
                <div className="text-xl font-semibold">Insert XY Plane</div>
                <div className="mt-1 text-sm text-slate-600">Dots at coordinates + axes in your current viewport.</div>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  <label className="text-sm">
                    Mode
                    <select
                      className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2"
                      value={axesMode}
                      onChange={(e) => setAxesMode(e.target.value as any)}
                    >
                      <option value="full">Full screen</option>
                      <option value="half">Half screen</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    Domain min
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={domMin} onChange={(e) => setDomMin(Number(e.target.value))} />
                  </label>
                  <label className="text-sm">
                    Domain max
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={domMax} onChange={(e) => setDomMax(Number(e.target.value))} />
                  </label>
                  <label className="text-sm">
                    Domain step
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={domStep} onChange={(e) => setDomStep(Number(e.target.value))} />
                  </label>

                  <label className="text-sm">
                    Range min
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={rngMin} onChange={(e) => setRngMin(Number(e.target.value))} />
                  </label>
                  <label className="text-sm">
                    Range max
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={rngMax} onChange={(e) => setRngMax(Number(e.target.value))} />
                  </label>
                  <label className="text-sm">
                    Range step
                    <input type="number" className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2" value={rngStep} onChange={(e) => setRngStep(Number(e.target.value))} />
                  </label>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button className={pill} type="button" onClick={() => setShowAxesModal(false)}>
                    Cancel
                  </button>
                  <button className={pill} type="button" onClick={() => removeAxes()} disabled={!axesApplied}>
                    Remove XY
                  </button>
                  <button type="button" className="rounded-xl border-2 border-slate-200 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800" onClick={() => applyAxes()}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {leaveOpen && (
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-xl">
            <div className="text-lg font-extrabold text-slate-900">Leave whiteboard?</div>
            <div className="mt-2 text-sm text-slate-700">
              You have unsaved whiteboard changes. If you leave now, they will be lost.
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={pill} onClick={cancelLeave}>
                Stay
              </button>

              <button
                type="button"
                onClick={confirmLeave}
                className="rounded-full border-2 border-red-700 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:translate-y-[1px]"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
