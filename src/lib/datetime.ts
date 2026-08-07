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

type FormatKind = "date" | "time" | "dateTime";

const FORMAT_OPTIONS: Record<FormatKind, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
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
