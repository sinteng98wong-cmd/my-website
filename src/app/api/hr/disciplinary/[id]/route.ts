import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.disciplinary.findUnique({
    where: { id: params.id },
    include: {
      staffProfile: { select: { id: true, user: { select: { name: true, email: true } } } },
      clinic: { select: { name: true } },
      resolvedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Redact confidential records from non-SUPER_ADMIN unless they're the clinic manager for that clinic
  if (record.isConfidential && role !== "SUPER_ADMIN") {
    const isManagerOfClinic = await prisma.userClinic.findFirst({
      where: { clinicId: record.clinicId, user: { id: (session.user as any).id, role: "CLINIC_MANAGER" } },
    });
    if (!isManagerOfClinic) return NextResponse.json({ error: "Access denied to confidential record" }, { status: 403 });
  }

  return NextResponse.json(record);
}
