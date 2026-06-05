import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StageTemplatesClient } from "./StageTemplatesClient";

export default async function StageTemplatesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const [treatmentTypes, templates] = await Promise.all([
    prisma.treatmentType.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.treatmentStageTemplate.findMany({
      where: { isActive: true },
      include: { treatmentType: { select: { name: true } } },
      orderBy: [{ treatmentTypeId: "asc" }, { order: "asc" }],
    }),
  ]);

  return (
    <StageTemplatesClient
      treatmentTypes={treatmentTypes}
      initialTemplates={JSON.parse(JSON.stringify(templates))}
    />
  );
}
