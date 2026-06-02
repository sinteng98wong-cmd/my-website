import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { ScheduleClient } from "./ScheduleClient";

export default async function SchedulePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  const clinics = await getUserClinics();
  return <ScheduleClient clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} isManager={isManager} />;
}
