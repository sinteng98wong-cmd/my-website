import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.disciplinary.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["OPEN", "RESPONDED"].includes(record.status)) return NextResponse.json({ error: "Can only resolve OPEN or RESPONDED records" }, { status: 422 });

  const { actionTaken, resolvedAt } = await req.json() as { actionTaken: string; resolvedAt?: string };

  const updated = await prisma.disciplinary.update({
    where: { id: params.id },
    data: { actionTaken, resolvedAt: resolvedAt ? new Date(resolvedAt) : new Date(), resolvedById: userId, status: "RESOLVED" },
  });
  return NextResponse.json(updated);
}
