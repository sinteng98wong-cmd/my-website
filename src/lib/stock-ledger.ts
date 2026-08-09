/**
 * Stock Ledger — posting layer (Tier 3A, Phase 1).
 *
 * Every quantity or value change to ClinicStock posts a matching StockMovement
 * inside the same transaction and under the same row lock, so `balanceAfter`
 * is the true balance immediately after the mutation.
 *
 * Phase 1 is dual-write: ClinicStock stays the operational balance and the
 * ledger is not yet the reporting source of truth. The drift detector
 * (lib/stock-drift) is the acceptance gate for promoting it.
 *
 * The ledger is immutable. Nothing here updates or deletes a movement — a
 * database trigger refuses both — so corrections must post a compensating
 * movement carrying `reversalOfId`.
 */
import type { Prisma, StockDirection, StockMovementType, StockSourceType } from "@prisma/client";

export type LedgerClient = Prisma.TransactionClient;

/** Which way each movement type moves stock. */
const DIRECTIONS: Record<StockMovementType, StockDirection> = {
  OPENING_BALANCE:       "IN",
  RECEIPT_PO:            "IN",
  RECEIPT_FOC:           "IN",
  RECEIPT_POOL:          "IN",
  RETURN_SUPPLIER:       "OUT",
  TRANSFER_OUT:          "OUT",
  TRANSFER_IN:           "IN",
  TRANSFER_VARIANCE_OUT: "OUT",
  ADJUSTMENT_IN:         "IN",
  ADJUSTMENT_OUT:        "OUT",
  STOCK_TAKE_IN:         "IN",
  STOCK_TAKE_OUT:        "OUT",
  CONSUMPTION:           "OUT",
  CONSUMPTION_REVERSAL:  "IN",
  WRITE_OFF_EXPIRY:      "OUT",
  WRITE_OFF_DAMAGE:      "OUT",
  REVALUATION:           "NONE",
};

export function directionFor(type: StockMovementType): StockDirection {
  return DIRECTIONS[type];
}

/** Accounting period a movement falls into. */
export function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Signed value impact of a movement. Stock in adds value at the incoming cost;
 * stock out removes value at the weighted-average cost at the time of issue.
 */
export function valueDeltaFor(direction: StockDirection, qtyIn: number, qtyOut: number, unitCost: number): number {
  if (direction === "IN")  return round2(qtyIn * unitCost);
  if (direction === "OUT") return round2(-(qtyOut * unitCost));
  return 0;
}

// ── Posting keys ────────────────────────────────────────────────────────────
// Deterministic, so replaying a posting collides on the unique index rather
// than double-posting the goods. Each key encodes the document line and the
// step within it, which is what makes partial receipts safe to repeat.

export const postingKeys = {
  poReceipt:   (poLineId: string, postedBefore: number) => `PO:${poLineId}:RECEIPT:${postedBefore}`,
  poFoc:       (poLineId: string, postedBefore: number) => `PO:${poLineId}:FOC:${postedBefore}`,
  doDispatch:  (doLineId: string) => `DO:${doLineId}:TRANSFER_OUT`,
  doReceipt:   (doLineId: string) => `DO:${doLineId}:TRANSFER_IN`,
  doVariance:  (doLineId: string) => `DO:${doLineId}:VARIANCE`,
  poolCentral: (poolId: string, itemId: string) => `POOL:${poolId}:${itemId}:RECEIPT`,
  poolDirect:  (participantId: string, itemId: string) => `POOLD:${participantId}:${itemId}:RECEIPT`,
  revalueDo:   (invoiceRef: string, doLineId: string) => `REVAL:DO:${invoiceRef}:${doLineId}`,
  revaluePo:   (invoiceRef: string, poLineId: string) => `REVAL:PO:${invoiceRef}:${poLineId}`,
  opening:     (clinicId: string, itemId: string) => `OPENING:${clinicId}:${itemId}`,
};

// ── Posting ─────────────────────────────────────────────────────────────────

export interface LedgerSource {
  sourceType:    StockSourceType;
  sourceId?:     string | null;
  sourceLineId?: string | null;
  reference:     string;
  userId?:       string | null;
  movementAt?:   Date;
  note?:         string | null;
}

export interface PostMovementInput extends LedgerSource {
  clinicId:     string;
  itemId:       string;
  batchId?:     string | null;
  type:         StockMovementType;
  /** Magnitude of the movement. Direction is derived from the type. */
  quantity:     number;
  unitCost:     number;
  postingKey:   string;
  /** Post-mutation state, captured under the row lock by the caller. */
  balanceAfter: number;
  avgCostAfter: number;
  /** Revaluations carry their value impact explicitly (quantity is zero). */
  valueDelta?:  number;
  reversalOfId?: string | null;
}

/**
 * Append one movement. Never call outside the transaction that performed the
 * corresponding ClinicStock mutation — the two must commit together.
 */
export async function postMovement(client: LedgerClient, input: PostMovementInput) {
  const direction = directionFor(input.type);
  const qtyIn  = direction === "IN"  ? input.quantity : 0;
  const qtyOut = direction === "OUT" ? input.quantity : 0;
  const unitCost = round4(input.unitCost);
  const valueDelta = input.valueDelta !== undefined
    ? round2(input.valueDelta)
    : valueDeltaFor(direction, qtyIn, qtyOut, unitCost);
  const movementAt = input.movementAt ?? new Date();
  const avgCostAfter = round4(input.avgCostAfter);

  return client.stockMovement.create({
    data: {
      clinicId:     input.clinicId,
      itemId:       input.itemId,
      batchId:      input.batchId ?? null,
      type:         input.type,
      direction,
      qtyIn,
      qtyOut,
      unitCost:     unitCost.toFixed(4),
      totalCost:    Math.abs(round2(valueDelta)).toFixed(2),
      valueDelta:   valueDelta.toFixed(2),
      balanceAfter: input.balanceAfter,
      valueAfter:   round2(input.balanceAfter * avgCostAfter).toFixed(2),
      avgCostAfter: avgCostAfter.toFixed(4),
      sourceType:   input.sourceType,
      sourceId:     input.sourceId ?? null,
      sourceLineId: input.sourceLineId ?? null,
      reference:    input.reference,
      postingKey:   input.postingKey,
      reversalOfId: input.reversalOfId ?? null,
      note:         input.note ?? null,
      movementAt,
      period:       periodOf(movementAt),
      createdById:  input.userId ?? null,
    },
  });
}

/** True when an error is a unique-constraint collision on postingKey. */
export function isDuplicatePosting(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string } };
  if (err?.code !== "P2002") return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return fields.includes("postingKey");
}
