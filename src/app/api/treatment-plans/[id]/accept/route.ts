import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { acceptPlan } from "@/lib/treatment-plan";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.acceptedByName) return NextResponse.json({ error: "acceptedByName required" }, { status: 400 });

  try {
    const plan = await acceptPlan(params.id, body.acceptedByName, body.signatureUrl);
    return NextResponse.json(plan);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
