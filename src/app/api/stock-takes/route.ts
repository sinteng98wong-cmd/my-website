/**
 * GET  /api/stock-takes  — list, scoped to the caller's clinics
 * POST /api/stock-takes  — raise a count, snapshotting current system figures
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess, clinicScopeFor, clinicWhere } from "@/lib/clinic-access";
import { buildStockTakeLines } from "@/services/stock-take.service";
import { z } from "zod";

const CreateSchema = z.object({
  clinicId: z.string().min(1),
  notes: z.string().optional(),
  /** Omit both to count every item that the clinic holds or could hold. */
  itemIds: z.array(z.string().min(1)).optional(),
  categoryId: z.string().optional(),
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
  const from = sp.get("from");
  const to   = sp.get("to");

  const takes = await prisma.stockTake.findMany({
    where: {
      ...clinicWhere(scope.clinicIds),
      ...(status ? { status: status as any } : {}),
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

  return NextResponse.json(takes);
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

  // The clinic comes from the request, so it must be authorized.
  const access = await assertClinicAccess(role, userId, d.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Resolve the item set: explicit ids, a category, or everything the clinic holds.
  let itemIds = d.itemIds ?? [];
  if (!itemIds.length) {
    const items = await prisma.stockItem.findMany({
      where: d.categoryId ? { categoryId: d.categoryId } : {},
      select: { id: true },
    });
    itemIds = items.map((i) => i.id);
  }
  if (!itemIds.length) return NextResponse.json({ error: "No items to count" }, { status: 422 });

  const lines = await buildStockTakeLines(d.clinicId, itemIds);

  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seq = await prisma.stockTake.count({
    where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
  });

  const take = await prisma.stockTake.create({
    data: {
      reference: `STK-${ym}-${String(seq + 1).padStart(3, "0")}`,
      clinicId: d.clinicId,
      status: "DRAFT",
      notes: d.notes || null,
      createdById: userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  return NextResponse.json(take, { status: 201 });
}
