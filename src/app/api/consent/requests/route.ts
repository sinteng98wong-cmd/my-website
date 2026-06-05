import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createConsentRequest, getConsentUrl, getWhatsAppLink } from "@/lib/consent";
import * as QRCode from "qrcode";

const CreateRequestSchema = z.object({
  templateId: z.string().min(1),
  patientId: z.string().min(1),
  clinicId: z.string().min(1),
  treatmentPlanId: z.string().optional(),
  expiryHours: z.number().int().min(1).max(720).default(48),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sentById = (session.user as any).id as string | undefined;

  try {
    const request = await createConsentRequest({ ...parsed.data, sentById });

    const consentUrl = getConsentUrl(request.token);
    const whatsappLink = getWhatsAppLink(request.patient, consentUrl, request.clinic.name);
    const qrCodeData = await QRCode.toDataURL(consentUrl);

    return NextResponse.json({ request, consentUrl, whatsappLink, qrCodeData }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/consent/requests]", err);
    return NextResponse.json({ error: err?.message ?? "internal_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId") ?? undefined;
  const clinicId = searchParams.get("clinicId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const requests = await prisma.consentRequest.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(clinicId ? { clinicId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      template: { select: { name: true, type: true } },
      patient: { select: { name: true, patientRef: true } },
      clinic: { select: { name: true } },
      sentBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}
