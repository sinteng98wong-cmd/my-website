/** GET /api/stock-takes/[id] — full count sheet, clinic-scoped. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { isEditable } from "@/lib/stock-take";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = await prisma.stockTake.findUnique({
    where: { id: params.id },
    include: {
      clinic:     { select: { id: true, name: true, picId: true, pic: { select: { name: true } } } },
      createdBy:  { select: { id: true, name: true } },
      submittedBy:{ select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      lines: {
        include: {
          item:      { select: { id: true, sku: true, name: true, unit: true, category: true } },
          countedBy: { select: { name: true } },
        },
        orderBy: { item: { name: "asc" } },
      },
    },
  });
  if (!take) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, take.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json({
    ...take,
    editable: isEditable(take.status),
    viewer: {
      userId,
      isPic: take.clinic.picId === userId,
      raisedThis: take.createdById === userId || take.submittedById === userId,
    },
  });
}
