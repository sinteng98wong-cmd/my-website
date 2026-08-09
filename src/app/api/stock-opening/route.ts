import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClinicAccess, clinicScopeFor, INVENTORY_ROLES } from "@/lib/clinic-access";
import { nextOpeningRef } from "@/services/stock-opening.service";
import { periodOf } from "@/lib/stock-ledger";
import { z } from "zod";

const CreateSchema = z.object({
  clinicId: z.string().min(1),
  itemIds:  z.array(z.string().min(1)).min(1, "select at least one item"),
  notes:    z.string().optional(),
});

/** Opening balance documents visible to the caller. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp     = req.nextUrl.searchParams;
  const scope  = await clinicScopeFor(role, userId, sp.get("clinicId"));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const status = sp.get("status");

  const docs = await prisma.openingBalance.findMany({
    where: {
      ...(scope.clinicIds ? { clinicId: { in: scope.clinicIds } } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      clinic:      { select: { id: true, name: true } },
      createdBy:   { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      reviewedBy:  { select: { id: true, name: true } },
      _count:      { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(docs);
}

/** Raise a draft over the chosen items. Quantities and costs start blank. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });

  const { clinicId, itemIds, notes } = parsed.data;
  const access = await assertClinicAccess(role, userId, clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const unique = [...new Set(itemIds)];
  const found  = await prisma.stockItem.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length)
    return NextResponse.json({ error: "One or more items were not found" }, { status: 422 });

  const doc = await prisma.openingBalance.create({
    data: {
      reference: await nextOpeningRef(periodOf(new Date())),
      clinicId, createdById: userId, notes: notes ?? null,
      lines: { create: unique.map((itemId) => ({ itemId })) },
    },
    include: { lines: { include: { item: { select: { id: true, name: true, unit: true } } } } },
  });
  return NextResponse.json(doc, { status: 201 });
}
