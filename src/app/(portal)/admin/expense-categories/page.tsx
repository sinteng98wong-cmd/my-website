import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExpenseCategoriesClient } from "./ExpenseCategoriesClient";

export default async function ExpenseCategoriesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any)?.role as string;
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const categories = await prisma.expenseCategory.findMany({
    orderBy: { order: "asc" },
  });

  return <ExpenseCategoriesClient categories={JSON.parse(JSON.stringify(categories))} />;
}
