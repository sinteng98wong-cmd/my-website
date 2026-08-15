/**
 * Receipt guards for Purchase Orders and Pool Orders.
 *
 * These are the rules that stop the same goods being posted to stock twice.
 * They are pure so the state machine can be unit tested without a database,
 * and they mirror the explicit transition guards already used by the Delivery
 * Order state machine.
 */

export type POStatusName = "DRAFT" | "SUBMITTED" | "CONFIRMED" | "PARTIAL" | "RECEIVED" | "INVOICED" | "CANCELLED";

export type Guard = { ok: true } | { ok: false; status: number; error: string };

const ok: Guard = { ok: true };
const deny = (status: number, error: string): Guard => ({ ok: false, status, error });

/** Legal PO transitions. Anything not listed here is refused. */
const PO_TRANSITIONS: Record<POStatusName, POStatusName[]> = {
  DRAFT:     ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["CONFIRMED", "PARTIAL", "RECEIVED", "CANCELLED"],
  CONFIRMED: ["PARTIAL", "RECEIVED", "CANCELLED"],
  PARTIAL:   ["PARTIAL", "RECEIVED", "CANCELLED"],
  RECEIVED:  ["INVOICED"],
  INVOICED:  [],
  CANCELLED: [],
};

/** Statuses that post goods into stock when reached. */
export const RECEIPT_STATUSES: POStatusName[] = ["PARTIAL", "RECEIVED"];

export function isReceiptStatus(status: string): boolean {
  return RECEIPT_STATUSES.includes(status as POStatusName);
}

export function checkPoTransition(current: string, next: string): Guard {
  const allowed = PO_TRANSITIONS[current as POStatusName];
  if (!allowed) return deny(400, `Unknown purchase order status ${current}`);
  if (!allowed.includes(next as POStatusName))
    return deny(409, `Cannot move a ${current} purchase order to ${next}`);
  return ok;
}

export interface ReceivableLine {
  id: string;
  quantity: number;
  receivedQty: number | null;
  /** Quantity already posted to stock by an earlier receipt. */
  postedQty: number;
}

/**
 * How much of a line still has to be posted to stock.
 *
 * A line with no receivedQty entered is treated as fully received, matching
 * the previous behaviour. Re-posting an unchanged line yields 0, which is what
 * makes a repeated receipt a no-op instead of a double post. Receiving the
 * remainder after a PARTIAL posts only the difference.
 */
export function receiptDelta(line: ReceivableLine): number {
  const target = line.receivedQty ?? line.quantity;
  return target - line.postedQty;
}

/**
 * A downward correction would have to take goods back out of stock, which
 * needs a stock adjustment — refuse rather than silently mis-post.
 */
export function checkReceiptDeltas(lines: ReceivableLine[]): Guard {
  const negative = lines.filter((l) => receiptDelta(l) < 0);
  if (negative.length)
    return deny(
      409,
      `Received quantity is lower than what has already been posted to stock on ${negative.length} line(s). ` +
        `Reversing posted stock requires a stock adjustment.`
    );
  return ok;
}

/** True when a receipt would post nothing at all. */
export function isNoOpReceipt(lines: ReceivableLine[]): boolean {
  return lines.every((l) => receiptDelta(l) === 0);
}

/**
 * The resulting status is derived from the lines, never taken from the client:
 * a PO is RECEIVED only once every line has been posted in full.
 */
export function derivePoStatus(lines: { quantity: number; postedQty: number }[]): "PARTIAL" | "RECEIVED" {
  return lines.every((l) => l.postedQty >= l.quantity) ? "RECEIVED" : "PARTIAL";
}

/**
 * A line's received quantity may not be edited below what has already been
 * posted to stock, otherwise the posted baseline stops matching reality.
 */
export function checkReceivedQtyEdit(line: { postedQty: number }, receivedQty: number): Guard {
  if (receivedQty < line.postedQty)
    return deny(
      409,
      `${line.postedQty} already posted to stock for this line — received quantity cannot be set below it.`
    );
  return ok;
}

// ── Pool order direct receipt ───────────────────────────────────────────────

export interface PoolDirectReceiveContext {
  poolStatus: string;
  deliveryMode: string;
  /** null when the clinic is not a participant. */
  participant: { clinicId: string; receivedAt: Date | null } | null;
  /** Item ids the participant actually ordered. */
  participantItemIds: string[];
  requestedItemIds: string[];
  /** Caller carries group-wide clinic scope (see lib/clinic-access). */
  hasGlobalScope: boolean;
  userClinicIds: string[];
}

/**
 * Direct receipt is a one-shot action per participating clinic: once the
 * clinic has been marked received, posting again would duplicate the stock.
 * The caller must also belong to the clinic they are receiving into.
 */
export function checkPoolDirectReceive(ctx: PoolDirectReceiveContext): Guard {
  if (ctx.poolStatus !== "DELIVERED" || ctx.deliveryMode !== "DIRECT")
    return deny(400, "Only available for DELIVERED DIRECT pool orders");

  if (!ctx.participant) return deny(400, "Clinic is not a participant");

  if (!ctx.hasGlobalScope && !ctx.userClinicIds.includes(ctx.participant.clinicId))
    return deny(403, "Forbidden: you can only receive stock into your own clinic");

  if (ctx.participant.receivedAt)
    return deny(409, "This clinic has already received its share of the pool order");

  const foreign = ctx.requestedItemIds.filter((id) => !ctx.participantItemIds.includes(id));
  if (foreign.length)
    return deny(422, `${foreign.length} line(s) are not part of this clinic's pool order request`);

  return ok;
}
