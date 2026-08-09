/**
 * H-5 — supplier invoice price correction split.
 *
 * When a supplier invoices at a different price from the one the goods were
 * received at, the difference has to land somewhere. Part of it belongs to
 * stock still on hand (an inventory revaluation) and part to stock that has
 * already been consumed, transferred or written off (a purchase price
 * variance). Before this split existed the whole correction was applied to
 * remaining inventory, and was dropped entirely when nothing remained.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A WEIGHTED-AVERAGE VALUATION ALLOCATION, NOT PHYSICAL ATTRIBUTION.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The system values stock at weighted average and keeps no PO-level
 * consumption lineage: a consumption movement records which batch it depleted
 * but never which purchase order those units were bought under. There is
 * therefore no honest way to say "these 40 units on the shelf came from PO-123".
 *
 * So the inventory share is derived proportionally from the fungible pool, and
 * nothing here should be read as a claim about physical units, FIFO order, or
 * lot identity.
 *
 * ── The denominator ─────────────────────────────────────────────────────────
 *
 *   onHandRatio = clamp(currentQty / paidPoolQty, 0, 1)
 *
 * `paidPoolQty` is the total quantity received into this clinic+item through
 * paid purchase receipts (RECEIPT_PO). It is deliberately NOT the invoiced
 * quantity alone: when two purchase orders supply the same item, ratios taken
 * against each receipt separately would both claim the same physical stock and
 * the corrections would together over-adjust inventory. Measuring each receipt
 * against the shared pool keeps the total allocation coherent.
 *
 * RECEIPT_FOC is excluded from the pool by movement type, and free goods are
 * excluded from the correction base by the caller, because free goods were
 * never invoiced and must not attract a purchase price correction.
 *
 * ── The invariant ───────────────────────────────────────────────────────────
 *
 *   totalCorrection === inventoryCorrection + ppvCorrection    (exactly, 2dp)
 *
 * PPV is computed as the residual rather than independently, so rounding can
 * never make the two halves drift apart or quietly lose a cent.
 */

export interface PriceCorrectionInput {
  /** Unit cost the goods were originally received and posted at. */
  receiptUnitCost: number;
  /** Unit cost the supplier actually invoiced. */
  invoiceUnitCost: number;
  /** Invoiced quantity for this line. Caller must exclude FOC. */
  paidInvoicedQty: number;
  /** ClinicStock.quantity for this clinic+item, read under the row lock. */
  currentQty: number;
  /** Σ qtyIn of RECEIPT_PO for this clinic+item. Excludes RECEIPT_FOC. */
  paidPoolQty: number;
}

export interface PriceCorrectionSplit {
  totalCorrection: number;
  /** Portion allocated to stock on hand. Posted as REVALUATION. */
  inventoryCorrection: number;
  /** Portion allocated to stock already gone. Posted as PURCHASE_PRICE_VARIANCE. */
  ppvCorrection: number;
  /** The proportion used, retained for the movement note and for tests. */
  onHandRatio: number;
}

/**
 * Round to cents, normalising negative zero.
 *
 * A negative correction multiplied by a zero ratio yields -0, which survives
 * `toFixed(2)` as the string "-0.00" and would be written to the ledger that
 * way. Collapsing it to 0 keeps stored values clean without affecting any
 * non-zero result.
 */
const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

/**
 * Split a supplier invoice price correction into its inventory and PPV halves.
 *
 * Pure: no database access, so every branch is unit-testable.
 */
export function splitPriceCorrection(input: PriceCorrectionInput): PriceCorrectionSplit {
  const totalCorrection = round2(
    (input.invoiceUnitCost - input.receiptUnitCost) * input.paidInvoicedQty
  );

  // The clamp applies to the RATIO ONLY — never to the correction itself. A
  // price reduction produces a negative correction, and both halves must keep
  // that sign. Flooring the correction at zero here would silently swallow
  // supplier credits, which is precisely the bug H-5 exists to fix.
  const onHandRatio =
    input.paidPoolQty > 0
      ? Math.min(1, Math.max(0, input.currentQty / input.paidPoolQty))
      : 0;

  const inventoryCorrection = round2(totalCorrection * onHandRatio);

  // Residual — never recomputed from the ratio. This is what guarantees
  // inventoryCorrection + ppvCorrection === totalCorrection exactly.
  const ppvCorrection = round2(totalCorrection - inventoryCorrection);

  return { totalCorrection, inventoryCorrection, ppvCorrection, onHandRatio };
}

/**
 * Quantity of a PO line that the supplier actually invoiced.
 *
 * Receipts record free goods as quantity received beyond the ordered quantity
 * (see the RECEIPT_FOC split in the purchase order receipt route). Those units
 * never appear on the invoice, so the correction base is capped at what was
 * ordered.
 */
export function paidInvoicedQtyOf(line: { quantity: number; receivedQty: number | null }): number {
  return Math.max(0, Math.min(line.receivedQty ?? line.quantity, line.quantity));
}

export const PPV_NOTE =
  "Purchase price variance from supplier invoice correction allocated to consumed/non-inventory portion " +
  "(weighted-average allocation, not physical batch attribution)";

export const REVALUATION_NOTE =
  "Weighted-average inventory allocation of supplier invoice price correction " +
  "(proportional allocation, not physical batch attribution)";
