/**
 * DentalOS — Tooth Chart helpers
 *
 * ToothRecord is now an immutable history log.
 * Current state = latest record per tooth (DISTINCT ON toothCode ORDER BY recordedAt DESC).
 */

import { prisma } from "@/lib/prisma";

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_CODES = new Set([
  "11","12","13","14","15","16","17","18",
  "21","22","23","24","25","26","27","28",
  "31","32","33","34","35","36","37","38",
  "41","42","43","44","45","46","47","48",
]);

export const VALID_CONDITIONS = [
  "healthy","decayed","filled","crowned",
  "extracted","rct","implant","missing",
  "bridge","veneer","fractured",
] as const;

export type ToothCondition = (typeof VALID_CONDITIONS)[number];

export function isValidToothCode(code: string): boolean {
  return VALID_CODES.has(code);
}

export function isValidCondition(c: string): c is ToothCondition {
  return (VALID_CONDITIONS as readonly string[]).includes(c);
}

// ── Current chart state ──────────────────────────────────────────────────────

export type CurrentToothRecord = {
  id: string;
  toothCode: string;
  condition: ToothCondition;
  surfaces: string | null;
  notes: string | null;
  recordedAt: Date;
  recordedBy: string | null;
  visitId: string | null;
};

/**
 * Returns a map of toothCode → latest ToothRecord for a patient.
 * Uses raw SQL DISTINCT ON for efficiency.
 */
export async function getCurrentDentalChart(
  patientId: string
): Promise<Record<string, CurrentToothRecord>> {
  // Raw query: DISTINCT ON is the most efficient way in PostgreSQL
  const rows = await prisma.$queryRaw<CurrentToothRecord[]>`
    SELECT DISTINCT ON ("toothCode")
      id, "toothCode", condition, surfaces, notes,
      "recordedAt", "recordedBy", "visitId"
    FROM "ToothRecord"
    WHERE "patientId" = ${patientId}
    ORDER BY "toothCode", "recordedAt" DESC
  `;

  const map: Record<string, CurrentToothRecord> = {};
  for (const row of rows) {
    map[row.toothCode] = row;
  }
  return map;
}

// ── Tooth history ────────────────────────────────────────────────────────────

export type ToothHistoryRecord = {
  id: string;
  toothCode: string;
  condition: ToothCondition;
  surfaces: string | null;
  notes: string | null;
  recordedAt: Date;
  recordedBy: string | null;
  visitId: string | null;
  visitDate: Date | null;
  visitRef: string | null;
};

/**
 * Returns all historical records for a single tooth, newest first.
 * Includes visit date for display.
 */
export async function getToothHistory(
  patientId: string,
  toothCode: string
): Promise<ToothHistoryRecord[]> {
  const rows = await prisma.$queryRaw<ToothHistoryRecord[]>`
    SELECT
      t.id, t."toothCode", t.condition, t.surfaces, t.notes,
      t."recordedAt", t."recordedBy", t."visitId",
      v."visitDate" AS "visitDate",
      v."visitRef"  AS "visitRef"
    FROM "ToothRecord" t
    LEFT JOIN "Visit" v ON v.id = t."visitId"
    WHERE t."patientId" = ${patientId}
      AND t."toothCode" = ${toothCode}
    ORDER BY t."recordedAt" DESC
  `;
  return rows;
}
