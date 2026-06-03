import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDocumentStatus, getEntityConfig } from "@/lib/myinvois-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { visit: { include: { clinic: { include: { entity: true } } } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = invoice as any;
  if (!invAny.eInvoiceUUID) {
    return NextResponse.json({
      eInvoiceStatus: invAny.eInvoiceStatus ?? "NOT_SUBMITTED",
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = invoice.visit.clinic.entity as any;
    const config = getEntityConfig(entity);
    const status = await getDocumentStatus(config, invAny.eInvoiceUUID as string);
    return NextResponse.json({ ...status, localStatus: invAny.eInvoiceStatus });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
