import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
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

  const remittance = await prisma.panelRemittance.findUnique({
    where:   { id: params.remId },
    include: { items: true },
  });
  if (!remittance || remittance.reconId !== params.id)
    return NextResponse.json({ error: "Remittance not found" }, { status: 404 });

  // Build month range from the recon month
  const [year, mon] = recon.month.split("-").map(Number);
  const monthStart  = new Date(year, mon - 1, 1);
  const monthEnd    = new Date(year, mon, 1);

  // Find all unmatched panel invoice payments for this provider in this month
  const alreadyMatched = new Set(remittance.items.map(i => i.invoicePaymentId));

  const candidates = await prisma.invoicePayment.findMany({
    where: {
      method:          "PANEL",
      panelProviderId: remittance.panelProviderId,
      // Not already matched to this remittance
      id:     { notIn: [...alreadyMatched] },
      invoice: {
        deletedAt: null,
        visit: {
          clinicId:  recon.clinicId,
          visitDate: { gte: monthStart, lt: monthEnd },
        },
      },
    },
    include: {
      invoice:      { select: { invoiceRef: true } },
      remittanceItems: { select: { allocatedAmount: true } },
    },
  });

  // Only match ones that haven't been fully allocated elsewhere
  const unallocated = candidates.filter(ip => {
    const alreadyAlloc = ip.remittanceItems.reduce((s, ri) => s + Number(ri.allocatedAmount), 0);
    return alreadyAlloc < Number(ip.amount);
  });

  // Greedily allocate up to remittance.totalAmount
  let remaining = Number(remittance.totalAmount) - remittance.items.reduce((s, i) => s + Number(i.allocatedAmount), 0);

  const toCreate: { remittanceId: string; invoicePaymentId: string; allocatedAmount: number; matchType: string }[] = [];
  for (const ip of unallocated) {
    if (remaining <= 0) break;
    const needed    = Number(ip.amount) - ip.remittanceItems.reduce((s, ri) => s + Number(ri.allocatedAmount), 0);
    const alloc     = Math.min(needed, remaining);
    toCreate.push({ remittanceId: params.remId, invoicePaymentId: ip.id, allocatedAmount: alloc, matchType: "AUTO" });
    remaining -= alloc;
  }

  if (toCreate.length > 0) {
    await prisma.panelRemittanceItem.createMany({ data: toCreate, skipDuplicates: true });
  }

  return NextResponse.json({ matched: toCreate.length, remainingUnallocated: Math.max(0, remaining) });
}
