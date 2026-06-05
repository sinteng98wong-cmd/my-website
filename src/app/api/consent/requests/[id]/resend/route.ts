import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateConsentToken, getConsentUrl, getWhatsAppLink } from "@/lib/consent";
import QRCode from "qrcode";

const ResendSchema = z.object({ expiryHours: z.number().int().min(1).max(720).default(48) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { expiryHours } = ResendSchema.parse(body);

  const existing = await prisma.consentRequest.findUnique({
    where: { id: params.id },
    include: { patient: { select: { name: true, phone: true } }, clinic: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "COMPLETED") {
    return NextResponse.json({ error: "Already completed" }, { status: 409 });
  }

  const newToken = generateConsentToken();
  const newExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  const updated = await prisma.consentRequest.update({
    where: { id: params.id },
    data: { token: newToken, expiresAt: newExpiry, status: "PENDING" },
  });

  const consentUrl = getConsentUrl(newToken);
  const whatsappLink = getWhatsAppLink(existing.patient, consentUrl, existing.clinic.name);
  const qrCodeData = await QRCode.toDataURL(consentUrl);

  return NextResponse.json({ request: updated, consentUrl, whatsappLink, qrCodeData });
}
