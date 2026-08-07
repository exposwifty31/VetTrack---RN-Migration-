import { DAY_MS } from "@/lib/home-readiness";

import {
  formatDate,
  formatDateTime,
  formatTime,
  relativeDay,
  resolveIntlLocale,
} from "../datetime";

// datetime → @/i18n → safe-storage hits the MMKV native module, absent under
// jest — mock the helpers (the i18n config.test.ts pattern; jest hoists the
// mock above the imports). Every assertion below passes `language` explicitly,
// so the persisted-locale value is moot.
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn(() => null),
  safeStorageSetItem: jest.fn(() => true),
  safeStorageRemoveItem: jest.fn(() => true),
}));

// 2026-08-07T12:30:00Z — fixed instant for deterministic assertions.
const INSTANT = Date.UTC(2026, 7, 7, 12, 30, 0);

describe("resolveIntlLocale", () => {
  it("maps he and he-* to he-IL by prefix", () => {
    expect(resolveIntlLocale("he")).toBe("he-IL");
    expect(resolveIntlLocale("he-IL")).toBe("he-IL");
  });

  it("maps everything else to en-GB", () => {
    expect(resolveIntlLocale("en")).toBe("en-GB");
    expect(resolveIntlLocale("en-US")).toBe("en-GB");
    expect(resolveIntlLocale("")).toBe("en-GB");
    // Prefix match is segment-aware — "hex" is not Hebrew.
    expect(resolveIntlLocale("hex")).toBe("en-GB");
  });
});

describe("formatters", () => {
  it("formats through the resolved locale (not the raw i18n tag)", () => {
    expect(formatDate(INSTANT, "he")).toBe(
      new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(INSTANT),
    );
    expect(formatDate(INSTANT, "en")).toBe(
      new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(INSTANT),
    );
  });

  it("formats date/time/dateTime with the expected granularity (en-GB)", () => {
    const date = formatDate(INSTANT, "en");
    const time = formatTime(INSTANT, "en");
    const dateTime = formatDateTime(INSTANT, "en");
    expect(date).toContain("2026");
    expect(date).not.toMatch(/\d{2}:\d{2}/);
    expect(time).toMatch(/\d{1,2}:\d{2}/);
    expect(time).not.toContain("2026");
    expect(dateTime).toContain("2026");
    expect(dateTime).toMatch(/\d{1,2}:\d{2}/);
  });

  it("accepts Date, epoch ms, and ISO strings equivalently", () => {
    const iso = new Date(INSTANT).toISOString();
    expect(formatDate(new Date(INSTANT), "en")).toBe(formatDate(INSTANT, "en"));
    expect(formatDate(iso, "en")).toBe(formatDate(INSTANT, "en"));
  });

  it("returns null for unparseable input", () => {
    expect(formatDate(null, "en")).toBeNull();
    expect(formatDate(undefined, "en")).toBeNull();
    expect(formatDate("not-a-date", "en")).toBeNull();
    expect(formatDate(Number.NaN, "en")).toBeNull();
    expect(formatTime("nope", "en")).toBeNull();
    expect(formatDateTime("nope", "en")).toBeNull();
  });
});

describe("relativeDay", () => {
  const now = INSTANT;

  it("is today strictly under one day of age", () => {
    expect(relativeDay(now, now)).toEqual({ kind: "today" });
    expect(relativeDay(now - (DAY_MS - 1), now)).toEqual({ kind: "today" });
  });

  it("is yesterday from exactly one day up to under two", () => {
    expect(relativeDay(now - DAY_MS, now)).toEqual({ kind: "yesterday" });
    expect(relativeDay(now - (2 * DAY_MS - 1), now)).toEqual({ kind: "yesterday" });
  });

  it("is daysAgo from two days on", () => {
    expect(relativeDay(now - 2 * DAY_MS, now)).toEqual({ kind: "daysAgo", days: 2 });
    expect(relativeDay(now - 14 * DAY_MS, now)).toEqual({ kind: "daysAgo", days: 14 });
  });

  it("clamps future timestamps to today (equipmentRowMeta idiom)", () => {
    expect(relativeDay(now + DAY_MS, now)).toEqual({ kind: "today" });
  });

  it("returns null for unparseable input", () => {
    expect(relativeDay(null, now)).toBeNull();
    expect(relativeDay("not-a-date", now)).toBeNull();
  });
});
