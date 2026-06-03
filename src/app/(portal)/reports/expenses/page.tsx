import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExpensesClient } from "./ExpensesClient";

export default async function ExpensesReportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) redirect("/dashboard");

  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <ExpensesClient clinics={JSON.parse(JSON.stringify(clinics))} />;
}
