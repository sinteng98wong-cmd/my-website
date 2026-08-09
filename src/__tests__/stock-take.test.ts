import {
  EDITABLE_STATUSES,
  REASONS,
  checkApprover,
  checkSubmittable,
  checkTransition,
  detectDrift,
  isEditable,
  movementTypeFor,
  totalsOf,
  varianceOf,
  varianceValue,
  type CountLine,
} from "@/lib/stock-take";
import { postingKeys } from "@/lib/stock-ledger";

const line = (over: Partial<CountLine> = {}): CountLine => ({
  id: "l1", systemQty: 10, physicalQty: 10, avgUnitCost: 5, reason: null, ...over,
});

describe("variance", () => {
  it("is physical minus system", () => {
    expect(varianceOf({ systemQty: 10, physicalQty: 13 })).toBe(3);
    expect(varianceOf({ systemQty: 10, physicalQty: 7 })).toBe(-3);
    expect(varianceOf({ systemQty: 10, physicalQty: 10 })).toBe(0);
  });

  it("is unknown until the line is counted", () => {
    expect(varianceOf({ systemQty: 10, physicalQty: null })).toBeNull();
  });

  it("values at the average cost", () => {
    expect(varianceValue(3, 5)).toBe(15);
    expect(varianceValue(-3, 5)).toBe(-15);
    expect(varianceValue(2, 4.1667)).toBe(8.33);
  });

  it("totals only the counted lines", () => {
    const t = totalsOf([
      line({ physicalQty: 13 }),                    // +3 → +15
      line({ id: "l2", physicalQty: 7 }),           // -3 → -15
      line({ id: "l3", physicalQty: null }),        // uncounted
    ]);
    expect(t).toEqual({ varianceQty: 0, varianceValue: 0, countedLines: 2 });
  });
});

describe("3/4/5. movement type per variance direction", () => {
  it("posts ADJUSTMENT_IN when the physical count is higher", () => {
    expect(movementTypeFor(3)).toBe("ADJUSTMENT_IN");
  });

  it("posts ADJUSTMENT_OUT when the physical count is lower", () => {
    expect(movementTypeFor(-3)).toBe("ADJUSTMENT_OUT");
  });

  it("posts nothing when the count matches", () => {
    expect(movementTypeFor(0)).toBeNull();
  });
});

describe("6. reason is mandatory for a variance", () => {
  it("refuses to submit a variance with no reason", () => {
    const g = checkSubmittable([line({ physicalQty: 13 })]);
    expect(g).toMatchObject({ ok: false, status: 422 });
    expect((g as any).error).toMatch(/reason/i);
  });

  it("accepts a variance once a reason is given", () => {
    expect(checkSubmittable([line({ physicalQty: 13, reason: "FOUND_STOCK" })]).ok).toBe(true);
  });

  it("does not require a reason when there is no variance", () => {
    expect(checkSubmittable([line({ physicalQty: 10 })]).ok).toBe(true);
  });

  it("refuses to submit an uncounted sheet", () => {
    expect(checkSubmittable([line({ physicalQty: null })])).toMatchObject({ ok: false, status: 422 });
  });

  it("refuses an empty sheet and a negative count", () => {
    expect(checkSubmittable([])).toMatchObject({ ok: false, status: 422 });
    expect(checkSubmittable([line({ physicalQty: -1 })])).toMatchObject({ ok: false, status: 422 });
  });

  it("offers the expected reason vocabulary", () => {
    expect(REASONS).toEqual([
      "STOCK_COUNT_VARIANCE", "DAMAGED", "EXPIRED", "WASTAGE",
      "FOUND_STOCK", "DATA_CORRECTION", "OTHER",
    ]);
  });
});

describe("7. PIC approval and separation of duties", () => {
  const ctx = (over: any = {}) => ({
    picId: "user-pic", role: "CLINIC_MANAGER", userId: "user-pic",
    createdById: "user-counter", submittedById: "user-counter", ...over,
  });

  it("lets the clinic's PIC approve", () => {
    expect(checkApprover(ctx()).ok).toBe(true);
  });

  it("refuses anyone who is not the PIC", () => {
    expect(checkApprover(ctx({ userId: "user-other" }))).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses the person who raised the count, even if they are the PIC", () => {
    const g = checkApprover(ctx({ userId: "user-pic", createdById: "user-pic" }));
    expect(g).toMatchObject({ ok: false, status: 403 });
    expect((g as any).error).toMatch(/raised or submitted/i);
  });

  it("refuses the person who submitted it", () => {
    expect(checkApprover(ctx({ userId: "user-pic", submittedById: "user-pic" })).ok).toBe(false);
  });

  it("refuses Super Admin approving their own count", () => {
    expect(checkApprover(ctx({ role: "SUPER_ADMIN", userId: "u1", createdById: "u1", picId: null })).ok).toBe(false);
  });

  it("lets Super Admin stand in for someone else's count", () => {
    expect(checkApprover(ctx({ role: "SUPER_ADMIN", userId: "admin", picId: null })).ok).toBe(true);
  });

  it("blocks with a 422 when the clinic has no PIC configured", () => {
    expect(checkApprover(ctx({ picId: null, userId: "someone", role: "CLINIC_MANAGER" })))
      .toMatchObject({ ok: false, status: 422 });
  });
});

describe("8. idempotent approval", () => {
  it("derives one deterministic posting key per line", () => {
    expect(postingKeys.stockTake("line-1")).toBe("STOCKTAKE:line-1:ADJUSTMENT");
    expect(postingKeys.stockTake("line-1")).toBe(postingKeys.stockTake("line-1"));
  });

  it("keeps lines apart so one sheet cannot collide with itself", () => {
    expect(postingKeys.stockTake("line-1")).not.toBe(postingKeys.stockTake("line-2"));
  });

  it("does not collide with any other posting source", () => {
    const keys = [
      postingKeys.stockTake("x"), postingKeys.doDispatch("x"), postingKeys.doReceipt("x"),
      postingKeys.doVariance("x"), postingKeys.poReceipt("x", 0), postingKeys.poFoc("x", 0),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses a second approval of an approved take", () => {
    expect(checkTransition("APPROVED", "APPROVED")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("9. approved and rejected takes are immutable", () => {
  it("allows counting only while the take is open", () => {
    expect(EDITABLE_STATUSES).toEqual(["DRAFT", "RECOUNT_REQUIRED"]);
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("RECOUNT_REQUIRED")).toBe(true);
    expect(isEditable("SUBMITTED")).toBe(false);
    expect(isEditable("APPROVED")).toBe(false);
    expect(isEditable("REJECTED")).toBe(false);
  });

  it("refuses to reopen an approved take, pointing at a new adjustment", () => {
    const g = checkTransition("APPROVED", "SUBMITTED");
    expect(g).toMatchObject({ ok: false, status: 409 });
    expect((g as any).error).toMatch(/new adjustment/i);
  });

  it("keeps a rejected take closed but in history", () => {
    expect(checkTransition("REJECTED", "SUBMITTED")).toMatchObject({ ok: false, status: 409 });
    expect(checkTransition("REJECTED", "APPROVED").ok).toBe(false);
  });

  it("walks the normal path", () => {
    expect(checkTransition("DRAFT", "SUBMITTED").ok).toBe(true);
    expect(checkTransition("SUBMITTED", "APPROVED").ok).toBe(true);
    expect(checkTransition("SUBMITTED", "REJECTED").ok).toBe(true);
    expect(checkTransition("SUBMITTED", "RECOUNT_REQUIRED").ok).toBe(true);
    expect(checkTransition("RECOUNT_REQUIRED", "SUBMITTED").ok).toBe(true);
  });

  it("refuses to skip review", () => {
    expect(checkTransition("DRAFT", "APPROVED").ok).toBe(false);
  });
});

describe("10. stock moving after the count blocks approval", () => {
  const lines = [
    { id: "l1", itemId: "item-1", systemQty: 10 },
    { id: "l2", itemId: "item-2", systemQty: 5 },
  ];

  it("detects nothing when stock is unchanged", () => {
    expect(detectDrift(lines, new Map([["item-1", 10], ["item-2", 5]]))).toEqual([]);
  });

  it("detects a line whose system quantity moved", () => {
    const d = detectDrift(lines, new Map([["item-1", 12], ["item-2", 5]]));
    expect(d).toEqual([{ lineId: "l1", itemId: "item-1", countedSystemQty: 10, currentSystemQty: 12 }]);
  });

  it("detects a decrease as well as an increase", () => {
    expect(detectDrift(lines, new Map([["item-1", 8], ["item-2", 5]]))[0].currentSystemQty).toBe(8);
  });

  it("treats a vanished position as zero rather than ignoring it", () => {
    const d = detectDrift(lines, new Map([["item-2", 5]]));
    expect(d).toEqual([{ lineId: "l1", itemId: "item-1", countedSystemQty: 10, currentSystemQty: 0 }]);
  });

  it("reports every drifted line, not just the first", () => {
    expect(detectDrift(lines, new Map([["item-1", 1], ["item-2", 2]]))).toHaveLength(2);
  });
});
