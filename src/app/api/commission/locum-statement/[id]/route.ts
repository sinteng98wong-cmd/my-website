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
 * Body: { action: "approve" | "lock" }
 * Roles: SUPER_ADMIN, FINANCE
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    splitRate?: number;
  };
  const { action, splitRate } = body;

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 422 });

  const existing = await (prisma as any).locumReconciliationStatement.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Adjust split rate + regenerate payload
  if (action === "adjust_split") {
    if (splitRate === undefined || splitRate <= 0 || splitRate > 100)
      return NextResponse.json({ error: "splitRate must be between 1 and 100" }, { status: 422 });

    if (!["DRAFT", "APPROVED"].includes(existing.status))
      return NextResponse.json({ error: "Only DRAFT or APPROVED statements can be adjusted" }, { status: 409 });

    const { generateLocumStatement } = await import("@/services/commission.service");
    const Decimal = (await import("decimal.js")).default;
    const { prisma: db } = await import("@/lib/prisma");

    const { statementId } = await generateLocumStatement(
      existing.doctorId,
      existing.month,
      new Decimal(splitRate),
      [],
      db,
    );
    const refreshed = await (prisma as any).locumReconciliationStatement.findUnique({ where: { id: statementId } });
    return NextResponse.json(refreshed);
  }

  if (!["approve", "lock"].includes(action))
    return NextResponse.json({ error: "action must be 'approve', 'lock', or 'adjust_split'" }, { status: 422 });

  const newStatus = action === "lock" ? "LOCKED" : "APPROVED";
  const updated = await (prisma as any).locumReconciliationStatement.update({
    where: { id: params.id },
    data:  { status: newStatus },
  });
  return NextResponse.json(updated);
}
