/**
 * Stock ledger drift detector — CLI.
 *
 *   npx tsx scripts/stock-drift-check.ts [clinicId ...]
 *
 * Exits non-zero when any ERROR finding is present, so it can gate a
 * deployment or run from cron during Phase 1 dual-write.
 */
import { prisma } from "../src/lib/prisma";
import { runDriftDetection } from "../src/lib/stock-drift";
import { runAndRecordDrift } from "../src/lib/stock-drift-run";

async function main() {
  const args = process.argv.slice(2);

  // --record runs group-wide through the same path the nightly job uses and
  // leaves an audit record, so a manual check is visible alongside the schedule.
  if (args.includes("--record")) {
    const summary = await runAndRecordDrift({ trigger: "MANUAL" });
    console.log(
      `Recorded run ${summary.runId ?? "(not persisted)"} — ${summary.status} ` +
      `(${summary.errorCount} errors, ${summary.warningCount} warnings, ${summary.infoCount} info, ${summary.durationMs}ms)`
    );
    if (!summary.clean) process.exitCode = 1;
    return;
  }

  const clinicIds = args.filter((a) => !a.startsWith("--"));
  const report = await runDriftDetection(clinicIds.length ? clinicIds : null);

  console.log(`Stock ledger drift check — ${report.generatedAt}`);
  console.log(`  positions: ${report.totals.positions}   movements: ${report.totals.movements}`);
  console.log(`  errors: ${report.totals.errors}   warnings: ${report.totals.warnings}   info: ${report.totals.infos}\n`);

  for (const f of report.findings) {
    const where = [f.clinicName, f.itemName].filter(Boolean).join(" / ");
    const delta = f.expected !== undefined ? `  (expected ${f.expected}, actual ${f.actual})` : "";
    console.log(`  ${f.severity.padEnd(7)} ${f.code.padEnd(22)} ${where ? where + " — " : ""}${f.detail}${delta}`);
  }

  console.log(
    report.clean
      ? "\nLedger reconciles: no errors."
      : `\n${report.totals.errors} error(s) — the ledger does not reconcile.`
  );
  if (!report.clean) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
