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

  const pool = await prisma.poolOrder.findUnique({
    where: { id: params.id },
    include: {
      initiatingClinic: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      reopenedBy: { select: { id: true, name: true } },
      lines: { include: { item: { select: { id: true, name: true, sku: true, unit: true } } } },
      participants: {
        include: {
          clinic: { select: { id: true, name: true } },
          joinedBy: { select: { id: true, name: true } },
          items: {
            include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
      deliveryOrders: {
        select: { id: true, doRef: true, status: true, toClinicId: true },
      },
    },
  });

  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(pool);
}
