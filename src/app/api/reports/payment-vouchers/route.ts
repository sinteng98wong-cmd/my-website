import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId") ?? undefined;
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 1);

  const pvs = await prisma.paymentVoucher.findMany({
    where: {
      ...(clinicId ? { clinicId } : {}),
      createdAt: { gte: from, lt: to },
    },
    include: {
      supplier: { select: { name: true } },
      invoices: { include: { category: { select: { name: true } } } },
    },
  });

  const totalPaid    = pvs.filter((p) => p.status === "PAID").reduce((s, p) => s + Number(p.totalAmount), 0);
  const totalPending = pvs.filter((p) => !["PAID", "REJECTED"].includes(p.status)).reduce((s, p) => s + Number(p.totalAmount), 0);

  const catMap: Record<string, { category: string; totalAmount: number; pvCount: number }> = {};
  for (const pv of pvs) {
    for (const inv of pv.invoices) {
      const cat = inv.category?.name ?? "Uncategorized";
      if (!catMap[cat]) catMap[cat] = { category: cat, totalAmount: 0, pvCount: 0 };
      catMap[cat].totalAmount += Number(inv.amount);
      catMap[cat].pvCount++;
    }
  }

  const supMap: Record<string, { supplierName: string; totalAmount: number; pvCount: number }> = {};
  for (const pv of pvs) {
    const name = pv.supplier?.name ?? "Unknown";
    if (!supMap[name]) supMap[name] = { supplierName: name, totalAmount: 0, pvCount: 0 };
    supMap[name].totalAmount += Number(pv.totalAmount);
    supMap[name].pvCount++;
  }

  const byStatus = (["DRAFT", "PENDING_DIRECTOR", "PENDING_PIC", "APPROVED", "PAID", "REJECTED"] as const)
    .map((status) => {
      const filtered = pvs.filter((p) => p.status === status);
      return { status, count: filtered.length, totalAmount: filtered.reduce((s, p) => s + Number(p.totalAmount), 0) };
    });

  return NextResponse.json({
    totalPaid, totalPending,
    byCategory: Object.values(catMap).sort((a, b) => b.totalAmount - a.totalAmount),
    bySupplier: Object.values(supMap).sort((a, b) => b.totalAmount - a.totalAmount),
    byStatus,
    monthlyTrend: [],
  });
}
