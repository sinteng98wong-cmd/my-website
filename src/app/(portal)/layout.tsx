import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PortalShell } from "@/components/PortalShell";
import { getUserClinics, getSelectedClinicId, getEffectiveRole } from "@/lib/selected-clinic";
import { getModuleAccessForRole } from "@/lib/access-config";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const baseRole = (session.user as any)?.role ?? "";

  const [clinics, selectedClinicId, effectiveRole] = await Promise.all([
    getUserClinics(),
    Promise.resolve(getSelectedClinicId()),
    getEffectiveRole(),
  ]);

  const allowedModules = await getModuleAccessForRole(effectiveRole);

  return (
    <PortalShell
      clinics={clinics}
      selectedClinicId={selectedClinicId}
      allowedModules={[...allowedModules]}
      effectiveRole={effectiveRole}
      baseRole={baseRole}
    >
      {children}
    </PortalShell>
  );
}
