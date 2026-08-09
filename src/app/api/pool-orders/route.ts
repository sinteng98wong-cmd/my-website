import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generatePoRef } from "@/lib/ref-generator";
import { assertClinicAccess } from "@/lib/clinic-access";

const ALLOWED_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

const CreateSchema = z.object({
  supplierName: z.string().min(1),
  deliveryMode: z.enum(["CENTRALISED", "DIRECT"]),
  moqTarget: z.number().positive(),
  deadline: z.string().datetime({ offset: true }).optional(),
  notes: z.string().optional(),
  initiatingClinicId: z.string().min(1),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    totalQty: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
  })).min(1),
  initiatorItems: z.array(z.object({
    itemId: z.string().min(1),
    requestedQty: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
  })).optional().default([]),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");

  const orders = await prisma.poolOrder.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      initiatingClinic: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
      lines: { select: { unitCost: true, totalQty: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = orders.map((o) => ({
    id: o.id,
    poRef: o.poRef,
    supplierName: o.supplierName,
    status: o.status,
    deliveryMode: o.deliveryMode,
    initiatingClinic: o.initiatingClinic,
    participantCount: o._count.participants,
    moqTarget: o.moqTarget,
    totalAmount: o.lines.reduce((s, l) => s + Number(l.unitCost) * l.totalQty, 0),
    deadline: o.deadline,
    deadlineNotifiedAt: o.deadlineNotifiedAt,
    createdAt: o.createdAt,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const d = parsed.data;
  const userId = (session.user as any).id as string;

  // A pool may only be raised on behalf of a clinic the caller is authorized for.
  const access = await assertClinicAccess(role, userId, d.initiatingClinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const poRef = await generatePoRef();

  const initiatorAmount = d.initiatorItems.reduce(
    (s, item) => s + item.requestedQty * item.unitCost,
    0
  );

  const pool = await prisma.poolOrder.create({
    data: {
      poRef,
      initiatingClinicId: d.initiatingClinicId,
      supplierName: d.supplierName,
      deliveryMode: d.deliveryMode,
      moqTarget: d.moqTarget,
      deadline: d.deadline ? new Date(d.deadline) : null,
      notes: d.notes,
      raisedById: userId,
      status: "OPEN",
      lines: {
        create: d.lines.map((l) => ({
          itemId: l.itemId,
          totalQty: l.totalQty,
          unitCost: l.unitCost,
        })),
      },
      participants: {
        create: {
          clinicId: d.initiatingClinicId,
          requestedAmount: initiatorAmount,
          joinedById: userId,
          items: {
            create: d.initiatorItems.map((item) => ({
              itemId: item.itemId,
              requestedQty: item.requestedQty,
              unitCost: item.unitCost,
            })),
          },
        },
      },
    },
    include: {
      lines: true,
      participants: { include: { items: true } },
    },
  });

  return NextResponse.json(pool, { status: 201 });
}
