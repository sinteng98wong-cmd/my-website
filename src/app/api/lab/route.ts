import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json([], { status: 200 });

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId");
    const month    = searchParams.get("month");
    const vendorId = searchParams.get("vendorId");
    const status   = searchParams.get("status");

    const where: any = {};
    if (clinicId) where.clinicId = clinicId;
    if (vendorId) where.vendorId = vendorId;
    if (status)   where.status   = status;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      where.createdAt = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const jobs = await prisma.labJob.findMany({
      where,
      include: {
        vendor:  { select: { id: true, name: true } },
        clinic:  { select: { id: true, name: true } },
        visit: {
          include: {
            patient: { select: { id: true, name: true, patientRef: true } },
          },
        },
        treatments: { include: { treatmentType: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(jobs);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();
    const { visitId, vendorId, clinicId, estimatedFee, workDescription, expectedDate, treatmentIds } = body;

    if (!visitId || !vendorId || !clinicId || !estimatedFee) {
      return NextResponse.json({ error: "visitId, vendorId, clinicId, estimatedFee required" }, { status: 422 });
    }

    const count  = await prisma.labJob.count();
    const labJobRef = `LJ-${String(count + 1).padStart(5, "0")}`;

    const job = await prisma.labJob.create({
      data: {
        labJobRef, visitId, vendorId, clinicId,
        estimatedFee: Number(estimatedFee),
        workDescription: workDescription || null,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status: "ORDERED",
        ...(treatmentIds?.length ? {
          treatments: { connect: treatmentIds.map((id: string) => ({ id })) },
        } : {}),
      },
      include: {
        vendor:  { select: { id: true, name: true } },
        clinic:  { select: { id: true, name: true } },
        visit:   { include: { patient: { select: { id: true, name: true, patientRef: true } } } },
        treatments: { include: { treatmentType: { select: { name: true } } } },
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
