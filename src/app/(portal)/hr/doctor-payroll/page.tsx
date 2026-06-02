import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DoctorPayrollClient } from "./DoctorPayrollClient";

export default async function DoctorPayrollPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const doctors = await prisma.doctorProfile.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <DoctorPayrollClient
      doctors={doctors.map((d) => ({ profileId: d.id, name: d.user.name, type: d.type }))}
    />
  );
}
