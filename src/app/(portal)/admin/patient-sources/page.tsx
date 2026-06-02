import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientSourcesClient } from "./PatientSourcesClient";

export default async function PatientSourcesPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") redirect("/dashboard");

  const sources = await prisma.patientSource.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { patients: true } } },
  });

  return (
    <PatientSourcesClient
      initial={sources.map((s) => ({
        id: s.id, name: s.name, description: s.description,
        isActive: s.isActive, order: s.order, patientCount: s._count.patients,
      }))}
    />
  );
}
