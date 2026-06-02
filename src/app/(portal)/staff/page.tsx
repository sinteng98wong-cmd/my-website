import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  await requirePermission("staff:manage");

  const [staff, clinics] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "SUPER_ADMIN" } },
      include: {
        userClinics: {
          include: { clinic: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return <StaffClient staff={JSON.parse(JSON.stringify(staff))} clinics={clinics} />;
}
