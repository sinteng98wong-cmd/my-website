import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PayrollDetailClient } from "./PayrollDetailClient";

export default async function PayrollDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");
  return <PayrollDetailClient id={params.id} canApprove={["SUPER_ADMIN", "FINANCE"].includes(role)} />;
}
