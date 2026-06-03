import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEntityConfig, submitDocuments } from "@/lib/myinvois-client";
import { buildInvoiceFromData } from "@/lib/einvoice-ubl";
import crypto from "crypto";

// The Prisma client types may be stale until `prisma generate` is re-run.
// Using `any` cast for new models and new Entity fields added in this migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    invoiceId?: string;
    reason?: string;
    amount?: number;
  };
  const { invoiceId, reason, amount } = body;
  if (!invoiceId || !reason || !amount) {
    return NextResponse.json(
      { error: "invoiceId, reason, amount required" },
      { status: 422 }
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      visit: {
        include: {
          patient: true,
          clinic: { include: { entity: true } },
          treatments: { include: { treatmentType: true } },
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eInvoiceUUID is a new field — access via any until prisma generate runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = invoice as any;
  if (!invAny.eInvoiceUUID) {
    return NextResponse.json(
      { error: "Invoice has not been submitted to MyInvois" },
      { status: 409 }
    );
  }

  const submittedAt: Date = invAny.eInvoiceSubmittedAt ?? invoice.createdAt;
  const hoursSince = (Date.now() - submittedAt.getTime()) / 3600000;
  if (hoursSince <= 72) {
    return NextResponse.json(
      { error: "Within 72hrs: use Cancel instead" },
      { status: 409 }
    );
  }

  const cnCount = await db.eInvoiceCreditNote.count({
    where: { originalInvoiceId: invoiceId },
  });
  const cnRef = `CN-${new Date().toISOString().slice(0, 7).replace("-", "")}-${String(cnCount + 1).padStart(3, "0")}`;

  const cn = await db.eInvoiceCreditNote.create({
    data: {
      cnRef,
      originalInvoiceId: invoiceId,
      clinicId: invoice.visit.clinicId,
      reason,
      amount: Number(amount),
      status: "PENDING",
      createdById: userId,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entity = invoice.visit.clinic.entity as any;
  const config = getEntityConfig(entity);

  const data = {
    invoice: {
      id: cn.id,
      invoiceRef: cnRef,
      subtotal: Number(amount),
      sst: 0,
      total: Number(amount),
      createdAt: new Date(),
    },
    patient: {
      name: invoice.visit.patient.name,
      icNumber: invoice.visit.patient.icNumber,
      passportNo: invoice.visit.patient.passportNo,
      isForeigner: invoice.visit.patient.isForeigner,
      phone: invoice.visit.patient.phone,
      email: invoice.visit.patient.email,
    },
    clinic: { name: invoice.visit.clinic.name },
    entity: {
      tin: entity.tin,
      registrationNo: entity.registrationNo,
      sstRegistrationNo: entity.sstRegistrationNo,
      legalName: entity.legalName,
      address: entity.address,
      city: entity.city,
      state: entity.state,
      postcode: entity.postcode,
      phone: entity.phone,
      email: entity.email,
    },
    treatments: [{ name: `Credit Note: ${reason}`, amount: Number(amount), sst: 0 }],
  };

  const ubl = buildInvoiceFromData(data, "02");
  const submissionDoc = {
    format: "JSON",
    document: Buffer.from(JSON.stringify(ubl)).toString("base64"),
    documentHash: crypto.createHash("sha256").update(cnRef).digest("hex"),
    codeNumber: cnRef,
  };

  try {
    const result = await submitDocuments(config, [submissionDoc]);
    const accepted = result.acceptedDocuments?.[0];
    if (accepted) {
      await db.eInvoiceCreditNote.update({
        where: { id: cn.id },
        data: {
          status:         "VALID",
          myInvoisUUID:   accepted.uuid,
          myInvoisLongId: accepted.longId ?? null,
          submittedAt:    new Date(),
          validatedAt:    new Date(),
          rawRequest:     submissionDoc,
          rawResponse:    result,
        },
      });
      return NextResponse.json({ success: true, cnId: cn.id, uuid: accepted.uuid });
    } else {
      await db.eInvoiceCreditNote.update({
        where: { id: cn.id },
        data: { status: "INVALID" },
      });
      return NextResponse.json({ success: false, error: "Rejected" });
    }
  } catch (e: unknown) {
    await db.eInvoiceCreditNote.update({
      where: { id: cn.id },
      data: { status: "INVALID" },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
