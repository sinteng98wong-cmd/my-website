import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { TrainingListClient } from "./TrainingListClient";

export default async function TrainingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session?.user as any)?.role as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  const clinics = isManager ? await getUserClinics() : [];
  return <TrainingListClient isManager={isManager} clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} />;
}
