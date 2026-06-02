import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailAppraisalCompleted } from "@/lib/hr-email";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const appraisal = await prisma.appraisal.findUnique({ where: { id: params.id } });
  if (!appraisal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appraisal.status !== "MANAGER_REVIEW") return NextResponse.json({ error: "Can only complete from MANAGER_REVIEW status" }, { status: 422 });

  const updated = await prisma.appraisal.update({ where: { id: params.id }, data: { status: "COMPLETED" } });
  emailAppraisalCompleted(appraisal.staffProfileId).catch(console.error);
  return NextResponse.json(updated);
}
