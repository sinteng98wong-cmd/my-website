import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LabJobClient } from "./LabJobClient";

export default async function LabJobDetailPage({ params }: { params: { id: string } }) {
  const [job, vendors] = await Promise.all([
    prisma.labJob.findUnique({
      where: { id: params.id },
      include: {
        vendor:  true,
        clinic:  { select: { id: true, name: true } },
        visit: {
          include: {
            patient: { select: { id: true, name: true, patientRef: true, phone: true } },
            treatments: {
              include: {
                treatmentType: true,
                commissions: {
                  select: { id: true, finalPayout: true, labFee: true, status: true, doctorRate: true, doctorSplit: true, txAmount: true },
                },
              },
            },
            invoices: true,
          },
        },
        treatments: {
          include: {
            treatmentType: true,
            commissions: {
              select: { id: true, finalPayout: true, labFee: true, status: true, doctorRate: true, doctorSplit: true, txAmount: true },
            },
          },
        },
      },
    }),
    prisma.labVendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!job) notFound();

  return <LabJobClient job={JSON.parse(JSON.stringify(job))} vendors={vendors} />;
}
