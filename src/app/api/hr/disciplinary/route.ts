import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailDisciplinaryNotice } from "@/lib/hr-email";

const RESPONSE_TYPES = ["SHOW_CAUSE", "WRITTEN_WARNING"];

async function genDiscRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.disciplinary.count({ where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } });
  return `DIS-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get("staffProfileId")) where.staffProfileId = sp.get("staffProfileId");
  if (sp.get("clinicId")) where.clinicId = sp.get("clinicId");
  if (sp.get("status")) where.status = sp.get("status");

  const records = await prisma.disciplinary.findMany({
    where,
    include: { staffProfile: { select: { user: { select: { name: true } } } }, clinic: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    staffProfileId: string; clinicId: string; type: string; incidentDate: string;
    incidentDesc: string; actionTaken?: string; responseDeadline?: string;
    attachmentUrls?: string[]; isConfidential?: boolean;
  };

  if (!body.staffProfileId || !body.clinicId || !body.type || !body.incidentDate || !body.incidentDesc) {
    return NextResponse.json({ error: "staffProfileId, clinicId, type, incidentDate and incidentDesc are required" }, { status: 422 });
  }
  if (body.type === "TERMINATION" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can create TERMINATION records" }, { status: 403 });
  }

  const discRef = await genDiscRef();
  const record = await prisma.disciplinary.create({
    data: {
      discRef, staffProfileId: body.staffProfileId, clinicId: body.clinicId,
      type: body.type as any, incidentDate: new Date(body.incidentDate),
      incidentDesc: body.incidentDesc, actionTaken: body.actionTaken,
      responseDeadline: body.responseDeadline ? new Date(body.responseDeadline) : undefined,
      attachmentUrls: body.attachmentUrls ?? [],
      isConfidential: body.isConfidential ?? true,
      createdById: userId,
    },
  });

  if (RESPONSE_TYPES.includes(body.type) && !body.isConfidential) {
    emailDisciplinaryNotice(body.staffProfileId, body.type, body.responseDeadline).catch(console.error);
  }

  return NextResponse.json(record, { status: 201 });
}
