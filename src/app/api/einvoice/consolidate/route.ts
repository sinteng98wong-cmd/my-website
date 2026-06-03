import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  submitConsolidatedBatch,
  submitPanelConsolidatedBatch,
} from "@/lib/einvoice-service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    clinicId?: string;
    month?: string;
    panelProviderId?: string;
  };
  const { clinicId, month, panelProviderId } = body;
  if (!clinicId || !month) {
    return NextResponse.json({ error: "clinicId and month required" }, { status: 422 });
  }

  try {
    const result = panelProviderId
      ? await submitPanelConsolidatedBatch(clinicId, panelProviderId, month, userId)
      : await submitConsolidatedBatch(clinicId, month, userId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
