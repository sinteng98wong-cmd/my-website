/**
 * Tests for src/lib/financial-year.ts
 * All functions are pure — no DB mock needed.
 */

import {
  getFinancialYearLabel,
  getFinancialYearRange,
  getDateFYPeriod,
  getLeaveResetDate,
  getSstFilingPeriods,
} from "../lib/financial-year";

// ── getFinancialYearLabel ─────────────────────────────────────────────────────

describe("getFinancialYearLabel", () => {
  test("calendar-year FY (start = Jan) returns FYyyyy", () => {
    expect(getFinancialYearLabel(new Date("2026-06-15"), 1)).toBe("FY2026");
  });

  test("mid-year FY start: month before start → previous FY", () => {
    // fyStartMonth=4 (April). Feb 2026 is still in FY2025/26
    expect(getFinancialYearLabel(new Date("2026-02-01"), 4)).toBe("FY2025/26");
  });

  test("mid-year FY start: month at start → current FY", () => {
    // fyStartMonth=4. April 2026 → FY2026/27
    expect(getFinancialYearLabel(new Date("2026-04-01"), 4)).toBe("FY2026/27");
  });

  test("fyStartMonth=7: June (before start) → prior FY", () => {
    expect(getFinancialYearLabel(new Date("2026-06-30"), 7)).toBe("FY2025/26");
  });

  test("fyStartMonth=7: July (at start) → current FY", () => {
    expect(getFinancialYearLabel(new Date("2026-07-01"), 7)).toBe("FY2026/27");
  });
});

// ── getFinancialYearRange ─────────────────────────────────────────────────────

describe("getFinancialYearRange", () => {
  test("calendar year: start=Jan 1, end=Dec 31", () => {
    const r = getFinancialYearRange(1, 2026);
    expect(r.start).toEqual(new Date(2026, 0, 1));
    expect(r.end).toEqual(new Date(2026, 11, 31));
    expect(r.label).toBe("FY2026");
  });

  test("April-start FY: start=Apr 1 2026, end=Mar 31 2027", () => {
    const r = getFinancialYearRange(4, 2026);
    expect(r.start).toEqual(new Date(2026, 3, 1));
    expect(r.end).toEqual(new Date(2027, 2, 31));
    expect(r.label).toBe("FY2026/27");
  });

  test("July-start FY: start=Jul 1, end=Jun 30 next year", () => {
    const r = getFinancialYearRange(7, 2025);
    expect(r.start).toEqual(new Date(2025, 6, 1));
    expect(r.end).toEqual(new Date(2026, 5, 30));
    expect(r.label).toBe("FY2025/26");
  });
});

// ── getDateFYPeriod ───────────────────────────────────────────────────────────

describe("getDateFYPeriod", () => {
  test("date in middle of FY resolves to correct FY label", () => {
    const r = getDateFYPeriod(new Date("2026-06-05"), 4); // April FY
    expect(r.fyLabel).toBe("FY2026/27");
    expect(r.fyStart).toEqual(new Date(2026, 3, 1));
    expect(r.fyEnd).toEqual(new Date(2027, 2, 31));
  });

  test("date before FY start resolves to prior FY", () => {
    const r = getDateFYPeriod(new Date("2026-03-15"), 4);
    expect(r.fyLabel).toBe("FY2025/26");
  });

  test("calendar-year FY: Jan date in correct year", () => {
    const r = getDateFYPeriod(new Date("2026-01-01"), 1);
    expect(r.fyLabel).toBe("FY2026");
  });
});

// ── getLeaveResetDate ─────────────────────────────────────────────────────────

describe("getLeaveResetDate", () => {
  test("fyStartMonth=1 → 1 Jan", () => {
    expect(getLeaveResetDate(1, 2026)).toEqual(new Date(2026, 0, 1));
  });

  test("fyStartMonth=4 → 1 Apr", () => {
    expect(getLeaveResetDate(4, 2026)).toEqual(new Date(2026, 3, 1));
  });
});

// ── getSstFilingPeriods ───────────────────────────────────────────────────────

describe("getSstFilingPeriods", () => {
  test("returns exactly 6 bi-monthly periods", () => {
    const periods = getSstFilingPeriods(1, 2026);
    expect(periods).toHaveLength(6);
  });

  test("first period starts at FY start month", () => {
    const periods = getSstFilingPeriods(1, 2026);
    expect(periods[0].startDate).toEqual(new Date(2026, 0, 1));
  });

  test("first period covers 2 months (Jan–Feb)", () => {
    const periods = getSstFilingPeriods(1, 2026);
    expect(periods[0].endDate).toEqual(new Date(2026, 1, 28)); // last day of Feb 2026
  });

  test("periods are contiguous — each period starts the month after the previous ends", () => {
    const periods = getSstFilingPeriods(1, 2026);
    for (let i = 1; i < periods.length; i++) {
      const prevEnd  = periods[i - 1].endDate;
      const curStart = periods[i].startDate;
      // next period should start the month after prev ends
      const expectedStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth() + 1, 1);
      expect(curStart).toEqual(expectedStart);
    }
  });

  test("period labels are non-empty strings", () => {
    const periods = getSstFilingPeriods(4, 2026);
    periods.forEach((p) => {
      expect(typeof p.label).toBe("string");
      expect(p.label.length).toBeGreaterThan(0);
    });
  });

  test("due date is after end date for every period", () => {
    const periods = getSstFilingPeriods(1, 2026);
    periods.forEach((p) => {
      expect(p.dueDate.getTime()).toBeGreaterThan(p.endDate.getTime());
    });
  });
});
