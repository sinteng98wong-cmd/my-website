import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordPlanPayment } from "@/lib/treatment-plan";
import { z } from "zod";

const Schema = z.object({
  amount:      z.number().positive(),
  paymentType: z.string().min(1),
  stageId:     z.string().optional(),
  notes:       z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId  = (session?.user as any)?.id;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const payment = await recordPlanPayment({
    planId:       params.id,
    amount:       parsed.data.amount,
    paymentType:  parsed.data.paymentType,
    stageId:      parsed.data.stageId,
    notes:        parsed.data.notes,
    recordedById: userId,
  });
  return NextResponse.json(payment, { status: 201 });
}
