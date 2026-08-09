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
  | "DOUBLE_REVERSAL"        // a movement reversed more than once
  | "BATCH_OVER_ALLOCATION"  // batches claim more stock than the position holds
  | "BATCH_NEGATIVE"         // a batch has been driven below zero
  | "UNBATCHED_STOCK"        // part of the position has no batch behind it
  | "VALUE_MISMATCH";        // ledger value does not reconcile to stock value

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
  /** Sum of StockBatch.remainingQty for this position. */
  batchQty: number;
  /** How many batch rows sit below zero (should always be none). */
  negativeBatches: number;
  /** Cumulative signed value the ledger has posted for this position. */
  ledgerValue: number;
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

/**
 * Value tolerance.
 *
 * Two roundings stand between the ledger and ClinicStock and neither is a
 * defect. ClinicStock.avgUnitCost is Decimal(10,2) while the ledger carries
 * Decimal(12,4), so `quantity × avgUnitCost` can be out by up to half a cent
 * per unit; and every posted valueDelta is itself rounded to the cent. The
 * tolerance absorbs exactly those two and nothing more, so a real double
 * posting or a bypassed mutation still shows up.
 *
 * Precision is deliberately not being changed here — the tolerance is the
 * documented bridge until that decision is taken.
 */
const VALUE_FLOOR_TOLERANCE = 0.05;
export function valueTolerance(quantity: number, movementCount: number): number {
  return VALUE_FLOOR_TOLERANCE + Math.abs(quantity) * 0.005 + movementCount * 0.005;
}

export function evaluatePositions(rows: PositionRow[]): DriftFinding[] {
  const findings: DriftFinding[] = [];

  for (const r of rows) {
    const where = { clinicId: r.clinicId, clinicName: r.clinicName, itemId: r.itemId, itemName: r.itemName };

    if (r.quantity < 0) {
      findings.push({ ...where, code: "NEGATIVE_BALANCE", severity: "ERROR",
        detail: "ClinicStock quantity is negative", actual: r.quantity });
    }

    // ── Physical batches vs the operational balance ──────────────────────
    //
    // Batches account for part of a position, never more than all of it. The
    // system predates batch tracking, so a position may legitimately hold
    // stock no batch covers — that remainder is unbatched stock, reported for
    // visibility, not as a fault. Batches claiming *more* than the position
    // holds is real drift: it means a stock-out reduced ClinicStock without
    // depleting the batch behind it.
    if (r.negativeBatches > 0) {
      findings.push({ ...where, code: "BATCH_NEGATIVE", severity: "ERROR",
        detail: `${r.negativeBatches} batch record(s) have a negative remaining quantity`,
        actual: r.negativeBatches });
    }

    if (r.batchQty > r.quantity) {
      findings.push({ ...where, code: "BATCH_OVER_ALLOCATION", severity: "ERROR",
        detail: "Batch quantities exceed stock on hand — a stock-out reduced the balance without depleting its batch",
        expected: r.quantity, actual: r.batchQty });
    } else if (r.batchQty < r.quantity && r.movementCount > 0) {
      // Positions with no ledger history at all are already reported as
      // MISSING_MOVEMENTS; do not report the same stock twice.
      findings.push({ ...where, code: "UNBATCHED_STOCK", severity: "INFO",
        detail: "Part of this position has no batch record behind it (pre-batch stock or a stock-take increase)",
        expected: r.quantity, actual: r.batchQty });
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

    // ── Value ────────────────────────────────────────────────────────────
    //
    // Under weighted average the ledger's cumulative value is the stock value:
    // an issue removes quantity × average and leaves the average alone, a
    // receipt adds quantity × cost and moves the average to match. So the sum
    // of every valueDelta must equal quantity × avgUnitCost.
    //
    // PURCHASE_PRICE_VARIANCE is the one exception and is filtered out of
    // ledgerValue above: it records value that never entered — or has already
    // left — inventory, so it is not part of this reconciliation.
    //
    // Only checkable where the ledger covers the whole history. A position
    // that already held stock when the ledger started has an opening value the
    // ledger never saw, and Phase 1 deliberately posts no opening balances —
    // so those are skipped rather than reported as false errors.
    if (r.firstBalanceAfter !== null && r.firstNet !== null && r.avgUnitCost !== null) {
      const opening = r.firstBalanceAfter - r.firstNet;
      if (opening === 0) {
        const stockValue = r.quantity * r.avgUnitCost;
        const gap = Math.abs(r.ledgerValue - stockValue);
        if (gap > valueTolerance(r.quantity, r.movementCount)) {
          findings.push({ ...where, code: "VALUE_MISMATCH", severity: "ERROR",
            detail: "Ledger value does not reconcile to stock on hand at the operational average cost",
            expected: Math.round(stockValue * 100) / 100,
            actual: Math.round(r.ledgerValue * 100) / 100 });
        }
      }
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
      m."firstNet", m."firstBalanceAfter",
      COALESCE(m."ledgerValue", 0)     AS "ledgerValue",
      COALESCE(b."batchQty", 0)        AS "batchQty",
      COALESCE(b."negativeBatches", 0) AS "negativeBatches"
    FROM "ClinicStock" cs
    JOIN "Clinic" c    ON c."id" = cs."clinicId"
    JOIN "StockItem" i ON i."id" = cs."itemId"
    LEFT JOIN (
      SELECT
        "clinicId", "itemId",
        COUNT(*)::int                                              AS "movementCount",
        SUM("qtyIn")::int                                          AS "sumIn",
        SUM("qtyOut")::int                                         AS "sumOut",
        -- Purchase price variance is excluded by design. It is the half of a
        -- supplier invoice correction relating to stock that has already left
        -- inventory, so it never lands in ClinicStock value; including it here
        -- would report a VALUE_MISMATCH on every repriced position.
        SUM("valueDelta") FILTER (WHERE "type" <> 'PURCHASE_PRICE_VARIANCE')
                                                                   AS "ledgerValue",
        (ARRAY_AGG("balanceAfter" ORDER BY "seq" DESC))[1]         AS "lastBalanceAfter",
        (ARRAY_AGG("avgCostAfter" ORDER BY "seq" DESC))[1]         AS "lastAvgCostAfter",
        (ARRAY_AGG("createdAt" ORDER BY "seq" DESC))[1]            AS "lastMovementAt",
        (ARRAY_AGG("qtyIn" - "qtyOut" ORDER BY "seq" ASC))[1]      AS "firstNet",
        (ARRAY_AGG("balanceAfter" ORDER BY "seq" ASC))[1]          AS "firstBalanceAfter"
      FROM "StockMovement"
      GROUP BY "clinicId", "itemId"
    ) m ON m."clinicId" = cs."clinicId" AND m."itemId" = cs."itemId"
    LEFT JOIN (
      SELECT
        "clinicId", "itemId",
        SUM(GREATEST("remainingQty", 0))::int                      AS "batchQty",
        COUNT(*) FILTER (WHERE "remainingQty" < 0)::int            AS "negativeBatches"
      FROM "StockBatch"
      GROUP BY "clinicId", "itemId"
    ) b ON b."clinicId" = cs."clinicId" AND b."itemId" = cs."itemId"
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
    batchQty: Number(p.batchQty),
    negativeBatches: Number(p.negativeBatches),
    ledgerValue: Number(p.ledgerValue),
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
