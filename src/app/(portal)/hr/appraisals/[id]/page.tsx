import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppraisalDetailClient } from "./AppraisalDetailClient";

export default async function AppraisalDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  return <AppraisalDetailClient id={params.id} userId={userId} isManager={isManager} />;
}
