import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, ACTIVE } from "@/lib/soft-delete";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const visit = await prisma.visit.findUnique({
    where: notDeleted({ id: params.id }),
    include: {
      patient: { select: { id: true, name: true, patientRef: true, phone: true, icNumber: true, passportNo: true, isForeigner: true } },
      treatments: {
        include: {
          treatmentType: { select: { id: true, name: true, defaultPrice: true } },
          doctor: { include: { user: { select: { id: true, name: true } } } },
          labJob: { select: { id: true, labJobRef: true, status: true, vendor: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
      labJobs: {
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      invoices: {
        where: ACTIVE,
        select: {
          id: true, invoiceRef: true, total: true, collectedAt: true,
          payments: { select: { method: true, amount: true, panelProvider: { select: { name: true } } } },
        },
      },
      appointment: { select: { id: true, apptRef: true, type: true } },
    },
  });

  if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(visit);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { chiefComplaint, remarks } = body;

  const visit = await prisma.visit.update({
    where: { id: params.id },
    data:  {
      ...(chiefComplaint !== undefined ? { chiefComplaint } : {}),
      ...(remarks !== undefined        ? { remarks }        : {}),
    },
  });

  return NextResponse.json(visit);
}

/** Soft-delete a visit. Hard delete is never used. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const userId = (session.user as any)?.id as string;
  const role   = (session.user as any)?.role as string;

  if (!["SUPER_ADMIN","CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const visit = await prisma.visit.findUnique({
    where: notDeleted({ id: params.id }),
    select: { id: true },
  });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  // Cascade soft-delete invoices under this visit
  await prisma.invoice.updateMany({
    where: notDeleted({ visitId: params.id }),
    data:  { deletedAt: new Date(), deletedBy: userId } as any,
  });

  await prisma.visit.update({
    where: { id: params.id },
    data:  { deletedAt: new Date(), deletedBy: userId } as any,
  });

  return NextResponse.json({ ok: true });
}
