import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const run = await prisma.payrollRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "APPROVED") return NextResponse.json({ error: `Cannot mark a ${run.status} run as paid` }, { status: 400 });

  await prisma.payrollRun.update({ where: { id: params.id }, data: { status: "PAID", paidAt: new Date() } });
  return NextResponse.json({ ok: true, status: "PAID" });
}
