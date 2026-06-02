import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailAppraisalInitiated } from "@/lib/hr-email";

async function genAppraisalRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.appraisal.count({ where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } });
  return `APR-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get("staffProfileId")) where.staffProfileId = sp.get("staffProfileId");
  if (sp.get("period")) where.period = sp.get("period");
  if (sp.get("status")) where.status = sp.get("status");

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    where.staffProfileId = profile?.id ?? "__none__";
  }

  const appraisals = await prisma.appraisal.findMany({
    where,
    include: {
      staffProfile: { select: { id: true, user: { select: { name: true } } } },
      reviewer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(appraisals);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { staffProfileId, reviewerId, period } = await req.json() as { staffProfileId: string; reviewerId: string; period: string };
  if (!staffProfileId || !reviewerId || !period) return NextResponse.json({ error: "staffProfileId, reviewerId and period are required" }, { status: 422 });

  const existing = await prisma.appraisal.findFirst({ where: { staffProfileId, period } });
  if (existing) return NextResponse.json({ error: `Appraisal already exists for this staff for ${period}` }, { status: 409 });

  const appraisalRef = await genAppraisalRef();
  const appraisal = await prisma.appraisal.create({ data: { appraisalRef, staffProfileId, reviewerId, period, status: "DRAFT" } });

  emailAppraisalInitiated(staffProfileId, period).catch(console.error);

  return NextResponse.json(appraisal, { status: 201 });
}
