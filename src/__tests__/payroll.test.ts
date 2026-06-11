/**
 * Tests for src/lib/payroll.ts — pure statutory calculation functions.
 * No Prisma mock needed; all tested functions are side-effect free.
 */

import {
  ageFromIc,
  calculateEpf,
  calculateSocso,
  calculateEis,
  calculatePcb,
  calculateOvertime,
  calculateUnpaidLeaveDeduction,
} from "../lib/payroll";

// ── ageFromIc ─────────────────────────────────────────────────────────────────
// All ICs use January (01) birthdays so "birthday already passed" holds for the
// entire calendar year regardless of when the test suite runs.
// Century rule: yy <= (currentYear % 100) → 2000s, else 1900s.
// In 2026: 2026 % 100 = 26, so yy ≤ 26 → 2000s; yy > 26 → 1900s.

describe("ageFromIc", () => {
  test("null returns 35", () => {
    expect(ageFromIc(null)).toBe(35);
  });

  test("undefined returns 35", () => {
    expect(ageFromIc(undefined)).toBe(35);
  });

  test("empty string returns 35", () => {
    expect(ageFromIc("")).toBe(35);
  });

  test("fewer than 6 digits returns 35", () => {
    expect(ageFromIc("1234")).toBe(35);
  });

  test("non-numeric string returns 35", () => {
    expect(ageFromIc("ABCDEF-01-1234")).toBe(35);
  });

  test("invalid month (mm=13) returns 35", () => {
    expect(ageFromIc("901301075555")).toBe(35);
  });

  test("invalid day (dd=00) returns 35", () => {
    expect(ageFromIc("901200075555")).toBe(35);
  });

  test("valid IC with dashes: 850101-07-5555 → age 41", () => {
    expect(ageFromIc("850101-07-5555")).toBe(41);
  });

  test("valid IC without dashes: 850101075555 → age 41", () => {
    expect(ageFromIc("850101075555")).toBe(41);
  });

  test("6-digit IC (no state/checksum): 850101 → age 41", () => {
    expect(ageFromIc("850101")).toBe(41);
  });

  test("century boundary yy=26 maps to 2026 (age 0)", () => {
    // Born 2026-01-01; birthday passed by June — age should be 0
    expect(ageFromIc("260101")).toBe(0);
  });

  test("century boundary yy=27 maps to 1927 (age 99)", () => {
    // 27 > 26 → 1900 century; born 1927-01-01 → age 99
    expect(ageFromIc("270101")).toBe(99);
  });

  test("age > 60 case: 650101 → age 61", () => {
    expect(ageFromIc("650101")).toBe(61);
  });

  test("birthday not yet passed this year: Dec 31 birth in June → age - 1", () => {
    // Born 1990-12-31; running in June 2026 → birthday not yet passed → age 35
    expect(ageFromIc("901231")).toBe(35);
  });
});

// ── calculateEpf ─────────────────────────────────────────────────────────────

describe("calculateEpf", () => {
  test("salary 0 returns zeros", () => {
    expect(calculateEpf(0, 30)).toEqual({ employee: 0, employer: 0 });
  });

  test("negative salary returns zeros", () => {
    expect(calculateEpf(-100, 30)).toEqual({ employee: 0, employer: 0 });
  });

  test("age 30, salary 3000 → employee 11%, employer 13%", () => {
    expect(calculateEpf(3000, 30)).toEqual({ employee: 330, employer: 390 });
  });

  test("age 30, salary 5000 → at threshold, still 13% employer", () => {
    expect(calculateEpf(5000, 30)).toEqual({ employee: 550, employer: 650 });
  });

  test("age 30, salary 5001 → employee 11%, employer drops to 12%", () => {
    expect(calculateEpf(5001, 30)).toEqual({ employee: 550.11, employer: 600.12 });
  });

  test("age 30, salary 10000 → employee 11%, employer 12%", () => {
    expect(calculateEpf(10000, 30)).toEqual({ employee: 1100, employer: 1200 });
  });

  test("age 61, salary 3000 → employee 5.5%, employer 6.5%", () => {
    expect(calculateEpf(3000, 61)).toEqual({ employee: 165, employer: 195 });
  });

  test("age 61, salary 8000 → reduced rates regardless of salary level", () => {
    expect(calculateEpf(8000, 61)).toEqual({ employee: 440, employer: 520 });
  });
});

// ── calculateSocso ────────────────────────────────────────────────────────────

describe("calculateSocso", () => {
  test("age 30, salary 2000 → employee 0.5%, employer 1.75%", () => {
    expect(calculateSocso(2000, 30)).toEqual({ employee: 10, employer: 35 });
  });

  test("age 30, salary 4000 → at ceiling, employee 20, employer 70", () => {
    expect(calculateSocso(4000, 30)).toEqual({ employee: 20, employer: 70 });
  });

  test("age 30, salary 8000 → capped at RM4000", () => {
    expect(calculateSocso(8000, 30)).toEqual({ employee: 20, employer: 70 });
  });

  test("age 59 (< 60) → still first category", () => {
    expect(calculateSocso(4000, 59)).toEqual({ employee: 20, employer: 70 });
  });

  test("age 60 → second category: employee 0, employer 1.25%", () => {
    expect(calculateSocso(4000, 60)).toEqual({ employee: 0, employer: 50 });
  });

  test("age 65, salary 8000 → capped, employee 0, employer 50", () => {
    expect(calculateSocso(8000, 65)).toEqual({ employee: 0, employer: 50 });
  });

  test("salary 0, age 30 → both zero", () => {
    expect(calculateSocso(0, 30)).toEqual({ employee: 0, employer: 0 });
  });
});

// ── calculateEis ──────────────────────────────────────────────────────────────

describe("calculateEis", () => {
  test("age 30, salary 2000 → 0.2% each", () => {
    expect(calculateEis(2000, 30)).toEqual({ employee: 4, employer: 4 });
  });

  test("age 30, salary 4000 → at ceiling", () => {
    expect(calculateEis(4000, 30)).toEqual({ employee: 8, employer: 8 });
  });

  test("age 30, salary 8000 → capped at RM4000", () => {
    expect(calculateEis(8000, 30)).toEqual({ employee: 8, employer: 8 });
  });

  test("age 59 (< 60) → still contributes", () => {
    expect(calculateEis(4000, 59)).toEqual({ employee: 8, employer: 8 });
  });

  test("age 60 → both zero (≥60 exempted)", () => {
    expect(calculateEis(4000, 60)).toEqual({ employee: 0, employer: 0 });
  });

  test("age 65, any salary → both zero", () => {
    expect(calculateEis(8000, 65)).toEqual({ employee: 0, employer: 0 });
  });
});

// ── calculatePcb ──────────────────────────────────────────────────────────────
// PCB: annualise (basic + allowances) × 12, subtract RM9000 relief,
// apply progressive brackets, return monthly (annual / 12).

describe("calculatePcb", () => {
  test("annual gross ≤ 9000 (fully covered by relief) → 0 tax", () => {
    // 750 × 12 = 9000, chargeable = 0
    expect(calculatePcb(750, 0)).toBe(0);
  });

  test("annual gross just above relief threshold → first taxable bracket (1%)", () => {
    // 1000 × 12 = 12000, chargeable = 3000 (all in 0% bracket ≤5000) → 0 tax
    expect(calculatePcb(1000, 0)).toBe(0);
  });

  test("annual gross in first taxable band (5001–20000 @ 1%)", () => {
    // 1500 × 12 = 18000, chargeable = 9000; all in 0% bracket? No:
    // bracket 1: ≤5000 @ 0% → 0; bracket 2: 5001–20000 @ 1% → 4000 × 0.01 = 40
    // monthly = 40/12 = 3.33
    expect(calculatePcb(1500, 0)).toBe(3.33);
  });

  test("annual gross spanning two positive-rate brackets", () => {
    // 3000 × 12 = 36000, chargeable = 27000
    // 0% on first 5000 = 0; 1% on 15000 = 150; 3% on 7000 = 210; total = 360; monthly = 30
    expect(calculatePcb(3000, 0)).toBe(30);
  });

  test("allowances increase chargeable income", () => {
    // basic 1500, allowances 500 → annual (2000 × 12) = 24000, chargeable = 15000
    // 0% on 5000 = 0; 1% on 10000 = 100; monthly = 100/12 = 8.33
    expect(calculatePcb(1500, 500)).toBe(8.33);
  });

  test("zero allowances is same as calculatePcb(basic, 0)", () => {
    expect(calculatePcb(2000, 0)).toBe(calculatePcb(2000, 0));
  });

  test("high earner crosses multiple brackets correctly", () => {
    // 10000/month, 0 allowances → annual 120000, chargeable 111000
    // 0% 5000, 1% 15000=150, 3% 15000=450, 8% 15000=1200,
    // 13% 20000=2600, 21% 30000=6300, 24% 11000=2640; total=13340; monthly=1111.67
    expect(calculatePcb(10000, 0)).toBe(1111.67);
  });
});

// ── calculateOvertime ─────────────────────────────────────────────────────────
// Hourly rate = basicSalary / 26 / 8
// Multipliers: NORMAL=1.5, REST=2, PUBLIC_HOLIDAY=3

describe("calculateOvertime", () => {
  test("zero minutes returns 0", () => {
    expect(calculateOvertime(3000, 0, "NORMAL")).toBe(0);
  });

  test("negative minutes returns 0", () => {
    expect(calculateOvertime(3000, -30, "NORMAL")).toBe(0);
  });

  test("salary 0 returns 0", () => {
    expect(calculateOvertime(0, 60, "NORMAL")).toBe(0);
  });

  test("NORMAL day, 60 min, salary 3000", () => {
    // hourly = 3000/26/8 = 14.4231; 1h × 1.5 = 21.63
    expect(calculateOvertime(3000, 60, "NORMAL")).toBe(21.63);
  });

  test("REST day, 60 min, salary 3000", () => {
    // hourly = 14.4231; 1h × 2 = 28.85
    expect(calculateOvertime(3000, 60, "REST")).toBe(28.85);
  });

  test("PUBLIC_HOLIDAY, 60 min, salary 3000", () => {
    // hourly = 14.4231; 1h × 3 = 43.27
    expect(calculateOvertime(3000, 60, "PUBLIC_HOLIDAY")).toBe(43.27);
  });

  test("90 minutes NORMAL day, salary 5000", () => {
    // hourly = 5000/26/8 = 24.0385; 1.5h × 1.5 = 54.09
    expect(calculateOvertime(5000, 90, "NORMAL")).toBe(54.09);
  });

  test("PUBLIC_HOLIDAY, 120 min, salary 3000", () => {
    // hourly = 14.4231; 2h × 3 = 86.54
    expect(calculateOvertime(3000, 120, "PUBLIC_HOLIDAY")).toBe(86.54);
  });
});

// ── calculateUnpaidLeaveDeduction ─────────────────────────────────────────────
// Formula: (basicSalary / 26) × unpaidDays

describe("calculateUnpaidLeaveDeduction", () => {
  test("0 unpaid days returns 0", () => {
    expect(calculateUnpaidLeaveDeduction(3000, 0)).toBe(0);
  });

  test("salary 0 returns 0", () => {
    expect(calculateUnpaidLeaveDeduction(0, 2)).toBe(0);
  });

  test("1 unpaid day, salary 3000 → 115.38", () => {
    expect(calculateUnpaidLeaveDeduction(3000, 1)).toBe(115.38);
  });

  test("3 unpaid days, salary 3000 → 346.15", () => {
    expect(calculateUnpaidLeaveDeduction(3000, 3)).toBe(346.15);
  });

  test("half-day (0.5 days), salary 3000 → 57.69", () => {
    expect(calculateUnpaidLeaveDeduction(3000, 0.5)).toBe(57.69);
  });
});
