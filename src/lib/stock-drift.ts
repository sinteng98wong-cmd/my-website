/**
 * Stock ledger drift detector.
 *
 * Phase 1 acceptance gate: ClinicStock is still the operational balance and
 * the ledger is written alongside it. This compares the two and reports every
 * way they can disagree, plus the ledger's own internal invariants.
 *
 * The evaluation is pure — it takes plain rows and returns findings — so the
 * rules are unit testable without a database. `runDriftDetection` supplies the
 * rows from Postgres.
 */
import { prisma } from "./prisma";
import { clinicWhere } from "./clinic-access";

export type DriftSeverity = "ERROR" | "WARNING" | "INFO";

export type DriftCode =
  | "BALANCE_MISMATCH"       // ClinicStock.quantity != ledger balance
  | "SUM_MISMATCH"           // opening + in - out != closing
  | "RUNNING_BALANCE_BREAK"  // a movement's balanceAfter does not follow its predecessor
  | "MISSING_MOVEMENTS"      // stock on hand with no ledger history at all
  | "DUPLICATE_POSTING_KEY"  // the same posting recorded twice
  | "NEGATIVE_BALANCE"       // stock or a movement below zero
  | "UNEXPLAINED_CHANGE"     // ClinicStock changed after the last ledger write
  | "AVG_COST_MISMATCH"      // costing drifted from the ledger
  | "INVALID_DIRECTION"      // qtyIn/qtyOut disagree with direction
  | "DOUBLE_REVERSAL";       // a movement reversed more than once

export interface DriftFinding {
  code: DriftCode;
  severity: DriftSeverity;
  clinicId?: string;
  clinicName?: string;
  itemId?: string;
  itemName?: string;
  detail: string;
  expected?: number | string;
  actual?: number | string;
}

/** One (clinic, item) position as the detector sees it. */
export interface PositionRow {
  clinicId: string;
  clinicName: string;
  itemId: string;
  itemName: string;
  quantity: number;              // ClinicStock.quantity
  avgUnitCost: number | null;    // ClinicStock.avgUnitCost
  stockUpdatedAt: Date;
  movementCount: number;
  lastBalanceAfter: number | null;
  lastAvgCostAfter: number | null;
  lastMovementAt: Date | null;
  sumIn: number;
  sumOut: number;
  firstNet: number | null;       // qtyIn - qtyOut of the earliest movement
  firstBalanceAfter: number | null;
}

export interface LedgerAnomalyRows {
  duplicateKeys: { postingKey: string; count: number }[];
  invalidDirection: { id: string; type: string; direction: string; qtyIn: number; qtyOut: number }[];
  negativeMovements: { id: string; clinicId: string; itemId: string; balanceAfter: number }[];
  brokenRunningBalance: { id: string; clinicId: string; itemId: string; expected: number; actual: number }[];
  doubleReversals: { reversalOfId: string; count: number }[];
}

/** ClinicStock is allowed to lag the ledger by this much before we complain. */
const UNEXPLAINED_TOLERANCE_MS = 60_000;
const COST_TOLERANCE = 0.005;

export function evaluatePositions(rows: PositionRow[]): DriftFinding[] {
  const findings: DriftFinding[] = [];

  for (const r of rows) {
    const where = { clinicId: r.clinicId, clinicName: r.clinicName, itemId: r.itemId, itemName: r.itemName };

    if (r.quantity < 0) {
      findings.push({ ...where, code: "NEGATIVE_BALANCE", severity: "ERROR",
        detail: "ClinicStock quantity is negative", actual: r.quantity });
    }

    if (r.movementCount === 0) {
      // Expected during Phase 1: stock that predates the ledger has no history
      // yet, because opening balances are deliberately not created in 3A.
      if (r.quantity !== 0) {
        findings.push({ ...where, code: "MISSING_MOVEMENTS", severity: "INFO",
          detail: "Stock on hand predates the ledger (no opening balance posted yet)", actual: r.quantity });
      }
      continue;
    }

    if (r.lastBalanceAfter !== null && r.quantity !== r.lastBalanceAfter) {
      findings.push({ ...where, code: "BALANCE_MISMATCH", severity: "ERROR",
        detail: "ClinicStock quantity does not match the latest ledger balance",
        expected: r.lastBalanceAfter, actual: r.quantity });
    }

    // opening + in - out = closing, where opening is implied by the first
    // movement's own balance (Phase 1 has no OPENING_BALANCE rows).
    if (r.firstBalanceAfter !== null && r.firstNet !== null) {
      const opening = r.firstBalanceAfter - r.firstNet;
      const closing = opening + r.sumIn - r.sumOut;
      if (closing !== r.quantity) {
        findings.push({ ...where, code: "SUM_MISMATCH", severity: "ERROR",
          detail: `Opening ${opening} + in ${r.sumIn} - out ${r.sumOut} does not reconcile to stock on hand`,
          expected: closing, actual: r.quantity });
      }
    }

    if (
      r.lastAvgCostAfter !== null && r.avgUnitCost !== null &&
      Math.abs(r.avgUnitCost - r.lastAvgCostAfter) > COST_TOLERANCE
    ) {
      findings.push({ ...where, code: "AVG_COST_MISMATCH", severity: "WARNING",
        detail: "Average cost differs from the latest ledger movement",
        expected: r.lastAvgCostAfter, actual: r.avgUnitCost });
    }

    if (
      r.lastMovementAt &&
      r.stockUpdatedAt.getTime() - r.lastMovementAt.getTime() > UNEXPLAINED_TOLERANCE_MS
    ) {
      findings.push({ ...where, code: "UNEXPLAINED_CHANGE", severity: "WARNING",
        detail: "ClinicStock was modified after the last ledger movement — a mutation may have bypassed the ledger",
        expected: r.lastMovementAt.toISOString(), actual: r.stockUpdatedAt.toISOString() });
    }
  }

  return findings;
}

export function evaluateLedgerAnomalies(rows: LedgerAnomalyRows): DriftFinding[] {
  const findings: DriftFinding[] = [];

  for (const d of rows.duplicateKeys) {
    findings.push({ code: "DUPLICATE_POSTING_KEY", severity: "ERROR",
      detail: `Posting key "${d.postingKey}" appears ${d.count} times — the same movement was posted more than once`,
      actual: d.count });
  }
  for (const m of rows.invalidDirection) {
    findings.push({ code: "INVALID_DIRECTION", severity: "ERROR", itemId: m.id,
      detail: `Movement ${m.id} (${m.type}) has direction ${m.direction} with in=${m.qtyIn} out=${m.qtyOut}` });
  }
  for (const m of rows.negativeMovements) {
    findings.push({ code: "NEGATIVE_BALANCE", severity: "ERROR", clinicId: m.clinicId, itemId: m.itemId,
      detail: `Movement ${m.id} recorded a negative balance`, actual: m.balanceAfter });
  }
  for (const m of rows.brokenRunningBalance) {
    findings.push({ code: "RUNNING_BALANCE_BREAK", severity: "ERROR", clinicId: m.clinicId, itemId: m.itemId,
      detail: `Movement ${m.id} does not continue the running balance`,
      expected: m.expected, actual: m.actual });
  }
  for (const d of rows.doubleReversals) {
    findings.push({ code: "DOUBLE_REVERSAL", severity: "ERROR",
      detail: `Movement ${d.reversalOfId} has been reversed ${d.count} times`, actual: d.count });
  }

  return findings;
}

export interface DriftReport {
  generatedAt: string;
  scope: { clinicIds: string[] | null };
  totals: { positions: number; movements: number; errors: number; warnings: number; infos: number };
  findings: DriftFinding[];
  clean: boolean;
}

/** Run the full detection sweep against the database. */
export async function runDriftDetection(clinicIds: string[] | null = null): Promise<DriftReport> {
  const where = clinicWhere(clinicIds);

  const positions = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      cs."clinicId", c."name" AS "clinicName", cs."itemId", i."name" AS "itemName",
      cs."quantity", cs."avgUnitCost", cs."updatedAt" AS "stockUpdatedAt",
      COALESCE(m."movementCount", 0)      AS "movementCount",
      m."lastBalanceAfter", m."lastAvgCostAfter", m."lastMovementAt",
      COALESCE(m."sumIn", 0)  AS "sumIn",
      COALESCE(m."sumOut", 0) AS "sumOut",
      m."firstNet", m."firstBalanceAfter"
    FROM "ClinicStock" cs
    JOIN "Clinic" c    ON c."id" = cs."clinicId"
    JOIN "StockItem" i ON i."id" = cs."itemId"
    LEFT JOIN (
      SELECT
        "clinicId", "itemId",
        COUNT(*)::int                                              AS "movementCount",
        SUM("qtyIn")::int                                          AS "sumIn",
        SUM("qtyOut")::int                                         AS "sumOut",
        (ARRAY_AGG("balanceAfter" ORDER BY "seq" DESC))[1]         AS "lastBalanceAfter",
        (ARRAY_AGG("avgCostAfter" ORDER BY "seq" DESC))[1]         AS "lastAvgCostAfter",
        (ARRAY_AGG("createdAt" ORDER BY "seq" DESC))[1]            AS "lastMovementAt",
        (ARRAY_AGG("qtyIn" - "qtyOut" ORDER BY "seq" ASC))[1]      AS "firstNet",
        (ARRAY_AGG("balanceAfter" ORDER BY "seq" ASC))[1]          AS "firstBalanceAfter"
      FROM "StockMovement"
      GROUP BY "clinicId", "itemId"
    ) m ON m."clinicId" = cs."clinicId" AND m."itemId" = cs."itemId"
    ${clinicIds ? `WHERE cs."clinicId" = ANY($1)` : ""}
  `, ...(clinicIds ? [clinicIds] : []));

  const rows: PositionRow[] = positions.map((p) => ({
    clinicId: p.clinicId,
    clinicName: p.clinicName,
    itemId: p.itemId,
    itemName: p.itemName,
    quantity: Number(p.quantity),
    avgUnitCost: p.avgUnitCost === null ? null : Number(p.avgUnitCost),
    stockUpdatedAt: new Date(p.stockUpdatedAt),
    movementCount: Number(p.movementCount),
    lastBalanceAfter: p.lastBalanceAfter === null ? null : Number(p.lastBalanceAfter),
    lastAvgCostAfter: p.lastAvgCostAfter === null ? null : Number(p.lastAvgCostAfter),
    lastMovementAt: p.lastMovementAt ? new Date(p.lastMovementAt) : null,
    sumIn: Number(p.sumIn),
    sumOut: Number(p.sumOut),
    firstNet: p.firstNet === null ? null : Number(p.firstNet),
    firstBalanceAfter: p.firstBalanceAfter === null ? null : Number(p.firstBalanceAfter),
  }));

  const [duplicateKeys, invalidDirection, negativeMovements, brokenRunningBalance, doubleReversals, movementCount] =
    await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT "postingKey", COUNT(*)::int AS count FROM "StockMovement"
        GROUP BY "postingKey" HAVING COUNT(*) > 1
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT "id", "type"::text, "direction"::text, "qtyIn", "qtyOut" FROM "StockMovement"
        WHERE ("direction" = 'IN'   AND ("qtyIn" <= 0 OR "qtyOut" <> 0))
           OR ("direction" = 'OUT'  AND ("qtyOut" <= 0 OR "qtyIn" <> 0))
           OR ("direction" = 'NONE' AND ("qtyIn" <> 0 OR "qtyOut" <> 0))
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT "id", "clinicId", "itemId", "balanceAfter" FROM "StockMovement" WHERE "balanceAfter" < 0
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT id, "clinicId", "itemId", expected, actual FROM (
          SELECT
            "id", "clinicId", "itemId",
            LAG("balanceAfter") OVER w + "qtyIn" - "qtyOut" AS expected,
            "balanceAfter"                                  AS actual,
            LAG("balanceAfter") OVER w                      AS prev
          FROM "StockMovement"
          WINDOW w AS (PARTITION BY "clinicId", "itemId" ORDER BY "seq")
        ) t WHERE prev IS NOT NULL AND expected <> actual
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT "reversalOfId", COUNT(*)::int AS count FROM "StockMovement"
        WHERE "reversalOfId" IS NOT NULL GROUP BY "reversalOfId" HAVING COUNT(*) > 1
      `),
      prisma.stockMovement.count({ where }),
    ]);

  const findings = [
    ...evaluatePositions(rows),
    ...evaluateLedgerAnomalies({
      duplicateKeys:        duplicateKeys.map((d) => ({ postingKey: d.postingKey, count: Number(d.count) })),
      invalidDirection,
      negativeMovements:    negativeMovements.map((m) => ({ ...m, balanceAfter: Number(m.balanceAfter) })),
      brokenRunningBalance: brokenRunningBalance.map((m) => ({ ...m, expected: Number(m.expected), actual: Number(m.actual) })),
      doubleReversals:      doubleReversals.map((d) => ({ reversalOfId: d.reversalOfId, count: Number(d.count) })),
    }),
  ];

  const errors   = findings.filter((f) => f.severity === "ERROR").length;
  const warnings = findings.filter((f) => f.severity === "WARNING").length;
  const infos    = findings.filter((f) => f.severity === "INFO").length;

  return {
    generatedAt: new Date().toISOString(),
    scope: { clinicIds },
    totals: { positions: rows.length, movements: movementCount, errors, warnings, infos },
    findings,
    clean: errors === 0,
  };
}
