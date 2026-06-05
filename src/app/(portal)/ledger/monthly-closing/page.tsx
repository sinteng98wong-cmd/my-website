import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { MonthlyClosingClient } from "./MonthlyClosingClient";

export default async function MonthlyClosingPage({
  searchParams,
}: {
  searchParams: { month?: string; clinicId?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const month    = searchParams.month    ?? new Date().toISOString().slice(0, 7);
  const clinicId = searchParams.clinicId ?? getSelectedClinicId() ?? "";

  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <MonthlyClosingClient
      clinics={clinics}
      initialMonth={month}
      initialClinicId={clinicId}
    />
  );
}
