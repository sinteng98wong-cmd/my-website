/**
 * scripts/migrate-staff-leave.ts
 *
 * Migrates all rows from the legacy `StaffLeave` model to `LeaveApplication`.
 *
 * Run with:
 *   npx tsx scripts/migrate-staff-leave.ts
 *
 * Safe to re-run — skips rows whose `leaveRef` already exists in
 * `LeaveApplication`. Logs a full summary at the end.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Enum mappings ─────────────────────────────────────────────────────────────

/**
 * Legacy LeaveType  →  HrLeaveType
 *
 * Only maps values that existed in the old enum.
 * Any unrecognised value is caught below and the row is skipped with a warning.
 */
const LEAVE_TYPE_MAP: Record<string, string> = {
  ANNUAL_LEAVE:    "ANNUAL",
  MEDICAL_LEAVE:   "MEDICAL",
  EMERGENCY_LEAVE: "EMERGENCY",
  UNPAID_LEAVE:    "UNPAID",
};

/**
 * Legacy LeaveStatus  →  HrLeaveStatus
 *
 * The new model adds WITHDRAWN; the old model has no equivalent so it is never
 * produced here. All four legacy statuses map 1-to-1.
 */
const LEAVE_STATUS_MAP: Record<string, string> = {
  PENDING:   "PENDING",
  APPROVED:  "APPROVED",
  REJECTED:  "REJECTED",
  CANCELLED: "CANCELLED",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapLeaveType(legacy: string): string {
  const mapped = LEAVE_TYPE_MAP[legacy];
  if (!mapped) throw new Error(`Unknown LeaveType value: "${legacy}"`);
  return mapped;
}

function mapLeaveStatus(legacy: string): string {
  const mapped = LEAVE_STATUS_MAP[legacy];
  if (!mapped) throw new Error(`Unknown LeaveStatus value: "${legacy}"`);
  return mapped;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("StaffLeave → LeaveApplication migration");
  console.log("=".repeat(60));

  // 1. Load all legacy rows
  const legacyRows = await (prisma as any).staffLeave.findMany({
    orderBy: { appliedAt: "asc" },
  });
  console.log(`\nFound ${legacyRows.length} StaffLeave row(s) to process.\n`);

  if (legacyRows.length === 0) {
    console.log("Nothing to migrate. Exiting.");
    return;
  }

  // 2. Build a User → StaffProfile lookup map in one query (avoid N+1)
  const profiles = await prisma.staffProfile.findMany({
    select: { id: true, userId: true, clinicId: true },
  });
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  // 3. Load already-migrated leaveRefs so the script is idempotent
  const existing = await prisma.leaveApplication.findMany({
    select: { leaveRef: true },
  });
  const existingRefs = new Set(existing.map((e) => e.leaveRef));
  console.log(`Already migrated: ${existingRefs.size} row(s) (will be skipped).\n`);

  // 4. Process each row
  const results = {
    migrated: 0,
    skipped:  0,    // leaveRef already exists
    failed:   0,
    warnings: [] as string[],
  };

  for (const row of legacyRows) {
    const label = `[${row.leaveRef}]`;

    // ── Skip if already migrated ──────────────────────────────────────────
    if (existingRefs.has(row.leaveRef)) {
      console.log(`  SKIP   ${label} already exists in LeaveApplication`);
      results.skipped++;
      continue;
    }

    // ── Resolve staffProfileId via userId ─────────────────────────────────
    const profile = profileByUserId.get(row.staffId);
    if (!profile) {
      const msg = `${label} No StaffProfile found for userId=${row.staffId} — row skipped`;
      console.warn(`  WARN   ${msg}`);
      results.warnings.push(msg);
      results.failed++;
      continue;
    }

    // ── Map enum values ───────────────────────────────────────────────────
    let hrLeaveType: string;
    let hrLeaveStatus: string;

    try {
      hrLeaveType   = mapLeaveType(row.leaveType);
      hrLeaveStatus = mapLeaveStatus(row.status);
    } catch (err: any) {
      const msg = `${label} Enum mapping failed — ${err.message} — row skipped`;
      console.error(`  ERROR  ${msg}`);
      results.warnings.push(msg);
      results.failed++;
      continue;
    }

    // ── Determine clinicId ────────────────────────────────────────────────
    // Prefer the value recorded on the leave row; fall back to the profile's
    // home clinic if somehow missing (legacy data quality issue).
    const clinicId = row.clinicId ?? profile.clinicId;
    if (!row.clinicId) {
      const msg = `${label} clinicId was null — used profile.clinicId (${profile.clinicId})`;
      console.warn(`  WARN   ${msg}`);
      results.warnings.push(msg);
    }

    // ── Build the target payload ──────────────────────────────────────────
    const payload = {
      leaveRef:      row.leaveRef,
      staffProfileId: profile.id,
      clinicId,
      leaveType:     hrLeaveType,
      startDate:     row.fromDate,
      endDate:       row.toDate,
      totalDays:     row.days,
      reason:        row.reason    ?? null,
      attachmentUrl: null,           // StaffLeave has no attachmentUrl — safe default
      status:        hrLeaveStatus,
      appliedAt:     row.appliedAt,
      reviewedById:  row.reviewedById ?? null,
      reviewedAt:    row.reviewedAt   ?? null,
      reviewNote:    row.reviewNote   ?? null,
    };

    // ── Insert ────────────────────────────────────────────────────────────
    try {
      await prisma.leaveApplication.create({ data: payload as any });
      console.log(`  OK     ${label} ${row.leaveType} → ${hrLeaveType} | ${row.status} | ${profile.id}`);
      results.migrated++;
    } catch (err: any) {
      const msg = `${label} Insert failed — ${err.message}`;
      console.error(`  ERROR  ${msg}`);
      results.warnings.push(msg);
      results.failed++;
    }
  }

  // 5. Summary
  console.log("\n" + "=".repeat(60));
  console.log("Migration complete");
  console.log("=".repeat(60));
  console.log(`  Migrated : ${results.migrated}`);
  console.log(`  Skipped  : ${results.skipped}  (already in LeaveApplication)`);
  console.log(`  Failed   : ${results.failed}`);

  if (results.warnings.length > 0) {
    console.log("\nWarnings / errors:");
    results.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }

  if (results.failed > 0) {
    console.log("\nSome rows failed — review the warnings above and re-run after fixing.");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
