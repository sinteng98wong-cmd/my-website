import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { INVENTORY_ROLES } from "@/lib/clinic-access";
import { OpeningBalanceDetailClient } from "./OpeningBalanceDetailClient";

export default async function OpeningBalanceDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) redirect("/dashboard");

  return <OpeningBalanceDetailClient id={params.id} role={role} userId={userId} />;
}
