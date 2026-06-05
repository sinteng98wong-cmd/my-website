import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR", "RECEPTIONIST"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: params.id },
    include: {
      patient:  { select: { id: true, name: true, patientRef: true, phone: true } },
      clinic:   { select: { id: true, name: true } },
      dentist:  { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      stages: {
        orderBy: { order: "asc" },
        include: { performedBy: { select: { name: true } }, visit: { select: { id: true, visitRef: true } } },
      },
      payments: {
        orderBy: { paidAt: "asc" },
        include: { recordedBy: { select: { name: true } }, invoice: { select: { id: true, invoiceRef: true } } },
      },
    },
  });

  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(plan);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plan = await prisma.treatmentPlan.findUnique({ where: { id: params.id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.status !== "DRAFT") return NextResponse.json({ error: "Only DRAFT plans can be edited" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updated = await prisma.treatmentPlan.update({
    where: { id: params.id },
    data: {
      ...(body.title           !== undefined && { title: body.title }),
      ...(body.toothCodes      !== undefined && { toothCodes: body.toothCodes }),
      ...(body.notes           !== undefined && { notes: body.notes }),
      ...(body.discount        !== undefined && { discount: body.discount, totalAmount: Math.max(0, Number(plan.subtotal) - body.discount) }),
      ...(body.depositRequired !== undefined && { depositRequired: body.depositRequired }),
      ...(body.paymentMode     !== undefined && { paymentMode: body.paymentMode }),
    },
  });
  return NextResponse.json(updated);
}
