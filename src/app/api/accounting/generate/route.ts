import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateLedgerEntries } from "@/lib/accounting-export";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string;
  const userId  = (session?.user as any)?.id   as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { clinicId, year, month } = body;
  if (!clinicId || !year || !month)
    return NextResponse.json({ error: "clinicId, year, month required" }, { status: 422 });

  try {
    const entries = await generateLedgerEntries(clinicId, Number(year), Number(month), userId);
    return NextResponse.json({ generated: entries.length, entries });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
