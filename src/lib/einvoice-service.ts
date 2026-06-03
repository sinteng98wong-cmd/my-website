import crypto from "crypto";
import { prisma } from "./prisma";
import {
  getEntityConfig,
  submitDocuments,
  cancelDocument,
  getQrUrl,
} from "./myinvois-client";
import { buildInvoiceFromData } from "./einvoice-ubl";

// The Prisma client types may be stale until `prisma generate` is re-run after
// the schema additions. Using `any` cast for new models and new Entity fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function hashDocument(doc: object): string {
  const json = JSON.stringify(doc);
  return crypto.createHash("sha256").update(json).digest("hex");
}

// ── Individual submission ────────────────────────────────────────────────────

export async function submitIndividualInvoice(
  invoiceId: string,
  _submittedById?: string
): Promise<{
  success: boolean;
  uuid?: string;
  longId?: string;
  qrUrl?: string;
  error?: string;
}> {
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

  if (!invoice) throw new Error("Invoice not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = invoice as any;
  if (invAny.eInvoiceStatus === "VALID") {
    return { success: true, uuid: invAny.eInvoiceUUID ?? undefined };
  }

  const { visit } = invoice;
  const { clinic, patient } = visit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entity = clinic.entity as any;

  if (!entity.eInvoiceEnabled) throw new Error("e-Invoice not enabled for this entity");
  const config = getEntityConfig(entity);

  const data = {
    invoice: {
      id: invoice.id,
      invoiceRef: invoice.invoiceRef,
      subtotal: Number(invoice.subtotal),
      sst: Number(invoice.sst),
      total: Number(invoice.total),
      createdAt: invoice.createdAt,
    },
    patient: {
      name: patient.name,
      icNumber: patient.icNumber,
      passportNo: patient.passportNo,
      isForeigner: patient.isForeigner,
      phone: patient.phone,
      email: patient.email,
    },
    clinic: {
      name: clinic.name,
    },
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
    treatments: visit.treatments.map((t) => ({
      name: t.treatmentType.name,
      amount: Number(t.billedAmount),
      sst: Number(t.sst),
    })),
  };

  const ubl = buildInvoiceFromData(data, "01");
  const docHash = hashDocument(ubl);
  const submissionDoc = {
    format: "JSON",
    document: Buffer.from(JSON.stringify(ubl)).toString("base64"),
    documentHash: docHash,
    codeNumber: invoice.invoiceRef,
  };

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      eInvoiceStatus: "PENDING",
      eInvoiceType: "INDIVIDUAL",
      eInvoiceSubmittedAt: new Date(),
    },
  });

  try {
    const result = await submitDocuments(config, [submissionDoc]);
    const accepted = result.acceptedDocuments?.[0];
    const rejected = result.rejectedDocuments?.[0];

    if (accepted) {
      const qrUrl = accepted.longId
        ? getQrUrl(
            entity.myInvoisEnvironment ?? "SANDBOX",
            accepted.uuid,
            accepted.longId
          )
        : null;
      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          eInvoiceStatus:      "VALID",
          eInvoiceUUID:        accepted.uuid,
          eInvoiceLongId:      accepted.longId ?? null,
          eInvoiceRef:         accepted.uuid,
          eInvoiceQrUrl:       qrUrl,
          eInvoiceValidatedAt: new Date(),
        },
      });
      return {
        success: true,
        uuid: accepted.uuid,
        longId: accepted.longId ?? undefined,
        qrUrl: qrUrl ?? undefined,
      };
    } else {
      await db.invoice.update({
        where: { id: invoiceId },
        data: { eInvoiceStatus: "INVALID" },
      });
      return { success: false, error: JSON.stringify(rejected?.error ?? "Rejected") };
    }
  } catch (e: unknown) {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { eInvoiceStatus: "INVALID" },
    });
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Cancel document ──────────────────────────────────────────────────────────

export async function cancelInvoice(
  invoiceId: string,
  reason: string,
  _userId: string
): Promise<{ success: boolean; error?: string }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { visit: { include: { clinic: { include: { entity: true } } } } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = invoice as any;
  if (!invoice || !invAny.eInvoiceUUID) {
    throw new Error("Invoice not found or not submitted");
  }
  if (invAny.eInvoiceStatus !== "VALID") {
    throw new Error("Only VALID invoices can be cancelled");
  }

  const submittedAt: Date = invAny.eInvoiceSubmittedAt ?? invoice.createdAt;
  const hoursSince = (Date.now() - submittedAt.getTime()) / 3600000;
  if (hoursSince > 72) {
    throw new Error("72-hour cancellation window has passed. Use credit note instead.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entity = invoice.visit.clinic.entity as any;
  const config = getEntityConfig(entity);

  try {
    await cancelDocument(config, invAny.eInvoiceUUID as string, reason);
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        eInvoiceStatus:       "CANCELLED",
        eInvoiceCancelledAt:  new Date(),
        eInvoiceCancelReason: reason,
      },
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Helper ───────────────────────────────────────────────────────────────────

function buildSupplierParty(entity: {
  tin?: string | null;
  registrationNo?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  legalName: string;
}) {
  return {
    Party: {
      IndustryClassificationCode: "86210",
      PartyIdentification: [
        { ID: { _: entity.tin ?? "", schemeID: "TIN" } },
        { ID: { _: entity.registrationNo ?? "", schemeID: "BRN" } },
      ],
      PostalAddress: {
        AddressLine: [{ Line: { _: entity.address ?? "" } }],
        CityName: entity.city ?? "",
        PostalZone: entity.postcode ?? "",
        Country: { IdentificationCode: { _: "MYS" } },
      },
      PartyLegalEntity: { RegistrationName: { _: entity.legalName } },
    },
  };
}

// ── Consolidated batch ───────────────────────────────────────────────────────

export async function submitConsolidatedBatch(
  clinicId: string,
  month: string,
  submittedById: string
): Promise<{ success: boolean; batchId?: string; error?: string }> {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(year, mon - 1, 1);
  const to   = new Date(year, mon, 1);

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: { entity: true },
  });
  if (!clinic) throw new Error("Clinic not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entity = clinic.entity as any;
  if (!entity.eInvoiceEnabled) throw new Error("e-Invoice not enabled");

  const config = getEntityConfig(entity);

  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: from, lt: to },
      visit: { clinicId },
      // New fields — use db (any cast) for the where clause
    },
  });

  // Filter in JS for new fields since Prisma types are stale
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligibleInvoices = invoices.filter((inv: any) =>
    !inv.eInvoiceType && inv.eInvoiceStatus !== "VALID"
  );

  if (eligibleInvoices.length === 0) {
    return { success: false, error: "No invoices to consolidate for this month" };
  }

  const batchCount = await db.eInvoiceBatch.count({ where: { clinicId, month } });
  const batchRef = `EINV-BATCH-${month.replace("-", "")}-${String(batchCount + 1).padStart(3, "0")}`;

  const totalAmount = eligibleInvoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  const totalSst    = eligibleInvoices.reduce((s: number, i: any) => s + Number(i.sst), 0);

  const consolidatedUbl = {
    ID: batchRef,
    IssueDate: new Date().toISOString().slice(0, 10),
    IssueTime: new Date().toISOString().slice(11, 19) + "Z",
    InvoiceTypeCode: "04",
    DocumentCurrencyCode: "MYR",
    AccountingSupplierParty: buildSupplierParty(entity),
    AccountingCustomerParty: {
      Party: {
        PartyIdentification: [
          { ID: { _: "EI00000000010", schemeID: "TIN" } },
          { ID: { _: "EI00000000010", schemeID: "NRIC" } },
        ],
        PostalAddress: { Country: { IdentificationCode: { _: "MYS" } } },
        PartyLegalEntity: { RegistrationName: { _: "General Public" } },
      },
    },
    TaxTotal: [{ TaxAmount: { _: totalSst.toFixed(2), currencyID: "MYR" } }],
    LegalMonetaryTotal: {
      LineExtensionAmount: { _: (totalAmount - totalSst).toFixed(2), currencyID: "MYR" },
      TaxInclusiveAmount:  { _: totalAmount.toFixed(2), currencyID: "MYR" },
      PayableAmount:       { _: totalAmount.toFixed(2), currencyID: "MYR" },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    InvoiceLine: eligibleInvoices.map((inv: any, i: number) => ({
      ID: { _: String(i + 1) },
      InvoicedQuantity: { _: 1, unitCode: "C62" },
      LineExtensionAmount: { _: Number(inv.subtotal).toFixed(2), currencyID: "MYR" },
      Item: { Description: { _: inv.invoiceRef } },
      Price: { PriceAmount: { _: Number(inv.subtotal).toFixed(2), currencyID: "MYR" } },
    })),
  };

  const consolidatedDoc = {
    format: "JSON",
    document: Buffer.from(JSON.stringify(consolidatedUbl)).toString("base64"),
    documentHash: crypto.createHash("sha256").update(batchRef).digest("hex"),
    codeNumber: batchRef,
  };

  const batch = await db.eInvoiceBatch.create({
    data: {
      batchRef,
      clinicId,
      entityId: clinic.entityId,
      batchType: "CONSOLIDATED",
      month,
      totalAmount,
      totalSst,
      invoiceCount: eligibleInvoices.length,
      status: "PENDING",
      submittedById,
      rawRequest: consolidatedDoc,
    },
  });

  try {
    const result = await submitDocuments(config, [consolidatedDoc]);
    const accepted = result.acceptedDocuments?.[0];

    if (accepted) {
      await db.eInvoiceBatch.update({
        where: { id: batch.id },
        data: {
          status:         "VALID",
          myInvoisUUID:   accepted.uuid,
          myInvoisLongId: accepted.longId ?? null,
          submittedAt:    new Date(),
          validatedAt:    new Date(),
          rawResponse:    result,
        },
      });
      await db.invoice.updateMany({
        where: { id: { in: eligibleInvoices.map((i: any) => i.id) } },
        data: {
          eInvoiceStatus:      "CONSOLIDATED",
          eInvoiceType:        "CONSOLIDATED",
          consolidatedBatchId: batch.id,
          eInvoiceSubmittedAt: new Date(),
        },
      });
      return { success: true, batchId: batch.id };
    } else {
      await db.eInvoiceBatch.update({
        where: { id: batch.id },
        data: {
          status:       "INVALID",
          rawResponse:  result,
          errorMessage: JSON.stringify(result.rejectedDocuments),
        },
      });
      return { success: false, error: "Rejected by MyInvois" };
    }
  } catch (e: unknown) {
    await db.eInvoiceBatch.update({
      where: { id: batch.id },
      data: { status: "INVALID", errorMessage: e instanceof Error ? e.message : String(e) },
    });
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Panel consolidated batch ─────────────────────────────────────────────────

export async function submitPanelConsolidatedBatch(
  clinicId: string,
  panelProviderId: string,
  month: string,
  submittedById: string
): Promise<{ success: boolean; batchId?: string; error?: string }> {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(year, mon - 1, 1);
  const to   = new Date(year, mon, 1);

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: { entity: true },
  });
  const panel = await prisma.panelProvider.findUnique({
    where: { id: panelProviderId },
  });

  if (!clinic || !panel) throw new Error("Clinic or panel not found");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entity = clinic.entity as any;
  const config = getEntityConfig(entity);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const panelAny = panel as any;

  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: from, lt: to },
      visit: { clinicId },
      payments: { some: { method: "PANEL", panelProviderId } },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligibleInvoices = invoices.filter((inv: any) => !inv.eInvoiceType);

  if (eligibleInvoices.length === 0) {
    return { success: false, error: "No panel invoices to consolidate" };
  }

  const totalAmount = eligibleInvoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  const totalSst    = eligibleInvoices.reduce((s: number, i: any) => s + Number(i.sst), 0);

  const batchCount = await db.eInvoiceBatch.count({
    where: { clinicId, panelProviderId, month },
  });
  const batchRef = `EINV-PANEL-${panel.code}-${month.replace("-", "")}-${String(batchCount + 1).padStart(3, "0")}`;

  const panelUbl = {
    ID: batchRef,
    IssueDate: new Date().toISOString().slice(0, 10),
    IssueTime: new Date().toISOString().slice(11, 19) + "Z",
    InvoiceTypeCode: "02",
    DocumentCurrencyCode: "MYR",
    AccountingSupplierParty: buildSupplierParty(entity),
    AccountingCustomerParty: {
      Party: {
        PartyIdentification: [
          { ID: { _: panelAny.tin ?? "EI00000000010", schemeID: "TIN" } },
          { ID: { _: panelAny.registrationNo ?? "", schemeID: "BRN" } },
        ],
        PartyLegalEntity: { RegistrationName: { _: panel.name } },
      },
    },
    TaxTotal: [{ TaxAmount: { _: totalSst.toFixed(2), currencyID: "MYR" } }],
    LegalMonetaryTotal: {
      TaxInclusiveAmount: { _: totalAmount.toFixed(2), currencyID: "MYR" },
      PayableAmount:      { _: totalAmount.toFixed(2), currencyID: "MYR" },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    InvoiceLine: eligibleInvoices.map((inv: any, i: number) => ({
      ID: { _: String(i + 1) },
      InvoicedQuantity: { _: 1, unitCode: "C62" },
      LineExtensionAmount: { _: Number(inv.subtotal).toFixed(2), currencyID: "MYR" },
      Item: { Description: { _: inv.invoiceRef } },
      Price: { PriceAmount: { _: Number(inv.subtotal).toFixed(2), currencyID: "MYR" } },
    })),
  };

  const panelDoc = {
    format: "JSON",
    document: Buffer.from(JSON.stringify(panelUbl)).toString("base64"),
    documentHash: crypto.createHash("sha256").update(batchRef).digest("hex"),
    codeNumber: batchRef,
  };

  const batch = await db.eInvoiceBatch.create({
    data: {
      batchRef,
      clinicId,
      entityId: clinic.entityId,
      batchType: "PANEL_CONSOLIDATED",
      panelProviderId,
      month,
      totalAmount,
      totalSst,
      invoiceCount: eligibleInvoices.length,
      status: "PENDING",
      submittedById,
    },
  });

  try {
    const result = await submitDocuments(config, [panelDoc]);
    const accepted = result.acceptedDocuments?.[0];
    if (accepted) {
      await db.eInvoiceBatch.update({
        where: { id: batch.id },
        data: {
          status:         "VALID",
          myInvoisUUID:   accepted.uuid,
          myInvoisLongId: accepted.longId ?? null,
          submittedAt:    new Date(),
          validatedAt:    new Date(),
        },
      });
      await db.invoice.updateMany({
        where: { id: { in: eligibleInvoices.map((i: any) => i.id) } },
        data: {
          eInvoiceStatus:      "CONSOLIDATED",
          eInvoiceType:        "PANEL_CONSOLIDATED",
          consolidatedBatchId: batch.id,
        },
      });
      return { success: true, batchId: batch.id };
    } else {
      await db.eInvoiceBatch.update({
        where: { id: batch.id },
        data: { status: "INVALID" },
      });
      return { success: false, error: "Rejected" };
    }
  } catch (e: unknown) {
    await db.eInvoiceBatch.update({
      where: { id: batch.id },
      data: { status: "INVALID", errorMessage: e instanceof Error ? e.message : String(e) },
    });
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
