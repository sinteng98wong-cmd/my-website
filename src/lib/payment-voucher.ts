import { prisma } from "./prisma";

export async function generatePvRef(clinicId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PV-${year}${month}`;
  const count = await prisma.paymentVoucher.count({
    where: { pvRef: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

export async function isLabJobAlreadyBilled(labJobId: string, excludePvId?: string): Promise<boolean> {
  const inv = await prisma.supplierInvoice.findFirst({
    where: {
      labJobId,
      ...(excludePvId ? { pvId: { not: excludePvId } } : {}),
    },
  });
  return !!inv;
}

export async function isStockInvoiceAlreadyBilled(stockInvoiceId: string, excludePvId?: string): Promise<boolean> {
  const inv = await prisma.supplierInvoice.findFirst({
    where: {
      stockInvoiceId,
      ...(excludePvId ? { pvId: { not: excludePvId } } : {}),
    },
  });
  return !!inv;
}

export function calculatePVTotal(invoices: { amount: number | string }[]): number {
  return invoices.reduce((s, i) => s + Number(i.amount), 0);
}
