import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";

/** Soft-delete an invoice. Hard delete is never used. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const userId = (session.user as any)?.id as string;
  const role   = (session.user as any)?.role as string;

  if (!["SUPER_ADMIN","FINANCE","CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: notDeleted({ id: params.id }),
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  await prisma.invoice.update({
    where: { id: params.id },
    data:  { deletedAt: new Date(), deletedBy: userId } as any,
  });

  return NextResponse.json({ ok: true });
}
