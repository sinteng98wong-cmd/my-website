import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { daysUntilExpiry, computeLicenseStatus } from "@/lib/license";
import { sendLicenseExpiryAlert, sendLicenseExpiredAlert } from "@/lib/license-email";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const licenses = await prisma.license.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      licenseType:  { select: { name: true } },
      clinic:       { select: { name: true } },
      staffProfile: { select: { clinicId: true, user: { select: { name: true, email: true } } } },
    },
  });

  let processed = 0;

  for (const license of licenses) {
    const days       = daysUntilExpiry(license.expiryDate);
    const newStatus  = computeLicenseStatus(license.expiryDate);
    const entityName = license.scope === "CLINIC"
      ? (license.clinic?.name ?? "")
      : (license.staffProfile?.user.name ?? "");
    const clinicId   = license.scope === "CLINIC"
      ? license.clinicId
      : (license.staffProfile?.clinicId ?? null);
    const doctorEmail = license.scope === "DOCTOR"
      ? (license.staffProfile?.user.email ?? null)
      : null;

    const updates: Record<string, unknown> = {};
    if (newStatus !== license.status) updates.status = newStatus;

    const alertBase = {
      licenseId:  license.id,
      typeName:   license.licenseType.name,
      licenseNo:  license.licenseNo,
      entityName,
      expiryDate: license.expiryDate,
      scope:      license.scope as "CLINIC" | "DOCTOR",
      clinicId,
      doctorEmail,
    };

    if (days < 0 && !license.expiredAlertSent) {
      await sendLicenseExpiredAlert(alertBase);
      updates.expiredAlertSent = true;
    } else if (days >= 0 && days <= 7 && !license.alert7Sent) {
      await sendLicenseExpiryAlert({ ...alertBase, daysRemaining: days });
      updates.alert7Sent = true;
    } else if (days > 7 && days <= 30 && !license.alert30Sent) {
      await sendLicenseExpiryAlert({ ...alertBase, daysRemaining: days });
      updates.alert30Sent = true;
    } else if (days > 30 && days <= 60 && !license.alert60Sent) {
      await sendLicenseExpiryAlert({ ...alertBase, daysRemaining: days });
      updates.alert60Sent = true;
    } else if (days > 60 && days <= 90 && !license.alert90Sent) {
      await sendLicenseExpiryAlert({ ...alertBase, daysRemaining: days });
      updates.alert90Sent = true;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.license.update({ where: { id: license.id }, data: updates });
      processed++;
    }
  }

  return NextResponse.json({ processed, total: licenses.length });
}
