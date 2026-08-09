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
//
// Batch allocation now lives in lib/stock-batch, because every stock-out needs
// it — not just issues. Re-exported here so the issue rules read as one piece.

export {
  allocateBatches as allocateFefo,
  unbatchedAvailable,
  allocationsReconcile,
  isExpired,
  pinnedBatchError,
} from "./stock-batch";
export type {
  AllocatableBatch,
  Allocation,
  AllocationResult,
  AllocationOptions,
} from "./stock-batch";

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
