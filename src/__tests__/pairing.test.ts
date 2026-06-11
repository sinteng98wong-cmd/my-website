/**
 * Tests for src/lib/pairing.ts
 *
 * getEffectivePairing, isNursePaired, and suggestNurses are all tested
 * with a mocked Prisma. The resolution order for getEffectivePairing is
 * the critical business logic: exact shift → date-any → default → null.
 */

import {
  getEffectivePairing,
  isNursePaired,
  suggestNurses,
} from "../lib/pairing";

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    dentistNursePairing: {
      findFirst: jest.fn(),
      groupBy:   jest.fn(),
    },
    staffProfile: {
      findMany: jest.fn(),
    },
    staffSchedule: {
      findFirst: jest.fn(),
    },
    leaveApplication: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";

const mockDNP          = (prisma as any).dentistNursePairing as { findFirst: jest.Mock; groupBy: jest.Mock };
const mockStaffProfile = (prisma as any).staffProfile        as { findMany: jest.Mock };
const mockSchedule     = (prisma as any).staffSchedule       as { findFirst: jest.Mock };
const mockLeave        = (prisma as any).leaveApplication    as { findFirst: jest.Mock };

beforeEach(() => jest.resetAllMocks());

// ── Fixture ───────────────────────────────────────────────────────────────────

const PAIRING = { id: "p1", dentistProfileId: "d1", nurseProfileId: "n1", clinicId: "c1" };
const DATE    = new Date("2026-06-05T08:00:00Z");

// ── getEffectivePairing ───────────────────────────────────────────────────────

describe("getEffectivePairing — resolution order", () => {
  test("returns exact shift match when shiftTemplateId provided and found", async () => {
    mockDNP.findFirst.mockResolvedValueOnce(PAIRING); // exact shift hit
    const result = await getEffectivePairing("d1", "c1", DATE, "shift-1");
    expect(result).toBe(PAIRING);
    // Only one DB call needed
    expect(mockDNP.findFirst).toHaveBeenCalledTimes(1);
  });

  test("falls through to date-any match when shift has no exact record", async () => {
    mockDNP.findFirst
      .mockResolvedValueOnce(null)    // exact shift → miss
      .mockResolvedValueOnce(PAIRING); // date-any → hit
    const result = await getEffectivePairing("d1", "c1", DATE, "shift-1");
    expect(result).toBe(PAIRING);
    expect(mockDNP.findFirst).toHaveBeenCalledTimes(2);
  });

  test("falls through to default when both date lookups miss", async () => {
    mockDNP.findFirst
      .mockResolvedValueOnce(null)    // exact shift → miss
      .mockResolvedValueOnce(null)    // date-any → miss
      .mockResolvedValueOnce(PAIRING); // default → hit
    const result = await getEffectivePairing("d1", "c1", DATE, "shift-1");
    expect(result).toBe(PAIRING);
    expect(mockDNP.findFirst).toHaveBeenCalledTimes(3);
  });

  test("returns null when all three lookups miss", async () => {
    mockDNP.findFirst.mockResolvedValue(null);
    const result = await getEffectivePairing("d1", "c1", DATE, "shift-1");
    expect(result).toBeNull();
  });

  test("skips the exact-shift lookup when no shiftTemplateId provided", async () => {
    mockDNP.findFirst
      .mockResolvedValueOnce(PAIRING); // date-any hit (first call)
    const result = await getEffectivePairing("d1", "c1", DATE); // no shiftTemplateId
    expect(result).toBe(PAIRING);
    // Should only call twice max (date-any, then default if miss)
    expect(mockDNP.findFirst).toHaveBeenCalledTimes(1);
  });

  test("returns null when no shiftTemplateId and both date-any and default miss", async () => {
    mockDNP.findFirst
      .mockResolvedValueOnce(null)   // date-any → miss
      .mockResolvedValueOnce(null);  // default → miss
    const result = await getEffectivePairing("d1", "c1", DATE);
    expect(result).toBeNull();
  });
});

// ── isNursePaired ─────────────────────────────────────────────────────────────

describe("isNursePaired", () => {
  test("returns false when no conflict found", async () => {
    mockDNP.findFirst.mockResolvedValueOnce(null);
    expect(await isNursePaired("n1", "c1", DATE)).toBe(false);
  });

  test("returns true when a conflict exists", async () => {
    mockDNP.findFirst.mockResolvedValueOnce({ id: "conflict-1" });
    expect(await isNursePaired("n1", "c1", DATE)).toBe(true);
  });

  test("excludePairingId is excluded from the conflict query", async () => {
    mockDNP.findFirst.mockResolvedValueOnce(null);
    await isNursePaired("n1", "c1", DATE, undefined, "exclude-me");
    const where = mockDNP.findFirst.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "exclude-me" });
  });

  test("conflict query is scoped to the given nurseProfileId and clinicId", async () => {
    mockDNP.findFirst.mockResolvedValueOnce(null);
    await isNursePaired("nurse-42", "clinic-99", DATE);
    const where = mockDNP.findFirst.mock.calls[0][0].where;
    expect(where.nurseProfileId).toBe("nurse-42");
    expect(where.clinicId).toBe("clinic-99");
  });
});

// ── suggestNurses ─────────────────────────────────────────────────────────────

describe("suggestNurses", () => {
  function setupSuggestBase(nurses: any[], historyOverride: any[] = []) {
    mockStaffProfile.findMany.mockResolvedValueOnce(nurses);
    mockDNP.groupBy.mockResolvedValueOnce(historyOverride);
  }

  function setupNurseChecks(opts: { scheduled?: any; onLeave?: any; alreadyPaired?: boolean }) {
    mockSchedule.findFirst.mockResolvedValueOnce(opts.scheduled ?? { isOff: false });
    mockLeave.findFirst.mockResolvedValueOnce(opts.onLeave ?? null);
    // isNursePaired calls dentistNursePairing.findFirst
    mockDNP.findFirst.mockResolvedValueOnce(opts.alreadyPaired ? { id: "conflict" } : null);
  }

  test("nurse with no conflicts is available", async () => {
    setupSuggestBase([{ id: "n1", user: { name: "Alice" } }]);
    setupNurseChecks({});
    const results = await suggestNurses("c1", "d1", DATE);
    expect(results).toHaveLength(1);
    expect(results[0].isAvailable).toBe(true);
    expect(results[0].unavailableReason).toBeUndefined();
  });

  test("nurse on leave is unavailable with reason 'On leave'", async () => {
    setupSuggestBase([{ id: "n1", user: { name: "Alice" } }]);
    setupNurseChecks({ onLeave: { id: "leave-1" } });
    const results = await suggestNurses("c1", "d1", DATE);
    expect(results[0].isAvailable).toBe(false);
    expect(results[0].unavailableReason).toBe("On leave");
  });

  test("nurse on off day is unavailable with reason 'Off day'", async () => {
    setupSuggestBase([{ id: "n1", user: { name: "Alice" } }]);
    setupNurseChecks({ scheduled: { isOff: true } });
    const results = await suggestNurses("c1", "d1", DATE);
    expect(results[0].isAvailable).toBe(false);
    expect(results[0].unavailableReason).toBe("Off day");
  });

  test("already paired nurse is unavailable with reason 'Already paired'", async () => {
    setupSuggestBase([{ id: "n1", user: { name: "Alice" } }]);
    setupNurseChecks({ alreadyPaired: true });
    const results = await suggestNurses("c1", "d1", DATE);
    expect(results[0].isAvailable).toBe(false);
    expect(results[0].unavailableReason).toBe("Already paired");
  });

  test("leave takes priority over off day in unavailable reason", async () => {
    setupSuggestBase([{ id: "n1", user: { name: "Alice" } }]);
    setupNurseChecks({ scheduled: { isOff: true }, onLeave: { id: "leave-1" } });
    const results = await suggestNurses("c1", "d1", DATE);
    expect(results[0].unavailableReason).toBe("On leave");
  });

  test("pairingCount taken from history, 0 when no history", async () => {
    setupSuggestBase(
      [{ id: "n1", user: { name: "Alice" } }, { id: "n2", user: { name: "Bob" } }],
      [{ nurseProfileId: "n1", _count: { _all: 5 } }]
    );
    setupNurseChecks({});
    setupNurseChecks({});
    const results = await suggestNurses("c1", "d1", DATE);
    const alice = results.find((r) => r.nurseProfileId === "n1")!;
    const bob   = results.find((r) => r.nurseProfileId === "n2")!;
    expect(alice.pairingCount).toBe(5);
    expect(alice.isPreviouslyPaired).toBe(true);
    expect(bob.pairingCount).toBe(0);
    expect(bob.isPreviouslyPaired).toBe(false);
  });

  test("sort: available first, then higher pairingCount, then alphabetical name", async () => {
    setupSuggestBase(
      [
        { id: "n1", user: { name: "Zara" } },
        { id: "n2", user: { name: "Alice" } },
        { id: "n3", user: { name: "Bob" } },
      ],
      [{ nurseProfileId: "n2", _count: { _all: 3 } }]
    );
    // n1: on leave (unavailable)
    setupNurseChecks({ onLeave: { id: "leave" } });
    // n2: available, 3 prior pairings
    setupNurseChecks({});
    // n3: available, 0 prior pairings
    setupNurseChecks({});

    const results = await suggestNurses("c1", "d1", DATE);
    const ids = results.map((r) => r.nurseProfileId);
    // Available first: n2 (3 pairings) before n3 (0), unavailable n1 last
    expect(ids).toEqual(["n2", "n3", "n1"]);
  });

  test("returns empty list when clinic has no nurses", async () => {
    setupSuggestBase([]);
    const results = await suggestNurses("c1", "d1", DATE);
    expect(results).toHaveLength(0);
  });
});
