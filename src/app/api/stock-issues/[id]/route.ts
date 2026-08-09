/** GET /api/stock-issues/[id] — detail with batch allocations, clinic-scoped. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { isEditable, requiresApproval } from "@/lib/stock-issue";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const issue = await prisma.stockIssue.findUnique({
    where: { id: params.id },
    include: {
      clinic:     { select: { id: true, name: true, picId: true, pic: { select: { name: true } } } },
      createdBy:  { select: { id: true, name: true } },
      submittedBy:{ select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      lines: {
        include: {
          item:        { select: { id: true, sku: true, name: true, unit: true } },
          batch:       { select: { id: true, batchNumber: true, expiryDate: true } },
          allocations: { orderBy: { expiryDate: "asc" } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, issue.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Ledger references for the audit trail.
  const movementIds = issue.lines.map((l) => l.movementId).filter(Boolean) as string[];
  const movements = movementIds.length
    ? await prisma.stockMovement.findMany({
        where: { id: { in: movementIds } },
        select: { id: true, type: true, qtyOut: true, valueDelta: true, balanceAfter: true, period: true, postingKey: true },
      })
    : [];

  return NextResponse.json({
    ...issue,
    editable: isEditable(issue.status),
    needsApproval: requiresApproval(issue.reason),
    movements,
    viewer: {
      userId,
      isPic: issue.clinic.picId === userId,
      raisedThis: issue.createdById === userId || issue.submittedById === userId,
    },
  });
}
