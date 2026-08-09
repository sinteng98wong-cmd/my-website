/**
 * Stock Issue — the normal stock-out path.
 *
 * Covers clinical consumption, general usage, and expiry/damage/wastage
 * write-offs. Posting goes through the existing atomic mutation helpers and
 * the existing immutable ledger; nothing here writes stock directly.
 *
 * FEFO decides which physical batch is depleted. Weighted average still
 * decides the money — these are independent axes and this file never mixes
 * them.
 *
 * Pure, so the rules are unit testable without a database.
 */
import type { StockIssueReason, StockIssueStatus, StockMovementType } from "@prisma/client";

export type Guard = { ok: true } | { ok: false; status: number; error: string };
const ok: Guard = { ok: true };
const deny = (status: number, error: string): Guard => ({ ok: false, status, error });

// ── Reasons → ledger movement types ─────────────────────────────────────────
//
// The ledger type says what happened to the stock; the reason keeps the finer
// detail. Consumption covers stock that was used; the write-off types cover
// stock destroyed. WRITE_OFF_WASTAGE was added because wastage is neither
// damage nor expiry — spoiled or unusable stock with no other cause.

const REASON_MOVEMENT: Record<StockIssueReason, StockMovementType> = {
  CLINICAL_CONSUMPTION: "CONSUMPTION",
  GENERAL_USAGE:        "CONSUMPTION",
  OTHER:                "CONSUMPTION",
  DAMAGED:              "WRITE_OFF_DAMAGE",
  WASTAGE:              "WRITE_OFF_WASTAGE",
  EXPIRED:              "WRITE_OFF_EXPIRY",
};

export function movementTypeForReason(reason: StockIssueReason): StockMovementType {
  return REASON_MOVEMENT[reason];
}

/** Write-offs destroy stock, so they need PIC sign-off; usage does not. */
const WRITE_OFF_REASONS: StockIssueReason[] = ["DAMAGED", "WASTAGE", "EXPIRED"];

export function isWriteOff(reason: StockIssueReason): boolean {
  return WRITE_OFF_REASONS.includes(reason);
}

export function requiresApproval(reason: StockIssueReason): boolean {
  return isWriteOff(reason);
}

/** Expired stock is only issuable when the issue is itself an expiry write-off. */
export function allowsExpiredBatches(reason: StockIssueReason): boolean {
  return reason === "EXPIRED" || reason === "DAMAGED" || reason === "WASTAGE";
}

export const REASON_LABELS: Record<StockIssueReason, string> = {
  CLINICAL_CONSUMPTION: "Clinical consumption",
  GENERAL_USAGE:        "General usage",
  DAMAGED:              "Damaged",
  WASTAGE:              "Wastage",
  EXPIRED:              "Expired",
  OTHER:                "Other",
};

export const REASONS = Object.keys(REASON_LABELS) as StockIssueReason[];

// ── Status machine ──────────────────────────────────────────────────────────

const TRANSITIONS: Record<StockIssueStatus, StockIssueStatus[]> = {
  DRAFT:            ["PENDING_APPROVAL", "POSTED"],
  PENDING_APPROVAL: ["POSTED", "REJECTED"],
  POSTED:           [],
  REJECTED:         [],
};

export function checkTransition(current: StockIssueStatus, next: StockIssueStatus): Guard {
  const allowed = TRANSITIONS[current];
  if (!allowed) return deny(400, `Unknown stock issue status ${current}`);
  if (!allowed.includes(next)) {
    if (current === "POSTED")
      return deny(409, "This stock issue is already posted. Raise a compensating movement to correct it.");
    if (current === "REJECTED")
      return deny(409, "This stock issue was rejected. Raise a new one instead.");
    return deny(409, `Cannot move a ${current} stock issue to ${next}`);
  }
  return ok;
}

export function isEditable(status: StockIssueStatus): boolean {
  return status === "DRAFT";
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface IssueLineInput {
  itemId: string;
  quantity: number;
  batchId?: string | null;
}

export function checkIssuable(lines: IssueLineInput[], reason: StockIssueReason | null): Guard {
  if (!reason) return deny(422, "A reason is required for every stock issue");
  if (!lines.length) return deny(422, "A stock issue must contain at least one line");
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0))
    return deny(422, "Every line needs a whole quantity greater than zero");
  const seen = new Set<string>();
  for (const l of lines) {
    const key = `${l.itemId}:${l.batchId ?? ""}`;
    if (seen.has(key)) return deny(422, "The same item and batch appears more than once");
    seen.add(key);
  }
  return ok;
}

/** Available stock must cover the issue; negative stock is never permitted. */
export function checkAvailability(available: number, requested: number, itemName?: string): Guard {
  if (requested > available)
    return deny(
      409,
      `Insufficient stock for ${itemName ?? "this item"}: ${available} available, ${requested} requested`
    );
  return ok;
}

// ── FEFO allocation ─────────────────────────────────────────────────────────

export interface AllocatableBatch {
  id: string;
  batchNumber: string;
  expiryDate: Date | null;
  remainingQty: number;
}

export interface Allocation {
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: Date | null;
  quantity: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Quantity that no batch could cover and no unbatched stock backed. */
  shortfall: number;
}

/**
 * First Expiry, First Out.
 *
 * Batches are consumed earliest-expiry first. Batches with no expiry date go
 * last — an unknown expiry is not an early one. Anything the batches cannot
 * cover falls back to an explicit unbatched allocation, up to the unbatched
 * stock actually on hand, so it stays distinguishable from real batch stock
 * instead of being invented.
 */
export function allocateFefo(
  batches: AllocatableBatch[],
  quantity: number,
  options: { unbatchedAvailable: number; allowExpired?: boolean; asOf?: Date }
): AllocationResult {
  const asOf = options.asOf ?? new Date();
  const allowExpired = options.allowExpired ?? false;

  const eligible = batches
    .filter((b) => b.remainingQty > 0)
    .filter((b) => allowExpired || !b.expiryDate || b.expiryDate >= asOf)
    .sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime();
      if (a.expiryDate) return -1;   // dated batches before undated ones
      if (b.expiryDate) return 1;
      return a.batchNumber.localeCompare(b.batchNumber);
    });

  const allocations: Allocation[] = [];
  let outstanding = quantity;

  for (const b of eligible) {
    if (outstanding <= 0) break;
    const take = Math.min(b.remainingQty, outstanding);
    allocations.push({ batchId: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: take });
    outstanding -= take;
  }

  // Explicit unbatched fallback for stock that has no batch record behind it.
  if (outstanding > 0 && options.unbatchedAvailable > 0) {
    const take = Math.min(options.unbatchedAvailable, outstanding);
    allocations.push({ batchId: null, batchNumber: null, expiryDate: null, quantity: take });
    outstanding -= take;
  }

  return { allocations, shortfall: Math.max(0, outstanding) };
}

/** Stock on hand that no batch record accounts for. */
export function unbatchedAvailable(clinicStockQty: number, batches: AllocatableBatch[]): number {
  const batched = batches.reduce((s, b) => s + Math.max(0, b.remainingQty), 0);
  return Math.max(0, clinicStockQty - batched);
}

/** Allocations must add up to exactly what was issued. */
export function allocationsReconcile(allocations: Allocation[], quantity: number): boolean {
  return allocations.reduce((s, a) => s + a.quantity, 0) === quantity;
}

export function isExpired(batch: { expiryDate: Date | null }, asOf: Date = new Date()): boolean {
  return !!batch.expiryDate && batch.expiryDate < asOf;
}

// ── Approval ────────────────────────────────────────────────────────────────

export interface ApproverContext {
  picId: string | null;
  role: string;
  userId: string;
  createdById: string;
  submittedById: string | null;
}

/**
 * Write-off approval mirrors the Stock Take rule: the clinic's PIC signs off,
 * and nobody signs off their own write-off, Super Admin included.
 *
 * Extension point: a future clinic configuration can require a second
 * signature above a configured value by adding a second check here. No
 * threshold is invented now.
 */
export function checkApprover(ctx: ApproverContext): Guard {
  if (ctx.userId === ctx.createdById || (ctx.submittedById && ctx.userId === ctx.submittedById))
    return deny(403, "You cannot approve a write-off you raised or submitted");
  if (!ctx.picId && ctx.role !== "SUPER_ADMIN")
    return deny(422, "No PIC configured for this clinic. Set one in clinic settings first.");
  if (ctx.userId === ctx.picId) return ok;
  if (ctx.role === "SUPER_ADMIN") return ok;
  return deny(403, "Only the clinic's PIC can approve a write-off");
}
