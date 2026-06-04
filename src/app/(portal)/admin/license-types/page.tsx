import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LicenseTypesClient } from "./LicenseTypesClient";

export default async function LicenseTypesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const types = await prisma.licenseType.findMany({ orderBy: [{ scope: "asc" }, { order: "asc" }] });

  return <LicenseTypesClient initialTypes={JSON.parse(JSON.stringify(types))} />;
}
