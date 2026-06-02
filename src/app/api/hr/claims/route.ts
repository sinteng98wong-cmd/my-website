import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkClaimLimit } from "@/lib/claims";
import type { ClaimType } from "@prisma/client";

async function genClaimRef(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await prisma.staffClaim.count({ where: { createdAt: { gte: start, lt: end } } });
  return `CLM-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get("clinicId")) where.clinicId = sp.get("clinicId");
  if (sp.get("status")) where.status = sp.get("status");
  if (sp.get("staffProfileId")) where.staffProfileId = sp.get("staffProfileId");
  if (sp.get("month")) {
    const [y, m] = sp.get("month")!.split("-").map(Number);
    where.receiptDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    where.staffProfileId = profile?.id ?? "__none__";
  }

  const claims = await prisma.staffClaim.findMany({
    where,
    include: { staffProfile: { select: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(claims);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true, clinicId: true } });
  if (!profile) return NextResponse.json({ error: "You do not have a staff profile" }, { status: 400 });

  const b = await req.json();
  const { claimType, amount, receiptDate, description, receiptUrl } = b as {
    claimType: ClaimType; amount: number; receiptDate: string; description: string; receiptUrl?: string;
  };
  if (!claimType || !amount || !receiptDate || !description) {
    return NextResponse.json({ error: "claimType, amount, receiptDate, description required" }, { status: 422 });
  }

  const limit = await checkClaimLimit(profile.id, claimType, Number(amount), new Date(receiptDate));
  const claimRef = await genClaimRef();

  const claim = await prisma.staffClaim.create({
    data: {
      claimRef, staffProfileId: profile.id, clinicId: profile.clinicId,
      claimType, amount: Number(amount), receiptDate: new Date(receiptDate),
      description, receiptUrl: receiptUrl || null, status: "DRAFT",
    },
  });

  return NextResponse.json({ claim, limit, overLimit: !limit.withinLimit }, { status: 201 });
}
