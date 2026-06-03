import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { submitIndividualInvoice } from "@/lib/einvoice-service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  if (
    !session?.user ||
    !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "RECEPTIONIST"].includes(role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { invoiceId?: string };
  const { invoiceId } = body;
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 422 });

  try {
    const result = await submitIndividualInvoice(
      invoiceId,
      (session.user as { id?: string }).id
    );
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
