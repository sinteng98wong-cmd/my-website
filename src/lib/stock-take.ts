/**
 * Stock Take — workflow rules.
 *
 * Operational physical counting. A count snapshots the system quantity, staff
 * record what they physically find, and only PIC approval converts the
 * variance into adjustment movements in the existing immutable ledger.
 *
 * Pure, so the rules are unit testable without a database. The posting itself
 * lives in services/stock-take.service.ts and goes through the same atomic
 * mutation path as every other stock movement.
 */
import type { StockAdjustmentReason, StockMovementType, StockTakeStatus } from "@prisma/client";

export type Guard = { ok: true } | { ok: false; status: number; error: string };
const ok: Guard = { ok: true };
const deny = (status: number, error: string): Guard => ({ ok: false, status, error });

/** Legal transitions. Approved and rejected counts are terminal. */
const TRANSITIONS: Record<StockTakeStatus, StockTakeStatus[]> = {
  DRAFT:            ["SUBMITTED"],
  SUBMITTED:        ["APPROVED", "REJECTED", "RECOUNT_REQUIRED"],
  RECOUNT_REQUIRED: ["SUBMITTED"],
  APPROVED:         [],
  REJECTED:         [],
};

/** Statuses where lines may still be counted or edited. */
export const EDITABLE_STATUSES: StockTakeStatus[] = ["DRAFT", "RECOUNT_REQUIRED"];

export function isEditable(status: StockTakeStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function checkTransition(current: StockTakeStatus, next: StockTakeStatus): Guard {
  const allowed = TRANSITIONS[current];
  if (!allowed) return deny(400, `Unknown stock take status ${current}`);
  if (!allowed.includes(next)) {
    if (current === "APPROVED")
      return deny(409, "An approved stock take is final. Raise a new adjustment to correct it.");
    if (current === "REJECTED")
      return deny(409, "A rejected stock take is closed. Raise a new stock take instead.");
    return deny(409, `Cannot move a ${current} stock take to ${next}`);
  }
  return ok;
}

// ── Variance ────────────────────────────────────────────────────────────────

export interface CountLine {
  id: string;
  systemQty: number;
  physicalQty: number | null;
  avgUnitCost: number;
  reason: StockAdjustmentReason | null;
}

/** Physical minus system. Null until the line has actually been counted. */
export function varianceOf(line: Pick<CountLine, "systemQty" | "physicalQty">): number | null {
  if (line.physicalQty === null || line.physicalQty === undefined) return null;
  return line.physicalQty - line.systemQty;
}

export function varianceValue(variance: number, avgUnitCost: number): number {
  return Math.round(variance * avgUnitCost * 100) / 100;
}

/** A positive variance adds stock, a negative one removes it, zero posts nothing. */
export function movementTypeFor(variance: number): StockMovementType | null {
  if (variance > 0) return "ADJUSTMENT_IN";
  if (variance < 0) return "ADJUSTMENT_OUT";
  return null;
}

export function totalsOf(lines: CountLine[]): { varianceQty: number; varianceValue: number; countedLines: number } {
  let varianceQty = 0;
  let value = 0;
  let countedLines = 0;
  for (const l of lines) {
    const v = varianceOf(l);
    if (v === null) continue;
    countedLines++;
    varianceQty += v;
    value += varianceValue(v, l.avgUnitCost);
  }
  return { varianceQty, varianceValue: Math.round(value * 100) / 100, countedLines };
}

// ── Submission ──────────────────────────────────────────────────────────────

/**
 * Every line must be counted, and every line that moves stock must say why.
 * A reason is mandatory for any non-zero variance.
 */
export function checkSubmittable(lines: CountLine[]): Guard {
  if (!lines.length) return deny(422, "A stock take must contain at least one item");

  const uncounted = lines.filter((l) => l.physicalQty === null || l.physicalQty === undefined);
  if (uncounted.length)
    return deny(422, `${uncounted.length} item(s) have not been counted yet`);

  const negative = lines.filter((l) => (l.physicalQty ?? 0) < 0);
  if (negative.length) return deny(422, "Physical quantity cannot be negative");

  const missingReason = lines.filter((l) => {
    const v = varianceOf(l);
    return v !== null && v !== 0 && !l.reason;
  });
  if (missingReason.length)
    return deny(422, `${missingReason.length} item(s) with a variance need a reason`);

  return ok;
}

// ── Approval ────────────────────────────────────────────────────────────────

export interface ApproverContext {
  /** The clinic's configured PIC (Clinic.picId). */
  picId: string | null;
  role: string;
  userId: string;
  createdById: string;
  submittedById: string | null;
}

/**
 * PIC approval, with separation of duties: nobody signs off their own count,
 * Super Admin included.
 *
 * Extension point for the future high-value rule: a clinic configuration can
 * add a second approver above a configured variance value by calling this for
 * the first signature and an equivalent check for the second. Nothing here
 * assumes a single approval is the permanent shape.
 */
export function checkApprover(ctx: ApproverContext): Guard {
  if (ctx.userId === ctx.createdById || (ctx.submittedById && ctx.userId === ctx.submittedById))
    return deny(403, "You cannot approve a stock take you raised or submitted");

  if (!ctx.picId && ctx.role !== "SUPER_ADMIN")
    return deny(422, "No PIC configured for this clinic. Set one in clinic settings first.");

  if (ctx.userId === ctx.picId) return ok;
  if (ctx.role === "SUPER_ADMIN") return ok;

  return deny(403, "Only the clinic's PIC can approve a stock take");
}

// ── Concurrency ─────────────────────────────────────────────────────────────

export interface DriftedLine {
  lineId: string;
  itemId: string;
  countedSystemQty: number;
  currentSystemQty: number;
}

/**
 * Stock may have moved between the count and the approval. Applying
 * `physical - countedSystemQty` against a changed balance would silently
 * overwrite whatever happened in between, so any drift blocks the posting and
 * forces a recount against the current figures.
 */
export function detectDrift(
  lines: { id: string; itemId: string; systemQty: number }[],
  currentQuantities: Map<string, number>
): DriftedLine[] {
  const drifted: DriftedLine[] = [];
  for (const l of lines) {
    const current = currentQuantities.get(l.itemId) ?? 0;
    if (current !== l.systemQty)
      drifted.push({ lineId: l.id, itemId: l.itemId, countedSystemQty: l.systemQty, currentSystemQty: current });
  }
  return drifted;
}

/** Human-readable reason labels for the UI. */
export const REASON_LABELS: Record<StockAdjustmentReason, string> = {
  STOCK_COUNT_VARIANCE: "Stock count variance",
  DAMAGED:              "Damaged",
  EXPIRED:              "Expired",
  WASTAGE:              "Wastage",
  FOUND_STOCK:          "Found stock",
  DATA_CORRECTION:      "Data correction",
  OTHER:                "Other",
};

export const REASONS = Object.keys(REASON_LABELS) as StockAdjustmentReason[];
