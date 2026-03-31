import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type SlotKind = "period" | "break" | "lunch";

type Slot = {
  id: string;
  kind: SlotKind;
  label: string;
  start: string; // HH:MM
  end: string; // HH:MM
};

type TimetableEntry = {
  classId: number | null;
  classLabel: string;
  room: string;
  supervisionRank: number | null;
  dutyNote: string;
};

type DaySchedule = {
  slots: Slot[];
  entries: Record<string, TimetableEntry>;
};

type TeacherProfile = {
  title: string;
  firstName: string;
  surname: string;
  schoolName: string;
  schoolAddress: string;
  rollNumber: string;
};

type TimetableDayConfig = {
  startTime: string;
  periods: number;
  classLengthMinutes: number;
  smallBreakEnabled: boolean;
  smallBreakAfterPeriod: number;
  smallBreakStart: string;
  smallBreakEnd: string;
  lunchEnabled: boolean;
  lunchAfterPeriod: number;
  lunchStart: string;
  lunchEnd: string;
  includeMorningSupervision: boolean;
  morningSupervisionMinutes: number;
  includeAfternoonSupervision: boolean;
  afternoonSupervisionMinutes: number;
};

type TimetableConfig = {
  setupComplete: boolean;
  sameForAllDays: boolean;
  days: Record<DayKey, TimetableDayConfig>;
};

type StoredAdminState = {
  profile: TeacherProfile;
  schedule: Record<DayKey, DaySchedule>;
  timetableConfig: TimetableConfig;
  adminPin: string;
  updatedAt: string | null;
};

type ClassItem = {
  id: number;
  name: string;
  subject: string;
};

type ClassMeta = { color: string; order: number };
type MetaStore = Record<string, ClassMeta>;
type BillingStatus = {
  subscription_status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  has_stripe_customer: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_active: boolean;
  prompt_usage_today: number;
  prompt_limit_today: number;
};

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const COLOURS = [
  { name: "Emerald", bg: "bg-emerald-600", ring: "ring-emerald-200" },
  { name: "Amber", bg: "bg-amber-500", ring: "ring-amber-200" },
  { name: "Rose", bg: "bg-rose-600", ring: "ring-rose-200" },
  { name: "Sky", bg: "bg-sky-600", ring: "ring-sky-200" },
  { name: "Sunflower", bg: "bg-yellow-400", ring: "ring-yellow-200" },
  { name: "Violet", bg: "bg-violet-700", ring: "ring-violet-200" },
  { name: "Lime", bg: "bg-lime-500", ring: "ring-lime-200" },
  { name: "Fuchsia", bg: "bg-fuchsia-600", ring: "ring-fuchsia-200" },
  { name: "Orange", bg: "bg-orange-600", ring: "ring-orange-200" },
  { name: "Slate", bg: "bg-slate-800", ring: "ring-slate-300" },
];

function defaultBgForClassId(classId: number) {
  return COLOURS[classId % COLOURS.length]?.bg ?? "bg-emerald-600";
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(totalMinutes: number) {
  const mins = Math.max(0, totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(hhmm: string, mins: number) {
  return minutesToHHMM(toMinutes(hhmm) + mins);
}

function formatBillingDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function billingDaysLeft(value: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function nowLocalMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function dayKeyToday(): DayKey | null {
  const d = new Date().getDay();
  if (d === 1) return "Mon";
  if (d === 2) return "Tue";
  if (d === 3) return "Wed";
  if (d === 4) return "Thu";
  if (d === 5) return "Fri";
  return null;
}

function getEmailFromToken(): string | null {
  const t = localStorage.getItem("elume_token");
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return payload?.email ?? payload?.sub ?? payload?.username ?? null;
  } catch {
    return null;
  }
}

function storageKey() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v3__${email}`;
}

function legacyStorageKey() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_teacher_admin_v2__${email}`;
}

function metaKeyForUser() {
  const email = getEmailFromToken() ?? "anon";
  return `elume_class_layout_v1__${email}`;
}

function loadMeta(): MetaStore {
  try {
    const raw = localStorage.getItem(metaKeyForUser());
    return raw ? (JSON.parse(raw) as MetaStore) : {};
  } catch {
    return {};
  }
}

function tileTextClass(bgClass: string) {
  if (
    bgClass.includes("bg-yellow") ||
    bgClass.includes("bg-amber") ||
    bgClass.includes("bg-lime") ||
    bgClass.includes("bg-slate-100") ||
    bgClass.includes("bg-slate-200") ||
    bgClass.includes("bg-white")
  ) {
    return "text-slate-900";
  }
  return "text-white";
}

function defaultEntry(): TimetableEntry {
  return {
    classId: null,
    classLabel: "",
    room: "",
    supervisionRank: null,
    dutyNote: "",
  };
}

function defaultDayConfig(day: DayKey): TimetableDayConfig {
  if (day === "Fri") {
    return {
      startTime: "08:50",
      periods: 5,
      classLengthMinutes: 58,
      smallBreakEnabled: true,
      smallBreakAfterPeriod: 2,
      smallBreakStart: "10:46",
      smallBreakEnd: "11:01",
      lunchEnabled: true,
      lunchAfterPeriod: 4,
      lunchStart: "12:59",
      lunchEnd: "13:14",
      includeMorningSupervision: true,
      morningSupervisionMinutes: 15,
      includeAfternoonSupervision: true,
      afternoonSupervisionMinutes: 15,
    };
  }

  return {
    startTime: "08:50",
    periods: 6,
    classLengthMinutes: 58,
    smallBreakEnabled: true,
    smallBreakAfterPeriod: 2,
    smallBreakStart: "10:46",
    smallBreakEnd: "11:01",
    lunchEnabled: true,
    lunchAfterPeriod: 4,
    lunchStart: "12:57",
    lunchEnd: day === "Mon" ? "13:44" : "13:54",
    includeMorningSupervision: true,
    morningSupervisionMinutes: 15,
    includeAfternoonSupervision: true,
    afternoonSupervisionMinutes: 15,
  };
}

function defaultTimetableConfig(): TimetableConfig {
  return {
    setupComplete: false,
    sameForAllDays: false,
    days: {
      Mon: defaultDayConfig("Mon"),
      Tue: defaultDayConfig("Tue"),
      Wed: defaultDayConfig("Wed"),
      Thu: defaultDayConfig("Thu"),
      Fri: defaultDayConfig("Fri"),
    },
  };
}

function buildSlotsFromDayConfig(cfg: TimetableDayConfig): Slot[] {
  const slots: Slot[] = [];
  const startMinutes = toMinutes(cfg.startTime);

  if (cfg.includeMorningSupervision && cfg.morningSupervisionMinutes > 0) {
    slots.push({
      id: "PRE",
      kind: "break",
      label: "AM Supervision",
      start: minutesToHHMM(startMinutes - cfg.morningSupervisionMinutes),
      end: cfg.startTime,
    });
  }

  let cursor = cfg.startTime;

  for (let i = 1; i <= cfg.periods; i++) {
    let end = addMinutes(cursor, cfg.classLengthMinutes);

    if (cfg.smallBreakEnabled && i === cfg.smallBreakAfterPeriod) {
      end = cfg.smallBreakStart;
    }
    if (cfg.lunchEnabled && i === cfg.lunchAfterPeriod) {
      end = cfg.lunchStart;
    }

    slots.push({
      id: `P${i}`,
      kind: "period",
      label: `Period ${i}`,
      start: cursor,
      end,
    });

    cursor = end;

    if (cfg.smallBreakEnabled && i === cfg.smallBreakAfterPeriod) {
      slots.push({
        id: "SB",
        kind: "break",
        label: "Small Break",
        start: cfg.smallBreakStart,
        end: cfg.smallBreakEnd,
      });
      cursor = cfg.smallBreakEnd;
    }

    if (cfg.lunchEnabled && i === cfg.lunchAfterPeriod) {
      slots.push({
        id: "L",
        kind: "lunch",
        label: "Lunch",
        start: cfg.lunchStart,
        end: cfg.lunchEnd,
      });
      cursor = cfg.lunchEnd;
    }
  }

  if (cfg.includeAfternoonSupervision && cfg.afternoonSupervisionMinutes > 0) {
    slots.push({
      id: "POST",
      kind: "break",
      label: "PM Supervision",
      start: cursor,
      end: addMinutes(cursor, cfg.afternoonSupervisionMinutes),
    });
  }

  return slots;
}

function buildScheduleFromConfig(
  config: TimetableConfig,
  existingSchedule?: Record<DayKey, DaySchedule>
): Record<DayKey, DaySchedule> {
  const schedule = {} as Record<DayKey, DaySchedule>;

  for (const day of DAYS) {
    const slots = buildSlotsFromDayConfig(config.days[day]);
    const oldEntries = existingSchedule?.[day]?.entries ?? {};
    const entries: Record<string, TimetableEntry> = {};

    for (const slot of slots) {
      entries[slot.id] = oldEntries[slot.id] ? { ...oldEntries[slot.id] } : defaultEntry();
    }

    schedule[day] = { slots, entries };
  }

  return schedule;
}

function makeDefaultState(): StoredAdminState {
  const profile: TeacherProfile = {
    title: "Mr",
    firstName: "",
    surname: "",
    schoolName: "",
    schoolAddress: "",
    rollNumber: "",
  };

  const timetableConfig = defaultTimetableConfig();
  const schedule = buildScheduleFromConfig(timetableConfig);

  return { profile, schedule, timetableConfig, adminPin: "2026", updatedAt: null };
}

function normalizeState(raw: any): StoredAdminState {
  const base = makeDefaultState();

  const profile: TeacherProfile = {
    ...base.profile,
    ...(raw?.profile ?? {}),
  };

  const timetableConfig: TimetableConfig = {
    ...base.timetableConfig,
    ...(raw?.timetableConfig ?? {}),
    days: {
      Mon: { ...base.timetableConfig.days.Mon, ...(raw?.timetableConfig?.days?.Mon ?? {}) },
      Tue: { ...base.timetableConfig.days.Tue, ...(raw?.timetableConfig?.days?.Tue ?? {}) },
      Wed: { ...base.timetableConfig.days.Wed, ...(raw?.timetableConfig?.days?.Wed ?? {}) },
      Thu: { ...base.timetableConfig.days.Thu, ...(raw?.timetableConfig?.days?.Thu ?? {}) },
      Fri: { ...base.timetableConfig.days.Fri, ...(raw?.timetableConfig?.days?.Fri ?? {}) },
    },
  };

  const hasRawSchedule = !!raw?.schedule;
  const freshSchedule = buildScheduleFromConfig(timetableConfig);

  const schedule = hasRawSchedule
    ? ({
        Mon: raw.schedule.Mon ?? freshSchedule.Mon,
        Tue: raw.schedule.Tue ?? freshSchedule.Tue,
        Wed: raw.schedule.Wed ?? freshSchedule.Wed,
        Thu: raw.schedule.Thu ?? freshSchedule.Thu,
        Fri: raw.schedule.Fri ?? freshSchedule.Fri,
      } as Record<DayKey, DaySchedule>)
    : freshSchedule;

  return {
    profile,
    schedule,
    timetableConfig,
    adminPin:
      typeof raw?.adminPin === "string" && raw.adminPin.trim()
        ? raw.adminPin.trim()
        : base.adminPin,
    updatedAt: raw?.updatedAt ?? null,
  };
}

function fmtDay(d: DayKey) {
  if (d === "Mon") return "Monday";
  if (d === "Tue") return "Tuesday";
  if (d === "Wed") return "Wednesday";
  if (d === "Thu") return "Thursday";
  return "Friday";
}

function updateSetupDay(
  config: TimetableConfig,
  day: DayKey,
  patch: Partial<TimetableDayConfig>
): TimetableConfig {
  if (config.sameForAllDays) {
    const next = { ...config.days.Mon, ...patch };
    return {
      ...config,
      days: {
        Mon: { ...next },
        Tue: { ...next },
        Wed: { ...next },
        Thu: { ...next },
        Fri: { ...next },
      },
    };
  }

  return {
    ...config,
    days: {
      ...config.days,
      [day]: { ...config.days[day], ...patch },
    },
  };
}

export default function TeacherAdminPage() {
  const navigate = useNavigate();
  const email = getEmailFromToken();
  const isSuperAdmin = email === "admin@elume.ie";

  const [state, setState] = useState<StoredAdminState>(() => {
    const raw = localStorage.getItem(storageKey()) ?? localStorage.getItem(legacyStorageKey());
    if (!raw) return makeDefaultState();
    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      return makeDefaultState();
    }
  });

  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [meta, setMeta] = useState<MetaStore>(() => loadMeta());

  const today = dayKeyToday();
  const nowMins = nowLocalMinutes();

  const [dayView, setDayView] = useState<DayKey>(() => today ?? "Mon");
  const [editing, setEditing] = useState<{ day: DayKey; slotId: string } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [setupPromptDismissed, setSetupPromptDismissed] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [adminSectionOpen, setAdminSectionOpen] = useState(false);

  const [setupDraft, setSetupDraft] = useState<TimetableConfig>(() =>
    structuredClone(defaultTimetableConfig())
  );

  const editingSlot = useMemo(() => {
    if (!editing) return null;
    return state.schedule[editing.day].slots.find((s) => s.id === editing.slotId) ?? null;
  }, [editing, state.schedule]);

  const editingEntry = useMemo(() => {
    if (!editing) return null;
    const daySch = state.schedule[editing.day];
    return daySch.entries[editing.slotId] ?? defaultEntry();
  }, [editing, state.schedule]);

  useEffect(() => {
    let cancelled = false;

    const localRaw = localStorage.getItem(storageKey()) ?? localStorage.getItem(legacyStorageKey());
    let localState: StoredAdminState | null = null;
    try {
      localState = localRaw ? normalizeState(JSON.parse(localRaw)) : null;
    } catch {
      localState = null;
    }

    apiFetch("/teacher-admin/state")
      .then((data: any) => {
        if (cancelled) return;

        const serverRaw = data?.state ?? null;
        const serverState = serverRaw ? normalizeState(serverRaw) : null;
        const serverUpdatedAt = data?.updated_at ? String(data.updated_at) : null;

        const localTs = localState?.updatedAt ? Date.parse(localState.updatedAt) : 0;
        const serverTs =
          serverState?.updatedAt
            ? Date.parse(serverState.updatedAt)
            : serverUpdatedAt
              ? Date.parse(serverUpdatedAt)
              : 0;

        const serverValid = !!(serverState?.profile && serverState?.schedule && serverState?.timetableConfig);

        if (serverValid && serverTs >= localTs) {
          setState(serverState as StoredAdminState);
          try {
            localStorage.setItem(storageKey(), JSON.stringify(serverState));
          } catch {
            // ignore
          }
        } else if (localState?.profile && localState?.schedule) {
          setState(localState);
        }

        setLoadedFromServer(true);

        if ((!serverValid || localTs > serverTs) && localState?.profile && localState?.schedule) {
          apiFetch("/teacher-admin/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: localState }),
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedFromServer(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/billing/me")
      .then((data) => {
        if (!cancelled) {
          setBilling(data as BillingStatus);
          setBillingError(null);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setBillingError(e?.message || "Could not load billing status.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadedFromServer && !state.timetableConfig.setupComplete && !setupPromptDismissed) {
      setSetupDraft(structuredClone(state.timetableConfig));
      setSetupOpen(true);
    }
  }, [loadedFromServer, state.timetableConfig.setupComplete, setupPromptDismissed]);

  function saveState(next: StoredAdminState) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch {
      // ignore
    }

    setState(next);

    setSavedToast("Saved ✓");
    window.setTimeout(() => setSavedToast(null), 1200);

    if (loadedFromServer) {
      apiFetch("/teacher-admin/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      }).catch(() => {});
    }
  }

  async function startCheckout(plan: "monthly" | "annual") {
    setBillingBusy(true);
    setBillingError(null);

    try {
      const data = await apiFetch("/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });

      const checkoutUrl = String((data as any)?.checkout_url || "").trim();
      if (!checkoutUrl) throw new Error("No Stripe checkout URL was returned.");

      window.location.assign(checkoutUrl);
    } catch (e: any) {
      setBillingError(e?.message || "Could not start Stripe checkout.");
      setBillingBusy(false);
    }
  }

  async function openBillingPortal() {
    setBillingBusy(true);
    setBillingError(null);

    try {
      const data = await apiFetch("/billing/create-portal-session", {
        method: "POST",
      });

      const portalUrl = String((data as any)?.portal_url || "").trim();
      if (!portalUrl) throw new Error("No billing portal URL was returned.");

      window.location.assign(portalUrl);
    } catch (e: any) {
      setBillingError(e?.message || "Could not open billing portal.");
      setBillingBusy(false);
    }
  }

  function touch(next: StoredAdminState) {
    saveState({ ...next, updatedAt: new Date().toISOString() });
  }

  function updateProfile(patch: Partial<TeacherProfile>) {
    touch({
      ...state,
      profile: { ...state.profile, ...patch },
    });
  }

  function updateAdminPin(value: string) {
    touch({
      ...state,
      adminPin: value,
    });
  }

  function updateEntry(day: DayKey, slotId: string, patch: Partial<TimetableEntry>) {
    const daySch = state.schedule[day];
    const prev = daySch.entries[slotId] ?? defaultEntry();
    const nextEntries = { ...daySch.entries, [slotId]: { ...prev, ...patch } };
    touch({
      ...state,
      schedule: { ...state.schedule, [day]: { ...daySch, entries: nextEntries } },
    });
  }

  function updateSlotTime(day: DayKey, slotId: string, field: "start" | "end", val: string) {
    const daySch = state.schedule[day];
    const nextSlots = daySch.slots.map((s) => (s.id === slotId ? { ...s, [field]: val } : s));
    touch({
      ...state,
      schedule: { ...state.schedule, [day]: { ...daySch, slots: nextSlots } },
    });
  }

  function clearEntry(day: DayKey, slotId: string) {
    updateEntry(day, slotId, defaultEntry());
  }

  function slotIsActive(day: DayKey, slot: Slot) {
    if (today !== day) return false;
    const a = toMinutes(slot.start);
    const b = toMinutes(slot.end);
    return nowMins >= a && nowMins < b;
  }

  async function exportPdf() {
    const node = document.getElementById("timetablePrint");
    if (!node) return;

    const title = (state.profile.title || "").trim();
    const surname = (state.profile.surname || "").trim();
    const firstName = (state.profile.firstName || "").trim();

    const teacherName =
      [title, surname].filter(Boolean).join(" ") ||
      [title, firstName, surname].filter(Boolean).join(" ") ||
      "Teacher";

    const heading = `${teacherName}'s Timetable`;
    const prevScrollTop = node.scrollTop;
    node.scrollTop = 0;

    try {
      const dataUrl = await toPng(node as HTMLElement, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const headerH = 14;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text(heading, margin, margin + 6);

      const imgProps = pdf.getImageProperties(dataUrl);
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2 - headerH;

      const imgW = imgProps.width;
      const imgH = imgProps.height;

      const scale = Math.min(maxW / imgW, maxH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;

      const x = (pageW - drawW) / 2;
      const y = margin + headerH;

      pdf.addImage(dataUrl, "PNG", x, y, drawW, drawH, undefined, "FAST");

      const safeSurname = surname ? surname.replace(/\s+/g, "_") : "Teacher";
      pdf.save(`${title || ""}${safeSurname ? "_" + safeSurname : ""}_Timetable.pdf`.replace(/^_/, ""));
    } catch (e) {
      console.error(e);
      alert("Export failed. Try again, or reduce browser zoom to 100%.");
    } finally {
      node.scrollTop = prevScrollTop;
    }
  }

  function autoRankUnusedToday() {
    const d = today ?? dayView;
    const daySch = state.schedule[d];
    let r = 1;
    const nextEntries = { ...daySch.entries };

    const candidates = daySch.slots.filter((s) => s.kind === "period");

    for (const slot of candidates) {
      const e = nextEntries[slot.id] ?? defaultEntry();
      const isFree = !e.classId && !e.classLabel;
      if (isFree) {
        nextEntries[slot.id] = { ...e, supervisionRank: r++ };
      }
    }

    touch({
      ...state,
      schedule: { ...state.schedule, [d]: { ...daySch, entries: nextEntries } },
    });
  }

  function tileBgForClassId(classId: number | null) {
    if (!classId) return "bg-white";
    const m = meta[String(classId)];
    return m?.color ?? defaultBgForClassId(classId);
  }

  function openSetupWizard() {
    setSetupDraft(structuredClone(state.timetableConfig));
    setSetupOpen(true);
  }

  function applySetupDraft() {
    const cleaned = structuredClone(setupDraft);

    if (cleaned.sameForAllDays) {
      const mon = cleaned.days.Mon;
      cleaned.days = {
        Mon: { ...mon },
        Tue: { ...mon },
        Wed: { ...mon },
        Thu: { ...mon },
        Fri: { ...mon },
      };
    }

    cleaned.setupComplete = true;

    touch({
      ...state,
      timetableConfig: cleaned,
      schedule: buildScheduleFromConfig(cleaned, state.schedule),
    });

    setSetupOpen(false);
  }

  function resetTimetableFromSettings() {
    if (
      !window.confirm(
        "Rebuild the timetable from your saved settings? Existing slot assignments will only stay where the slot ids still match."
      )
    ) {
      return;
    }

    touch({
      ...state,
      schedule: buildScheduleFromConfig(state.timetableConfig, state.schedule),
    });
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError("Please complete all password fields.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("Please use at least 8 characters for your new password.");
      return;
    }

    try {
      setPasswordBusy(true);

      await apiFetch("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      });

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordMessage("Password updated successfully.");
      setPasswordModalOpen(false);
    } catch (err: any) {
      setPasswordError(err?.message || "Could not update password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  useEffect(() => {
    setMeta(loadMeta());

    const onFocus = () => setMeta(loadMeta());
    const onStorage = () => setMeta(loadMeta());

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    let cancelled = false;

    apiFetch("/classes")
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? (data as any[]) : [];
        const cleaned: ClassItem[] = arr
          .map((c) => ({
            id: Number(c.id),
            name: String(c.name ?? ""),
            subject: String(c.subject ?? ""),
          }))
          .filter((c) => Number.isFinite(c.id) && c.id > 0);

        setClasses(cleaned);

        const currentMeta = loadMeta();
        let changed = false;

        for (const cls of cleaned) {
          const key = String(cls.id);
          if (!currentMeta[key]?.color) {
            currentMeta[key] = {
              color: defaultBgForClassId(cls.id),
              order: currentMeta[key]?.order ?? cls.id,
            };
            changed = true;
          }
        }

        if (changed) {
          localStorage.setItem(metaKeyForUser(), JSON.stringify(currentMeta));
          setMeta(currentMeta);
        }
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const classOptions = useMemo(() => {
    return [
      { id: 0, label: "— Free / Unused" },
      ...classes.map((c) => ({
        id: c.id,
        label: `${c.name}${c.subject ? ` — ${c.subject}` : ""}`,
      })),
    ];
  }, [classes]);

  useEffect(() => {
    if (classes.length === 0) return;

    const labelToId = new Map<string, number>();
    for (const c of classes) {
      const label = `${c.name}${c.subject ? ` — ${c.subject}` : ""}`.trim();
      labelToId.set(label, c.id);
    }

    let changed = false;

    const next: StoredAdminState = {
      ...state,
      schedule: { ...state.schedule },
    };

    for (const day of DAYS) {
      const daySch = state.schedule[day];
      let dayChanged = false;
      const nextEntries = { ...daySch.entries };

      for (const slot of daySch.slots) {
        const e = nextEntries[slot.id];
        if (!e) continue;

        if ((e.classId == null || e.classId === 0) && e.classLabel?.trim()) {
          const recovered = labelToId.get(e.classLabel.trim());
          if (recovered) {
            nextEntries[slot.id] = { ...e, classId: recovered };
            dayChanged = true;
            changed = true;
          }
        }
      }

      if (dayChanged) {
        next.schedule[day] = { ...daySch, entries: nextEntries };
      }
    }

    if (changed) {
      saveState({ ...next, updatedAt: new Date().toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes]);

  const card =
    "rounded-3xl border-2 border-slate-200 bg-white shadow-[0_2px_0_rgba(15,23,42,0.06)] print:shadow-none";
  const btn =
    "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50";
  const btnPrimary =
    "rounded-full border-2 border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700";
  const input =
    "w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm";

  useEffect(() => {
    if (today) setDayView(today);
  }, [today]);

  const setupIncomplete = !state.timetableConfig.setupComplete;

  return (
    <div className="min-h-screen bg-emerald-100 p-6 print:bg-white print:p-0">
      <style>
        {`
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body * { visibility: hidden; }
            #timetablePrint, #timetablePrint * { visibility: visible; }
            #timetablePrint { position: absolute; left: 0; top: 0; width: 100%; }
            .print-hide { display: none !important; }
            .print-tight { padding: 0 !important; }
          }
        `}
      </style>

      <div className="mx-auto max-w-7xl px-4 py-6 print:px-0 print:py-0">
        {setupIncomplete && (
          <div className="mb-4 rounded-[28px] border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 p-5 shadow-sm print-hide">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900">
                  Finish your timetable setup
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  Before you use Teacher Admin properly, set your school day, period lengths, breaks, lunch and supervision slots.
                </div>
              </div>
              <button type="button" className={btnPrimary} onClick={openSetupWizard}>
                Set up timetable now
              </button>
            </div>
          </div>
        )}

        <div className={`${card} p-4 print:border-0 print:shadow-none print-tight`}>
          <div className="flex flex-wrap items-start justify-between gap-3 print-hide">
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                Teacher Admin
              </div>
              <div className="text-sm text-slate-600">
                Quick reference timetable • editable profile • secure teacher settings
              </div>
            </div>

            {isSuperAdmin && (
              <div className="mt-6 rounded-3xl border-2 border-purple-300 bg-purple-50 p-4 shadow-sm">
                <div className="text-lg font-bold text-purple-900">Super Admin Controls</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-full border-2 border-purple-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-purple-100"
                    onClick={() => navigate("/admin-users")}
                  >
                    Manage Users
                  </button>

                  <button
                    className="rounded-full border-2 border-purple-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-purple-100"
                    onClick={() => navigate("/admin-stats")}
                  >
                    Platform Stats
                  </button>
                </div>

                <div className="mt-2 text-xs text-purple-700">
                  Visible only to the ELUME Super Admin account.
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                className={btn}
                type="button"
                onClick={() => setAdminSectionOpen((prev) => !prev)}
              >
                {adminSectionOpen ? "▾ Hide admin details" : "▸ Show admin details"}
              </button>
              <button className={btn} type="button" onClick={() => navigate("/")}>
                Back to Dashboard
              </button>
              <button className={btn} type="button" onClick={exportPdf}>
                Print Timetable
              </button>
              {savedToast && (
                <span className="rounded-full border-2 border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {savedToast}
                </span>
              )}
            </div>
          </div>

          {adminSectionOpen ? (
            <div className="mt-4 grid gap-3 md:grid-cols-12 print:mt-2">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-600">
                Title
                <select
                  className={`${input} mt-1`}
                  value={state.profile.title}
                  onChange={(e) => updateProfile({ title: e.target.value })}
                >
                  {["Mr", "Mrs", "Ms", "Miss", "Mx", "Dr"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-slate-600">
                First name
                <input
                  className={`${input} mt-1`}
                  value={state.profile.firstName}
                  onChange={(e) => updateProfile({ firstName: e.target.value })}
                  placeholder="e.g. Peter"
                />
              </label>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-slate-600">
                Surname
                <input
                  className={`${input} mt-1`}
                  value={state.profile.surname}
                  onChange={(e) => updateProfile({ surname: e.target.value })}
                  placeholder="e.g. Fitzgerald"
                />
              </label>
            </div>

            <div className="md:col-span-4">
              <label className="text-xs font-bold text-slate-600">
                School name
                <input
                  className={`${input} mt-1`}
                  value={state.profile.schoolName}
                  onChange={(e) => updateProfile({ schoolName: e.target.value })}
                  placeholder="School name"
                />
              </label>
            </div>

            <div className="md:col-span-8">
              <label className="text-xs font-bold text-slate-600">
                School address
                <input
                  className={`${input} mt-1`}
                  value={state.profile.schoolAddress}
                  onChange={(e) => updateProfile({ schoolAddress: e.target.value })}
                  placeholder="School address"
                />
              </label>
            </div>

            <div className="md:col-span-4">
              <label className="text-xs font-bold text-slate-600">
                Roll number
                <input
                  className={`${input} mt-1`}
                  value={state.profile.rollNumber}
                  onChange={(e) => updateProfile({ rollNumber: e.target.value })}
                  placeholder="e.g. 12345A"
                />
              </label>
            </div>
            </div>
          ) : null}
        </div>

        <div className={`${adminSectionOpen ? "mt-6" : "mt-0"} grid gap-4 md:grid-cols-12 print:mt-0`}>
          {adminSectionOpen ? (
          <div className="md:col-span-12 print-hide">
            <div className={`${card} p-4`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">
                    Teacher settings
                  </div>
                  <div className="text-sm text-slate-600">
                    Adjust your timetable structure or update your password without cluttering the page.
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      setSetupDraft(structuredClone(state.timetableConfig));
                      setSetupOpen(true);
                    }}
                  >
                    Timetable settings
                  </button>

                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      setPasswordError(null);
                      setPasswordMessage(null);
                      setPasswordModalOpen(true);
                    }}
                  >
                    Change password
                  </button>
                </div>
              </div>

              {!state.timetableConfig.setupComplete && (
                <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Your timetable setup is not complete yet. You can finish it now or come back later from
                  <span className="font-semibold"> Timetable settings</span>.
                </div>
              )}

              <div className="mt-4 rounded-[28px] border border-white/70 bg-white/82 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                      Billing
                    </div>
                    <div className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
                      {billing?.trial_active
                        ? `Trial active • ${billingDaysLeft(billing?.trial_ends_at || null)} day${billingDaysLeft(billing?.trial_ends_at || null) === 1 ? "" : "s"} left`
                        : billing?.subscription_status === "active"
                          ? `${billing?.billing_interval === "annual" ? "Annual" : "Monthly"} • renews ${formatBillingDate(billing?.current_period_end || null) || "soon"}`
                          : billing?.subscription_status === "canceled"
                            ? `Canceled • access ends ${formatBillingDate(billing?.current_period_end || null) || "soon"}`
                            : billing?.subscription_status === "past_due"
                              ? "Past due"
                              : "Billing setup needed"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {billing?.subscription_status === "active" || billing?.trial_active
                        ? "Manage your subscription from Teacher Admin."
                        : "Choose or manage your plan from the billing step."}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      If your subscription ends, your workspace may be removed after 30 days. Please export important materials before then.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {billing?.has_stripe_customer && (
                      <button
                        type="button"
                        className={btn}
                        onClick={openBillingPortal}
                        disabled={billingBusy}
                      >
                        {billingBusy ? "Redirecting..." : "Manage plan"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => navigate("/onboarding/billing")}
                    >
                      View plans
                    </button>
                  </div>
                </div>

                {billingError ? (
                  <div className="mt-3 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                    {billingError}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-[28px] border border-white/70 bg-white/82 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-sm font-black uppercase tracking-[0.16em] text-cyan-700">
                      Dashboard Admin
                    </div>
                    <div className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
                      Class Admin PIN
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      This PIN protects Class Admin on shared classroom screens. Teachers can enter it from the class page before opening admin tools.
                    </div>
                  </div>

                  <div className="w-full max-w-xs">
                    <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Admin PIN
                      <input
                        className={`${input} mt-2`}
                        value={state.adminPin}
                        onChange={(e) => updateAdminPin(e.target.value)}
                        onBlur={() => {
                          if (!state.adminPin.trim()) updateAdminPin("2026");
                        }}
                        placeholder="2026"
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ) : null}

          <div className="md:col-span-12">
            <div className={`${card} p-4 print-tight`}>
              <div className="flex items-center justify-between print-hide">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">
                    Weekly Timetable
                  </div>
                  <div className="text-sm text-slate-600">
                    Click a slot to edit. “Now” highlights the current period.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className={btn} type="button" onClick={autoRankUnusedToday}>
                    Auto-rank unused (today)
                  </button>
                  <button className={btn} type="button" onClick={resetTimetableFromSettings}>
                    Reset timetable
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 md:hidden print-hide">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                      dayView === d
                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-800"
                    }`}
                    onClick={() => setDayView(d)}
                  >
                    {fmtDay(d)}
                    {today === d ? " • Today" : ""}
                  </button>
                ))}
              </div>

              <div
                id="timetablePrint"
                className="mt-4 rounded-3xl border-2 border-slate-200 bg-white print:border-0 print:mt-0"
              >
                <div className="hidden md:block">
                  <div className="md:min-w-[980px]">
                    <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                      <div className="p-3">Time</div>
                      {DAYS.map((d) => (
                        <div key={d} className={`p-3 ${today === d ? "text-emerald-800" : ""}`}>
                          {fmtDay(d)}
                          {today === d ? " • Today" : ""}
                        </div>
                      ))}
                    </div>

                    {state.schedule["Mon"].slots.map((rowSlot) => (
                      <div key={rowSlot.id} className="grid grid-cols-6 border-b border-slate-100 last:border-b-0">
                        <div className="p-3 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">{rowSlot.label}</div>
                          <div>
                            {rowSlot.start}–{rowSlot.end}
                          </div>
                        </div>

                        {DAYS.map((day) => (
                          <DayCell
                            key={day}
                            day={day}
                            rowSlotId={rowSlot.id}
                            state={state}
                            tileBgForClassId={tileBgForClassId}
                            setEditing={setEditing}
                            slotIsActive={slotIsActive}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md:hidden">
                  <div className="divide-y divide-slate-100">
                    {state.schedule[dayView].slots.map((slot) => (
                      <div key={slot.id} className="px-3 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-700">
                            {slot.label}
                            <span className="ml-2 font-semibold text-slate-500">
                              {slot.start}–{slot.end}
                            </span>
                          </div>

                          {slotIsActive(dayView, slot) && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                              Now
                            </span>
                          )}
                        </div>

                        <div className="-mx-1">
                          <DayCell
                            day={dayView}
                            rowSlotId={slot.id}
                            state={state}
                            tileBgForClassId={tileBgForClassId}
                            setEditing={setEditing}
                            slotIsActive={slotIsActive}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500 print-hide">
                Export tip: Click <b>Print Timetable</b> to download a clean PDF.
              </div>
            </div>
          </div>

          <div className="md:col-span-12 print-hide">
            <div className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">My class groups</div>
                  <div className="mt-1 text-sm text-slate-600">
                    These come from your live Elume classes.
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => alert("Archived classes coming soon (wired stub).")}
                >
                  Archived classes
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {classes.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    No classes found (or still loading).
                  </div>
                ) : (
                  classes.map((c) => {
                    const bg = tileBgForClassId(c.id);
                    const tc = tileTextClass(bg);
                    return (
                      <div key={c.id} className={`rounded-2xl border-2 border-black px-3 py-2 ${bg} ${tc}`}>
                        <div className="text-sm font-extrabold leading-tight">{c.name}</div>
                        <div className={`text-xs ${tc === "text-white" ? "text-white/90" : "text-slate-800/80"}`}>
                          {c.subject}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {editing && editingSlot && editingEntry && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center print-hide">
          <div className="w-full max-w-xl rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  {fmtDay(editing.day)} • {editingSlot.label} ({editingSlot.start}–{editingSlot.end})
                </div>
                <div className="text-xs text-slate-600">Edit this slot. Changes save instantly.</div>
              </div>

              <button
                type="button"
                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                onClick={() => setEditing(null)}
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {editingSlot.kind === "period" && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Class
                      <select
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingEntry.classId ?? 0}
                        onChange={(e) => {
                          const picked = Number(e.target.value);
                          const opt = classOptions.find((o) => o.id === picked);
                          if (!opt || picked === 0) {
                            updateEntry(editing.day, editing.slotId, {
                              classId: null,
                              classLabel: "",
                            });
                          } else {
                            updateEntry(editing.day, editing.slotId, {
                              classId: picked,
                              classLabel: opt.label,
                              supervisionRank: null,
                            });
                          }
                        }}
                      >
                        {classOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-600">
                      Room
                      <input
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingEntry.room}
                        onChange={(e) => updateEntry(editing.day, editing.slotId, { room: e.target.value })}
                        placeholder="e.g. Lab 1"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Supervision rank (only if Free/Unused)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingEntry.supervisionRank ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.trunc(Number(e.target.value || 0)));
                          updateEntry(editing.day, editing.slotId, { supervisionRank: v === 0 ? null : v });
                        }}
                        disabled={!!editingEntry.classId || !!editingEntry.classLabel}
                      />
                    </label>

                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                        onClick={() => clearEntry(editing.day, editing.slotId)}
                      >
                        Clear slot
                      </button>
                    </div>
                  </div>
                </>
              )}

              {(editingSlot.kind === "break" || editingSlot.kind === "lunch") && (
                <>
                  <label className="text-xs font-bold text-slate-600">
                    Duty / Note
                    <input
                      className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                      value={editingEntry.dutyNote}
                      onChange={(e) => updateEntry(editing.day, editing.slotId, { dutyNote: e.target.value })}
                      placeholder="e.g. Lunch supervision / Corridor duty / Yard duty"
                    />
                  </label>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Start time
                      <input
                        type="time"
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingSlot.start}
                        onChange={(e) => updateSlotTime(editing.day, editing.slotId, "start", e.target.value)}
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-600">
                      End time
                      <input
                        type="time"
                        className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editingSlot.end}
                        onChange={(e) => updateSlotTime(editing.day, editing.slotId, "end", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      onClick={() => clearEntry(editing.day, editing.slotId)}
                    >
                      Clear note
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {passwordModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 print-hide">
          <div className="w-full max-w-lg rounded-[32px] border-2 border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Change password
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Update your password securely from Teacher Admin.
                </div>
              </div>

              <button
                type="button"
                className={btn}
                onClick={() => setPasswordModalOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="space-y-3 p-5" onSubmit={submitPasswordChange}>
              <label className="block text-xs font-bold text-slate-600">
                Current password
                <input
                  type="password"
                  className={`${input} mt-1`}
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                />
              </label>

              <label className="block text-xs font-bold text-slate-600">
                New password
                <input
                  type="password"
                  className={`${input} mt-1`}
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                />
              </label>

              <label className="block text-xs font-bold text-slate-600">
                Confirm new password
                <input
                  type="password"
                  className={`${input} mt-1`}
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                />
              </label>

              {passwordError && (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {passwordError}
                </div>
              )}

              {passwordMessage && (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {passwordMessage}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  className={btn}
                  onClick={() => setPasswordModalOpen(false)}
                >
                  Cancel
                </button>

                <button type="submit" className={btnPrimary} disabled={passwordBusy}>
                  {passwordBusy ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {setupOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 print-hide md:items-center">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border-2 border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Timetable settings
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Tell Elume how your school day works. You can save this now or come back later.
                </div>
              </div>

              <button
                type="button"
                className={btn}
                onClick={() => {
                  setSetupOpen(false);
                  setSetupPromptDismissed(true);
                }}
              >
                Cancel
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4 rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={setupDraft.sameForAllDays}
                    onChange={(e) =>
                      setSetupDraft((prev) => ({ ...prev, sameForAllDays: e.target.checked }))
                    }
                  />
                  Use the same timetable structure for all 5 days
                </label>
              </div>

              <div className="space-y-4">
                {(setupDraft.sameForAllDays ? (["Mon"] as DayKey[]) : DAYS).map((day) => {
                  const cfg = setupDraft.days[day];
                  return (
                    <div key={day} className="rounded-[28px] border-2 border-slate-200 bg-slate-50 p-4">
                      <div className="mb-4 text-lg font-extrabold text-slate-900">
                        {setupDraft.sameForAllDays ? "School day settings" : fmtDay(day)}
                      </div>

                      <div className="grid gap-3 md:grid-cols-12">
                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            What time does your day start?
                            <input
                              type="time"
                              className={`${input} mt-1`}
                              value={cfg.startTime}
                              onChange={(e) =>
                                setSetupDraft((prev) => updateSetupDay(prev, day, { startTime: e.target.value }))
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            How many classes?
                            <input
                              type="number"
                              min={1}
                              max={12}
                              className={`${input} mt-1`}
                              value={cfg.periods}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    periods: Math.max(1, Math.trunc(Number(e.target.value || 1))),
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Class length (mins)
                            <input
                              type="number"
                              min={20}
                              max={120}
                              className={`${input} mt-1`}
                              value={cfg.classLengthMinutes}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    classLengthMinutes: Math.max(20, Math.trunc(Number(e.target.value || 20))),
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Small break after class
                            <input
                              type="number"
                              min={1}
                              max={cfg.periods}
                              className={`${input} mt-1`}
                              value={cfg.smallBreakAfterPeriod}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    smallBreakAfterPeriod: Math.min(
                                      Math.max(1, Math.trunc(Number(e.target.value || 1))),
                                      cfg.periods
                                    ),
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Small break start
                            <input
                              type="time"
                              className={`${input} mt-1`}
                              value={cfg.smallBreakStart}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    smallBreakStart: e.target.value,
                                    smallBreakEnabled: true,
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Small break end
                            <input
                              type="time"
                              className={`${input} mt-1`}
                              value={cfg.smallBreakEnd}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    smallBreakEnd: e.target.value,
                                    smallBreakEnabled: true,
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Lunch after class
                            <input
                              type="number"
                              min={1}
                              max={cfg.periods}
                              className={`${input} mt-1`}
                              value={cfg.lunchAfterPeriod}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    lunchAfterPeriod: Math.min(
                                      Math.max(1, Math.trunc(Number(e.target.value || 1))),
                                      cfg.periods
                                    ),
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Lunch start
                            <input
                              type="time"
                              className={`${input} mt-1`}
                              value={cfg.lunchStart}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    lunchStart: e.target.value,
                                    lunchEnabled: true,
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Lunch end
                            <input
                              type="time"
                              className={`${input} mt-1`}
                              value={cfg.lunchEnd}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    lunchEnd: e.target.value,
                                    lunchEnabled: true,
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            Before school supervision (mins)
                            <input
                              type="number"
                              min={0}
                              max={60}
                              className={`${input} mt-1`}
                              value={cfg.morningSupervisionMinutes}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    morningSupervisionMinutes: Math.max(
                                      0,
                                      Math.trunc(Number(e.target.value || 0))
                                    ),
                                    includeMorningSupervision: Number(e.target.value || 0) > 0,
                                  })
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="md:col-span-3">
                          <label className="text-xs font-bold text-slate-600">
                            After school supervision (mins)
                            <input
                              type="number"
                              min={0}
                              max={60}
                              className={`${input} mt-1`}
                              value={cfg.afternoonSupervisionMinutes}
                              onChange={(e) =>
                                setSetupDraft((prev) =>
                                  updateSetupDay(prev, day, {
                                    afternoonSupervisionMinutes: Math.max(
                                      0,
                                      Math.trunc(Number(e.target.value || 0))
                                    ),
                                    includeAfternoonSupervision: Number(e.target.value || 0) > 0,
                                  })
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="sticky bottom-0 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white pt-4">
                <div className="text-sm text-slate-600">
                  You can come back and edit these settings later from Teacher Admin.
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      setSetupOpen(false);
                      setSetupPromptDismissed(true);
                    }}
                  >
                    Skip for now
                  </button>

                  <button type="button" className={btnPrimary} onClick={applySetupDraft}>
                    Save timetable settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayCell({
  day,
  rowSlotId,
  state,
  tileBgForClassId,
  setEditing,
  slotIsActive,
}: {
  day: DayKey;
  rowSlotId: string;
  state: StoredAdminState;
  tileBgForClassId: (id: number | null) => string;
  setEditing: React.Dispatch<React.SetStateAction<{ day: DayKey; slotId: string } | null>>;
  slotIsActive: (d: DayKey, s: Slot) => boolean;
}) {
  const daySch = state.schedule[day];
  const slot = daySch.slots.find((s) => s.id === rowSlotId);
  if (!slot) {
    return <div className="p-3 text-xs text-slate-400">—</div>;
  }

  const entry = daySch.entries[slot.id] ?? defaultEntry();
  const isActive = slotIsActive(day, slot);

  if (slot.kind === "period") {
    const hasClass = !!entry.classId || !!entry.classLabel;
    const bg = hasClass ? tileBgForClassId(entry.classId) : "bg-white";
    const tc = hasClass ? tileTextClass(bg) : "text-slate-900";

    const tile = hasClass
      ? `border-[4px] border-black ${bg} ${tc} shadow-[0_4px_0_rgba(15,23,42,0.16)]`
      : "border-2 border-slate-200 bg-white text-slate-900";

    const showRank = !hasClass && (entry.supervisionRank ?? 0) > 0;
    const parts = (entry.classLabel || "").split(" — ");
    const clsName = parts[0] || "";
    const subj = parts[1] || "";

    return (
      <div className="p-3">
        <button
          type="button"
          onClick={() => setEditing({ day, slotId: slot.id })}
          className={`w-full rounded-3xl p-3 text-left ${tile} ${isActive ? "ring-2 ring-emerald-300" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {isActive && (
                <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                  Now
                </div>
              )}

              <div className="truncate text-lg font-extrabold leading-tight">
                {hasClass ? clsName : "Free"}
              </div>

              {hasClass && subj && (
                <div
                  className={`truncate text-sm font-semibold leading-tight ${
                    tc === "text-white" ? "text-white/90" : "text-slate-700"
                  }`}
                >
                  {subj}
                </div>
              )}

              <div className={`text-sm ${tc === "text-white" ? "text-white/90" : "text-slate-700"}`}>
                {slot.start}–{slot.end}
                {entry.room ? ` • ${entry.room}` : ""}
              </div>
            </div>

            {showRank && (
              <div className="grid h-12 w-12 place-items-center rounded-3xl border-[4px] border-black bg-white text-2xl font-extrabold text-slate-900 shadow-[0_4px_0_rgba(15,23,42,0.16)]">
                {entry.supervisionRank}
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  const note = entry.dutyNote?.trim();
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={() => setEditing({ day, slotId: slot.id })}
        className={`w-full rounded-2xl border-2 p-2 text-left ${
          note
            ? "border-red-400 bg-red-50"
            : slot.kind === "lunch"
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50"
        } ${isActive ? "ring-2 ring-emerald-300" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {isActive && (
              <div className="mb-1 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                Now
              </div>
            )}
            <div className="text-xs font-extrabold text-slate-900">{slot.label}</div>
            <div className="text-[11px] text-slate-600">
              {slot.start}–{slot.end}
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold text-slate-800">
              {note ? note : "No duty"}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

