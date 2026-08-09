import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateDoRef } from "@/lib/ref-generator";
import { clinicScopeFor } from "@/lib/clinic-access";

const ALLOWED_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

const CreateSchema = z.object({
  fromClinicId: z.string().min(1),
  toClinicId: z.string().min(1),
  notes: z.string().optional(),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
  })).min(1),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  const clinicIdFilter = req.nextUrl.searchParams.get("clinicId");

  // A requested clinicId narrows the caller's own scope — it never replaces it.
  const scope = await clinicScopeFor(role, userId, clinicIdFilter);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const userClinicIds = scope.clinicIds ?? undefined;

  const uninvoiced = req.nextUrl.searchParams.get("uninvoiced") === "1";

  const where: any = {};
  if (status) where.status = status;
  if (uninvoiced) where.stockInvoiceId = null;
  if (userClinicIds) {
    where.OR = [
      { fromClinicId: { in: userClinicIds } },
      { toClinicId: { in: userClinicIds } },
    ];
  }

  const orders = await prisma.deliveryOrder.findMany({
    where,
    include: {
      fromClinic: { select: { id: true, name: true, entityId: true } },
      toClinic:   { select: { id: true, name: true } },
      poolOrder:  { select: { id: true, poRef: true } },
      lines: {
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true, category: true } },
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  // Determine user's clinic ids for action-needed flagging
  const myClinicIds: string[] = userClinicIds ?? (await prisma.clinic.findMany({ select: { id: true } })).map((c) => c.id);

  const result = orders.map((o) => ({
    ...o,
    totalValue: o.lines.reduce((s, l) => s + l.quantity * Number(l.unitCost), 0),
    actionNeeded: myClinicIds.includes(o.toClinicId) && o.status === "IN_TRANSIT",
    approvalNeeded: myClinicIds.includes(o.fromClinicId) && o.status === "PENDING",
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const d = parsed.data;

  // Non-SUPER_ADMIN must belong to either fromClinic (dispatching) OR toClinic (requesting).
  // This allows a branch to raise an inbound request from HQ/another branch.
  if (role !== "SUPER_ADMIN") {
    const [fromLink, toLink] = await Promise.all([
      prisma.userClinic.findFirst({ where: { userId, clinicId: d.fromClinicId } }),
      prisma.userClinic.findFirst({ where: { userId, clinicId: d.toClinicId } }),
    ]);
    if (!fromLink && !toLink) {
      return NextResponse.json({ error: "Forbidden: you must belong to either the sending or receiving clinic" }, { status: 403 });
    }
  }

  const doRef = await generateDoRef();

  const order = await prisma.deliveryOrder.create({
    data: {
      doRef,
      fromClinicId: d.fromClinicId,
      toClinicId: d.toClinicId,
      notes: d.notes,
      status: "DRAFT",
      raisedById: userId,
      lines: {
        create: d.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json(order, { status: 201 });
}
