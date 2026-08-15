/**
 * GET  /api/stock-issues — list, scoped to the caller's clinics
 * POST /api/stock-issues — raise an issue (consumption or write-off)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess, clinicScopeFor, clinicWhere } from "@/lib/clinic-access";
import { checkIssuable, requiresApproval } from "@/lib/stock-issue";
import { checkLineAvailability } from "@/services/stock-issue.service";
import { z } from "zod";

const CreateSchema = z.object({
  clinicId: z.string().min(1),
  reason: z.enum(["CLINICAL_CONSUMPTION", "GENERAL_USAGE", "DAMAGED", "WASTAGE", "EXPIRED", "OTHER"]),
  notes: z.string().optional(),
  sourceKind: z.enum(["MANUAL", "VISIT", "TREATMENT"]).optional(),
  sourceRefId: z.string().optional(),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().positive(),
    batchId: z.string().optional().nullable(),
    note: z.string().optional(),
  })).min(1),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const scope = await clinicScopeFor(role, userId, sp.get("clinicId"));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const status = sp.get("status");
  const reason = sp.get("reason");
  const from = sp.get("from");
  const to = sp.get("to");

  const issues = await prisma.stockIssue.findMany({
    where: {
      ...clinicWhere(scope.clinicIds),
      ...(status ? { status: status as any } : {}),
      ...(reason ? { reason: reason as any } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    include: {
      clinic:    { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      reviewedBy:{ select: { name: true } },
      _count:    { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(issues);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const access = await assertClinicAccess(role, userId, d.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const issuable = checkIssuable(d.lines, d.reason);
  if (!issuable.ok) return NextResponse.json({ error: issuable.error }, { status: issuable.status });

  // Every item must belong to this clinic's stock context and have the stock.
  for (const l of d.lines) {
    const avail = await checkLineAvailability(d.clinicId, l.itemId, l.quantity);
    if (!avail.ok) return NextResponse.json({ error: avail.error }, { status: avail.status });
    if (l.batchId) {
      const batch = await prisma.stockBatch.findFirst({
        where: { id: l.batchId, clinicId: d.clinicId, itemId: l.itemId },
      });
      if (!batch) return NextResponse.json({ error: "Batch does not belong to this clinic and item" }, { status: 422 });
    }
  }

  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seq = await prisma.stockIssue.count({
    where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
  });

  const issue = await prisma.stockIssue.create({
    data: {
      reference: `ISS-${ym}-${String(seq + 1).padStart(3, "0")}`,
      clinicId: d.clinicId,
      reason: d.reason,
      notes: d.notes || null,
      sourceKind: d.sourceKind ?? "MANUAL",
      sourceRefId: d.sourceRefId || null,
      status: "DRAFT",
      createdById: userId,
      lines: {
        create: d.lines.map((l) => ({
          itemId: l.itemId, quantity: l.quantity, batchId: l.batchId || null, note: l.note || null,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json({ ...issue, requiresApproval: requiresApproval(d.reason) }, { status: 201 });
}
