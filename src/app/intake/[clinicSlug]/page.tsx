import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage({ params }: { params: { clinicSlug: string } }) {
  const clinic = await prisma.clinic.findUnique({
    where: { slug: params.clinicSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!clinic) notFound();

  const sources = await prisma.patientSource.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="mx-auto max-w-xl">
        <div className="rounded-t-xl bg-blue-600 px-6 py-5 text-white">
          <h1 className="text-lg font-bold">{clinic.name}</h1>
          <p className="text-sm text-blue-100 mt-0.5">Patient Registration</p>
        </div>
        <div className="rounded-b-xl bg-white p-6 shadow-sm">
          <IntakeForm clinicSlug={clinic.slug!} sources={sources} />
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Powered by DentalOS</p>
      </div>
    </div>
  );
}
