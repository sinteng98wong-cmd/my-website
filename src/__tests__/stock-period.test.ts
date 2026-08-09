/**
 * Stock period locking — unit level.
 *
 * Covers the authority rules, period validation, the error contract and the
 * gate inside postMovement. The behaviour that needs a real database —
 * every posting path refused, ClinicStock untouched on rejection, and a lock
 * landing while a mutation is in flight — is proven in
 * src/__integration__/stock-period.verify.test.ts.
 */
import {
  PeriodLockedError,
  isPeriodLockedError,
  canLockPeriod,
  canUnlockPeriod,
  isValidPeriod,
  assertPeriodOpen,
} from "@/lib/stock-period";
import { periodOf } from "@/lib/stock-ledger";

describe("lock authority", () => {
  it("lets super admin, finance and clinic manager lock a period", () => {
    for (const r of ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"]) {
      expect(canLockPeriod(r)).toBe(true);
    }
  });

  it("refuses everyone else, including the storekeeper who raises the movements", () => {
    for (const r of ["STOREKEEPER", "DOCTOR", "NURSE", "RECEPTIONIST", ""]) {
      expect(canLockPeriod(r)).toBe(false);
    }
  });
});

describe("unlock authority", () => {
  it("is super admin only — narrower than locking", () => {
    expect(canUnlockPeriod("SUPER_ADMIN")).toBe(true);
    for (const r of ["FINANCE", "CLINIC_MANAGER", "STOREKEEPER", "DOCTOR", ""]) {
      expect(canUnlockPeriod(r)).toBe(false);
    }
  });

  it("does not let anyone who can lock also unlock", () => {
    const lockOnly = ["FINANCE", "CLINIC_MANAGER"];
    for (const r of lockOnly) {
      expect(canLockPeriod(r)).toBe(true);
      expect(canUnlockPeriod(r)).toBe(false);
    }
  });
});

describe("period validation", () => {
  it("accepts well-formed months", () => {
    for (const p of ["2026-01", "2026-08", "2026-12", "2030-07"]) {
      expect(isValidPeriod(p)).toBe(true);
    }
  });

  it("rejects malformed or impossible months", () => {
    for (const p of ["2026-00", "2026-13", "2026-8", "26-08", "2026/08", "2026-08-01", "", "abcd-ef"]) {
      expect(isValidPeriod(p)).toBe(false);
    }
  });

  it("accepts what periodOf produces", () => {
    expect(isValidPeriod(periodOf(new Date("2026-07-31T23:00:00Z")))).toBe(true);
    expect(isValidPeriod(periodOf(new Date()))).toBe(true);
  });
});

describe("PeriodLockedError", () => {
  const err = new PeriodLockedError("clinic-a", "2026-07");

  it("carries the clinic and period", () => {
    expect(err.clinicId).toBe("clinic-a");
    expect(err.period).toBe("2026-07");
  });

  it("is recognisable across module boundaries", () => {
    expect(isPeriodLockedError(err)).toBe(true);
    expect(isPeriodLockedError(new Error("something else"))).toBe(false);
    expect(isPeriodLockedError(null)).toBe(false);
    expect(isPeriodLockedError({ name: "PeriodLockedError" })).toBe(true);
  });

  it("names the period and points at the way forward", () => {
    expect(err.message).toContain("2026-07");
    expect(err.message).toMatch(/current open period/i);
    expect(err.message).toMatch(/unlock/i);
  });
});

describe("assertPeriodOpen", () => {
  const clientWith = (status: string | null) => ({
    $executeRawUnsafe: jest.fn(async () => [{}]),
    stockPeriodLock: {
      findUnique: jest.fn(async () => (status === null ? null : { status })),
    },
  }) as any;

  it("allows a period with no lock row at all", async () => {
    await expect(assertPeriodOpen(clientWith(null), "clinic-a", "2026-08")).resolves.toBeUndefined();
  });

  it("allows a period whose lock has been reopened", async () => {
    await expect(assertPeriodOpen(clientWith("OPEN"), "clinic-a", "2026-08")).resolves.toBeUndefined();
  });

  it("refuses a locked period", async () => {
    await expect(assertPeriodOpen(clientWith("LOCKED"), "clinic-a", "2026-07"))
      .rejects.toThrow(PeriodLockedError);
  });

  it("takes the advisory lock before reading, on the caller's client", async () => {
    const c = clientWith(null);
    await assertPeriodOpen(c, "clinic-a", "2026-08");
    expect(c.$executeRawUnsafe).toHaveBeenCalled();
    const [sql, key] = c.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain("pg_advisory_xact_lock_shared");
    expect(key).toContain("clinic-a");
    expect(key).toContain("2026-08");
  });

  it("keys the lock per clinic and period, so clinics do not block each other", async () => {
    const a = clientWith(null);
    const b = clientWith(null);
    await assertPeriodOpen(a, "clinic-a", "2026-08");
    await assertPeriodOpen(b, "clinic-b", "2026-08");
    expect(a.$executeRawUnsafe.mock.calls[0][1]).not.toBe(b.$executeRawUnsafe.mock.calls[0][1]);
  });

  it("looks the lock up by the exact clinic and period", async () => {
    const c = clientWith(null);
    await assertPeriodOpen(c, "clinic-a", "2026-08");
    expect(c.stockPeriodLock.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId_period: { clinicId: "clinic-a", period: "2026-08" } },
      })
    );
  });
});

describe("backdating is not reachable", () => {
  it("does not expose movementAt on the posting input", () => {
    // The public input type no longer carries movementAt (removed in d25dbc2a).
    // This asserts the runtime consequence: the period always comes from now.
    const src = require("fs").readFileSync(
      require("path").join(process.cwd(), "src/lib/stock-ledger.ts"),
      "utf8"
    );
    expect(src).toContain("const movementAt = new Date();");
    expect(src).not.toMatch(/input\.movementAt/);
  });

  it("derives the gate's period from the same call as the stored period", () => {
    const src = require("fs").readFileSync(
      require("path").join(process.cwd(), "src/lib/stock-ledger.ts"),
      "utf8"
    );
    // One periodOf call feeds both the lock check and the persisted column, so
    // they can never disagree.
    expect(src).toContain("const period = periodOf(movementAt);");
    expect(src).toContain("assertPeriodOpen(client, input.clinicId, period)");
    expect(src).toContain("period,");
  });
});
