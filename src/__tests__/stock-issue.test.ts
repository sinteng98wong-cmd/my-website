import {
  allocateFefo,
  allocationsReconcile,
  allowsExpiredBatches,
  checkApprover,
  checkAvailability,
  checkIssuable,
  checkTransition,
  isEditable,
  isExpired,
  isWriteOff,
  movementTypeForReason,
  REASONS,
  requiresApproval,
  unbatchedAvailable,
  type AllocatableBatch,
} from "@/lib/stock-issue";
import { directionFor, postingKeys } from "@/lib/stock-ledger";

const d = (iso: string) => new Date(iso);
const NOW = d("2026-08-09T00:00:00Z");

const batch = (over: Partial<AllocatableBatch> = {}): AllocatableBatch => ({
  id: "b1", batchNumber: "B1", expiryDate: d("2026-12-01"), remainingQty: 10, ...over,
});

describe("reason → ledger movement type", () => {
  it("maps usage to consumption", () => {
    expect(movementTypeForReason("CLINICAL_CONSUMPTION")).toBe("CONSUMPTION");
    expect(movementTypeForReason("GENERAL_USAGE")).toBe("CONSUMPTION");
    expect(movementTypeForReason("OTHER")).toBe("CONSUMPTION");
  });

  it("maps destruction to its own write-off type", () => {
    expect(movementTypeForReason("EXPIRED")).toBe("WRITE_OFF_EXPIRY");
    expect(movementTypeForReason("DAMAGED")).toBe("WRITE_OFF_DAMAGE");
    expect(movementTypeForReason("WASTAGE")).toBe("WRITE_OFF_WASTAGE");
  });

  it("makes every issue type an outward movement", () => {
    for (const r of REASONS) expect(directionFor(movementTypeForReason(r))).toBe("OUT");
  });

  it("treats only destruction as a write-off needing approval", () => {
    expect(isWriteOff("EXPIRED")).toBe(true);
    expect(isWriteOff("DAMAGED")).toBe(true);
    expect(isWriteOff("WASTAGE")).toBe(true);
    expect(isWriteOff("CLINICAL_CONSUMPTION")).toBe(false);
    expect(requiresApproval("GENERAL_USAGE")).toBe(false);
    expect(requiresApproval("EXPIRED")).toBe(true);
  });
});

describe("3/4. availability and negative stock", () => {
  it("rejects a quantity greater than available", () => {
    const g = checkAvailability(10, 11, "Gloves");
    expect(g).toMatchObject({ ok: false, status: 409 });
    expect((g as any).error).toMatch(/10 available, 11 requested/);
  });

  it("allows issuing exactly what is on hand", () => {
    expect(checkAvailability(10, 10).ok).toBe(true);
  });

  it("rejects issuing from an empty position", () => {
    expect(checkAvailability(0, 1).ok).toBe(false);
  });
});

describe("18. reason and line validation", () => {
  const lines = [{ itemId: "i1", quantity: 2 }];

  it("requires a reason", () => {
    expect(checkIssuable(lines, null)).toMatchObject({ ok: false, status: 422 });
  });

  it("requires at least one line", () => {
    expect(checkIssuable([], "GENERAL_USAGE")).toMatchObject({ ok: false, status: 422 });
  });

  it("rejects a zero or fractional quantity", () => {
    expect(checkIssuable([{ itemId: "i1", quantity: 0 }], "GENERAL_USAGE").ok).toBe(false);
    expect(checkIssuable([{ itemId: "i1", quantity: 1.5 }], "GENERAL_USAGE").ok).toBe(false);
  });

  it("rejects the same item and batch twice", () => {
    expect(checkIssuable([{ itemId: "i1", quantity: 1 }, { itemId: "i1", quantity: 2 }], "GENERAL_USAGE").ok).toBe(false);
  });

  it("allows the same item on different batches", () => {
    expect(checkIssuable(
      [{ itemId: "i1", quantity: 1, batchId: "b1" }, { itemId: "i1", quantity: 2, batchId: "b2" }],
      "GENERAL_USAGE"
    ).ok).toBe(true);
  });
});

describe("9/10/14. FEFO allocation", () => {
  it("consumes the earliest expiry first", () => {
    const early = batch({ id: "a", batchNumber: "A", expiryDate: d("2026-09-01"), remainingQty: 10 });
    const late  = batch({ id: "b", batchNumber: "B", expiryDate: d("2026-12-01"), remainingQty: 20 });
    const r = allocateFefo([late, early], 15, { unbatchedAvailable: 0, asOf: NOW });
    expect(r.allocations).toEqual([
      { batchId: "a", batchNumber: "A", expiryDate: d("2026-09-01"), quantity: 10 },
      { batchId: "b", batchNumber: "B", expiryDate: d("2026-12-01"), quantity: 5 },
    ]);
    expect(r.shortfall).toBe(0);
  });

  it("allocations add up to exactly the issued quantity", () => {
    const r = allocateFefo(
      [batch({ id: "a", expiryDate: d("2026-09-01"), remainingQty: 10 }),
       batch({ id: "b", expiryDate: d("2026-12-01"), remainingQty: 20 })],
      15, { unbatchedAvailable: 0, asOf: NOW }
    );
    expect(allocationsReconcile(r.allocations, 15)).toBe(true);
  });

  it("takes only what it needs from a single batch", () => {
    const r = allocateFefo([batch({ remainingQty: 50 })], 7, { unbatchedAvailable: 0, asOf: NOW });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0].quantity).toBe(7);
  });

  it("puts undated batches last — an unknown expiry is not an early one", () => {
    const dated   = batch({ id: "a", batchNumber: "A", expiryDate: d("2026-12-01"), remainingQty: 5 });
    const undated = batch({ id: "z", batchNumber: "Z", expiryDate: null, remainingQty: 5 });
    const r = allocateFefo([undated, dated], 6, { unbatchedAvailable: 0, asOf: NOW });
    expect(r.allocations[0].batchId).toBe("a");
    expect(r.allocations[1].batchId).toBe("z");
  });

  it("skips empty batches", () => {
    const r = allocateFefo(
      [batch({ id: "empty", expiryDate: d("2026-08-15"), remainingQty: 0 }), batch({ id: "full", remainingQty: 5 })],
      3, { unbatchedAvailable: 0, asOf: NOW }
    );
    expect(r.allocations).toEqual([expect.objectContaining({ batchId: "full", quantity: 3 })]);
  });
});

describe("12. expired batches are excluded from normal issues", () => {
  const expired = batch({ id: "old", batchNumber: "OLD", expiryDate: d("2026-01-01"), remainingQty: 10 });
  const good    = batch({ id: "new", batchNumber: "NEW", expiryDate: d("2026-12-01"), remainingQty: 10 });

  it("does not consume expired stock for consumption", () => {
    const r = allocateFefo([expired, good], 5, { unbatchedAvailable: 0, asOf: NOW });
    expect(r.allocations).toEqual([expect.objectContaining({ batchId: "new", quantity: 5 })]);
  });

  it("reports a shortfall rather than reaching for expired stock", () => {
    const r = allocateFefo([expired], 5, { unbatchedAvailable: 0, asOf: NOW });
    expect(r.allocations).toEqual([]);
    expect(r.shortfall).toBe(5);
  });

  it("does consume expired stock when the issue is an expiry write-off", () => {
    const r = allocateFefo([expired, good], 5, { unbatchedAvailable: 0, allowExpired: true, asOf: NOW });
    expect(r.allocations).toEqual([expect.objectContaining({ batchId: "old", quantity: 5 })]);
  });

  it("only write-off reasons may reach expired stock", () => {
    expect(allowsExpiredBatches("EXPIRED")).toBe(true);
    expect(allowsExpiredBatches("DAMAGED")).toBe(true);
    expect(allowsExpiredBatches("WASTAGE")).toBe(true);
    expect(allowsExpiredBatches("CLINICAL_CONSUMPTION")).toBe(false);
    expect(allowsExpiredBatches("GENERAL_USAGE")).toBe(false);
  });

  it("knows what counts as expired", () => {
    expect(isExpired({ expiryDate: d("2026-01-01") }, NOW)).toBe(true);
    expect(isExpired({ expiryDate: d("2027-01-01") }, NOW)).toBe(false);
    expect(isExpired({ expiryDate: null }, NOW)).toBe(false);
  });
});

describe("13. unbatched fallback", () => {
  it("counts stock that no batch record accounts for", () => {
    expect(unbatchedAvailable(30, [batch({ remainingQty: 10 })])).toBe(20);
    expect(unbatchedAvailable(10, [batch({ remainingQty: 10 })])).toBe(0);
    expect(unbatchedAvailable(5, [batch({ remainingQty: 10 })])).toBe(0);
    expect(unbatchedAvailable(8, [])).toBe(8);
  });

  it("falls back to an explicit unbatched allocation after the batches run out", () => {
    const r = allocateFefo([batch({ id: "a", remainingQty: 4 })], 10, { unbatchedAvailable: 6, asOf: NOW });
    expect(r.allocations).toEqual([
      expect.objectContaining({ batchId: "a", quantity: 4 }),
      { batchId: null, batchNumber: null, expiryDate: null, quantity: 6 },
    ]);
    expect(r.shortfall).toBe(0);
  });

  it("keeps the unbatched allocation distinguishable from real batch stock", () => {
    const r = allocateFefo([], 5, { unbatchedAvailable: 5, asOf: NOW });
    expect(r.allocations[0].batchId).toBeNull();
    expect(r.allocations[0].batchNumber).toBeNull();
  });

  it("never invents stock that is not there", () => {
    const r = allocateFefo([batch({ remainingQty: 2 })], 10, { unbatchedAvailable: 3, asOf: NOW });
    expect(r.shortfall).toBe(5);
    expect(allocationsReconcile(r.allocations, 10)).toBe(false);
  });
});

describe("status machine and immutability", () => {
  it("walks consumption straight to posted", () => {
    expect(checkTransition("DRAFT", "POSTED").ok).toBe(true);
  });

  it("walks a write-off through approval", () => {
    expect(checkTransition("DRAFT", "PENDING_APPROVAL").ok).toBe(true);
    expect(checkTransition("PENDING_APPROVAL", "POSTED").ok).toBe(true);
    expect(checkTransition("PENDING_APPROVAL", "REJECTED").ok).toBe(true);
  });

  it("refuses to post twice", () => {
    const g = checkTransition("POSTED", "POSTED");
    expect(g).toMatchObject({ ok: false, status: 409 });
    expect((g as any).error).toMatch(/compensating/i);
  });

  it("keeps rejected issues closed and in history", () => {
    expect(checkTransition("REJECTED", "POSTED").ok).toBe(false);
  });

  it("only allows editing a draft", () => {
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("PENDING_APPROVAL")).toBe(false);
    expect(isEditable("POSTED")).toBe(false);
  });
});

describe("write-off approval", () => {
  const ctx = (over: any = {}) => ({
    picId: "user-pic", role: "CLINIC_MANAGER", userId: "user-pic",
    createdById: "user-store", submittedById: "user-store", ...over,
  });

  it("lets the clinic PIC approve", () => {
    expect(checkApprover(ctx()).ok).toBe(true);
  });

  it("refuses the person who raised it", () => {
    expect(checkApprover(ctx({ userId: "user-pic", createdById: "user-pic" })).ok).toBe(false);
  });

  it("refuses anyone who is not the PIC", () => {
    expect(checkApprover(ctx({ userId: "someone" }))).toMatchObject({ ok: false, status: 403 });
  });

  it("blocks when no PIC is configured", () => {
    expect(checkApprover(ctx({ picId: null, userId: "x" }))).toMatchObject({ ok: false, status: 422 });
  });
});

describe("6. idempotent posting key", () => {
  it("is deterministic per line", () => {
    expect(postingKeys.stockIssue("l1")).toBe("ISSUE:l1:OUT");
    expect(postingKeys.stockIssue("l1")).toBe(postingKeys.stockIssue("l1"));
  });

  it("does not collide with other sources", () => {
    const keys = [
      postingKeys.stockIssue("x"), postingKeys.stockTake("x"), postingKeys.doDispatch("x"),
      postingKeys.doReceipt("x"), postingKeys.poReceipt("x", 0),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
