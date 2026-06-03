import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PVDetailClient } from "./PVDetailClient";

export default async function PVDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const pv = await prisma.paymentVoucher.findUnique({
    where: { id: params.id },
    include: {
      clinic:   { select: { id: true, name: true, directorId: true, picId: true } },
      supplier: true,
      fromClinic: { select: { id: true, name: true } },
      preparedBy:         { select: { id: true, name: true } },
      directorApprovedBy: { select: { id: true, name: true } },
      picApprovedBy:      { select: { id: true, name: true } },
      rejectedBy:         { select: { id: true, name: true } },
      paidBy:             { select: { id: true, name: true } },
      invoices: {
        include: {
          category:     { select: { name: true } },
          labJob:       { select: { id: true, labJobRef: true, workDescription: true, estimatedFee: true, invoiceAmount: true } },
          stockInvoice: { select: { id: true, invoiceRef: true, totalAmount: true } },
          poolOrder:    { select: { id: true, poRef: true } },
          fromClinic:   { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!pv) notFound();

  const role   = (session.user as any)?.role as string;
  const userId = (session.user as any)?.id   as string;

  return (
    <PVDetailClient
      pv={JSON.parse(JSON.stringify(pv))}
      role={role}
      userId={userId}
    />
  );
}
