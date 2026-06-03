import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewPVClient } from "./NewPVClient";

export default async function NewPVPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) redirect("/payment-vouchers");

  const [clinics, categories] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true, directorId: true, picId: true }, orderBy: { name: "asc" } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);

  return (
    <NewPVClient
      clinics={JSON.parse(JSON.stringify(clinics))}
      categories={JSON.parse(JSON.stringify(categories))}
    />
  );
}
