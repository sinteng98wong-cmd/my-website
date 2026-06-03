import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentVouchersClient } from "./PaymentVouchersClient";

export default async function PaymentVouchersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role   = (session.user as any)?.role as string;
  const userId = (session.user as any)?.id   as string;

  let pvs: any[] = [];

  if (["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    pvs = await prisma.paymentVoucher.findMany({
      include: {
        supplier:   { select: { name: true } },
        clinic:     { select: { name: true } },
        preparedBy: { select: { name: true } },
        _count:     { select: { invoices: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  } else {
    pvs = await prisma.paymentVoucher.findMany({
      where: {
        OR: [
          { directorId: userId, status: "PENDING_DIRECTOR" },
          { picId: userId, status: "PENDING_PIC" },
        ],
      },
      include: {
        supplier:   { select: { name: true } },
        clinic:     { select: { name: true } },
        preparedBy: { select: { name: true } },
        _count:     { select: { invoices: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  return (
    <PaymentVouchersClient
      pvs={JSON.parse(JSON.stringify(pvs))}
      role={role}
      userId={userId}
    />
  );
}
