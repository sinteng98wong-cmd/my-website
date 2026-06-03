import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id   as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const pv = await prisma.paymentVoucher.findUnique({
    where: { id: params.id },
    include: {
      clinic: { select: { picId: true, name: true } },
      supplier: { select: { name: true } },
      preparedBy: { select: { email: true, name: true } },
    },
  });
  if (!pv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pv.status !== "PENDING_DIRECTOR")
    return NextResponse.json({ error: "PV is not pending director approval" }, { status: 409 });

  const isDirector = pv.directorId === userId;
  const isSuperAdmin = role === "SUPER_ADMIN";
  if (!isDirector && !isSuperAdmin)
    return NextResponse.json({ error: "Only the assigned director or Super Admin can approve" }, { status: 403 });

  if (!pv.clinic.picId)
    return NextResponse.json({ error: "No PIC configured for this clinic. Set a PIC in clinic settings first." }, { status: 422 });

  const body = await req.json().catch(() => ({})) as { directorNote?: string };

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: {
      status: "PENDING_PIC",
      directorApprovedById: userId,
      directorApprovedAt: new Date(),
      directorNote: body.directorNote || null,
    },
  });

  return NextResponse.json(updated);
}
