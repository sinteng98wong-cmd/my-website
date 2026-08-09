import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReceivedQtyEdit } from "@/lib/stock-receipt";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { z } from "zod";

/** Statuses where the goods have not been fully booked in yet. */
const EDITABLE_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMED", "PARTIAL"];

const Schema = z.object({
  lineId:      z.string().min(1),
  receivedQty: z.number().int().nonnegative(),
  batchNumber: z.string().optional(),
  expiryDate:  z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body   = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const { lineId, receivedQty, batchNumber, expiryDate } = parsed.data;

  const po = await prisma.purchaseOrder.findUnique({ where: { id: params.id }, select: { status: true, clinicId: true } });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, po.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!EDITABLE_STATUSES.includes(po.status))
    return NextResponse.json({ error: `Cannot edit received quantity on a ${po.status} purchase order` }, { status: 409 });

  const line = await prisma.pOLine.findFirst({ where: { id: lineId, poId: params.id } });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  // A line's received quantity may never drop below what is already on the shelf.
  const editGuard = checkReceivedQtyEdit(line, receivedQty);
  if (!editGuard.ok) return NextResponse.json({ error: editGuard.error }, { status: editGuard.status });

  const updated = await prisma.pOLine.update({
    where: { id: lineId },
    data: {
      receivedQty,
      batchNumber: batchNumber ?? null,
      expiryDate:  expiryDate  ? new Date(expiryDate) : null,
    },
  });

  return NextResponse.json(updated);
}
