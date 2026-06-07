import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/commission/locum-statement/:id
 * Returns a single LocumReconciliationStatement with doctor name.
 * Doctors may only fetch their own; Finance/Admin can fetch any.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role   = (session.user as any).role  as string;
  const userId = (session.user as any).id    as string;

  const stmt = await (prisma as any).locumReconciliationStatement.findUnique({
    where:   { id: params.id },
    include: { doctor: { include: { user: { select: { name: true } } } } },
  });

  if (!stmt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Doctors may only view their own slip
  if (role === "DOCTOR" && stmt.doctor.userId !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(stmt);
}

/**
 * PATCH /api/commission/locum-statement/:id
 * Body: { action: "doctor-sign" | "cm-approve" | "finance-approve" | "lock" | "adjust_split", splitRate? }
 *
 * Status flow: DRAFT → DOCTOR_SIGNED → CM_APPROVED → FINANCE_APPROVED → LOCKED
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role   = (session.user as any).role   as string;
  const userId = (session.user as any).id     as string;
  const name   = ((session.user as any).name  as string) ?? userId;

  const body = await req.json().catch(() => ({})) as { action?: string; splitRate?: number };
  const { action, splitRate } = body;
  if (!action) return NextResponse.json({ error: "action is required" }, { status: 422 });

  const existing = await (prisma as any).locumReconciliationStatement.findUnique({
    where:   { id: params.id },
    include: { doctor: { select: { userId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "adjust_split") {
    if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (splitRate === undefined || splitRate <= 0 || splitRate > 100)
      return NextResponse.json({ error: "splitRate must be 1–100" }, { status: 422 });
    if (!["DRAFT", "DOCTOR_SIGNED"].includes(existing.status))
      return NextResponse.json({ error: "Can only adjust DRAFT or DOCTOR_SIGNED statements" }, { status: 409 });

    const { generateLocumStatement } = await import("@/services/commission.service");
    const Decimal = (await import("decimal.js")).default;
    const { prisma: db } = await import("@/lib/prisma");
    const { statementId } = await generateLocumStatement(existing.doctorId, existing.month, new Decimal(splitRate), [], db);
    const refreshed = await (prisma as any).locumReconciliationStatement.findUnique({ where: { id: statementId } });
    return NextResponse.json(refreshed);
  }

  if (action === "doctor-sign") {
    if (role !== "DOCTOR" || existing.doctor.userId !== userId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "DRAFT")
      return NextResponse.json({ error: "Only DRAFT statements can be signed by the doctor" }, { status: 409 });
    const updated = await (prisma as any).locumReconciliationStatement.update({
      where: { id: params.id },
      data:  { status: "DOCTOR_SIGNED", doctorSignedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  if (action === "cm-approve") {
    if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "DOCTOR_SIGNED")
      return NextResponse.json({ error: "Statement must be DOCTOR_SIGNED before CM approval" }, { status: 409 });
    const updated = await (prisma as any).locumReconciliationStatement.update({
      where: { id: params.id },
      data:  { status: "CM_APPROVED", cmApprovedAt: new Date(), cmApprovedBy: name },
    });
    return NextResponse.json(updated);
  }

  if (action === "finance-approve") {
    if (!["SUPER_ADMIN", "FINANCE"].includes(role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "CM_APPROVED")
      return NextResponse.json({ error: "Statement must be CM_APPROVED before Finance approval" }, { status: 409 });
    const updated = await (prisma as any).locumReconciliationStatement.update({
      where: { id: params.id },
      data:  { status: "FINANCE_APPROVED", financeApprovedAt: new Date(), financeApprovedBy: name },
    });
    return NextResponse.json(updated);
  }

  if (action === "lock") {
    if (!["SUPER_ADMIN", "FINANCE"].includes(role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "FINANCE_APPROVED")
      return NextResponse.json({ error: "Statement must be FINANCE_APPROVED before locking" }, { status: 409 });
    const updated = await (prisma as any).locumReconciliationStatement.update({
      where: { id: params.id },
      data:  { status: "LOCKED" },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 422 });
}
