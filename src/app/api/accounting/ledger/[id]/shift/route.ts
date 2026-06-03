import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string;
  const userId  = (session?.user as any)?.id   as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const canAlwaysShift = ["SUPER_ADMIN", "FINANCE"].includes(role);

  const entry = await (prisma as any).accountingLedgerEntry.findUnique({ where: { id: params.id } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const monthLock = await (prisma as any).accountingMonthLock.findFirst({
    where: { clinicId: entry.clinicId, month: entry.settlementMonth },
  });
  if (monthLock) return NextResponse.json({ error: "Month is locked — cannot shift entries" }, { status: 409 });

  if (entry.isLocked && !canAlwaysShift)
    return NextResponse.json({ error: "Entry is locked — Finance or Super Admin only can shift" }, { status: 403 });

  const { tag } = await req.json();
  if (!["CURRENT", "DEFERRED"].includes(tag))
    return NextResponse.json({ error: "tag must be CURRENT or DEFERRED" }, { status: 422 });

  let newRef = entry.ref;
  if (tag === "DEFERRED" && !newRef.endsWith("-2")) newRef = newRef + "-2";
  if (tag === "CURRENT"  &&  newRef.endsWith("-2")) newRef = newRef.slice(0, -2);

  const updated = await (prisma as any).accountingLedgerEntry.update({
    where: { id: params.id },
    data: { tag, ref: newRef, updatedById: userId },
  });

  return NextResponse.json(updated);
}
