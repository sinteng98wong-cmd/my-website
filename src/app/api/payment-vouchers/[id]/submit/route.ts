import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pv = await prisma.paymentVoucher.findUnique({
    where: { id: params.id },
    include: {
      invoices: true,
      clinic: { select: { directorId: true, name: true } },
      supplier: { select: { name: true } },
    },
  });
  if (!pv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pv.status !== "DRAFT" && pv.status !== "REJECTED")
    return NextResponse.json({ error: "Can only submit DRAFT PVs" }, { status: 409 });
  if (pv.invoices.length === 0)
    return NextResponse.json({ error: "Add at least one supplier invoice before submitting" }, { status: 422 });
  if (!pv.clinic.directorId)
    return NextResponse.json({ error: "No director configured for this clinic. Set a director in clinic settings first." }, { status: 422 });

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: {
      status: "PENDING_DIRECTOR",
      submittedAt: new Date(),
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null,
    },
  });

  return NextResponse.json(updated);
}
