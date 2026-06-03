import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SuppliersClient } from "./SuppliersClient";

export default async function SuppliersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const suppliers = await prisma.supplier.findMany({
    where: { active: true },
    include: { _count: { select: { pvs: true } } },
    orderBy: { name: "asc" },
  });

  return <SuppliersClient suppliers={JSON.parse(JSON.stringify(suppliers))} role={role} />;
}
