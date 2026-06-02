import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json([], { status: 200 });

    const mcs = await prisma.medicalCertificate.findMany({
      where: { patientId: params.id },
      include: {
        issuedBy: { select: { name: true } },
        clinic: { select: { name: true } },
      },
      orderBy: { issueDate: "desc" },
    });
    return NextResponse.json(mcs);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const userId = (session.user as any)?.id;
    const body = await req.json();
    const { fromDate, toDate, diagnosis, remarks, clinicId, visitId } = body;

    if (!fromDate || !toDate || !clinicId) {
      return NextResponse.json({ error: "fromDate, toDate and clinicId are required" }, { status: 422 });
    }

    const from = new Date(fromDate);
    const to   = new Date(toDate);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const count = await prisma.medicalCertificate.count();
    const mcRef = `MC-${String(count + 1).padStart(5, "0")}`;

    const mc = await prisma.medicalCertificate.create({
      data: {
        mcRef,
        patientId: params.id,
        issuedById: userId,
        issueDate: new Date(),
        fromDate: from,
        toDate: to,
        days,
        diagnosis: diagnosis || null,
        remarks: remarks || null,
        clinicId,
        visitId: visitId || null,
      },
      include: {
        issuedBy: { select: { name: true } },
        clinic: { select: { name: true } },
      },
    });

    return NextResponse.json(mc, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
