/**
 * Stock period locking.
 *
 * A locked clinic-month refuses every new stock movement for that clinic and
 * period. The check lives inside `postMovement`, which is the only place in
 * the codebase that writes a StockMovement row, so all seven posting paths —
 * PO receipt, pool receipt, pool direct receipt, DO dispatch/receipt/variance,
 * stock issue, stock take adjustment, invoice revaluation and PPV — inherit it
 * without each having to remember.
 *
 * ── Why the period cannot be chosen ─────────────────────────────────────────
 *
 * `movementAt` was removed from the public posting input, so a movement is
 * always stamped with the moment it is written and its period derived from
 * that in Malaysia time. There is no way for a caller to aim a posting at a
 * period of its choosing, which is what makes this lock meaningful rather than
 * advisory.
 *
 * ── Why an advisory lock ────────────────────────────────────────────────────
 *
 * A plain SELECT would leave a race: a posting reads "open", a lock commits,
 * then the posting commits into the freshly locked period. Postgres will not
 * block a SELECT against an INSERT of a row that does not exist yet, so there
 * is nothing to conflict on.
 *
 * Both sides therefore take a transaction-scoped advisory lock keyed on
 * clinic+period — shared while posting, exclusive while locking. An in-flight
 * posting holds the shared lock until it commits, so a lock request waits for
 * it; a posting that starts after the lock commits blocks, then sees LOCKED
 * and is refused. The invariant that holds is the one that matters: no
 * movement is ever committed into a period that was locked at the time it
 * committed.
 *
 * Advisory locks are released automatically at commit or rollback, so a failed
 * posting cannot strand one.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type PeriodClient = Prisma.TransactionClient;

/** Thrown when a posting targets a locked clinic-month. Routes map this to 409. */
export class PeriodLockedError extends Error {
  readonly clinicId: string;
  readonly period: string;
  constructor(clinicId: string, period: string) {
    super(
      `Stock period ${period} is locked for this clinic. ` +
        `Post the correction into the current open period, or ask a super admin to unlock ${period}.`
    );
    this.name = "PeriodLockedError";
    this.clinicId = clinicId;
    this.period = period;
  }
}

export function isPeriodLockedError(e: unknown): e is PeriodLockedError {
  return e instanceof PeriodLockedError || (e as { name?: string })?.name === "PeriodLockedError";
}

/** Advisory-lock key for one clinic-month. */
const lockKey = (clinicId: string, period: string) => `stock-period:${clinicId}:${period}`;

/**
 * Refuse the posting if this clinic-month is locked.
 *
 * Must be called with the same transaction client that performs the
 * ClinicStock mutation — the check and the write have to commit together, or
 * the check proves nothing.
 */
export async function assertPeriodOpen(
  client: PeriodClient,
  clinicId: string,
  period: string
): Promise<void> {
  // $executeRaw, not $queryRaw: the advisory lock functions return void,
  // which has no Prisma column type to deserialize.
  // Shared: many postings for the same clinic-month proceed concurrently, but
  // a lock request (exclusive) waits for all of them to commit first.
  await client.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock_shared(hashtext($1)::bigint)",
    lockKey(clinicId, period)
  );

  const lock = await client.stockPeriodLock.findUnique({
    where:  { clinicId_period: { clinicId, period } },
    select: { status: true },
  });

  if (lock?.status === "LOCKED") throw new PeriodLockedError(clinicId, period);
}

// ── Lock administration ─────────────────────────────────────────────────────

export const PERIOD_LOCK_ROLES   = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];
export const PERIOD_UNLOCK_ROLES = ["SUPER_ADMIN"];

export function canLockPeriod(role: string): boolean {
  return PERIOD_LOCK_ROLES.includes(role);
}

/** Unlocking is deliberately narrower than locking — reopening a closed month
 *  is a controlled act, not routine housekeeping. */
export function canUnlockPeriod(role: string): boolean {
  return PERIOD_UNLOCK_ROLES.includes(role);
}

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(period: string): boolean {
  return PERIOD_RE.test(period);
}

/**
 * Lock a clinic-month.
 *
 * Takes the exclusive advisory lock first, so any posting already in flight
 * for this clinic-month finishes before the period closes. Re-locking a period
 * that was previously unlocked reuses the row and clears the unlock fields.
 */
export async function lockPeriod(opts: {
  clinicId: string;
  period: string;
  userId: string;
  notes?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      lockKey(opts.clinicId, opts.period)
    );

    return tx.stockPeriodLock.upsert({
      where:  { clinicId_period: { clinicId: opts.clinicId, period: opts.period } },
      create: {
        clinicId: opts.clinicId, period: opts.period, status: "LOCKED",
        lockedById: opts.userId, lockedAt: new Date(), notes: opts.notes ?? null,
      },
      update: {
        status: "LOCKED", lockedById: opts.userId, lockedAt: new Date(),
        notes: opts.notes ?? null,
        // A fresh lock supersedes the previous unlock.
        unlockedById: null, unlockedAt: null, unlockReason: null,
      },
    });
  });
}

/**
 * Reopen a clinic-month. Super admin only, and never without a reason — the
 * row is kept so the reopen stays on record.
 */
export async function unlockPeriod(opts: {
  clinicId: string;
  period: string;
  userId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      lockKey(opts.clinicId, opts.period)
    );

    const existing = await tx.stockPeriodLock.findUnique({
      where: { clinicId_period: { clinicId: opts.clinicId, period: opts.period } },
    });
    if (!existing) throw new Error("PERIOD_NOT_LOCKED");
    if (existing.status !== "LOCKED") throw new Error("PERIOD_NOT_LOCKED");

    return tx.stockPeriodLock.update({
      where: { id: existing.id },
      data: {
        status: "OPEN",
        unlockedById: opts.userId,
        unlockedAt: new Date(),
        unlockReason: opts.reason,
      },
    });
  });
}

/** Lock rows for the given clinics, most recent period first. */
export async function listPeriodLocks(clinicIds: string[] | null, period?: string) {
  return prisma.stockPeriodLock.findMany({
    where: {
      ...(clinicIds ? { clinicId: { in: clinicIds } } : {}),
      ...(period ? { period } : {}),
    },
    include: {
      clinic:     { select: { id: true, name: true } },
      lockedBy:   { select: { id: true, name: true } },
      unlockedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ period: "desc" }, { clinicId: "asc" }],
  });
}
