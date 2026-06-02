import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LeaveDetailClient } from "./LeaveDetailClient";

export default async function LeaveDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  return <LeaveDetailClient id={params.id} isManager={isManager} />;
}
