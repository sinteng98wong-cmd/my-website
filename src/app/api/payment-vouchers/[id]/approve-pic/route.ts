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
      supplier: { select: { name: true } },
      preparedBy: { select: { email: true, name: true } },
    },
  });
  if (!pv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pv.status !== "PENDING_PIC")
    return NextResponse.json({ error: "PV is not pending PIC approval" }, { status: 409 });

  const isPic = pv.picId === userId;
  const isSuperAdmin = role === "SUPER_ADMIN";
  if (!isPic && !isSuperAdmin)
    return NextResponse.json({ error: "Only the assigned PIC or Super Admin can approve bank transfer" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { picNote?: string };

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: {
      status: "APPROVED",
      picApprovedById: userId,
      picApprovedAt: new Date(),
      picNote: body.picNote || null,
    },
  });

  return NextResponse.json(updated);
}
