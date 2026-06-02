import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DELETED = { deletedAt: { not: null } } as any;

/** GET /api/admin/deleted — list all soft-deleted records (SUPER_ADMIN only) */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if ((session.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [patients, visits, invoices] = await Promise.all([
    prisma.patient.findMany({
      where:   DELETED,
      select:  { id: true, name: true, patientRef: true, deletedAt: true, deletedBy: true },
      orderBy: { deletedAt: "desc" },
      take:    200,
    }),
    prisma.visit.findMany({
      where:   DELETED,
      select:  { id: true, visitRef: true, visitDate: true, patientId: true, deletedAt: true, deletedBy: true, patient: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take:    200,
    }),
    prisma.invoice.findMany({
      where:   DELETED,
      select:  { id: true, invoiceRef: true, total: true, deletedAt: true, deletedBy: true, visit: { select: { visitRef: true, patient: { select: { name: true } } } } },
      orderBy: { deletedAt: "desc" },
      take:    200,
    }),
  ]);

  return NextResponse.json({ patients, visits, invoices });
}

/** POST /api/admin/deleted — restore a soft-deleted record (SUPER_ADMIN only) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if ((session.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, id } = await req.json();

  if (type === "patient") {
    await prisma.patient.update({
      where: { id },
      data:  { deletedAt: null, deletedBy: null } as any,
    });
  } else if (type === "visit") {
    await prisma.visit.update({
      where: { id },
      data:  { deletedAt: null, deletedBy: null } as any,
    });
    // Also restore invoices under this visit
    await prisma.invoice.updateMany({
      where: { visitId: id },
      data:  { deletedAt: null, deletedBy: null } as any,
    });
  } else if (type === "invoice") {
    await prisma.invoice.update({
      where: { id },
      data:  { deletedAt: null, deletedBy: null } as any,
    });
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
