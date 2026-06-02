import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const year = Number(sp.get("year")) || new Date().getFullYear();

  const runs = await prisma.payrollRun.findMany({
    where: { ...(clinicId ? { clinicId } : {}), month: { startsWith: `${year}-` } },
    include: { _count: { select: { slips: true } }, slips: { select: { eisEmployee: true, eisEmployer: true } } },
  });

  // aggregate per month
  const byMonth = new Map<string, any>();
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    byMonth.set(key, { month: key, totalGross: 0, totalNet: 0, totalEpf: 0, totalSocso: 0, totalEis: 0, totalTax: 0, staffCount: 0 });
  }
  for (const r of runs) {
    const e = byMonth.get(r.month);
    if (!e) continue;
    e.totalGross += Number(r.totalGross);
    e.totalNet += Number(r.totalNet);
    e.totalEpf += Number(r.totalEpf);
    e.totalSocso += Number(r.totalSocso);
    e.totalTax += Number(r.totalTax);
    e.totalEis += r.slips.reduce((s, sl) => s + Number(sl.eisEmployee) + Number(sl.eisEmployer), 0);
    e.staffCount += r._count.slips;
  }

  return NextResponse.json([...byMonth.values()]);
}
