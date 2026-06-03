import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, maskCredential } from "@/lib/encrypt";

function sanitizeEntity(e: Record<string, unknown>) {
  return {
    ...e,
    myInvoisClientId:     e.myInvoisClientId     ? maskCredential(e.myInvoisClientId as string)     : null,
    myInvoisClientSecret: e.myInvoisClientSecret ? maskCredential(e.myInvoisClientSecret as string) : null,
  };
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

    const entities = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.*,
        (SELECT COUNT(*) FROM "Clinic" c WHERE c."entityId" = e.id)::int AS "clinicCount"
      FROM "Entity" e
      ORDER BY e."legalName" ASC
    `;
    return NextResponse.json(entities.map(sanitizeEntity));
  } catch (e: any) {
    console.error("GET /api/entities error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

    const body = await req.json();

    if (!body.legalName && !body.name)
      return NextResponse.json({ error: "Company name required" }, { status: 422 });
    if (body.financialYearStartMonth !== undefined) {
      const m = Number(body.financialYearStartMonth);
      if (m < 1 || m > 12) return NextResponse.json({ error: "financialYearStartMonth must be 1-12" }, { status: 422 });
    }

    // Step 1: Create with only the fields the current Prisma client knows about
    const entity = await prisma.entity.create({
      data: {
        legalName:       body.legalName ?? body.name,
        sstRegistered:   body.sstRegistered ?? false,
        eInvoiceEnabled: body.eInvoiceEnabled ?? false,
        panelEnabled:    false,
        sstOnForeigner:  false,
      },
    });

    // Step 2: Patch all the extended fields via raw SQL (new columns not in old generated client)
    const clientId     = body.myInvoisClientId     ? encrypt(body.myInvoisClientId)     : null;
    const clientSecret = body.myInvoisClientSecret ? encrypt(body.myInvoisClientSecret) : null;
    const fyMonth      = body.financialYearStartMonth ? Number(body.financialYearStartMonth) : 1;

    await prisma.$executeRaw`
      UPDATE "Entity" SET
        name                   = ${(body.name ?? body.legalName) as string},
        "tradingName"          = ${(body.tradingName || null) as string | null},
        "registrationNo"       = ${(body.registrationNo || null) as string | null},
        "oldRegistrationNo"    = ${(body.oldRegistrationNo || null) as string | null},
        "incorporationDate"    = ${body.incorporationDate ? new Date(body.incorporationDate) : null},
        address                = ${(body.address || null) as string | null},
        city                   = ${(body.city || null) as string | null},
        state                  = ${(body.state || null) as string | null},
        postcode               = ${(body.postcode || null) as string | null},
        country                = ${(body.country ?? "Malaysia") as string},
        phone                  = ${(body.phone || null) as string | null},
        email                  = ${(body.email || null) as string | null},
        website                = ${(body.website || null) as string | null},
        "logoUrl"              = ${(body.logoUrl || null) as string | null},
        "financialYearStartMonth" = ${fyMonth},
        "sstRegistrationNo"    = ${(body.sstRegistrationNo || null) as string | null},
        "sstEffectiveDate"     = ${body.sstEffectiveDate ? new Date(body.sstEffectiveDate) : null},
        "sstFilingFrequency"   = ${(body.sstFilingFrequency ?? "BI_MONTHLY") as string},
        tin                    = ${(body.tin || null) as string | null},
        "myInvoisClientId"     = ${clientId},
        "myInvoisClientSecret" = ${clientSecret},
        "myInvoisEnvironment"  = ${(body.myInvoisEnvironment ?? "SANDBOX") as string},
        "eInvoiceEffectiveDate" = ${body.eInvoiceEffectiveDate ? new Date(body.eInvoiceEffectiveDate) : null},
        "directorName"         = ${(body.directorName || null) as string | null},
        "directorIcNo"         = ${(body.directorIcNo || null) as string | null},
        "bankName"             = ${(body.bankName || null) as string | null},
        "bankAccountNo"        = ${(body.bankAccountNo || null) as string | null},
        "bankAccountName"      = ${(body.bankAccountName || null) as string | null},
        "isActive"             = ${body.isActive ?? true}
      WHERE id = ${entity.id}
    `;

    // Re-fetch so response includes all fields
    const full = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "Entity" WHERE id = ${entity.id} LIMIT 1
    `;

    return NextResponse.json(sanitizeEntity(full[0] ?? entity), { status: 201 });
  } catch (e: any) {
    console.error("POST /api/entities error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
