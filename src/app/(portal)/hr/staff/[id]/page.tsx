import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StaffProfileClient } from "./StaffProfileClient";

export default async function StaffProfilePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  const isSuperAdmin = role === "SUPER_ADMIN";
  return <StaffProfileClient id={params.id} userId={userId} isManager={isManager} isSuperAdmin={isSuperAdmin} />;
}
