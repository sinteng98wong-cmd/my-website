import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { KpiListClient } from "./KpiListClient";

export default async function KpiPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) redirect("/login");
  const clinics = await getUserClinics();
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  return <KpiListClient clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} isManager={isManager} />;
}
