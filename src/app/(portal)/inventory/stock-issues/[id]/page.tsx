import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { INVENTORY_ROLES } from "@/lib/clinic-access";
import { StockIssueDetailClient } from "./StockIssueDetailClient";

export default async function StockIssueDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  if (!INVENTORY_ROLES.includes(role)) redirect("/dashboard");
  return <StockIssueDetailClient id={params.id} />;
}
