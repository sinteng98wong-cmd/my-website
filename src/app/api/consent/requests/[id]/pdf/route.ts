import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateConsentPdf } from "@/lib/consent-pdf";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const request = await prisma.consentRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "COMPLETED") {
    return NextResponse.json({ error: "Consent not yet completed" }, { status: 409 });
  }

  try {
    const pdfUrl = await generateConsentPdf(params.id);
    return NextResponse.json({ pdfUrl });
  } catch (err: any) {
    console.error("[POST /api/consent/requests/[id]/pdf]", err);
    return NextResponse.json({ error: err?.message ?? "pdf_generation_failed" }, { status: 500 });
  }
}
