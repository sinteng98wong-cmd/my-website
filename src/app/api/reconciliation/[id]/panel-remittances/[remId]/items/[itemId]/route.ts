import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; remId: string; itemId: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recon = await prisma.monthlyRecon.findUnique({ where: { id: params.id } });
  if (!recon) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (recon.status === "LOCKED")
    return NextResponse.json({ error: "Month is locked" }, { status: 409 });

  const item = await prisma.panelRemittanceItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.remittanceId !== params.remId)
    return NextResponse.json({ error: "Item not found" }, { status: 404 });

  await prisma.panelRemittanceItem.delete({ where: { id: params.itemId } });
  return new NextResponse(null, { status: 204 });
}
