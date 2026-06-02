import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!["SUPER_ADMIN", "FINANCE"].includes((session?.user as any)?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  if (!b.notes?.trim()) return NextResponse.json({ error: "A reason (notes) is required to void" }, { status: 422 });

  const row = await prisma.referralCommission.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.referralCommission.update({
    where: { id: params.id },
    data:  { status: "VOIDED", notes: b.notes.trim() },
  });
  return NextResponse.json(updated);
}
