/**
 * Tests for src/lib/journal.ts
 *
 * generateJournal calls getAccountCodeMap internally, which hits
 * prisma.ledgerAccountCode.findMany. All generateJournal tests mock that
 * method to return [] so DEFAULT_CODES is always used as the code map.
 * Tests for DB-override behaviour call getAccountCodeMap directly.
 */

import { generateJournal, getAccountCodeMap, DEFAULT_CODES } from "../lib/journal";

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    dailyLedger:       { findMany: jest.fn() },
    panelProvider:     { findMany: jest.fn() },
    ledgerAccountCode: { findMany: jest.fn() },
  },
}));

import { prisma } from "../lib/prisma";

const mockDailyLedger       = (prisma as any).dailyLedger       as { findMany: jest.Mock };
const mockPanelProvider     = (prisma as any).panelProvider     as { findMany: jest.Mock };
const mockLedgerAccountCode = (prisma as any).ledgerAccountCode as { findMany: jest.Mock };

beforeEach(() => jest.clearAllMocks());

// ── Shared fixture ────────────────────────────────────────────────────────────

function makeLedgerEntry(overrides: Record<string, any> = {}) {
  return {
    date:            new Date(2026, 4, 15),   // May 15, 2026
    clinicId:        "clinic-1",
    clinic:          { name: "Test Clinic", entity: { legalName: "TestCo Sdn Bhd" } },
    professionalFee: 0,
    productSales:    0,
    sst:             0,
    cashCurrent:     0,
    cashNext:        0,
    creditCard:      0,
    ewallet:         0,
    fpx:             0,
    atome:           0,
    depositTopup:    0,
    depositRefund:   0,
    salesReturn:     0,
    panelCollections: null,
    ...overrides,
  };
}

// ── DEFAULT_CODES constant ────────────────────────────────────────────────────

describe("DEFAULT_CODES", () => {
  test("contains 18 entries", () => {
    expect(DEFAULT_CODES).toHaveLength(18);
  });

  test("every entryType is unique", () => {
    const types = DEFAULT_CODES.map((d) => d.entryType);
    expect(new Set(types).size).toBe(types.length);
  });

  test("sortOrder values are all unique and ascending", () => {
    const orders = DEFAULT_CODES.map((d) => d.sortOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

// ── getAccountCodeMap — no DB overrides ──────────────────────────────────────

describe("getAccountCodeMap — no DB overrides", () => {
  beforeEach(() => {
    mockLedgerAccountCode.findMany.mockResolvedValue([]);
  });

  test("seeds all 18 DEFAULT_CODES into the map", async () => {
    const map = await getAccountCodeMap();
    expect(map.size).toBe(18);
  });

  test("PROF_FEE maps to accountCode 5001", async () => {
    const map = await getAccountCodeMap();
    expect(map.get("PROF_FEE")?.accountCode).toBe("5001");
  });

  test("PANEL maps to accountCode 3009 with subCode 001", async () => {
    const map = await getAccountCodeMap();
    const panel = map.get("PANEL");
    expect(panel?.accountCode).toBe("3009");
    expect(panel?.subCode).toBe("001");
  });
});

// ── getAccountCodeMap — DB overrides ─────────────────────────────────────────

describe("getAccountCodeMap — DB overrides", () => {
  test("DB entry overrides the default for that entryType", async () => {
    mockLedgerAccountCode.findMany.mockResolvedValueOnce([
      { entryType: "PROF_FEE", accountCode: "9999", subCode: null, description: "Custom Fee", module: "Custom", sortOrder: 1 },
    ]);
    const map = await getAccountCodeMap("clinic-1");
    expect(map.get("PROF_FEE")?.accountCode).toBe("9999");
  });

  test("non-overridden entries still use the default", async () => {
    mockLedgerAccountCode.findMany.mockResolvedValueOnce([
      { entryType: "PROF_FEE", accountCode: "9999", subCode: null, description: "Custom Fee", module: "Custom", sortOrder: 1 },
    ]);
    const map = await getAccountCodeMap("clinic-1");
    expect(map.get("PRODUCT")?.accountCode).toBe("5002");
  });

  test("no DB entries → all 18 defaults remain", async () => {
    mockLedgerAccountCode.findMany.mockResolvedValueOnce([]);
    const map = await getAccountCodeMap("clinic-1");
    expect(map.size).toBe(18);
  });
});

// ── generateJournal — zero and missing amounts ────────────────────────────────

describe("generateJournal — zero amounts are filtered", () => {
  beforeEach(() => {
    mockLedgerAccountCode.findMany.mockResolvedValue([]);
    mockPanelProvider.findMany.mockResolvedValue([]);
  });

  test("entry with all zero amounts produces no rows", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([makeLedgerEntry()]);
    const rows = await generateJournal("2026-05");
    expect(rows).toHaveLength(0);
  });

  test("only non-zero fields produce rows", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 1000 }),
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows).toHaveLength(1);
    expect(rows[0].entryType).toBe("PROF_FEE");
  });

  test("zero-amount field alongside non-zero field is excluded", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 500, productSales: 0, sst: 0 }),
    ]);
    const rows = await generateJournal("2026-05");
    const entryTypes = rows.map((r) => r.entryType);
    expect(entryTypes).toContain("PROF_FEE");
    expect(entryTypes).not.toContain("PRODUCT");
  });
});

// ── generateJournal — basic row mapping ──────────────────────────────────────

describe("generateJournal — basic row mapping", () => {
  beforeEach(() => {
    mockLedgerAccountCode.findMany.mockResolvedValue([]);
    mockPanelProvider.findMany.mockResolvedValue([]);
  });

  test("PROF_FEE row: code 5001, module Sales, correct amount", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 1000 }),
    ]);
    const rows = await generateJournal("2026-05");
    const row = rows.find((r) => r.entryType === "PROF_FEE")!;
    expect(row.code).toBe("5001");
    expect(row.module).toBe("Sales");
    expect(row.amount).toBe(1000);
  });

  test("two non-zero fields produce two rows", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 1000, productSales: 200 }),
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows).toHaveLength(2);
  });

  test("date field is formatted as DD-Mon-YYYY", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 500 }),
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].date).toBe("15-May-2026");
  });

  test("month field is formatted as Mon-YY", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 500 }),
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].month).toBe("May-26");
  });

  test("yaYear field is YA YYYY", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 500 }),
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].yaYear).toBe("YA 2026");
  });

  test("branch is taken from clinic.name", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 500 }),
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].branch).toBe("Test Clinic");
  });
});

// ── generateJournal — special entry types ────────────────────────────────────

describe("generateJournal — special entry types", () => {
  beforeEach(() => {
    mockLedgerAccountCode.findMany.mockResolvedValue([]);
    mockPanelProvider.findMany.mockResolvedValue([]);
  });

  test("SST produces row with code 4100-SST", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([makeLedgerEntry({ sst: 60 })]);
    const rows = await generateJournal("2026-05");
    const row = rows.find((r) => r.entryType === "SST")!;
    expect(row.code).toBe("4100-SST");
    expect(row.amount).toBe(60);
  });

  test("depositTopup produces row with code 2150-DEP and module Deposit", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([makeLedgerEntry({ depositTopup: 300 })]);
    const rows = await generateJournal("2026-05");
    const row = rows.find((r) => r.entryType === "DEPOSIT_TOPUP")!;
    expect(row.code).toBe("2150-DEP");
    expect(row.module).toBe("Deposit");
  });

  test("salesReturn produces row with code 5001-RTN and module Sales-Return", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([makeLedgerEntry({ salesReturn: 500 })]);
    const rows = await generateJournal("2026-05");
    const row = rows.find((r) => r.entryType === "SALES_RETURN")!;
    expect(row.code).toBe("5001-RTN");
    expect(row.module).toBe("Sales-Return");
  });

  test("clinicId filter is passed to dailyLedger.findMany", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([]);
    await generateJournal("2026-05", "clinic-42");
    const whereArg = mockDailyLedger.findMany.mock.calls[0][0].where;
    expect(whereArg.clinicId).toBe("clinic-42");
  });
});

// ── generateJournal — panel collections ──────────────────────────────────────

describe("generateJournal — panel collections", () => {
  beforeEach(() => {
    mockLedgerAccountCode.findMany.mockResolvedValue([]);
  });

  test("one panel provider produces one PANEL row with provider name", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ panelCollections: { PANEL01: 500 } }),
    ]);
    mockPanelProvider.findMany.mockResolvedValueOnce([
      { code: "PANEL01", name: "Aetna" },
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows).toHaveLength(1);
    expect(rows[0].entryType).toBe("PANEL");
    expect(rows[0].description).toBe("Panel-Aetna");
    expect(rows[0].amount).toBe(500);
  });

  test("two providers produce two PANEL rows", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ panelCollections: { PANEL01: 500, PANEL02: 300 } }),
    ]);
    mockPanelProvider.findMany.mockResolvedValueOnce([
      { code: "PANEL01", name: "Aetna" },
      { code: "PANEL02", name: "Great Eastern" },
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows).toHaveLength(2);
    const descriptions = rows.map((r) => r.description);
    expect(descriptions).toContain("Panel-Aetna");
    expect(descriptions).toContain("Panel-Great Eastern");
  });

  test("unknown panel code falls back to code as description", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ panelCollections: { UNKNOWN: 200 } }),
    ]);
    mockPanelProvider.findMany.mockResolvedValueOnce([]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].description).toBe("Panel-UNKNOWN");
  });

  test("zero-amount in panelCollections produces no row", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ panelCollections: { PANEL01: 0 } }),
    ]);
    mockPanelProvider.findMany.mockResolvedValueOnce([
      { code: "PANEL01", name: "Aetna" },
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows).toHaveLength(0);
  });

  test("panel row uses code 3009-001 from DEFAULT_CODES", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ panelCollections: { PANEL01: 500 } }),
    ]);
    mockPanelProvider.findMany.mockResolvedValueOnce([
      { code: "PANEL01", name: "Aetna" },
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].code).toBe("3009-001");
  });
});

// ── generateJournal — sort order ─────────────────────────────────────────────

describe("generateJournal — sort order", () => {
  beforeEach(() => {
    mockLedgerAccountCode.findMany.mockResolvedValue([]);
    mockPanelProvider.findMany.mockResolvedValue([]);
  });

  test("rows sorted by DEFAULT_CODES sortOrder (PROF_FEE=1 before PRODUCT=2 before CASH_CURR=4)", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      makeLedgerEntry({ professionalFee: 500, productSales: 200, cashCurrent: 700 }),
    ]);
    const rows = await generateJournal("2026-05");
    const types = rows.map((r) => r.entryType);
    expect(types.indexOf("PROF_FEE")).toBeLessThan(types.indexOf("PRODUCT"));
    expect(types.indexOf("PRODUCT")).toBeLessThan(types.indexOf("CASH_CURR"));
  });

  test("same entryType from two branches sorted alphabetically by branch", async () => {
    mockDailyLedger.findMany.mockResolvedValueOnce([
      { ...makeLedgerEntry({ professionalFee: 500 }), clinic: { name: "Beta Clinic", entity: { legalName: "BetaCo" } } },
      { ...makeLedgerEntry({ professionalFee: 800 }), clinic: { name: "Alpha Clinic", entity: { legalName: "AlphaCo" } } },
    ]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].branch).toBe("Alpha Clinic");
    expect(rows[1].branch).toBe("Beta Clinic");
  });

  test("same entryType and branch, two dates → earlier date first", async () => {
    const entry1 = makeLedgerEntry({ professionalFee: 500, date: new Date(2026, 4, 20) });
    const entry2 = makeLedgerEntry({ professionalFee: 800, date: new Date(2026, 4, 5) });
    mockDailyLedger.findMany.mockResolvedValueOnce([entry1, entry2]);
    const rows = await generateJournal("2026-05");
    expect(rows[0].date).toBe("05-May-2026");
    expect(rows[1].date).toBe("20-May-2026");
  });
});
