import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  panelProviderId: z.string().min(1),
  remittanceRef:   z.string().optional(),
  receivedDate:    z.string().min(1),   // ISO date string
  totalAmount:     z.number().positive(),
  notes:           z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recon = await prisma.monthlyRecon.findUnique({ where: { id: params.id } });
  if (!recon) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (recon.status === "LOCKED")
    return NextResponse.json({ error: "Month is locked" }, { status: 409 });

  const body   = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;
  const remittance = await prisma.panelRemittance.create({
    data: {
      reconId:        params.id,
      clinicId:       recon.clinicId,
      panelProviderId: d.panelProviderId,
      remittanceRef:  d.remittanceRef ?? null,
      receivedDate:   new Date(d.receivedDate),
      totalAmount:    d.totalAmount,
      notes:          d.notes ?? null,
      createdById:    userId,
    },
  });

  return NextResponse.json(remittance, { status: 201 });
}
