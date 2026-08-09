/**
 * H-5 — supplier invoice price correction split.
 *
 * The governing invariant is that nothing disappears:
 *
 *   totalCorrection === inventoryCorrection + ppvCorrection
 *
 * exactly, at 2dp, in every scenario including price reductions and zero
 * stock. These tests exercise the pure allocation; ledger-level behaviour
 * (movement type, direction, quantity, posting keys) is asserted in
 * stock-ppv-ledger.test.ts.
 */
import {
  splitPriceCorrection,
  paidInvoicedQtyOf,
  PPV_NOTE,
  REVALUATION_NOTE,
  type PriceCorrectionInput,
} from "@/lib/stock-ppv";

/** The approved worked example: 100 @ RM5 received, 60 consumed, invoiced RM6. */
const APPROVED_EXAMPLE: PriceCorrectionInput = {
  receiptUnitCost: 5,
  invoiceUnitCost: 6,
  paidInvoicedQty: 100,
  currentQty:      40,
  paidPoolQty:     100,
};

/** The invariant, asserted the same way everywhere. */
function expectInvariant(s: { totalCorrection: number; inventoryCorrection: number; ppvCorrection: number }) {
  expect(s.inventoryCorrection + s.ppvCorrection).toBeCloseTo(s.totalCorrection, 10);
}

describe("splitPriceCorrection — approved business rule", () => {
  it("splits the approved example RM40 inventory / RM60 PPV", () => {
    const s = splitPriceCorrection(APPROVED_EXAMPLE);
    expect(s.totalCorrection).toBe(100);
    expect(s.inventoryCorrection).toBe(40);
    expect(s.ppvCorrection).toBe(60);
    expectInvariant(s);
  });

  // ── 1. One PO, all stock remains ─────────────────────────────────────────
  it("allocates the whole correction to inventory when nothing was consumed", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 100 });
    expect(s.inventoryCorrection).toBe(100);
    expect(s.ppvCorrection).toBe(0);
    expect(s.onHandRatio).toBe(1);
    expectInvariant(s);
  });

  // ── 2. One PO, part consumed ─────────────────────────────────────────────
  it("splits proportionally when stock is partly consumed", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 25 });
    expect(s.inventoryCorrection).toBe(25);
    expect(s.ppvCorrection).toBe(75);
    expectInvariant(s);
  });

  // ── 3. One PO, fully consumed ────────────────────────────────────────────
  it("sends the whole correction to PPV when nothing remains", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 0 });
    expect(s.inventoryCorrection).toBe(0);
    expect(s.ppvCorrection).toBe(100);
    expect(s.onHandRatio).toBe(0);
    expectInvariant(s);
  });

  // ── 4/5. Multiple POs for the same item ──────────────────────────────────
  it("measures each PO against the shared pool so two POs cannot double-claim the same stock", () => {
    // Two POs of 100 each, 40 units on hand. Each correction is RM100.
    const poolQty = 200;
    const a = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 40, paidPoolQty: poolQty });
    const b = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 40, paidPoolQty: poolQty });

    expect(a.onHandRatio).toBeCloseTo(0.2, 10);
    expect(a.inventoryCorrection).toBe(20);
    expect(b.inventoryCorrection).toBe(20);

    // The 40 held units are undervalued by RM1 each — RM40 in total, not RM80.
    expect(a.inventoryCorrection + b.inventoryCorrection).toBe(40);
    expectInvariant(a);
    expectInvariant(b);
  });

  it("keeps multi-PO stock fully allocated to inventory when nothing was consumed", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 200, paidPoolQty: 200 });
    expect(s.onHandRatio).toBe(1);
    expect(s.inventoryCorrection).toBe(100);
    expect(s.ppvCorrection).toBe(0);
    expectInvariant(s);
  });

  // ── 7. Multiple partial receipts from one PO ─────────────────────────────
  it("handles a pool built from several partial receipts of one PO", () => {
    // 60 + 40 posted in two partial receipts; 30 remain.
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 30, paidPoolQty: 100 });
    expect(s.inventoryCorrection).toBe(30);
    expect(s.ppvCorrection).toBe(70);
    expectInvariant(s);
  });

  // ── 8. Higher invoice price ──────────────────────────────────────────────
  it("produces a positive correction when the invoice price is higher", () => {
    const s = splitPriceCorrection(APPROVED_EXAMPLE);
    expect(s.totalCorrection).toBeGreaterThan(0);
    expect(s.inventoryCorrection).toBeGreaterThan(0);
    expect(s.ppvCorrection).toBeGreaterThan(0);
  });

  // ── 9. Lower invoice price — signs must survive ──────────────────────────
  it("preserves the negative sign on both halves when the invoice price is lower", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, invoiceUnitCost: 4 });
    expect(s.totalCorrection).toBe(-100);
    expect(s.inventoryCorrection).toBe(-40);
    expect(s.ppvCorrection).toBe(-60);
    expectInvariant(s);
  });

  it("never floors a negative correction to zero, even with no stock left", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, invoiceUnitCost: 4, currentQty: 0 });
    expect(s.inventoryCorrection).toBe(0);
    expect(s.ppvCorrection).toBe(-100); // the credit is retained in full
    expectInvariant(s);
  });

  it("never floors a negative correction when all stock remains", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, invoiceUnitCost: 4, currentQty: 100 });
    expect(s.inventoryCorrection).toBe(-100);
    expect(s.ppvCorrection).toBe(0);
    expectInvariant(s);
  });

  // ── 11. No price difference ──────────────────────────────────────────────
  it("produces nothing to post when the price is unchanged", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, invoiceUnitCost: 5 });
    expect(s.totalCorrection).toBe(0);
    expect(s.inventoryCorrection).toBe(0);
    expect(s.ppvCorrection).toBe(0);
  });
});

describe("splitPriceCorrection — ratio bounds and degenerate input", () => {
  it("clamps the ratio at 1 when stock exceeds the paid pool", () => {
    // Extra stock arrived by transfer, so on-hand exceeds what was purchased.
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 500, paidPoolQty: 100 });
    expect(s.onHandRatio).toBe(1);
    expect(s.inventoryCorrection).toBe(100);
    expect(s.ppvCorrection).toBe(0);
    expectInvariant(s);
  });

  it("treats an empty pool as fully consumed rather than dividing by zero", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: 40, paidPoolQty: 0 });
    expect(Number.isFinite(s.onHandRatio)).toBe(true);
    expect(s.onHandRatio).toBe(0);
    expect(s.ppvCorrection).toBe(100);
    expectInvariant(s);
  });

  it("never returns a negative ratio", () => {
    const s = splitPriceCorrection({ ...APPROVED_EXAMPLE, currentQty: -5, paidPoolQty: 100 });
    expect(s.onHandRatio).toBe(0);
    expectInvariant(s);
  });
});

describe("splitPriceCorrection — rounding", () => {
  it("keeps the invariant exact when the ratio does not divide cleanly", () => {
    // 1/3 of a correction that cannot be split evenly at 2dp.
    const s = splitPriceCorrection({
      receiptUnitCost: 1, invoiceUnitCost: 1.07, paidInvoicedQty: 7,
      currentQty: 1, paidPoolQty: 3,
    });
    expect(s.inventoryCorrection + s.ppvCorrection).toBe(s.totalCorrection);
  });

  it("keeps the invariant exact across a sweep of awkward ratios", () => {
    for (let held = 0; held <= 97; held++) {
      const s = splitPriceCorrection({
        receiptUnitCost: 3.33, invoiceUnitCost: 4.17, paidInvoicedQty: 97,
        currentQty: held, paidPoolQty: 97,
      });
      // Compared as integer cents so no float noise can mask a lost cent.
      const cents = (n: number) => Math.round(n * 100);
      expect(cents(s.inventoryCorrection) + cents(s.ppvCorrection)).toBe(cents(s.totalCorrection));
    }
  });

  it("keeps the invariant exact for negative corrections across the same sweep", () => {
    for (let held = 0; held <= 97; held++) {
      const s = splitPriceCorrection({
        receiptUnitCost: 4.17, invoiceUnitCost: 3.33, paidInvoicedQty: 97,
        currentQty: held, paidPoolQty: 97,
      });
      const cents = (n: number) => Math.round(n * 100);
      expect(cents(s.inventoryCorrection) + cents(s.ppvCorrection)).toBe(cents(s.totalCorrection));
      expect(s.totalCorrection).toBeLessThan(0);
    }
  });
});

// ── 6. FOC mixed with paid receipt ─────────────────────────────────────────
describe("paidInvoicedQtyOf — free goods never attract a price correction", () => {
  it("caps the base at the ordered quantity when free goods were received", () => {
    // 100 ordered, 120 received: 20 are free goods.
    expect(paidInvoicedQtyOf({ quantity: 100, receivedQty: 120 })).toBe(100);
  });

  it("uses the received quantity on a partial receipt", () => {
    expect(paidInvoicedQtyOf({ quantity: 100, receivedQty: 60 })).toBe(60);
  });

  it("treats a line with no receivedQty as fully received", () => {
    expect(paidInvoicedQtyOf({ quantity: 100, receivedQty: null })).toBe(100);
  });

  it("never returns a negative quantity", () => {
    expect(paidInvoicedQtyOf({ quantity: 100, receivedQty: -5 })).toBe(0);
  });

  it("excludes free goods from the correction, leaving FOC value untouched", () => {
    const line = { quantity: 100, receivedQty: 120 };
    const s = splitPriceCorrection({
      receiptUnitCost: 5, invoiceUnitCost: 6,
      paidInvoicedQty: paidInvoicedQtyOf(line),
      currentQty: 120, paidPoolQty: 100,
    });
    // RM1 × 100 invoiced units — the 20 free units contribute nothing.
    expect(s.totalCorrection).toBe(100);
    expectInvariant(s);
  });
});

describe("movement notes", () => {
  it("describe the split as a valuation allocation, not batch attribution", () => {
    for (const note of [PPV_NOTE, REVALUATION_NOTE]) {
      expect(note).toMatch(/not physical batch attribution/i);
    }
    expect(REVALUATION_NOTE).toMatch(/weighted-average/i);
    expect(PPV_NOTE).toMatch(/purchase price variance/i);
  });
});
