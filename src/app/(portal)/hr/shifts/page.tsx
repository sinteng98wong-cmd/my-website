import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { ShiftsClient } from "./ShiftsClient";

export default async function ShiftsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");
  const clinics = await getUserClinics();
  return <ShiftsClient clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} isSuperAdmin={role === "SUPER_ADMIN"} />;
}
