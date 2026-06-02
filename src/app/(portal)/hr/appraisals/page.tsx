import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppraisalsClient } from "./AppraisalsClient";

export default async function AppraisalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session?.user as any)?.role as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  return <AppraisalsClient isManager={isManager} />;
}
