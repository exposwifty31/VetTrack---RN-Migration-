import { DAY_MS } from "@/lib/home-readiness";

import {
  addIsoDays,
  formatDate,
  formatDateTime,
  formatDayLabel,
  formatTime,
  isoDayDate,
  isoDayString,
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

// --- Slice 3 additions: local ISO-day math for the Tasks day view ---

describe("isoDayString", () => {
  it("emits the LOCAL calendar day as YYYY-MM-DD", () => {
    // Construct from local fields so the assertion is TZ-independent.
    const local = new Date(2026, 7, 7, 23, 59, 59);
    expect(isoDayString(local)).toBe("2026-08-07");
    expect(isoDayString(new Date(2026, 0, 3, 0, 0, 1))).toBe("2026-01-03");
  });

  it("returns null for unparseable input", () => {
    expect(isoDayString("not-a-date")).toBeNull();
    expect(isoDayString(null)).toBeNull();
  });
});

describe("isoDayDate + addIsoDays", () => {
  it("round-trips a day string through local noon (DST-safe anchor)", () => {
    const d = isoDayDate("2026-08-07");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(7);
    expect(d?.getHours()).toBe(12);
  });

  it("rejects malformed day strings", () => {
    expect(isoDayDate("2026-8-7")).toBeNull();
    expect(isoDayDate("yesterday")).toBeNull();
    expect(addIsoDays("2026/08/07", 1)).toBeNull();
  });

  it("rejects calendar-invalid days instead of letting Date roll them over", () => {
    expect(isoDayDate("2026-02-31")).toBeNull();
    expect(isoDayDate("2026-04-31")).toBeNull();
    expect(isoDayDate("2026-13-01")).toBeNull();
    expect(isoDayDate("2026-00-10")).toBeNull();
    expect(isoDayDate("2026-01-00")).toBeNull();
    expect(isoDayDate("2026-01-32")).toBeNull();
    expect(addIsoDays("2026-02-31", 1)).toBeNull();
    // Leap-year boundary stays valid.
    expect(isoDayDate("2028-02-29")).not.toBeNull();
    expect(isoDayDate("2026-02-29")).toBeNull();
  });

  it("adds and subtracts days across month and year boundaries", () => {
    expect(addIsoDays("2026-08-07", 1)).toBe("2026-08-08");
    expect(addIsoDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIsoDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatDayLabel", () => {
  it("renders weekday + day + month through the resolved locale", () => {
    const d = isoDayDate("2026-08-07");
    const he = formatDayLabel(d, "he");
    const en = formatDayLabel(d, "en");
    expect(he).toBeTruthy();
    expect(en).toContain("7");
    expect(en).toMatch(/Aug/);
  });

  it("returns null for unparseable input", () => {
    expect(formatDayLabel("nope", "en")).toBeNull();
  });
});
