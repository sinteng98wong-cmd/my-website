import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitConsentForm } from "@/lib/consent";

const SubmitSchema = z.object({
  responses: z.record(z.unknown()),
  signatureBase64: z.string().min(1),
  signedByName: z.string().min(1),
});

// Simple in-memory rate limiter: token → last submit timestamp
const recentSubmits = new Map<string, number>();

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;

  // Rate limit: one submit per token per 10 seconds
  const lastSubmit = recentSubmits.get(token);
  if (lastSubmit && Date.now() - lastSubmit < 10_000) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  recentSubmits.set(token, Date.now());
  // Cleanup old entries
  if (recentSubmits.size > 1000) {
    const cutoff = Date.now() - 60_000;
    for (const [k, v] of recentSubmits) {
      if (v < cutoff) recentSubmits.delete(k);
    }
  }

  const body = await req.json();
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    const result = await submitConsentForm(
      token,
      parsed.data.responses,
      parsed.data.signatureBase64,
      parsed.data.signedByName,
      ip
    );
    return NextResponse.json({ ok: true, requestId: result.id });
  } catch (err: any) {
    const message = err.message ?? "submission_failed";
    const status =
      message === "expired"
        ? 410
        : message === "not_found"
          ? 404
          : message === "already_completed" || message === "cancelled"
            ? 409
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
