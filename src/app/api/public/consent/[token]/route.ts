import { NextRequest, NextResponse } from "next/server";
import { validateConsentToken } from "@/lib/consent";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { valid, request, reason } = await validateConsentToken(params.token);

  if (!valid) {
    const statusCode = reason === "not_found" ? 404 : 410;
    return NextResponse.json({ error: reason }, { status: statusCode });
  }

  // Return template + fields, omit PII from patient
  return NextResponse.json({
    id: request.id,
    status: request.status,
    expiresAt: request.expiresAt,
    template: {
      id: request.template.id,
      name: request.template.name,
      type: request.template.type,
      version: request.template.version,
      introText: request.template.introText,
      consentText: request.template.consentText,
      fields: request.template.fields,
    },
    clinic: {
      name: request.clinic.name,
    },
  });
}
