import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SuppliersClient } from "./SuppliersClient";

export default async function SuppliersPage() {
  await requirePermission("stock:manage");

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
  });

  return <SuppliersClient initialSuppliers={suppliers} />;
}
