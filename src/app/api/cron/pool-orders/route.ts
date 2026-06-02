import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { format, differenceInHours } from "date-fns";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const minus24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // RUN 1 — Auto-close expired
  const expiredPools = await prisma.poolOrder.findMany({
    where: {
      status: { in: ["OPEN", "REOPENED"] },
      deadline: { not: null, lt: now },
    },
    include: {
      initiatingClinic: {
        include: {
          userClinics: {
            include: { user: { select: { email: true, name: true, role: true } } },
          },
        },
      },
      participants: true,
      lines: true,
    },
  });

  for (const pool of expiredPools) {
    await prisma.poolOrder.update({ where: { id: pool.id }, data: { status: "CLOSED" } });

    const managers = pool.initiatingClinic.userClinics
      .filter((uc) => uc.user.role === "CLINIC_MANAGER" || uc.user.role === "SUPER_ADMIN")
      .map((uc) => uc.user.email);

    if (managers.length > 0) {
      const total = pool.lines.reduce((s, l) => s + Number(l.unitCost) * l.totalQty, 0);
      await resend.emails.send({
        from: "DentalOS <no-reply@dentalos.my>",
        to: managers,
        subject: `Pool Order ${pool.poRef} auto-closed — deadline passed`,
        html: `<p>Your pool order <strong>${pool.poRef}</strong> for <strong>${pool.supplierName}</strong> has been automatically closed as the deadline has passed.</p>
<p>${pool.participants.length} clinics joined, total value RM ${total.toFixed(2)}.</p>
<p>You can reopen it from the Pool Orders page if needed.</p>`,
      });
    }
  }

  // RUN 2 — 48hr reminder
  const reminderPools = await prisma.poolOrder.findMany({
    where: {
      status: { in: ["OPEN", "REOPENED"] },
      deadline: { not: null, gte: now, lte: in48h },
      OR: [
        { deadlineNotifiedAt: null },
        { deadlineNotifiedAt: { lt: minus24h } },
      ],
    },
    include: {
      initiatingClinic: {
        include: {
          userClinics: {
            include: { user: { select: { email: true, name: true, role: true } } },
          },
        },
      },
      participants: true,
      lines: true,
    },
  });

  for (const pool of reminderPools) {
    const managers = pool.initiatingClinic.userClinics
      .filter((uc) => uc.user.role === "CLINIC_MANAGER" || uc.user.role === "SUPER_ADMIN")
      .map((uc) => uc.user.email);

    if (managers.length > 0 && pool.deadline) {
      const hoursRemaining = Math.max(0, differenceInHours(pool.deadline, now));
      const total = pool.lines.reduce((s, l) => s + Number(l.unitCost) * l.totalQty, 0);
      const moq = Number(pool.moqTarget);
      const moqStatus = total >= moq
        ? `MOQ reached (RM ${total.toFixed(2)} / RM ${moq.toFixed(2)})`
        : `MOQ not yet reached — RM ${(moq - total).toFixed(2)} remaining`;

      await resend.emails.send({
        from: "DentalOS <no-reply@dentalos.my>",
        to: managers,
        subject: `Reminder: Pool Order ${pool.poRef} closes in ${hoursRemaining} hours`,
        html: `<p>Pool order <strong>${pool.poRef}</strong> for <strong>${pool.supplierName}</strong> will close on <strong>${format(pool.deadline, "d MMM yyyy, h:mm a")}</strong>.</p>
<p>${pool.participants.length} clinics have joined so far, total value RM ${total.toFixed(2)}.</p>
<p>MOQ target: RM ${moq.toFixed(2)} — ${moqStatus}.</p>`,
      });
    }

    await prisma.poolOrder.update({
      where: { id: pool.id },
      data: { deadlineNotifiedAt: now },
    });
  }

  return NextResponse.json({
    autoClosed: expiredPools.length,
    reminded: reminderPools.length,
  });
}
