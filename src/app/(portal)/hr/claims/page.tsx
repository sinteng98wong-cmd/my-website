import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClaimsClient } from "./ClaimsClient";

export default async function ClaimsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const isManager = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  const canPay = ["SUPER_ADMIN", "FINANCE"].includes(role);
  return <ClaimsClient isManager={isManager} canPay={canPay} />;
}
