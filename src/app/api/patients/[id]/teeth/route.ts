import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCurrentDentalChart,
  getToothHistory,
  isValidToothCode,
  isValidCondition,
} from "@/lib/tooth-chart";

/**
 * GET /api/patients/[id]/teeth
 * Returns the CURRENT chart state — latest record per tooth.
 * Query param: ?toothCode=XX&history=1 → returns full history for one tooth.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json([], { status: 200 });

    const sp        = new URL(req.url).searchParams;
    const toothCode = sp.get("toothCode");
    const history   = sp.get("history") === "1";

    if (toothCode && history) {
      // Full history for one tooth (raw SQL via helper — visit join included)
      if (!isValidToothCode(toothCode)) {
        return NextResponse.json({ error: "Invalid FDI tooth code" }, { status: 422 });
      }
      const records = await getToothHistory(params.id, toothCode);
      return NextResponse.json(records);
    }

    // Current chart state
    const chart = await getCurrentDentalChart(params.id);
    return NextResponse.json(chart);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/patients/[id]/teeth
 * ALWAYS inserts a new ToothRecord row — never updates existing ones.
 * Body: { toothCode, condition, notes?, surfaces?, visitId? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const userId = (session.user as any)?.id;
    const body   = await req.json();
    const { toothCode, condition, surfaces, notes, visitId } = body;

    // Validate
    if (!toothCode || !condition) {
      return NextResponse.json({ error: "toothCode and condition are required" }, { status: 422 });
    }
    if (!isValidToothCode(toothCode)) {
      return NextResponse.json(
        { error: `Invalid FDI tooth code "${toothCode}". Valid: 11-18, 21-28, 31-38, 41-48` },
        { status: 422 }
      );
    }
    if (!isValidCondition(condition)) {
      return NextResponse.json(
        { error: `Invalid condition "${condition}". Valid: healthy, decayed, filled, crowned, extracted, rct, implant, missing, bridge, veneer, fractured` },
        { status: 422 }
      );
    }

    // Always INSERT — history is preserved
    // Using raw SQL because Prisma client may not have visitId typed yet
    const id = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.$executeRaw`
      INSERT INTO "ToothRecord"
        (id, "patientId", "visitId", "toothCode", condition, surfaces, notes, "recordedBy", "recordedAt")
      VALUES (
        ${id},
        ${params.id},
        ${visitId || null},
        ${toothCode},
        ${condition},
        ${surfaces ? JSON.stringify(surfaces) : null},
        ${notes || null},
        ${userId || null},
        NOW()
      )
    `;

    const [record] = await prisma.$queryRaw<any[]>`
      SELECT * FROM "ToothRecord" WHERE id = ${id}
    `;
    return NextResponse.json(record, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
