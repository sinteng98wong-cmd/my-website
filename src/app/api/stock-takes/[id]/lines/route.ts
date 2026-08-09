/**
 * PATCH /api/stock-takes/[id]/lines — record a physical count on one line.
 * Only while the take is still open; an approved take is immutable.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { isEditable } from "@/lib/stock-take";
import { z } from "zod";

const Schema = z.object({
  lineId: z.string().min(1),
  physicalQty: z.number().int().nonnegative().nullable(),
  reason: z.enum([
    "STOCK_COUNT_VARIANCE", "DAMAGED", "EXPIRED", "WASTAGE",
    "FOUND_STOCK", "DATA_CORRECTION", "OTHER",
  ]).nullable().optional(),
  note: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = await prisma.stockTake.findUnique({
    where: { id: params.id },
    select: { id: true, clinicId: true, status: true },
  });
  if (!take) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, take.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!isEditable(take.status))
    return NextResponse.json(
      { error: `A ${take.status} stock take cannot be edited. Raise a new adjustment to correct it.` },
      { status: 409 }
    );

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const line = await prisma.stockTakeLine.findFirst({ where: { id: d.lineId, stockTakeId: params.id } });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const updated = await prisma.stockTakeLine.update({
    where: { id: d.lineId },
    data: {
      physicalQty: d.physicalQty,
      ...(d.reason !== undefined ? { reason: d.reason } : {}),
      ...(d.note !== undefined ? { note: d.note || null } : {}),
      countedById: d.physicalQty === null ? null : userId,
      countedAt:   d.physicalQty === null ? null : new Date(),
    },
  });

  return NextResponse.json(updated);
}
