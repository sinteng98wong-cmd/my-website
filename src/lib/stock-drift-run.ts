/**
 * Scheduled drift monitoring for Phase 1 dual-write.
 *
 * This wraps the existing detector in lib/stock-drift — it does not
 * reimplement any of the checks. Its job is to time a run, classify the
 * outcome, persist an audit record, and decide whether an administrator needs
 * to be told.
 *
 * Informational findings (pre-ledger MISSING_MOVEMENTS, expected until
 * opening balances exist) are counted but never make a run fail.
 */
import { prisma } from "./prisma";
import { runDriftDetection, type DriftFinding, type DriftReport } from "./stock-drift";

/** Cap on findings stored per run, so one bad night cannot bloat the table. */
export const MAX_STORED_FINDINGS = 100;

export type DriftRunOutcome = "CLEAN" | "ERRORS" | "FAILED";

export interface DriftRunSummary {
  status: "SUCCESS" | "FAILED";
  outcome: DriftRunOutcome;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  positions: number;
  movements: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  clean: boolean;
  /** Errors and warnings only — informational rows are counted, not stored. */
  findings: DriftFinding[];
  errorMessage?: string;
  /** True when an administrator must be told: any error, or the run itself failed. */
  needsAlert: boolean;
}

/**
 * A run is only "clean" when the detector completed AND found no errors.
 * Informational rows do not count against it; a crashed run is never clean.
 */
export function classifyRun(report: DriftReport | null, failure?: string): DriftRunOutcome {
  if (!report || failure) return "FAILED";
  return report.totals.errors > 0 ? "ERRORS" : "CLEAN";
}

/** Findings worth keeping on the run record. */
export function storableFindings(findings: DriftFinding[]): DriftFinding[] {
  return findings.filter((f) => f.severity !== "INFO").slice(0, MAX_STORED_FINDINGS);
}

export function summarise(
  report: DriftReport | null,
  startedAt: Date,
  finishedAt: Date,
  failure?: string
): DriftRunSummary {
  const outcome = classifyRun(report, failure);
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  if (outcome === "FAILED") {
    return {
      status: "FAILED", outcome, startedAt, finishedAt, durationMs,
      positions: report?.totals.positions ?? 0,
      movements: report?.totals.movements ?? 0,
      errorCount: report?.totals.errors ?? 0,
      warningCount: report?.totals.warnings ?? 0,
      infoCount: report?.totals.infos ?? 0,
      clean: false,
      findings: report ? storableFindings(report.findings) : [],
      errorMessage: failure ?? "Drift detection did not complete",
      needsAlert: true,
    };
  }

  const t = report!.totals;
  return {
    status: "SUCCESS", outcome, startedAt, finishedAt, durationMs,
    positions: t.positions, movements: t.movements,
    errorCount: t.errors, warningCount: t.warnings, infoCount: t.infos,
    clean: t.errors === 0,
    findings: storableFindings(report!.findings),
    needsAlert: t.errors > 0,
  };
}

export interface RunOptions {
  trigger?: "CRON" | "MANUAL";
  /** Injectable for tests; defaults to the real detector. */
  detector?: () => Promise<DriftReport>;
  /** Injectable for tests; defaults to persisting through Prisma. */
  persist?: (summary: DriftRunSummary, trigger: "CRON" | "MANUAL") => Promise<{ id: string }>;
}

async function defaultPersist(summary: DriftRunSummary, trigger: "CRON" | "MANUAL") {
  return prisma.stockDriftRun.create({
    data: {
      trigger,
      status: summary.status,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      durationMs: summary.durationMs,
      positions: summary.positions,
      movements: summary.movements,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      infoCount: summary.infoCount,
      clean: summary.clean,
      findings: summary.findings as any,
      errorMessage: summary.errorMessage ?? null,
    },
    select: { id: true },
  });
}

/**
 * Run the detector, record the outcome, and report whether an alert is needed.
 * A detector crash is captured as a FAILED run rather than propagating, so the
 * schedule always leaves an audit trail.
 */
export async function runAndRecordDrift(options: RunOptions = {}): Promise<DriftRunSummary & { runId: string | null }> {
  const trigger = options.trigger ?? "CRON";
  const detect = options.detector ?? (() => runDriftDetection(null));
  const persist = options.persist ?? defaultPersist;

  const startedAt = new Date();
  let report: DriftReport | null = null;
  let failure: string | undefined;

  try {
    report = await detect();
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  const summary = summarise(report, startedAt, new Date(), failure);

  let runId: string | null = null;
  try {
    runId = (await persist(summary, trigger)).id;
  } catch (e) {
    // Never let bookkeeping swallow the result the caller needs to act on.
    console.error("Failed to record stock drift run:", e);
  }

  return { ...summary, runId };
}

/**
 * Findings a caller with this scope is allowed to see.
 *
 * A finding with no clinic is ledger-wide (e.g. a duplicate posting key) and is
 * withheld from branch users rather than leaked without context.
 */
export function scopeFindings(findings: DriftFinding[], clinicIds: string[] | null): DriftFinding[] {
  if (clinicIds === null) return findings;
  return findings.filter((f) => f.clinicId !== undefined && clinicIds.includes(f.clinicId));
}

/** One-line summary for logs and alert subjects. */
export function describeRun(summary: DriftRunSummary): string {
  if (summary.status === "FAILED") return `Stock drift check FAILED: ${summary.errorMessage}`;
  if (summary.errorCount > 0)
    return `Stock ledger drift: ${summary.errorCount} error(s) across ${summary.positions} position(s)`;
  return `Stock ledger reconciles: ${summary.positions} position(s), ${summary.movements} movement(s), ${summary.infoCount} informational`;
}
