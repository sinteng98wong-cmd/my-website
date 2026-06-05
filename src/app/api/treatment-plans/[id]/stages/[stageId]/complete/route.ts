import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { completeStage } from "@/lib/treatment-plan";

export async function POST(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.visitId) return NextResponse.json({ error: "visitId required" }, { status: 400 });

  try {
    const stage = await completeStage(
      params.stageId,
      body.visitId,
      userId,
      body.clinicalNotes,
      body.nextStageDate ? new Date(body.nextStageDate) : undefined,
    );
    return NextResponse.json(stage, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
