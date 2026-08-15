import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/selected-clinic";
import { PayrollSettingsClient } from "./PayrollSettingsClient";

export default async function PayrollSettingsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");
  const clinics = await getUserClinics();

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Payroll Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
          Per-branch payroll control: who signs off payslips and bank payments, which
          Head Nurse submits monthly attendance, and whether Lunch OT may be claimed.
          These approvers are independent of the Payment Voucher director/PIC.
        </p>
      </div>
      <PayrollSettingsClient
        clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
        canEdit={["SUPER_ADMIN", "FINANCE"].includes(role)}
      />
    </div>
  );
}
