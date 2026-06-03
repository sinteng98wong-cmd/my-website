import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, maskCredential } from "@/lib/encrypt";

const db = prisma as any;

function sanitizeEntity(e: Record<string, unknown>) {
  return {
    ...e,
    myInvoisClientId:     e.myInvoisClientId     ? maskCredential(e.myInvoisClientId as string)     : null,
    myInvoisClientSecret: e.myInvoisClientSecret ? maskCredential(e.myInvoisClientSecret as string) : null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "Entity" WHERE id = ${params.id} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const clinics = await (prisma as any).clinic.findMany({
      where: { entityId: params.id },
      select: {
        id: true, name: true, isHQ: true, slug: true,
        address: true, city: true, state: true, postcode: true,
        phone: true, email: true,
        directorId: true, picId: true,
        director: { select: { id: true, name: true } },
        pic:      { select: { id: true, name: true } },
      },
      orderBy: [{ isHQ: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(sanitizeEntity({ ...rows[0], clinics }));
  } catch (e: any) {
    console.error("GET /api/entities/[id] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

    const body = await req.json();
    const existing = await db.entity.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Check if FY start month is changing — require confirmation
    if (body.financialYearStartMonth !== undefined &&
        Number(body.financialYearStartMonth) !== existing.financialYearStartMonth &&
        !body.confirmed) {
      return NextResponse.json({
        requiresConfirmation: true,
        warning: "Changing financial year start will affect reporting periods, leave entitlements, and SST filing periods. Existing historical data will not be recalculated. Are you sure?",
      });
    }

    const data: Record<string, unknown> = {};
    const simpleFields = [
      "legalName","name","tradingName","registrationNo","oldRegistrationNo",
      "address","city","state","postcode","country","phone","email","website","logoUrl",
      "financialYearStartMonth","sstFilingFrequency","myInvoisEnvironment",
      "directorName","directorIcNo","bankName","bankAccountNo","bankAccountName",
      "isActive","panelEnabled","sstOnForeigner",
      "sstRegistrationNo","tin",
    ];
    for (const f of simpleFields) {
      if (body[f] !== undefined) data[f] = body[f] === "" ? null : body[f];
    }

    if (body.sstRegistered    !== undefined) data.sstRegistered   = body.sstRegistered;
    if (body.isSstRegistered  !== undefined) data.sstRegistered   = body.isSstRegistered;
    if (body.eInvoiceEnabled  !== undefined) data.eInvoiceEnabled = body.eInvoiceEnabled;
    if (body.isEInvoiceEnabled !== undefined) data.eInvoiceEnabled = body.isEInvoiceEnabled;

    if (body.sstEffectiveDate      !== undefined) data.sstEffectiveDate      = body.sstEffectiveDate      ? new Date(body.sstEffectiveDate)      : null;
    if (body.eInvoiceEffectiveDate !== undefined) data.eInvoiceEffectiveDate = body.eInvoiceEffectiveDate ? new Date(body.eInvoiceEffectiveDate) : null;
    if (body.incorporationDate     !== undefined) data.incorporationDate     = body.incorporationDate     ? new Date(body.incorporationDate)     : null;

    if (body.financialYearStartMonth !== undefined)
      data.financialYearStartMonth = Number(body.financialYearStartMonth);

    // Credentials — only re-encrypt if a real (non-masked) value is passed
    if (body.myInvoisClientId !== undefined && !String(body.myInvoisClientId).includes("****"))
      data.myInvoisClientId = body.myInvoisClientId ? encrypt(body.myInvoisClientId) : null;
    if (body.myInvoisClientSecret !== undefined && !String(body.myInvoisClientSecret).includes("****"))
      data.myInvoisClientSecret = body.myInvoisClientSecret ? encrypt(body.myInvoisClientSecret) : null;

    // Use the known fields through the typed client first, then raw patch for extended fields
    // (Prisma client is stale — use $executeRaw to set new columns)
    const knownData: Record<string, unknown> = {};
    if (data.legalName       !== undefined) knownData.legalName       = data.legalName;
    if (data.sstRegistered   !== undefined) knownData.sstRegistered   = data.sstRegistered;
    if (data.eInvoiceEnabled !== undefined) knownData.eInvoiceEnabled = data.eInvoiceEnabled;
    if (data.panelEnabled    !== undefined) knownData.panelEnabled    = data.panelEnabled;
    if (data.sstOnForeigner  !== undefined) knownData.sstOnForeigner  = data.sstOnForeigner;

    if (Object.keys(knownData).length > 0) {
      await prisma.entity.update({ where: { id: params.id }, data: knownData });
    }

    // Patch extended fields via raw SQL
    const setClauses = Object.entries(data)
      .filter(([k]) => !["legalName","sstRegistered","eInvoiceEnabled","panelEnabled","sstOnForeigner"].includes(k))
      .map(([k]) => k);

    if (setClauses.length > 0) {
      // Build a safe parameterised update for each extended field
      const fieldMap: Record<string, unknown> = {};
      const extFields = [
        "name","tradingName","registrationNo","oldRegistrationNo","incorporationDate",
        "address","city","state","postcode","country","phone","email","website","logoUrl",
        "financialYearStartMonth","sstRegistrationNo","sstEffectiveDate","sstFilingFrequency",
        "tin","myInvoisClientId","myInvoisClientSecret","myInvoisEnvironment","eInvoiceEffectiveDate",
        "directorName","directorIcNo","bankName","bankAccountNo","bankAccountName","isActive",
      ];
      for (const f of extFields) {
        if (data[f] !== undefined) fieldMap[f] = data[f];
      }

      // Execute individual field updates (safe with parameterised queries)
      for (const [col, val] of Object.entries(fieldMap)) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Entity" SET "${col}" = $1 WHERE id = $2`,
          val,
          params.id
        );
      }
    }

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "Entity" WHERE id = ${params.id} LIMIT 1
    `;
    return NextResponse.json(sanitizeEntity(rows[0] ?? {}));
  } catch (e: any) {
    console.error("PATCH /api/entities/[id] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

    const clinicCount = await prisma.clinic.count({ where: { entityId: params.id } });
    if (clinicCount > 0)
      return NextResponse.json({ error: "Cannot delete entity with active clinics. Reassign or deactivate clinics first." }, { status: 409 });

    const updated = await db.entity.update({ where: { id: params.id }, data: { isActive: false } });
    return NextResponse.json(sanitizeEntity(updated));
  } catch (e: any) {
    console.error("DELETE /api/entities/[id] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
