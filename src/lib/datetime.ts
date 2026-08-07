/**
 * Intl.DateTimeFormat helpers, locale-resolved from i18n.language by prefix
 * match (he → he-IL, else en-GB). Formatters are cached per locale+kind —
 * Intl.DateTimeFormat construction is expensive.
 *
 * Unparseable input returns null everywhere (the equipmentRowMeta idiom):
 * callers render nothing rather than a fabricated claim.
 */
import { i18n } from "@/i18n";
import { DAY_MS } from "@/lib/home-readiness";

export function resolveIntlLocale(language: string = i18n.language): string {
  return language === "he" || language.startsWith("he-") ? "he-IL" : "en-GB";
}

type FormatKind = "date" | "time" | "dateTime" | "dayLabel";

const FORMAT_OPTIONS: Record<FormatKind, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  // Day-nav header shape (Tasks day view): "יום ה׳, 7 באוג׳" / "Thu, 7 Aug".
  dayLabel: { weekday: "short", day: "numeric", month: "short" },
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(kind: FormatKind, language?: string): Intl.DateTimeFormat {
  const locale = resolveIntlLocale(language ?? i18n.language);
  const cacheKey = `${kind}:${locale}`;
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, FORMAT_OPTIONS[kind]);
    formatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

export type DateTimeInput = Date | number | string | null | undefined;

function toEpochMs(value: DateTimeInput): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDate(value: DateTimeInput, language?: string): string | null {
  const ms = toEpochMs(value);
  return ms == null ? null : getFormatter("date", language).format(ms);
}

export function formatTime(value: DateTimeInput, language?: string): string | null {
  const ms = toEpochMs(value);
  return ms == null ? null : getFormatter("time", language).format(ms);
}

export function formatDateTime(value: DateTimeInput, language?: string): string | null {
  const ms = toEpochMs(value);
  return ms == null ? null : getFormatter("dateTime", language).format(ms);
}

export function formatDayLabel(value: DateTimeInput, language?: string): string | null {
  const ms = toEpochMs(value);
  return ms == null ? null : getFormatter("dayLabel", language).format(ms);
}

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * LOCAL calendar day as `YYYY-MM-DD` — the `?day=` param shape the server's
 * appointments listing expects. The server resolves the window in the CLINIC
 * timezone; the device-local day is the correct client input for on-site staff
 * (and the same assumption the web Tasks page makes).
 */
export function isoDayString(value: DateTimeInput): string | null {
  const ms = toEpochMs(value);
  if (ms == null) return null;
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * A `YYYY-MM-DD` string as a local-noon Date — noon anchors day arithmetic and
 * label formatting away from DST edges. Malformed AND calendar-invalid strings
 * return null: the round-trip check rejects Date's silent rollover (a
 * "2026-02-31" would otherwise become March 3).
 */
export function isoDayDate(day: string): Date | null {
  const match = ISO_DAY_RE.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dayOfMonth = Number(match[3]);
  const date = new Date(year, monthIndex, dayOfMonth, 12);
  return date.getFullYear() === year &&
    date.getMonth() === monthIndex &&
    date.getDate() === dayOfMonth
    ? date
    : null;
}

/** Day arithmetic on the `YYYY-MM-DD` shape (delta may be negative). */
export function addIsoDays(day: string, delta: number): string | null {
  const base = isoDayDate(day);
  if (base == null) return null;
  base.setDate(base.getDate() + delta);
  return isoDayString(base);
}

export type RelativeDay =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "daysAgo"; days: number };

/**
 * Coarse relative day — the equipmentRowMeta semantics generalized: age is
 * clamped to ≥0 (future timestamps read as today), days = floor(age / DAY_MS).
 * Returns a discriminated union, not copy — screens map kinds to their own
 * i18n keys (equipment.* keeps its "עודכן…" phrasing; other domains differ).
 */
export function relativeDay(value: DateTimeInput, nowMs: number): RelativeDay | null {
  const ms = toEpochMs(value);
  if (ms == null) return null;
  const ageMs = Math.max(0, nowMs - ms);
  const days = Math.floor(ageMs / DAY_MS);
  if (days === 0) return { kind: "today" };
  if (days === 1) return { kind: "yesterday" };
  return { kind: "daysAgo", days };
}
