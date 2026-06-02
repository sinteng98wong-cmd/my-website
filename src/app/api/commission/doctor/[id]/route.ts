import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/commission/doctor/:id
 *
 * Two modes depending on body shape:
 *
 * ── Mode 1: Status transition ──────────────────────────────────────────────
 * Body: { action: "lock" | "pending_lock" | "reverse" }
 *   DRAFT         → PENDING_LOCK  (manager flags for review)
 *   DRAFT/PENDING → LOCKED        (finance approves)
 *   LOCKED        → REVERSED      (finance reverses)
 *
 * ── Mode 2: Field adjustment ───────────────────────────────────────────────
 * Body: { action: "adjust", doctorSplit?, doctorRate?, labFee?, note? }
 * Only allowed on DRAFT or PENDING_LOCK rows.
 * Commission and finalPayout are auto-recalculated from the new values.
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  const userId  = (session?.user as any)?.id   as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const canLock   = ["SUPER_ADMIN", "FINANCE"].includes(role ?? "");
  const canFlag   = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? "");
  const canAdjust = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? "");

  if (!canFlag) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    doctorSplit?: number;
    doctorRate?:  number;
    labFee?:      number;
    note?:        string;
  };

  const { action } = body;

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 422 });

  const existing = await prisma.doctorCommission.findUnique({
    where:   { id: params.id },
    include: { treatment: { select: { billedAmount: true, sst: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Mode 2: Adjust fields ─────────────────────────────────────────────────
  if (action === "adjust") {
    if (!canAdjust)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!["DRAFT", "PENDING_LOCK"].includes(existing.status))
      return NextResponse.json(
        { error: "Only DRAFT or PENDING_LOCK rows can be adjusted" },
        { status: 409 },
      );

    const { doctorSplit, doctorRate, labFee, note } = body;

    // Validate ranges
    if (doctorSplit !== undefined && (doctorSplit < 0 || doctorSplit > 100))
      return NextResponse.json({ error: "doctorSplit must be 0–100" }, { status: 422 });
    if (doctorRate !== undefined && (doctorRate < 0 || doctorRate > 100))
      return NextResponse.json({ error: "doctorRate must be 0–100" }, { status: 422 });
    if (labFee !== undefined && labFee < 0)
      return NextResponse.json({ error: "labFee cannot be negative" }, { status: 422 });

    // Recalculate commission from updated values
    const effectiveSplit  = doctorSplit  ?? Number(existing.doctorSplit);
    const effectiveRate   = doctorRate   ?? Number(existing.doctorRate);
    const effectiveLabFee = labFee       ?? Number(existing.labFee);
    const billedAmount    = Number(existing.txAmount);
    const sst             = Number(existing.treatment.sst);

    const net        = billedAmount - effectiveLabFee - sst;
    const commission = Math.round(net * (effectiveSplit / 100) * (effectiveRate / 100) * 100) / 100;
    const finalPayout = commission;  // top-up recalculation handled by payroll run

    const updated = await prisma.doctorCommission.update({
      where: { id: params.id },
      data: {
        ...(doctorSplit  !== undefined ? { doctorSplit:  doctorSplit  } : {}),
        ...(doctorRate   !== undefined ? { doctorRate:   doctorRate   } : {}),
        ...(labFee       !== undefined ? { labFee:       labFee       } : {}),
        commission:  commission,
        finalPayout: finalPayout,
        // Annotate the adjustment — store in reversalRef field as an audit note
        ...(note ? { reversalRef: `ADJ: ${note}` } : {}),
      },
    });

    return NextResponse.json(updated);
  }

  // ── Mode 1: Status transition ─────────────────────────────────────────────
  if (!["lock", "pending_lock", "reverse"].includes(action))
    return NextResponse.json(
      { error: "action must be 'adjust', 'lock', 'pending_lock', or 'reverse'" },
      { status: 422 },
    );

  if ((action === "lock" || action === "reverse") && !canLock)
    return NextResponse.json({ error: "Forbidden — Finance or Super Admin only" }, { status: 403 });

  const validFrom: Record<string, string[]> = {
    pending_lock: ["DRAFT"],
    lock:         ["DRAFT", "PENDING_LOCK"],
    reverse:      ["LOCKED"],
  };

  if (!validFrom[action].includes(existing.status))
    return NextResponse.json(
      { error: `Cannot ${action} a record with status ${existing.status}` },
      { status: 409 },
    );

  const newStatus = action === "reverse"      ? "REVERSED"
                  : action === "pending_lock" ? "PENDING_LOCK"
                  : "LOCKED";

  const updated = await prisma.doctorCommission.update({
    where: { id: params.id },
    data: {
      status: newStatus,
      ...(newStatus === "LOCKED"   ? { lockedAt: new Date(), lockedBy: userId } : {}),
      ...(newStatus === "REVERSED" ? { reversalRef: `REV-${Date.now()}` }       : {}),
    },
  });

  return NextResponse.json(updated);
}
