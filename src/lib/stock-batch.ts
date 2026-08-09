/**
 * Physical batch allocation.
 *
 * One rule for every stock-out in the system: which physical batches does this
 * quantity actually come from? Receipts create batches, and every deduction —
 * issue, transfer, variance, stock-take shortfall — depletes them through here.
 *
 * This is the physical axis only. Money is weighted average and is decided
 * elsewhere; nothing in this file influences cost.
 *
 * Pure, so the rules are unit testable without a database.
 */

export interface AllocatableBatch {
  id: string;
  batchNumber: string;
  expiryDate: Date | null;
  remainingQty: number;
}

export interface Allocation {
  /** Null means the quantity came from stock no batch record accounts for. */
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: Date | null;
  quantity: number;
}

/** Why a pinned batch could not cover the request. */
export type PinnedFailure = "SHORTAGE" | "EXPIRED" | "MISSING";

export interface AllocationOptions {
  /** Stock on hand that no batch record accounts for (pre-batch history). */
  unbatchedAvailable: number;
  allowExpired?: boolean;
  asOf?: Date;
  /**
   * Pin the allocation to one batch. Nothing else may satisfy it: not another
   * batch, and not unbatched stock. Asking for a specific batch and quietly
   * getting a different one destroys the traceability that pinning exists for.
   */
  pinnedBatchId?: string | null;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Quantity no eligible batch and no unbatched stock could cover. */
  shortfall: number;
  /** Set only when a pinned batch fell short, for a precise error message. */
  pinned: {
    batchId: string;
    batchNumber: string | null;
    available: number;
    reason: PinnedFailure;
  } | null;
}

const usable = (b: AllocatableBatch, allowExpired: boolean, asOf: Date) =>
  b.remainingQty > 0 && (allowExpired || !b.expiryDate || b.expiryDate >= asOf);

/**
 * Allocate `quantity` across batches.
 *
 * Unpinned: First Expiry, First Out. Batches with no expiry date go last — an
 * unknown expiry is not an early one. Whatever the eligible batches cannot
 * cover falls back to an explicit unbatched allocation, capped at the unbatched
 * stock actually on hand, so it stays distinguishable from real batch stock
 * rather than being invented.
 *
 * Pinned: only the named batch, no fallback of any kind.
 */
export function allocateBatches(
  batches: AllocatableBatch[],
  quantity: number,
  options: AllocationOptions
): AllocationResult {
  const asOf = options.asOf ?? new Date();
  const allowExpired = options.allowExpired ?? false;
  const pinnedId = options.pinnedBatchId ?? null;

  if (pinnedId) {
    const batch = batches.find((b) => b.id === pinnedId);
    const take = batch && usable(batch, allowExpired, asOf) ? Math.min(batch.remainingQty, quantity) : 0;
    const allocations: Allocation[] = take > 0
      ? [{ batchId: batch!.id, batchNumber: batch!.batchNumber, expiryDate: batch!.expiryDate, quantity: take }]
      : [];

    const reason: PinnedFailure = !batch
      ? "MISSING"
      : !usable(batch, allowExpired, asOf) && batch.remainingQty > 0
        ? "EXPIRED"
        : "SHORTAGE";

    return {
      allocations,
      shortfall: quantity - take,
      pinned: take < quantity
        ? { batchId: pinnedId, batchNumber: batch?.batchNumber ?? null, available: batch?.remainingQty ?? 0, reason }
        : null,
    };
  }

  const eligible = batches
    .filter((b) => usable(b, allowExpired, asOf))
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

  if (outstanding > 0 && options.unbatchedAvailable > 0) {
    const take = Math.min(options.unbatchedAvailable, outstanding);
    allocations.push({ batchId: null, batchNumber: null, expiryDate: null, quantity: take });
    outstanding -= take;
  }

  return { allocations, shortfall: Math.max(0, outstanding), pinned: null };
}

/**
 * Stock on hand that no batch record accounts for.
 *
 * Always computed against *every* batch at the position, never a filtered
 * subset — a subset would let another batch's quantity masquerade as unbatched
 * stock and be consumed without a trace.
 */
export function unbatchedAvailable(clinicStockQty: number, batches: AllocatableBatch[]): number {
  const batched = batches.reduce((s, b) => s + Math.max(0, b.remainingQty), 0);
  return Math.max(0, clinicStockQty - batched);
}

/** Allocations must add up to exactly what moved. */
export function allocationsReconcile(allocations: Allocation[], quantity: number): boolean {
  return allocations.reduce((s, a) => s + a.quantity, 0) === quantity;
}

export function isExpired(batch: { expiryDate: Date | null }, asOf: Date = new Date()): boolean {
  return !!batch.expiryDate && batch.expiryDate < asOf;
}

/** Message for a pinned batch that could not cover the request. */
export function pinnedBatchError(
  pinned: NonNullable<AllocationResult["pinned"]>,
  requested: number,
  itemName?: string
): string {
  const label = pinned.batchNumber ? `Batch ${pinned.batchNumber}` : "The selected batch";
  const item = itemName ? ` of ${itemName}` : "";
  if (pinned.reason === "MISSING")
    return `${label}${item} no longer exists or has no stock left. Choose another batch.`;
  if (pinned.reason === "EXPIRED")
    return `${label}${item} has expired and cannot be used for this reason. Raise an expiry write-off instead.`;
  return (
    `${label}${item} does not have enough available quantity: ` +
    `${pinned.available} available, ${requested} requested. ` +
    `A pinned batch is never topped up from another batch or from unbatched stock.`
  );
}
