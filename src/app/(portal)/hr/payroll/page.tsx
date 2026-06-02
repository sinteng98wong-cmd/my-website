import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { PayrollListClient } from "./PayrollListClient";

export default async function PayrollPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");
  const clinics = await getUserClinics();
  return <PayrollListClient clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} />;
}
