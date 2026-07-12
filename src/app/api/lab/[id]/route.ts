import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const job = await prisma.labJob.findUnique({
      where: { id: params.id },
      include: {
        vendor:  true,
        clinic:  { select: { name: true } },
        visit: {
          include: {
            patient: { select: { id: true, name: true, patientRef: true, phone: true } },
            treatments: { include: { treatmentType: true, commissions: true } },
            invoices: true,
          },
        },
        treatments: { include: { treatmentType: true, commissions: { select: { id: true, finalPayout: true, status: true, doctorRate: true, doctorSplit: true } } } },
      },
    });

    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(job);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();
    const {
      status, sentDate, receivedDate, fittedDate,
      invoiceDate, invoiceNumber, invoiceAmount,
      paidToVendor, paidDate, notes, expectedDate, vendorId,
    } = body;

    const existing = await prisma.labJob.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.labJob.update({
      where: { id: params.id },
      data: {
        ...(vendorId     ? { vendorId }                             : {}),
        ...(status       ? { status }                               : {}),
        ...(sentDate     ? { sentDate: new Date(sentDate) }         : {}),
        ...(expectedDate ? { expectedDate: new Date(expectedDate) } : {}),
        ...(receivedDate ? { receivedDate: new Date(receivedDate) } : {}),
        ...(fittedDate   ? { fittedDate: new Date(fittedDate) }     : {}),
        ...(invoiceDate  ? { invoiceDate: new Date(invoiceDate) }   : {}),
        ...(invoiceNumber !== undefined ? { invoiceNumber }         : {}),
        ...(invoiceAmount !== undefined ? { invoiceAmount: Number(invoiceAmount) } : {}),
        ...(paidToVendor !== undefined  ? { paidToVendor }          : {}),
        ...(paidDate     ? { paidDate: new Date(paidDate) }         : {}),
        ...(notes !== undefined         ? { notes }                 : {}),
      },
      include: {
        vendor:     { select: { id: true, name: true } },
        clinic:     { select: { name: true } },
        treatments: { include: { treatmentType: { select: { name: true } }, commissions: true } },
        visit: { include: { patient: { select: { id: true, name: true, patientRef: true } } } },
      },
    });

    // When invoice amount confirmed → update treatment labFee + recalculate commission
    if (invoiceAmount && updated.treatments.length > 0) {
      const labFeePerTreatment = Number(invoiceAmount) / updated.treatments.length;

      for (const t of updated.treatments) {
        await prisma.treatment.update({
          where: { id: t.id },
          data: { labFee: labFeePerTreatment },
        });

        const tx = await prisma.treatment.findUnique({
          where: { id: t.id },
          select: { billedAmount: true, sst: true },
        });
        if (!tx) continue;

        for (const comm of t.commissions) {
          const base    = Math.max(Number(tx.billedAmount) - labFeePerTreatment - Number(tx.sst), 0);
          const newComm = Math.round(base * (Number(comm.doctorSplit) / 100) * (Number(comm.doctorRate) / 100) * 100) / 100;
          await prisma.doctorCommission.update({
            where: { id: comm.id },
            data: { labFee: labFeePerTreatment, commission: newComm, finalPayout: newComm },
          });
        }
      }
    }

    // Re-fetch after all recalculations so the response reflects the updated commissions
    const fresh = await prisma.labJob.findUnique({
      where: { id: params.id },
      include: {
        vendor:     { select: { id: true, name: true } },
        clinic:     { select: { name: true } },
        treatments: { include: { treatmentType: { select: { name: true } }, commissions: true } },
        visit: { include: { patient: { select: { id: true, name: true, patientRef: true } } } },
      },
    });

    return NextResponse.json(fresh ?? updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
