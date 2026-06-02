import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if ((session.user as any).role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden — SUPER_ADMIN only" }, { status: 403 });

  const record = await prisma.disciplinary.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { notes } = (await req.json().catch(() => ({}))) as { notes?: string };
  const updated = await prisma.disciplinary.update({
    where: { id: params.id },
    data: { status: "CLOSED", actionTaken: notes ? `${record.actionTaken ?? ""}\n${notes}`.trim() : record.actionTaken },
  });
  return NextResponse.json(updated);
}
