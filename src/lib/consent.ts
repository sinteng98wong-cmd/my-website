import crypto from "crypto";
import { prisma } from "./prisma";
import type { ConsentRequest } from "@prisma/client";

export function generateConsentToken(): string {
  return crypto.randomBytes(24).toString("base64url").slice(0, 32);
}

export function getConsentUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/consent/${token}`;
}

export function getWhatsAppLink(
  patient: { name: string; phone?: string | null },
  consentUrl: string,
  clinicName: string
): string {
  let phone = (patient.phone ?? "").replace(/\D/g, "");
  if (phone.startsWith("0")) phone = "60" + phone.slice(1);
  if (!phone.startsWith("60")) phone = "60" + phone;

  const message = `Dear ${patient.name}, please click the link below to complete your consent form for ${clinicName}:\n${consentUrl}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export async function createConsentRequest({
  templateId,
  patientId,
  clinicId,
  treatmentPlanId,
  sentById,
  expiryHours = 48,
}: {
  templateId: string;
  patientId: string;
  clinicId: string;
  treatmentPlanId?: string;
  sentById?: string;
  expiryHours?: number;
}) {
  const token = generateConsentToken();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  return prisma.consentRequest.create({
    data: {
      templateId,
      patientId,
      clinicId,
      treatmentPlanId: treatmentPlanId ?? null,
      sentById: sentById ?? null,
      token,
      expiresAt,
      status: "PENDING",
    },
    include: {
      template: true,
      patient: { select: { name: true, phone: true } },
      clinic: { select: { name: true } },
    },
  });
}

export async function validateConsentToken(token: string): Promise<{
  valid: boolean;
  request?: any;
  reason?: string;
}> {
  const request = await prisma.consentRequest.findUnique({
    where: { token },
    include: {
      template: {
        include: { fields: { orderBy: { order: "asc" } } },
      },
      clinic: { select: { name: true, phone: true, address: true } },
    },
  });

  if (!request) return { valid: false, reason: "not_found" };
  if (request.status === "COMPLETED") return { valid: false, reason: "already_completed" };
  if (request.status === "CANCELLED") return { valid: false, reason: "cancelled" };
  if (request.expiresAt < new Date()) {
    await prisma.consentRequest
      .update({ where: { id: request.id }, data: { status: "EXPIRED" } })
      .catch(() => {});
    return { valid: false, reason: "expired" };
  }

  return { valid: true, request };
}

export async function submitConsentForm(
  token: string,
  responses: Record<string, unknown>,
  signatureBase64: string,
  signedByName: string,
  ip: string
): Promise<ConsentRequest> {
  const validation = await validateConsentToken(token);
  if (!validation.valid) throw new Error(validation.reason ?? "invalid_token");

  const request = validation.request!;

  const updated = await prisma.consentRequest.update({
    where: { id: request.id },
    data: {
      responses: responses as any,
      signatureUrl: signatureBase64,
      signedByName,
      signedAt: new Date(),
      signedIp: ip,
      signMethod: "digital_signature",
      status: "COMPLETED",
      // Point to the API endpoint — no filesystem write needed
      pdfUrl: `/api/consent/requests/${request.id}/pdf`,
    },
  });

  return updated;
}
