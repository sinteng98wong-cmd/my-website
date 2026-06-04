import { LicenseStatus, type License } from "@prisma/client";
import { prisma } from "./prisma";

export function daysUntilExpiry(expiryDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeLicenseStatus(expiryDate: Date, alertWindowDays = 90): LicenseStatus {
  const days = daysUntilExpiry(expiryDate);
  if (days < 0) return LicenseStatus.EXPIRED;
  if (days <= alertWindowDays) return LicenseStatus.EXPIRING_SOON;
  return LicenseStatus.ACTIVE;
}

export async function renewLicense(
  licenseId: string,
  newExpiryDate: Date,
  newLicenseNo: string | undefined,
  newDocumentUrl: string | undefined,
  newDocumentName: string | undefined,
  renewedById: string
): Promise<License> {
  const old = await prisma.license.findUniqueOrThrow({
    where: { id: licenseId },
  });

  const newStatus = computeLicenseStatus(newExpiryDate);

  const [newLicense] = await prisma.$transaction([
    prisma.license.create({
      data: {
        licenseTypeId:   old.licenseTypeId,
        scope:           old.scope,
        clinicId:        old.clinicId,
        staffProfileId:  old.staffProfileId,
        licenseNo:       newLicenseNo ?? old.licenseNo,
        expiryDate:      newExpiryDate,
        status:          newStatus,
        documentUrl:     newDocumentUrl ?? old.documentUrl,
        documentName:    newDocumentName ?? old.documentName,
        notes:           old.notes,
        previousLicenseId: old.id,
        createdById:     renewedById,
      },
    }),
    prisma.license.update({
      where: { id: old.id },
      data:  { status: LicenseStatus.ARCHIVED },
    }),
  ]);

  // Prune renewal chain — keep only newest 3
  await pruneRenewalChain(newLicense.id);

  return newLicense;
}

async function pruneRenewalChain(latestId: string) {
  const chain: string[] = [];
  let current = await prisma.license.findUnique({ where: { id: latestId }, select: { id: true, previousLicenseId: true } });
  while (current) {
    chain.push(current.id);
    if (!current.previousLicenseId) break;
    current = await prisma.license.findUnique({ where: { id: current.previousLicenseId }, select: { id: true, previousLicenseId: true } });
  }

  if (chain.length <= 3) return;

  const toRemove = chain.slice(3);
  await prisma.license.deleteMany({ where: { id: { in: toRemove } } });
}

export async function getLicenseHistory(licenseId: string): Promise<License[]> {
  const results: License[] = [];
  let current = await prisma.license.findUnique({ where: { id: licenseId } });
  while (current) {
    results.push(current);
    if (!current.previousLicenseId) break;
    current = await prisma.license.findUnique({ where: { id: current.previousLicenseId } });
  }
  return results;
}
