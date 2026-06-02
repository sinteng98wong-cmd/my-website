import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateEntitlement, getLeaveBalance } from "@/lib/leave";

const LEAVE_TYPES = ["ANNUAL","MEDICAL","EMERGENCY","MATERNITY","PATERNITY","UNPAID","REPLACEMENT","HOSPITALISATION","COMPASSIONATE"] as const;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  const year = today.getFullYear();
  const isJanuary = today.getMonth() === 0;

  const activeStaff = await prisma.staffProfile.findMany({
    where: { employmentStatus: { in: ["ACTIVE", "PROBATION"] } },
    select: { id: true, joinDate: true },
  });

  let created = 0, updated = 0;

  for (const staff of activeStaff) {
    for (const lt of LEAVE_TYPES) {
      if (isJanuary) {
        // New year — carry over and create new balances
        const prevYear = year - 1;
        const prev = await prisma.leaveBalance.findUnique({
          where: { staffProfileId_year_leaveType: { staffProfileId: staff.id, year: prevYear, leaveType: lt as any } },
        });
        const carryOverDays = lt === "ANNUAL" && prev ? Math.min(Number(prev.balance), 8) : 0;
        const entitled = calculateEntitlement(lt as any, staff.joinDate ?? new Date(year, 0, 1), new Date(year, 11, 31));
        await prisma.leaveBalance.upsert({
          where: { staffProfileId_year_leaveType: { staffProfileId: staff.id, year, leaveType: lt as any } },
          create: { staffProfileId: staff.id, year, leaveType: lt as any, entitled, carriedOver: carryOverDays, balance: entitled + carryOverDays, taken: 0, pending: 0 },
          update: { entitled, carriedOver: carryOverDays, balance: entitled + carryOverDays },
        });
        if (prev && carryOverDays > 0) {
          await prisma.leaveBalance.update({ where: { id: prev.id }, data: { forfeited: Math.max(0, Number(prev.balance) - carryOverDays) } });
        }
        created++;
      } else {
        // Monthly refresh — sync pending days from open applications
        const pending = await prisma.leaveApplication.findMany({
          where: { staffProfileId: staff.id, leaveType: lt as any, status: "PENDING", startDate: { gte: new Date(year, 0, 1) } },
          select: { totalDays: true },
        });
        const pendingDays = pending.reduce((s, a) => s + Number(a.totalDays), 0);
        await prisma.leaveBalance.updateMany({
          where: { staffProfileId: staff.id, year, leaveType: lt as any },
          data: { pending: pendingDays },
        });
        updated++;
      }
    }
  }

  return NextResponse.json({ processed: activeStaff.length, isJanuary, created, updated });
}
