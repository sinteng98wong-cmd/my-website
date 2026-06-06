import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  invoicePaymentId: z.string().min(1),
  allocatedAmount:  z.number().positive(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; remId: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recon = await prisma.monthlyRecon.findUnique({ where: { id: params.id } });
  if (!recon) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (recon.status === "LOCKED")
    return NextResponse.json({ error: "Month is locked" }, { status: 409 });

  const remittance = await prisma.panelRemittance.findUnique({ where: { id: params.remId } });
  if (!remittance || remittance.reconId !== params.id)
    return NextResponse.json({ error: "Remittance not found" }, { status: 404 });

  const body   = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const item = await prisma.panelRemittanceItem.upsert({
    where:  { remittanceId_invoicePaymentId: { remittanceId: params.remId, invoicePaymentId: parsed.data.invoicePaymentId } },
    update: { allocatedAmount: parsed.data.allocatedAmount, matchType: "MANUAL" },
    create: { remittanceId: params.remId, invoicePaymentId: parsed.data.invoicePaymentId, allocatedAmount: parsed.data.allocatedAmount, matchType: "MANUAL" },
  });

  return NextResponse.json(item);
}
