import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { PayrollReportClient } from "./PayrollReportClient";

export default async function PayrollReportPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) redirect("/dashboard");
  const clinics = await getUserClinics();
  return <PayrollReportClient clinics={clinics.map((c) => ({ id: c.id, name: c.name }))} />;
}
