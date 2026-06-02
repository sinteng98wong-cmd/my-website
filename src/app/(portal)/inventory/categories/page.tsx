import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CategoriesClient } from "./CategoriesClient";

export default async function CategoriesPage() {
  await requirePermission("stock:manage");

  const categories = await prisma.stockCategory.findMany({
    where: { parentId: null },
    orderBy: { name: "asc" },
    include: {
      children: { orderBy: { name: "asc" } },
    },
  });

  return <CategoriesClient initialCategories={categories} />;
}
