// Build UBL 2.1 JSON for MyInvois Malaysia
// Reference: MyInvois API documentation

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxAmount: number;
  taxRate: number; // 0 or 6
}

export interface EInvoiceDocumentInput {
  // Document
  invoiceRef: string;
  invoiceDate: string;      // YYYY-MM-DD
  invoiceTime: string;      // HH:MM:SSZ
  invoiceTypeCode: string;  // "01" individual, "02" credit, "03" debit, "04" consolidated
  currencyCode: string;     // "MYR"

  // Supplier (clinic/entity)
  supplierTin: string;
  supplierRegistrationNo: string;
  supplierSstRegistrationNo?: string;
  supplierName: string;
  supplierAddressLine1?: string;
  supplierCity?: string;
  supplierState?: string;
  supplierPostcode?: string;
  supplierCountry: string; // "MYS"
  supplierPhone?: string;
  supplierEmail?: string;
  supplierMsic?: string;   // MSIC code — "86210" for dental

  // Buyer
  buyerName: string;
  buyerTin?: string;           // if known (e.g. panel company)
  buyerRegistrationNo?: string;// IC or passport or SSM
  buyerIdType: string;         // "NRIC" | "PASSPORT" | "BRN" | "ARMY"
  buyerPhone?: string;
  buyerEmail?: string;
  buyerAddressLine1?: string;
  buyerCity?: string;
  buyerState?: string;
  buyerPostcode?: string;
  buyerCountry: string;        // "MYS" or "OTH"

  // Amounts
  lineItems: InvoiceLineItem[];
  subtotalExclTax: number;
  totalTax: number;
  totalInclTax: number;
  totalDiscount: number;

  // Original document ref (for credit/debit notes)
  originalInvoiceRef?: string;
  originalInvoiceUUID?: string;
  originalInvoiceDate?: string;
}

export function buildInvoiceUBL(input: EInvoiceDocumentInput): object {
  return {
    "ID": input.invoiceRef,
    "IssueDate": input.invoiceDate,
    "IssueTime": input.invoiceTime,
    "InvoiceTypeCode": input.invoiceTypeCode,
    "DocumentCurrencyCode": input.currencyCode,
    "TaxCurrencyCode": input.currencyCode,
    "InvoicePeriod": null,
    "BillingReference": input.originalInvoiceRef ? [{
      "InvoiceDocumentReference": {
        "ID": input.originalInvoiceRef,
        "UUID": input.originalInvoiceUUID,
        "IssueDate": input.originalInvoiceDate,
      }
    }] : undefined,
    "AccountingSupplierParty": {
      "AdditionalAccountID": input.supplierTin,
      "Party": {
        "IndustryClassificationCode": input.supplierMsic ?? "86210",
        "PartyIdentification": [
          { "ID": { "_": input.supplierTin, "schemeID": "TIN" } },
          { "ID": { "_": input.supplierRegistrationNo, "schemeID": "BRN" } },
          ...(input.supplierSstRegistrationNo
            ? [{ "ID": { "_": input.supplierSstRegistrationNo, "schemeID": "SST" } }]
            : []),
        ],
        "PostalAddress": {
          "AddressLine": [{ "Line": { "_": input.supplierAddressLine1 ?? "" } }],
          "CityName": input.supplierCity ?? "",
          "PostalZone": input.supplierPostcode ?? "",
          "CountrySubentityCode": input.supplierState ?? "",
          "Country": { "IdentificationCode": { "_": "MYS" } },
        },
        "PartyLegalEntity": { "RegistrationName": { "_": input.supplierName } },
        "Contact": {
          "Telephone": input.supplierPhone ?? "",
          "ElectronicMail": input.supplierEmail ?? "",
        },
      },
    },
    "AccountingCustomerParty": {
      "Party": {
        "PartyIdentification": [
          { "ID": { "_": input.buyerTin ?? "EI00000000010", "schemeID": "TIN" } },
          { "ID": { "_": input.buyerRegistrationNo ?? "", "schemeID": input.buyerIdType } },
        ],
        "PostalAddress": {
          "AddressLine": [{ "Line": { "_": input.buyerAddressLine1 ?? "" } }],
          "CityName": input.buyerCity ?? "",
          "PostalZone": input.buyerPostcode ?? "",
          "Country": { "IdentificationCode": { "_": input.buyerCountry } },
        },
        "PartyLegalEntity": { "RegistrationName": { "_": input.buyerName } },
        "Contact": {
          "Telephone": input.buyerPhone ?? "",
          "ElectronicMail": input.buyerEmail ?? "",
        },
      },
    },
    "TaxTotal": [{
      "TaxAmount": { "_": input.totalTax.toFixed(2), "currencyID": input.currencyCode },
      "TaxSubtotal": [{
        "TaxableAmount": { "_": input.subtotalExclTax.toFixed(2), "currencyID": input.currencyCode },
        "TaxAmount": { "_": input.totalTax.toFixed(2), "currencyID": input.currencyCode },
        "TaxCategory": {
          "ID": { "_": "01" },
          "TaxScheme": { "ID": { "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" } },
        },
      }],
    }],
    "LegalMonetaryTotal": {
      "LineExtensionAmount": { "_": input.subtotalExclTax.toFixed(2), "currencyID": input.currencyCode },
      "TaxExclusiveAmount":  { "_": input.subtotalExclTax.toFixed(2), "currencyID": input.currencyCode },
      "TaxInclusiveAmount":  { "_": input.totalInclTax.toFixed(2), "currencyID": input.currencyCode },
      "AllowanceTotalAmount": { "_": input.totalDiscount.toFixed(2), "currencyID": input.currencyCode },
      "PayableAmount": { "_": input.totalInclTax.toFixed(2), "currencyID": input.currencyCode },
    },
    "InvoiceLine": input.lineItems.map((item, i) => ({
      "ID": { "_": String(i + 1) },
      "InvoicedQuantity": { "_": item.quantity, "unitCode": "C62" },
      "LineExtensionAmount": { "_": item.total.toFixed(2), "currencyID": input.currencyCode },
      "TaxTotal": [{
        "TaxAmount": { "_": item.taxAmount.toFixed(2), "currencyID": input.currencyCode },
        "TaxSubtotal": [{
          "TaxableAmount": { "_": item.total.toFixed(2), "currencyID": input.currencyCode },
          "TaxAmount": { "_": item.taxAmount.toFixed(2), "currencyID": input.currencyCode },
          "TaxCategory": {
            "ID": { "_": "01" },
            "Percent": { "_": item.taxRate.toFixed(2) },
            "TaxScheme": { "ID": { "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" } },
          },
        }],
      }],
      "Item": {
        "CommodityClassification": {
          "ItemClassificationCode": { "_": "86210", "listID": "CLASS" },
        },
        "Description": { "_": item.description },
      },
      "Price": {
        "PriceAmount": { "_": item.unitPrice.toFixed(2), "currencyID": input.currencyCode },
      },
    })),
  };
}

// Wrap in the submission envelope expected by MyInvois
export function buildSubmissionDocument(ubl: object, _format: string = "JSON"): object {
  return {
    format: "JSON",
    document: Buffer.from(JSON.stringify(ubl)).toString("base64"),
    documentHash: "",
    codeNumber: (ubl as Record<string, unknown>)["ID"],
  };
}

// Build from Invoice data
export interface FullInvoiceData {
  invoice: {
    id: string;
    invoiceRef: string;
    subtotal: number;
    sst: number;
    total: number;
    createdAt: Date;
  };
  patient: {
    name: string;
    icNumber?: string | null;
    passportNo?: string | null;
    isForeigner: boolean;
    phone?: string | null;
    email?: string | null;
  };
  clinic: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  entity: {
    tin?: string | null;
    registrationNo?: string | null;
    sstRegistrationNo?: string | null;
    legalName: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  treatments: { name: string; amount: number; sst: number }[];
}

export function buildInvoiceFromData(data: FullInvoiceData, typeCode: string = "01"): object {
  const { invoice, patient, entity, treatments } = data;
  const date = new Date(invoice.createdAt);
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = date.toISOString().slice(11, 19) + "Z";

  let buyerIdType = "NRIC";
  let buyerRegistrationNo = patient.icNumber ?? "";
  if (patient.isForeigner && patient.passportNo) {
    buyerIdType = "PASSPORT";
    buyerRegistrationNo = patient.passportNo;
  }

  const lineItems: InvoiceLineItem[] = treatments.map(t => ({
    description: t.name,
    quantity: 1,
    unitPrice: t.amount,
    total: t.amount,
    taxAmount: t.sst,
    taxRate: t.sst > 0 ? 6 : 0,
  }));

  const input: EInvoiceDocumentInput = {
    invoiceRef: invoice.invoiceRef,
    invoiceDate: dateStr,
    invoiceTime: timeStr,
    invoiceTypeCode: typeCode,
    currencyCode: "MYR",
    supplierTin: entity.tin ?? "",
    supplierRegistrationNo: entity.registrationNo ?? "",
    supplierSstRegistrationNo: entity.sstRegistrationNo ?? undefined,
    supplierName: entity.legalName,
    supplierAddressLine1: entity.address ?? undefined,
    supplierCity: entity.city ?? undefined,
    supplierState: entity.state ?? undefined,
    supplierPostcode: entity.postcode ?? undefined,
    supplierCountry: "MYS",
    supplierPhone: entity.phone ?? undefined,
    supplierEmail: entity.email ?? undefined,
    supplierMsic: "86210",
    buyerName: patient.name,
    buyerTin: undefined,
    buyerRegistrationNo,
    buyerIdType,
    buyerPhone: patient.phone ?? undefined,
    buyerEmail: patient.email ?? undefined,
    buyerCountry: patient.isForeigner ? "OTH" : "MYS",
    lineItems,
    subtotalExclTax: invoice.subtotal,
    totalTax: invoice.sst,
    totalInclTax: invoice.total,
    totalDiscount: 0,
  };

  return buildInvoiceUBL(input);
}
