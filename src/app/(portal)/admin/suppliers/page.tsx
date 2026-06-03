import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SuppliersClient } from "./SuppliersClient";

export default async function AdminSuppliersPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) redirect("/login");
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"].includes(role))
    redirect("/dashboard");

  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { pvs: true, purchaseOrders: true, stockInvoices: true } } },
    orderBy: { name: "asc" },
  });

  return <SuppliersClient suppliers={JSON.parse(JSON.stringify(suppliers))} role={role} />;
}
