import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClinicAccess } from "@/lib/clinic-access";
import { isEditable } from "@/lib/stock-opening";
import { z } from "zod";

const PatchSchema = z.object({
  lineId:      z.string().min(1),
  quantity:    z.number().int().nullable().optional(),
  unitCost:    z.number().nullable().optional(),
  batchNumber: z.string().trim().min(1).nullable().optional(),
  expiryDate:  z.string().nullable().optional(),
  note:        z.string().nullable().optional(),
});

/** Enter or clear one line's counted figures. Draft only. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });

  const doc = await prisma.openingBalance.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, doc.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!isEditable(doc.status))
    return NextResponse.json({ error: `A ${doc.status} opening balance cannot be edited` }, { status: 409 });

  const line = await prisma.openingBalanceLine.findUnique({ where: { id: parsed.data.lineId } });
  if (!line || line.openingBalanceId !== doc.id)
    return NextResponse.json({ error: "Line not found on this document" }, { status: 404 });

  const d = parsed.data;
  const nextQty  = d.quantity !== undefined ? d.quantity : line.quantity;
  const nextCost = d.unitCost !== undefined ? d.unitCost : (line.unitCost === null ? null : Number(line.unitCost));

  // Only structural problems are rejected while the draft is being filled in.
  // "Cost is required above zero quantity" is deliberately NOT enforced here:
  // the branch types the quantity before the cost, and rejecting the
  // half-filled row would make the form impossible to complete. That rule is
  // enforced at submission, where the document is judged as a whole.
  if (nextQty !== null && nextQty !== undefined) {
    if (!Number.isInteger(nextQty))
      return NextResponse.json({ error: "Opening quantity must be a whole number" }, { status: 422 });
    if (nextQty < 0)
      return NextResponse.json({ error: "Opening quantity cannot be negative" }, { status: 422 });
  }
  if (nextCost !== null && nextCost !== undefined) {
    if (!Number.isFinite(nextCost) || nextCost <= 0)
      return NextResponse.json({ error: "Unit cost must be greater than zero" }, { status: 422 });
  }

  const updated = await prisma.openingBalanceLine.update({
    where: { id: line.id },
    data: {
      ...(d.quantity    !== undefined ? { quantity: d.quantity } : {}),
      ...(d.unitCost    !== undefined ? { unitCost: d.unitCost } : {}),
      ...(d.batchNumber !== undefined ? { batchNumber: d.batchNumber } : {}),
      ...(d.expiryDate  !== undefined ? { expiryDate: d.expiryDate ? new Date(d.expiryDate) : null } : {}),
      ...(d.note        !== undefined ? { note: d.note } : {}),
    },
    include: { item: { select: { id: true, name: true, unit: true } } },
  });
  return NextResponse.json(updated);
}
