import { prisma } from "./prisma";

export async function generatePoRef(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const count = await prisma.poolOrder.count({
    where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
  });
  return `PO-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export async function generateDoRef(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const count = await prisma.deliveryOrder.count({
    where: { raisedAt: { gte: startOfMonth, lte: endOfMonth } },
  });
  return `DO-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export async function generatePurchaseOrderRef(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const count = await prisma.purchaseOrder.count({
    where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
  });
  return `PUR-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export async function generateStockInvoiceRef(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const count = await prisma.stockInvoice.count({
    where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
  });
  return `SINV-${ym}-${String(count + 1).padStart(3, "0")}`;
}
