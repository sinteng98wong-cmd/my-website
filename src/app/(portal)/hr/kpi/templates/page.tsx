import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { KpiTemplatesClient } from "./KpiTemplatesClient";

export default async function KpiTemplatesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (role !== "SUPER_ADMIN") redirect("/hr/kpi");
  return <KpiTemplatesClient />;
}
