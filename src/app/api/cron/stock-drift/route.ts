/**
 * GET /api/cron/stock-drift — nightly stock ledger drift check.
 *
 * Phase 1 dual-write monitoring: runs the existing detector, records the
 * outcome, and emails administrators when the ledger stops reconciling.
 *
 * Authentication accepts both conventions: the `x-cron-secret` header used by
 * this repo's other cron routes, and the `Authorization: Bearer <CRON_SECRET>`
 * header that Vercel Cron sends automatically. See DEPLOY.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GLOBAL_CLINIC_ROLES } from "@/lib/clinic-access";
import { describeRun, runAndRecordDrift } from "@/lib/stock-drift-run";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * The detector scans every stock position and the whole movement history. The
 * platform default (10-15s) would abort that as the ledger grows, and a
 * timeout writes no StockDriftRun row — a silent miss. 60s is within both the
 * Hobby and Pro ceilings.
 */
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runAndRecordDrift({ trigger: "CRON" });
  console.log(`[cron/stock-drift] ${describeRun(summary)} (${summary.durationMs}ms)`);

  // Anything an administrator must act on: errors, or a run that did not finish.
  // The whole notification path is best-effort: the run is already recorded, so
  // a failure to notify must not mask the outcome the caller needs.
  let alerted = false;
  if (summary.needsAlert) {
    try {
    const admins = await prisma.user.findMany({
      where: { active: true, role: { in: GLOBAL_CLINIC_ROLES as any } },
      select: { email: true },
    });

    if (resend && admins.length) {
      const failed = summary.status === "FAILED";
      const rows = summary.findings
        .slice(0, 20)
        .map((f) => `<tr><td>${f.severity}</td><td>${f.code}</td><td>${f.clinicName ?? "—"}</td><td>${f.itemName ?? "—"}</td><td>${f.detail}</td></tr>`)
        .join("");

      try {
        await resend.emails.send({
          from: "DentalOS <no-reply@dentalos.my>",
          to: admins.map((a) => a.email),
          subject: failed
            ? "ACTION REQUIRED: Stock ledger drift check failed"
            : `ACTION REQUIRED: Stock ledger drift — ${summary.errorCount} error(s)`,
          html: `
            <p><strong>${describeRun(summary)}</strong></p>
            <p>Checked ${summary.positions} stock position(s) against ${summary.movements} ledger movement(s)
               in ${summary.durationMs}ms. ${summary.infoCount} informational finding(s) were ignored —
               those are stock predating the ledger, not drift.</p>
            ${rows ? `<table border="1" cellpadding="4" cellspacing="0">
              <tr><th>Severity</th><th>Check</th><th>Clinic</th><th>Item</th><th>Detail</th></tr>${rows}
            </table>` : ""}
            <p>Review at ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/inventory/stock-drift</p>`,
        });
        alerted = true;
        if (summary.runId) {
          await prisma.stockDriftRun.update({
            where: { id: summary.runId },
            data: { alertSentAt: new Date() },
          });
        }
      } catch (e) {
        console.error("[cron/stock-drift] alert email failed:", e);
      }
    }
    } catch (e) {
      console.error("[cron/stock-drift] could not notify administrators:", e);
    }
  }

  return NextResponse.json({
    runId: summary.runId,
    status: summary.status,
    outcome: summary.outcome,
    clean: summary.clean,
    durationMs: summary.durationMs,
    positions: summary.positions,
    movements: summary.movements,
    errors: summary.errorCount,
    warnings: summary.warningCount,
    infos: summary.infoCount,
    needsAlert: summary.needsAlert,
    alerted,
  });
}
