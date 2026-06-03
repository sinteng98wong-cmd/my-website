import * as XLSX from "xlsx";
import type { SalesBookRow, CashReceivedRow, AccountingExportSummary } from "./accounting-export";

const RM = (n: number) => Number(n.toFixed(2));

export function generateAccountingExcel(
  clinicName: string,
  clinicCode: string,
  monthLabelStr: string,
  yyyyMM: string,
  salesBook: SalesBookRow[],
  cashReceived: CashReceivedRow[],
  summary: AccountingExportSummary,
): Buffer {
  const wb = XLSX.utils.book_new();
  const generated = new Date().toLocaleString("en-MY");

  // ── Sheet 1: Sales Book ──────────────────────────────────────────────────

  const s1Data: any[][] = [
    ["SALES BOOK"],
    [`Clinic: ${clinicName}`],
    [`Month: ${monthLabelStr}`],
    [`Generated: ${generated}`],
    [],
    ["Date", "Invoice No", "Debtor", "Professional Fees (RM)", "SST (RM)", "Products (RM)", "Total (RM)"],
  ];
  for (const r of salesBook) {
    s1Data.push([r.date, r.invoiceNo, r.debtor, RM(r.profFees), RM(r.sst), RM(r.products), RM(r.total)]);
  }
  const s1TotProfFees = salesBook.reduce((s, r) => s + r.profFees, 0);
  const s1TotSST      = salesBook.reduce((s, r) => s + r.sst, 0);
  const s1TotProducts = salesBook.reduce((s, r) => s + r.products, 0);
  const s1TotTotal    = salesBook.reduce((s, r) => s + r.total, 0);
  s1Data.push(["TOTAL", "", "", RM(s1TotProfFees), RM(s1TotSST), RM(s1TotProducts), RM(s1TotTotal)]);

  const ws1 = XLSX.utils.aoa_to_sheet(s1Data);
  ws1["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];

  // Style title
  if (ws1["A1"]) ws1["A1"].s = { font: { bold: true, sz: 14 } };

  XLSX.utils.book_append_sheet(wb, ws1, "Sales Book");

  // ── Sheet 2: Cash Received ───────────────────────────────────────────────

  const current  = cashReceived.filter((r) => r.tag === "CURRENT");
  const deferred = cashReceived.filter((r) => r.tag === "DEFERRED");

  const colHeaders = ["Ref", "Debtor", "Gross (RM)", "SST (RM)", "Service Charge (RM)", "Net Received (RM)"];
  const deferredColHeaders = [...colHeaders, "Invoice Month"];

  const s2Data: any[][] = [
    ["CASH RECEIVED"],
    [`Clinic: ${clinicName}`],
    [`Month: ${monthLabelStr}`],
    [`Generated: ${generated}`],
    [],
    ["CASH CURRENT"],
    colHeaders,
  ];

  for (const r of current) {
    s2Data.push([r.ref, r.debtor, RM(r.grossAmount), RM(r.sstAmount), RM(r.serviceCharge), RM(r.netReceived)]);
  }
  const subCurrent = current.reduce((s, r) => s + r.netReceived, 0);
  s2Data.push(["SUBTOTAL — CASH CURRENT", "", "", "", "", RM(subCurrent)]);
  s2Data.push([]);

  s2Data.push(["CASH DEFERRED (Prior Month)"]);
  s2Data.push(deferredColHeaders);
  for (const r of deferred) {
    s2Data.push([r.ref, r.debtor, RM(r.grossAmount), RM(r.sstAmount), RM(r.serviceCharge), RM(r.netReceived), r.invoiceMonth]);
  }
  const subDeferred = deferred.reduce((s, r) => s + r.netReceived, 0);
  s2Data.push(["SUBTOTAL — CASH DEFERRED", "", "", "", "", RM(subDeferred)]);
  s2Data.push([]);

  const grandTotal = subCurrent + subDeferred;
  s2Data.push(["TOTAL CASH RECEIVED", "", "", "", "", RM(grandTotal)]);
  s2Data.push([]);
  s2Data.push(["Service Charges Summary"]);
  s2Data.push(["Total Service Charges Deducted:", "", "", "", "", RM(summary.totalServiceCharges)]);
  for (const m of summary.byMethod) {
    if (m.serviceCharge > 0) {
      s2Data.push([`${m.method}:`, "", "", "", "", RM(m.serviceCharge)]);
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet(s2Data);
  ws2["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Cash Received");

  // ── Sheet 3: Summary ─────────────────────────────────────────────────────

  const s3Data: any[][] = [
    ["ACCOUNTING SUMMARY"],
    [`Clinic: ${clinicName}`],
    [`Month: ${monthLabelStr}`],
    [`Generated: ${generated}`],
    [],
    ["SALES"],
    ["Total Professional Fees", "", RM(summary.totalProfFees)],
    ["Total SST",               "", RM(summary.totalSST)],
    ["Total Products",          "", RM(summary.totalProducts)],
    ["─────────────────────────────────────", "", "──────────"],
    ["Total Sales",             "", RM(summary.totalSales)],
    ["Total Invoices",          "", summary.invoiceCount],
    [],
    ["CASH RECEIVED"],
    ["Cash Current",            "", RM(summary.totalCashCurrent)],
    ["Cash Deferred",           "", RM(summary.totalCashDeferred)],
    ["Total Service Charges",   "", RM(summary.totalServiceCharges)],
    ["─────────────────────────────────────", "", "──────────"],
    ["Total Cash Received",     "", RM(summary.totalCashReceived)],
    [],
    ["RECONCILIATION"],
    ["Total Sales",             "", RM(summary.totalSales)],
    ["Less: Total Cash Received", "", RM(summary.totalCashReceived)],
    ["─────────────────────────────────────", "", "──────────"],
    ["Outstanding Balance",     "", RM(summary.outstandingBalance)],
    [],
    ["BY PAYMENT METHOD"],
    ["Method", "Gross (RM)", "Service Charge (RM)", "Net Received (RM)"],
    ...summary.byMethod.map((m) => [m.method, RM(m.grossAmount), RM(m.serviceCharge), RM(m.netReceived)]),
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
  ws3["!cols"] = [{ wch: 38 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Summary");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
