/**
 * Opening Balance — rules.
 *
 * Establishes a clinic's first ledger position. Everything here is pure so the
 * state machine and the cost rules can be tested without a database; the
 * posting itself lives in services/stock-opening.service and goes through
 * receiveStock like every other receipt.
 *
 * ── Why cost is mandatory ───────────────────────────────────────────────────
 *
 * There is no cost basis anywhere else in the system to fall back on:
 * StockItem carries no price, and a clinic with no movements has no average.
 * An opening balance posted at zero cost would make the drift detector
 * reconcile 0 against 0 and report clean while the valuation is meaningless —
 * a green light that verifies nothing. So a positive quantity without a
 * positive cost is refused outright rather than defaulted.
 */

export type OpeningStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type Guard = { ok: true } | { ok: false; status: number; error: string };

const ok: Guard = { ok: true };
const deny = (status: number, error: string): Guard => ({ ok: false, status, error });

/** Legal transitions. Anything not listed is refused. */
const TRANSITIONS: Record<OpeningStatus, OpeningStatus[]> = {
  DRAFT:     ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED", "DRAFT"], // rejection returns it to the branch
  APPROVED:  [],                                 // terminal: the ledger is written
  REJECTED:  ["DRAFT"],
};

export function checkTransition(current: string, next: string): Guard {
  const allowed = TRANSITIONS[current as OpeningStatus];
  if (!allowed) return deny(400, `Unknown opening balance status ${current}`);
  if (!allowed.includes(next as OpeningStatus))
    return deny(409, `Cannot move a ${current} opening balance to ${next}`);
  return ok;
}

/** Only a draft may be edited. Once submitted the numbers are under review. */
export function isEditable(status: string): boolean {
  return status === "DRAFT";
}

// ── Line validation ─────────────────────────────────────────────────────────

export interface OpeningLine {
  id?: string;
  itemId: string;
  quantity: number | null;
  unitCost: number | null;
  batchNumber?: string | null;
  expiryDate?: Date | string | null;
}

/**
 * A line is postable when it carries a positive quantity and a positive cost.
 *
 * Zero is a legitimate answer — the branch counted and found none — but it
 * produces no ledger movement, so it is completed rather than postable.
 */
export function isPostable(line: OpeningLine): boolean {
  return (line.quantity ?? 0) > 0 && (line.unitCost ?? 0) > 0;
}

export function lineValue(line: OpeningLine): number {
  if (!isPostable(line)) return 0;
  return Math.round((line.quantity! * line.unitCost!) * 100) / 100;
}

/**
 * Validate one line for submission.
 *
 * A blank line is fine in a draft but not at submission: the branch either
 * states a quantity or removes the item from the document.
 */
export function checkLine(line: OpeningLine, itemName = "item"): Guard {
  const q = line.quantity;
  const c = line.unitCost;

  if (q === null || q === undefined)
    return deny(422, `${itemName}: opening quantity is required`);
  if (!Number.isInteger(q))
    return deny(422, `${itemName}: opening quantity must be a whole number`);
  if (q < 0)
    return deny(422, `${itemName}: opening quantity cannot be negative`);

  if (q === 0) {
    // Nothing to value, so cost is not required — and no movement is posted.
    return ok;
  }

  if (c === null || c === undefined)
    return deny(422, `${itemName}: unit cost is required when the opening quantity is above zero`);
  if (!(c > 0))
    return deny(422, `${itemName}: unit cost must be greater than zero`);
  if (!Number.isFinite(c))
    return deny(422, `${itemName}: unit cost is not a valid number`);

  return ok;
}

/** Validate the whole document for submission. */
export function checkSubmittable(
  lines: OpeningLine[],
  names: Map<string, string> = new Map()
): Guard {
  if (lines.length === 0)
    return deny(422, "Add at least one item before submitting");

  for (const line of lines) {
    const guard = checkLine(line, names.get(line.itemId) ?? "item");
    if (!guard.ok) return guard;
  }

  if (!lines.some(isPostable))
    return deny(
      422,
      "Every line is zero. An opening balance with nothing to post would create no ledger position — " +
        "enter the counted quantities, or discard this document."
    );

  return ok;
}

export function totalsOf(lines: OpeningLine[]): { quantity: number; value: number } {
  let quantity = 0;
  let value = 0;
  for (const line of lines) {
    quantity += line.quantity ?? 0;
    value += lineValue(line);
  }
  return { quantity, value: Math.round(value * 100) / 100 };
}

// ── Approval ────────────────────────────────────────────────────────────────

export const OPENING_REVIEW_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

export function canReviewOpening(role: string): boolean {
  return OPENING_REVIEW_ROLES.includes(role);
}

export interface ApproverContext {
  role: string;
  userId: string;
  createdById: string;
  submittedById: string | null;
}

/**
 * Separation of duties, mirroring the stock take rule: nobody approves an
 * opening balance they raised or submitted, Super Admin included. Opening
 * stock is the one posting with no upstream document to check it against, so
 * a second pair of eyes is the only control there is.
 */
export function checkApprover(ctx: ApproverContext): Guard {
  if (ctx.userId === ctx.createdById || (ctx.submittedById && ctx.userId === ctx.submittedById))
    return deny(403, "You cannot approve an opening balance you raised or submitted");

  if (!canReviewOpening(ctx.role))
    return deny(403, "Only a super admin, finance or clinic manager can approve an opening balance");

  return ok;
}

/** Document reference: OB-YYYYMM-NNN. */
export function openingRef(period: string, sequence: number): string {
  return `OB-${period.replace("-", "")}-${String(sequence).padStart(3, "0")}`;
}
