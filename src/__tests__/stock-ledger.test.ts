import {
  directionFor,
  isDuplicatePosting,
  periodOf,
  postingKeys,
  valueDeltaFor,
} from "@/lib/stock-ledger";
import {
  evaluateLedgerAnomalies,
  evaluatePositions,
  type PositionRow,
} from "@/lib/stock-drift";

describe("movement direction", () => {
  it("classifies receipts as stock in", () => {
    for (const t of ["OPENING_BALANCE", "RECEIPT_PO", "RECEIPT_FOC", "RECEIPT_POOL", "TRANSFER_IN"] as const) {
      expect(directionFor(t)).toBe("IN");
    }
  });

  it("classifies issues, transfers out and write-offs as stock out", () => {
    for (const t of [
      "TRANSFER_OUT", "TRANSFER_VARIANCE_OUT", "CONSUMPTION",
      "WRITE_OFF_EXPIRY", "WRITE_OFF_DAMAGE", "RETURN_SUPPLIER", "ADJUSTMENT_OUT", "STOCK_TAKE_OUT",
    ] as const) {
      expect(directionFor(t)).toBe("OUT");
    }
  });

  it("treats revaluation as a value-only movement", () => {
    expect(directionFor("REVALUATION")).toBe("NONE");
  });

  it("makes a correction move opposite to what it corrects", () => {
    expect(directionFor("CONSUMPTION")).toBe("OUT");
    expect(directionFor("CONSUMPTION_REVERSAL")).toBe("IN");
    expect(directionFor("ADJUSTMENT_IN")).toBe("IN");
    expect(directionFor("ADJUSTMENT_OUT")).toBe("OUT");
  });
});

describe("value impact", () => {
  it("adds value at the incoming cost", () => {
    expect(valueDeltaFor("IN", 10, 0, 5)).toBe(50);
  });

  it("removes value at the average cost in force", () => {
    expect(valueDeltaFor("OUT", 0, 4, 2.5)).toBe(-10);
  });

  it("gives free goods no value", () => {
    expect(valueDeltaFor("IN", 12, 0, 0)).toBe(0);
  });

  it("gives a quantity-less movement no derived value", () => {
    expect(valueDeltaFor("NONE", 0, 0, 7)).toBe(0);
  });
});

describe("period stamping", () => {
  it("uses the UTC year and month", () => {
    expect(periodOf(new Date("2026-08-09T12:00:00Z"))).toBe("2026-08");
    expect(periodOf(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(periodOf(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("posting keys", () => {
  it("distinguishes each step of a partial receipt", () => {
    expect(postingKeys.poReceipt("line-1", 0)).toBe("PO:line-1:RECEIPT:0");
    expect(postingKeys.poReceipt("line-1", 5)).toBe("PO:line-1:RECEIPT:5");
    expect(postingKeys.poReceipt("line-1", 0)).not.toBe(postingKeys.poReceipt("line-1", 5));
  });

  it("is stable, so a replayed posting collides instead of double-posting", () => {
    expect(postingKeys.poReceipt("line-1", 0)).toBe(postingKeys.poReceipt("line-1", 0));
    expect(postingKeys.doDispatch("dl-1")).toBe(postingKeys.doDispatch("dl-1"));
  });

  it("keeps paid and free portions of one line apart", () => {
    expect(postingKeys.poReceipt("line-1", 0)).not.toBe(postingKeys.poFoc("line-1", 0));
  });

  it("keeps the three delivery-order postings apart", () => {
    const keys = [postingKeys.doDispatch("dl-1"), postingKeys.doReceipt("dl-1"), postingKeys.doVariance("dl-1")];
    expect(new Set(keys).size).toBe(3);
  });

  it("keeps pool receipts unique per clinic and item", () => {
    expect(postingKeys.poolCentral("pool-1", "item-1")).not.toBe(postingKeys.poolCentral("pool-1", "item-2"));
    expect(postingKeys.poolDirect("part-a", "item-1")).not.toBe(postingKeys.poolDirect("part-b", "item-1"));
  });

  it("keeps revaluations unique per invoice and line", () => {
    expect(postingKeys.revaluePo("INV-1", "l1")).not.toBe(postingKeys.revaluePo("INV-2", "l1"));
    expect(postingKeys.revalueDo("INV-1", "l1")).not.toBe(postingKeys.revaluePo("INV-1", "l1"));
  });
});

describe("duplicate posting detection", () => {
  it("recognises a postingKey collision", () => {
    expect(isDuplicatePosting({ code: "P2002", meta: { target: ["postingKey"] } })).toBe(true);
  });

  it("ignores other unique violations and other errors", () => {
    expect(isDuplicatePosting({ code: "P2002", meta: { target: ["sku"] } })).toBe(false);
    expect(isDuplicatePosting({ code: "P2025" })).toBe(false);
    expect(isDuplicatePosting(new Error("boom"))).toBe(false);
  });
});

// ── Drift detection ─────────────────────────────────────────────────────────

const now = new Date("2026-08-09T10:00:00Z");

/**
 * A healthy position. Batch quantity and ledger value default to whatever
 * makes the row consistent, so a test only has to state the one thing it is
 * breaking.
 */
const position = (over: Partial<PositionRow> = {}): PositionRow => {
  const row = {
    clinicId: "clinic-a", clinicName: "Clinic A",
    itemId: "item-1", itemName: "Gloves",
    quantity: 10, avgUnitCost: 5 as number | null,
    stockUpdatedAt: now,
    movementCount: 1,
    lastBalanceAfter: 10 as number | null, lastAvgCostAfter: 5 as number | null,
    lastMovementAt: now as Date | null,
    sumIn: 10, sumOut: 0,
    firstNet: 10 as number | null, firstBalanceAfter: 10 as number | null,
    ...over,
  };
  return {
    ...row,
    batchQty:        over.batchQty        ?? row.quantity,
    negativeBatches: over.negativeBatches ?? 0,
    ledgerValue:     over.ledgerValue     ?? row.quantity * (row.avgUnitCost ?? 0),
  };
};

const codes = (rows: PositionRow[]) => evaluatePositions(rows).map((f) => f.code);

describe("drift: ClinicStock vs ledger", () => {
  it("reports nothing when the two agree", () => {
    expect(evaluatePositions([position()])).toEqual([]);
  });

  it("catches a quantity that does not match the ledger balance", () => {
    const f = evaluatePositions([position({ quantity: 13 })]);
    expect(f.map((x) => x.code)).toContain("BALANCE_MISMATCH");
    expect(f[0].expected).toBe(10);
    expect(f[0].actual).toBe(13);
  });

  it("catches a broken opening + in - out = closing reconciliation", () => {
    expect(codes([position({ quantity: 12, lastBalanceAfter: 12, sumIn: 10, sumOut: 0 })]))
      .toContain("SUM_MISMATCH");
  });

  it("reconciles a position built from several movements", () => {
    // opening 4, +10 in, -6 out → 8
    expect(evaluatePositions([position({
      quantity: 8, movementCount: 3, lastBalanceAfter: 8,
      sumIn: 10, sumOut: 6, firstNet: 4, firstBalanceAfter: 8,
    })])).toEqual([]);
  });

  it("flags stock predating the ledger as informational, not an error", () => {
    const f = evaluatePositions([position({ movementCount: 0, lastBalanceAfter: null, lastAvgCostAfter: null,
      lastMovementAt: null, sumIn: 0, sumOut: 0, firstNet: null, firstBalanceAfter: null })]);
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe("MISSING_MOVEMENTS");
    expect(f[0].severity).toBe("INFO");
  });

  it("says nothing about an empty position with no history", () => {
    expect(evaluatePositions([position({
      quantity: 0, movementCount: 0, lastBalanceAfter: null, lastAvgCostAfter: null,
      lastMovementAt: null, sumIn: 0, sumOut: 0, firstNet: null, firstBalanceAfter: null,
    })])).toEqual([]);
  });

  it("catches negative stock", () => {
    expect(codes([position({ quantity: -2, lastBalanceAfter: -2 })])).toContain("NEGATIVE_BALANCE");
  });

  it("catches a mutation that bypassed the ledger", () => {
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(codes([position({ stockUpdatedAt: later })])).toContain("UNEXPLAINED_CHANGE");
  });

  it("tolerates the write ordering inside a single transaction", () => {
    const slightlyLater = new Date(now.getTime() + 500);
    expect(codes([position({ stockUpdatedAt: slightlyLater })])).not.toContain("UNEXPLAINED_CHANGE");
  });

  it("catches costing that drifted from the ledger", () => {
    expect(codes([position({ avgUnitCost: 7 })])).toContain("AVG_COST_MISMATCH");
  });

  it("tolerates sub-cent rounding on cost", () => {
    expect(codes([position({ avgUnitCost: 5.001 })])).not.toContain("AVG_COST_MISMATCH");
  });
});

describe("18-22. drift: batch quantities and value", () => {
  it("18. says nothing about a position whose batches cover it exactly", () => {
    expect(evaluatePositions([position({ quantity: 10, batchQty: 10 })])).toEqual([]);
  });

  it("19. catches batches claiming more stock than the position holds", () => {
    const f = evaluatePositions([position({ quantity: 10, batchQty: 14 })]);
    const over = f.find((x) => x.code === "BATCH_OVER_ALLOCATION")!;
    expect(over.severity).toBe("ERROR");
    expect(over.expected).toBe(10);
    expect(over.actual).toBe(14);
  });

  it("19. catches a batch driven below zero", () => {
    const f = evaluatePositions([position({ negativeBatches: 1 })]);
    expect(f.find((x) => x.code === "BATCH_NEGATIVE")?.severity).toBe("ERROR");
  });

  it("21. treats stock with no batch behind it as informational, not an error", () => {
    const f = evaluatePositions([position({ quantity: 10, batchQty: 4 })]);
    const info = f.find((x) => x.code === "UNBATCHED_STOCK")!;
    expect(info.severity).toBe("INFO");
    expect(f.some((x) => x.severity === "ERROR")).toBe(false);
  });

  it("21. does not report unbatched stock twice for a pre-ledger position", () => {
    const f = evaluatePositions([position({
      quantity: 10, batchQty: 0, movementCount: 0, lastBalanceAfter: null,
      lastAvgCostAfter: null, lastMovementAt: null, sumIn: 0, sumOut: 0,
      firstNet: null, firstBalanceAfter: null,
    })]);
    expect(f.map((x) => x.code)).toEqual(["MISSING_MOVEMENTS"]);
  });

  it("20. catches a ledger value that does not reconcile to stock value", () => {
    // A second revaluation of the same receipt: value posted, quantity not.
    const f = evaluatePositions([position({ quantity: 10, avgUnitCost: 5, ledgerValue: 75 })]);
    const v = f.find((x) => x.code === "VALUE_MISMATCH")!;
    expect(v.severity).toBe("ERROR");
    expect(v.expected).toBe(50);
    expect(v.actual).toBe(75);
  });

  it("20. tolerates the Decimal(10,2) vs Decimal(12,4) rounding gap", () => {
    // 10 units whose true average is 5.0049 — stored as 5.00, ledger as 50.05.
    expect(codes([position({ quantity: 10, avgUnitCost: 5, ledgerValue: 50.05 })]))
      .not.toContain("VALUE_MISMATCH");
  });

  it("20. skips the value check where the ledger never saw the opening value", () => {
    // opening 4 units the ledger has no cost history for.
    expect(codes([position({
      quantity: 8, movementCount: 3, lastBalanceAfter: 8,
      sumIn: 10, sumOut: 6, firstNet: 4, firstBalanceAfter: 8, ledgerValue: 12,
    })])).not.toContain("VALUE_MISMATCH");
  });

  it("22. still reports a ledger quantity mismatch as an error", () => {
    const f = evaluatePositions([position({ quantity: 13, batchQty: 13, ledgerValue: 65 })]);
    expect(f.find((x) => x.code === "BALANCE_MISMATCH")?.severity).toBe("ERROR");
  });
});

describe("drift: ledger internal invariants", () => {
  const empty = {
    duplicateKeys: [], invalidDirection: [], negativeMovements: [],
    brokenRunningBalance: [], doubleReversals: [],
  };

  it("reports nothing on a healthy ledger", () => {
    expect(evaluateLedgerAnomalies(empty)).toEqual([]);
  });

  it("catches a duplicated posting key", () => {
    const f = evaluateLedgerAnomalies({ ...empty, duplicateKeys: [{ postingKey: "PO:l1:RECEIPT:0", count: 2 }] });
    expect(f[0].code).toBe("DUPLICATE_POSTING_KEY");
    expect(f[0].severity).toBe("ERROR");
  });

  it("catches quantities that disagree with direction", () => {
    const f = evaluateLedgerAnomalies({ ...empty,
      invalidDirection: [{ id: "m1", type: "RECEIPT_PO", direction: "IN", qtyIn: 0, qtyOut: 5 }] });
    expect(f[0].code).toBe("INVALID_DIRECTION");
  });

  it("catches a negative balance recorded in the ledger", () => {
    const f = evaluateLedgerAnomalies({ ...empty,
      negativeMovements: [{ id: "m1", clinicId: "c", itemId: "i", balanceAfter: -3 }] });
    expect(f[0].code).toBe("NEGATIVE_BALANCE");
  });

  it("catches a break in the running balance", () => {
    const f = evaluateLedgerAnomalies({ ...empty,
      brokenRunningBalance: [{ id: "m2", clinicId: "c", itemId: "i", expected: 10, actual: 12 }] });
    expect(f[0].code).toBe("RUNNING_BALANCE_BREAK");
    expect(f[0].expected).toBe(10);
  });

  it("catches a movement reversed more than once", () => {
    const f = evaluateLedgerAnomalies({ ...empty, doubleReversals: [{ reversalOfId: "m1", count: 2 }] });
    expect(f[0].code).toBe("DOUBLE_REVERSAL");
  });

  it("reports every distinct problem it finds", () => {
    const f = evaluateLedgerAnomalies({
      duplicateKeys: [{ postingKey: "k", count: 2 }],
      invalidDirection: [{ id: "m1", type: "RECEIPT_PO", direction: "IN", qtyIn: 0, qtyOut: 1 }],
      negativeMovements: [{ id: "m2", clinicId: "c", itemId: "i", balanceAfter: -1 }],
      brokenRunningBalance: [{ id: "m3", clinicId: "c", itemId: "i", expected: 1, actual: 2 }],
      doubleReversals: [{ reversalOfId: "m4", count: 3 }],
    });
    expect(f).toHaveLength(5);
    expect(f.every((x) => x.severity === "ERROR")).toBe(true);
  });
});
