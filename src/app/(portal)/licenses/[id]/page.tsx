import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLicenseHistory, daysUntilExpiry } from "@/lib/license";
import Link from "next/link";
import { LicenseDetailClient } from "./LicenseDetailClient";

export default async function LicenseDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const license = await prisma.license.findUnique({
    where: { id: params.id },
    include: {
      licenseType:  true,
      clinic:       { select: { name: true } },
      staffProfile: { select: { user: { select: { name: true } } } },
      createdBy:    { select: { name: true } },
    },
  });

  if (!license) notFound();

  const history = await getLicenseHistory(params.id);
  const days    = daysUntilExpiry(license.expiryDate);

  return (
    <LicenseDetailClient
      license={JSON.parse(JSON.stringify(license))}
      history={JSON.parse(JSON.stringify(history))}
      daysUntilExpiry={days}
      role={role}
    />
  );
}
