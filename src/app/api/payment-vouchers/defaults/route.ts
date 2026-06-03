/**
 * GET /api/payment-vouchers/defaults?clinicId=xxx
 *
 * Returns the bank account and PV mode pre-configured for this clinic/entity
 * so the PV creation form can auto-fill without the user typing it each time.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinicId = new URL(req.url).searchParams.get("clinicId");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  // Fetch clinic + entity in one query via raw SQL (Prisma client may be stale)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      c.id                  AS "clinicId",
      c.name                AS "clinicName",
      c."bankName"          AS "clinicBankName",
      c."bankAccountNo"     AS "clinicBankAccountNo",
      c."bankAccountName"   AS "clinicBankAccountName",
      c."pvGroupTag"        AS "pvGroupTag",
      c."directorId"        AS "directorId",
      c."picId"             AS "picId",
      e.id                  AS "entityId",
      e."pvMode"            AS "pvMode",
      e."bankName"          AS "entityBankName",
      e."bankAccountNo"     AS "entityBankAccountNo",
      e."bankAccountName"   AS "entityBankAccountName",
      e."legalName"         AS "entityName",
      ud.name               AS "directorName",
      up.name               AS "picName"
    FROM "Clinic" c
    JOIN "Entity" e ON e.id = c."entityId"
    LEFT JOIN "User" ud ON ud.id = c."directorId"
    LEFT JOIN "User" up ON up.id = c."picId"
    WHERE c.id = ${clinicId}
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  const r = rows[0];

  const pvMode = r.pvMode ?? "PER_CLINIC";
  const isGrouped = pvMode === "GROUPED";

  // Determine which bank account to use
  const bankName        = isGrouped ? r.entityBankName        : (r.clinicBankName        ?? r.entityBankName);
  const bankAccountNo   = isGrouped ? r.entityBankAccountNo   : (r.clinicBankAccountNo   ?? r.entityBankAccountNo);
  const bankAccountName = isGrouped ? r.entityBankAccountName : (r.clinicBankAccountName ?? r.entityBankAccountName);

  // In GROUPED mode, return all sibling clinics with the same pvGroupTag
  let groupedClinics: any[] = [];
  if (isGrouped) {
    const siblings = await prisma.$queryRaw<any[]>`
      SELECT id, name, "pvGroupTag"
      FROM "Clinic"
      WHERE "entityId" = ${r.entityId}
        AND (
          "pvGroupTag" = ${r.pvGroupTag ?? null}
          OR (${r.pvGroupTag ?? null} IS NULL AND "pvGroupTag" IS NULL)
        )
      ORDER BY "isHQ" DESC, name ASC
    `;
    groupedClinics = siblings;
  }

  return NextResponse.json({
    pvMode,
    clinicId:         r.clinicId,
    clinicName:       r.clinicName,
    entityId:         r.entityId,
    entityName:       r.entityName,
    bankName:         bankName ?? null,
    bankAccountNo:    bankAccountNo ?? null,
    bankAccountName:  bankAccountName ?? null,
    directorId:       r.directorId ?? null,
    directorName:     r.directorName ?? null,
    picId:            r.picId ?? null,
    picName:          r.picName ?? null,
    // GROUPED mode: list of clinics that will be covered by this PV
    groupedClinics:   isGrouped ? groupedClinics : [],
  });
}
