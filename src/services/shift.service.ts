/**
 * shift.service.ts — weekly staff rostering.
 *
 * Conflict Safeguard Engine: a user may not hold two overlapping shifts, even
 * at different branches. Enforced both here (friendly errors) and by a Postgres
 * btree_gist EXCLUDE constraint (hard guard) — see the weekly_shifts migration.
 */

import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export class ShiftConflictError extends Error {
  constructor(public readonly branchName: string, message?: string) {
    super(message ?? `Conflict Alert: staff member is already rostered at ${branchName} during these hours`);
    this.name = "ShiftConflictError";
  }
}

export interface ShiftInput {
  userId:    string;
  branchId:  string;
  startTime: Date;
  endTime:   Date;
  status?:   "PENDING" | "APPROVED";
}

/**
 * Returns the conflicting shift (with branch name) if `userId` already has a
 * shift overlapping [startTime, endTime), else null. Half-open interval so
 * back-to-back shifts (09:00–12:00, 12:00–15:00) do NOT conflict.
 */
export async function findConflict(
  userId: string,
  startTime: Date,
  endTime: Date,
  excludeShiftId?: string,
  p: PrismaClient = defaultPrisma,
): Promise<{ id: string; branchName: string; startTime: Date; endTime: Date } | null> {
  const overlap = await (p as any).shift.findFirst({
    where: {
      userId,
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      startTime: { lt: endTime },
      endTime:   { gt: startTime },
    },
    select: { id: true, startTime: true, endTime: true, branch: { select: { name: true } } },
  });
  return overlap
    ? { id: overlap.id, branchName: overlap.branch.name, startTime: overlap.startTime, endTime: overlap.endTime }
    : null;
}

function assertValidRange(start: Date, end: Date) {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Invalid shift times");
  if (end <= start) throw new Error("Shift end time must be after the start time");
}

/** Translate the DB exclusion violation (23P01) into a friendly conflict error. */
function rethrowDbConflict(e: any, branchName: string): never {
  const code = e?.code ?? e?.meta?.code ?? "";
  const msg  = String(e?.message ?? "");
  if (code === "23P01" || msg.includes("shift_no_user_overlap") || msg.includes("exclusion constraint")) {
    throw new ShiftConflictError(branchName);
  }
  throw e;
}

export async function createShift(input: ShiftInput, p: PrismaClient = defaultPrisma) {
  assertValidRange(input.startTime, input.endTime);
  const branch = await p.clinic.findUnique({ where: { id: input.branchId }, select: { name: true } });
  const branchName = branch?.name ?? "another branch";

  const conflict = await findConflict(input.userId, input.startTime, input.endTime, undefined, p);
  if (conflict) throw new ShiftConflictError(conflict.branchName);

  try {
    return await (p as any).shift.create({
      data: {
        userId:    input.userId,
        branchId:  input.branchId,
        startTime: input.startTime,
        endTime:   input.endTime,
        status:    input.status ?? "PENDING",
      },
      include: { user: { select: { id: true, name: true, role: true } }, branch: { select: { id: true, name: true } } },
    });
  } catch (e) {
    rethrowDbConflict(e, branchName);
  }
}

export interface ShiftUpdate {
  startTime?: Date;
  endTime?:   Date;
  branchId?:  string;
  status?:    "PENDING" | "APPROVED";
}

export async function updateShift(id: string, patch: ShiftUpdate, p: PrismaClient = defaultPrisma) {
  const existing = await (p as any).shift.findUnique({ where: { id }, select: { userId: true, startTime: true, endTime: true, branchId: true } });
  if (!existing) throw new Error("Shift not found");

  const start = patch.startTime ?? existing.startTime;
  const end   = patch.endTime   ?? existing.endTime;
  assertValidRange(start, end);

  const branchId = patch.branchId ?? existing.branchId;
  const branch = await p.clinic.findUnique({ where: { id: branchId }, select: { name: true } });
  const branchName = branch?.name ?? "another branch";

  const conflict = await findConflict(existing.userId, start, end, id, p);
  if (conflict) throw new ShiftConflictError(conflict.branchName);

  try {
    return await (p as any).shift.update({
      where: { id },
      data: {
        ...(patch.startTime ? { startTime: patch.startTime } : {}),
        ...(patch.endTime   ? { endTime:   patch.endTime }   : {}),
        ...(patch.branchId  ? { branchId:  patch.branchId }  : {}),
        ...(patch.status    ? { status:    patch.status }    : {}),
      },
      include: { user: { select: { id: true, name: true, role: true } }, branch: { select: { id: true, name: true } } },
    });
  } catch (e) {
    rethrowDbConflict(e, branchName);
  }
}
