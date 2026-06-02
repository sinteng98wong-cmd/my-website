import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { NewStaffClient } from "./NewStaffClient";

export default async function NewStaffPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) redirect("/hr/staff");
  const clinics = await getUserClinics();
  return <NewStaffClient clinics={clinics.map(c => ({ id: c.id, name: c.name }))} />;
}
