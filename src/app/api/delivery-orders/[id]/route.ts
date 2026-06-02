import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const order = await prisma.deliveryOrder.findUnique({
    where: { id: params.id },
    include: {
      fromClinic: { select: { id: true, name: true } },
      toClinic: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      poolOrder: { select: { id: true, poRef: true } },
      lines: {
        include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(order);
}
