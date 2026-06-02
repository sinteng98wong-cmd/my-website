import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { LeaveDashboard } from "./LeaveDashboard";

export default async function LeavePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  const clinicId = getSelectedClinicId() ?? "";

  return <LeaveDashboard isManager={isManager} clinicId={clinicId} />;
}
