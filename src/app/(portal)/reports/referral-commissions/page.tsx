import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReferralCommissionsClient } from "./ReferralCommissionsClient";

export default async function ReferralCommissionsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) redirect("/dashboard");

  return <ReferralCommissionsClient isSuperAdmin={role === "SUPER_ADMIN"} />;
}
