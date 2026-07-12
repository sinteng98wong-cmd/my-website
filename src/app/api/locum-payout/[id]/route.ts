/**
 * GET   /api/locum-payout/[id]         → fetch a single payout line
 * PATCH /api/locum-payout/[id]         → advance the 6-step workflow
 *
 * PATCH body: { action, ...params }
 *
 *  action = "counter_verify"  → Step 1 (CLINIC_MANAGER, RECEPTIONIST, NURSE)
 *  action = "doctor_verify"   → Step 2 (DOCTOR only, must own the line)
 *  action = "log_lab_fee"     → Step 3 (requires { labFee: number }) (CLINIC_MANAGER, RECEPTIONIST)
 *  action = "mark_complete"   → Step 4 (DOCTOR only)
 *  action = "check_release"   → Step 5 (CLINIC_MANAGER, FINANCE, SUPER_ADMIN)
 *  action = "mark_paid"       → Step 6 (FINANCE, SUPER_ADMIN)
 *  action = "force_release"   → Manager override (CLINIC_MANAGER, FINANCE, SUPER_ADMIN)
 *                               requires { reason: string }
 *  action = "void"            → Void a line (SUPER_ADMIN, FINANCE)
 *                               requires { reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";
import {
  step1_counterVerify,
  step2_doctorVerify,
  step3_logLabFee,
  step4_markCompletion,
  step5_checkAndRelease,
  step6_managerPay,
  forceRelease,
  voidPayoutLine,
  WorkflowError,
} from "@/services/locum-payout.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role     = (session.user as any).role  as string;
  const userId   = (session.user as any).id    as string;

  const line = await (prisma as any).locumPayoutLine.findUnique({
    where:   { id: params.id },
    include: {
      treatment: {
        include: {
          treatmentType: { select: { code: true, name: true } },
          visit:         { include: { patient: { select: { name: true, patientRef: true } } } },
          labJob:        { select: { id: true, status: true, invoiceAmount: true, estimatedFee: true } },
        },
      },
      treatmentPlan: {
        select: { id: true, planRef: true, title: true, status: true, totalAmount: true, totalPaid: true,
                  stages: { select: { id: true, name: true, status: true, order: true } } },
      },
      doctorProfile: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Doctors may only view lines where they are the doctor
  if (role === "DOCTOR") {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId }, select: { id: true },
    });
    if (!profile || profile.id !== line.doctorProfileId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(line);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id  as string;

  const body   = await req.json();
  const action = body.action as string;

  try {
    switch (action) {
      // ── Step 1: counter verifies collected cash ──────────────────────────
      case "counter_verify": {
        const allowed = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        await step1_counterVerify(params.id, userId);
        return NextResponse.json({ ok: true });
      }

      // ── Step 2: doctor verifies patient payments ─────────────────────────
      case "doctor_verify": {
        if (role !== "DOCTOR" && !["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        // Doctors can only verify their own lines
        if (role === "DOCTOR") {
          const profile = await prisma.doctorProfile.findUnique({
            where: { userId }, select: { id: true },
          });
          const line = await (prisma as any).locumPayoutLine.findUnique({
            where: { id: params.id }, select: { doctorProfileId: true },
          });
          if (!profile || !line || profile.id !== line.doctorProfileId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        }
        await step2_doctorVerify(params.id, userId);
        return NextResponse.json({ ok: true });
      }

      // ── Step 3: log confirmed lab invoice fee ───────────────────────────
      case "log_lab_fee": {
        const allowed = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const labFee = Number(body.labFee);
        if (!isFinite(labFee) || labFee < 0) {
          return NextResponse.json({ error: "labFee must be a non-negative number" }, { status: 400 });
        }
        const result = await step3_logLabFee(params.id, labFee, userId);
        return NextResponse.json({ ok: true, ...result });
      }

      // ── Step 4: doctor marks stage as complete ───────────────────────────
      case "mark_complete": {
        if (role !== "DOCTOR" && !["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (role === "DOCTOR") {
          const profile = await prisma.doctorProfile.findUnique({
            where: { userId }, select: { id: true },
          });
          const line = await (prisma as any).locumPayoutLine.findUnique({
            where: { id: params.id }, select: { doctorProfileId: true },
          });
          if (!profile || !line || profile.id !== line.doctorProfileId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        }
        await step4_markCompletion(params.id, userId);
        return NextResponse.json({ ok: true });
      }

      // ── Step 5: check release conditions → PENDING_RELEASE ───────────────
      case "check_release": {
        const allowed = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const result = await step5_checkAndRelease(params.id);
        if (!result.eligible) {
          return NextResponse.json({ eligible: false, reason: result.reason }, { status: 422 });
        }
        return NextResponse.json({ ok: true, eligible: true, releaseAmount: result.releaseAmount });
      }

      // ── Step 6: manager marks PAID ───────────────────────────────────────
      case "mark_paid": {
        const allowed = ["SUPER_ADMIN", "FINANCE"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        await step6_managerPay(params.id, userId);
        return NextResponse.json({ ok: true });
      }

      // ── Manager override: force-release ──────────────────────────────────
      case "force_release": {
        const allowed = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const reason = String(body.reason ?? "").trim();
        if (!reason) {
          return NextResponse.json({ error: "A reason is required for force-release" }, { status: 400 });
        }
        await forceRelease(params.id, userId, reason);
        return NextResponse.json({ ok: true });
      }

      // ── Clinical detail: sub-type (PFM, Valplast…) and tooth numbers ─────
      case "update_details": {
        const allowed = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const data: Record<string, string | null> = {};
        if (body.subType    !== undefined) data.subType    = String(body.subType    ?? "").trim() || null;
        if (body.toothCodes !== undefined) data.toothCodes = String(body.toothCodes ?? "").trim() || null;
        if (Object.keys(data).length === 0) {
          return NextResponse.json({ error: "Provide subType and/or toothCodes" }, { status: 400 });
        }
        try {
          await (prisma as any).locumPayoutLine.update({ where: { id: params.id }, data });
        } catch {
          return NextResponse.json({ error: "Line not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
      }

      // ── Void ─────────────────────────────────────────────────────────────
      case "void": {
        const allowed = ["SUPER_ADMIN", "FINANCE"];
        if (!allowed.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const reason = String(body.reason ?? "").trim();
        if (!reason) {
          return NextResponse.json({ error: "A void reason is required" }, { status: 400 });
        }
        await voidPayoutLine(params.id, userId, reason);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid: counter_verify, doctor_verify, log_lab_fee, mark_complete, check_release, mark_paid, force_release, void` },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof WorkflowError) {
      const status = err.code === "NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
