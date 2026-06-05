import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plan = await prisma.treatmentPlan.findUnique({ where: { id: params.id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.status !== "DRAFT") return NextResponse.json({ error: "Only DRAFT plans can be quoted" }, { status: 400 });

  const updated = await prisma.treatmentPlan.update({
    where: { id: params.id },
    data: { status: "QUOTED", quotedAt: new Date() },
  });
  return NextResponse.json(updated);
}
