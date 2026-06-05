import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateConsentPdfBuffer, generateConsentPdf } from "@/lib/consent-pdf";

/** GET — stream the PDF directly (no filesystem). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const request = await prisma.consentRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "COMPLETED") {
    return NextResponse.json({ error: "Consent not yet completed" }, { status: 409 });
  }

  try {
    const buffer = await generateConsentPdfBuffer(params.id);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="consent-${params.id.slice(-8)}.pdf"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err: any) {
    console.error("[GET /api/consent/requests/[id]/pdf]", err);
    return NextResponse.json({ error: err?.message ?? "pdf_generation_failed" }, { status: 500 });
  }
}

/** POST — (re)generate and record the pdfUrl in the DB. */
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
