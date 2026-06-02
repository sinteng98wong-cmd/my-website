import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";

const PAYMENT_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash — Current Month",
  CASH_NEXT:    "Cash — Next Month",
  CREDIT_CARD:  "Credit Card",
  FPX:          "FPX",
  EWALLET:      "eWallet",
  ATOME:        "Atome",
  PANEL:        "Panel",
};

const PAYMENT_ORDER = ["CASH_CURRENT","CASH_NEXT","CREDIT_CARD","FPX","EWALLET","ATOME","PANEL"];

function toCSVRow(cells: (string | number)[]) {
  return cells
    .map(c => {
      const s = String(c ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp       = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const format   = sp.get("format") ?? "csv";
  const rawFrom  = sp.get("from") ?? new Date().toISOString().slice(0, 10);
  const rawTo    = sp.get("to")   ?? new Date().toISOString().slice(0, 10);
  const label    = rawFrom === rawTo ? rawFrom : `${rawFrom} to ${rawTo}`;

  const from = new Date(rawFrom + "T00:00:00");
  const to   = new Date(rawTo   + "T23:59:59");

  const [invoices, clinics] = await Promise.all([
    prisma.invoice.findMany({
      where: notDeleted({
        visit: {
          visitDate: { gte: from, lte: to },
          ...(clinicId ? { clinicId } : {}),
        },
      }),
      include: {
        visit: {
          include: {
            patient: { select: { name: true, icNumber: true, passportNo: true, isForeigner: true } },
            treatments: {
              include: { doctor: { include: { user: { select: { name: true } } } } },
            },
          },
        },
        payments: { include: { panelProvider: { select: { name: true, code: true } } } },
      },
      orderBy: [{ visit: { visitDate: "asc" } }],
    }),
    prisma.clinic.findMany({ select: { id: true, name: true } }),
  ]);

  const clinicNameMap = Object.fromEntries(clinics.map(c => [c.id, c.name]));

  // Flatten to payment rows grouped by method
  type PRow = {
    invoiceRef: string; clinicId: string;
    patient: (typeof invoices)[0]["visit"]["patient"];
    visitDate: Date; doctors: string;
    subtotal: number; sst: number; total: number;
    lineAmount: number; panelProvider?: { name: string } | null;
  };
  const groups: Record<string, PRow[]> = {};
  for (const inv of invoices) {
    const doctors = Array.from(new Set(
      inv.visit.treatments.filter(t => t.doctor?.user?.name).map(t => t.doctor!.user.name)
    )).join(", ") || "—";
    for (const p of inv.payments) {
      const row: PRow = {
        invoiceRef: inv.invoiceRef, clinicId: inv.visit.clinicId,
        patient: inv.visit.patient, visitDate: inv.visit.visitDate, doctors,
        subtotal: Number(inv.subtotal), sst: Number(inv.sst), total: Number(inv.total),
        lineAmount: Number(p.amount), panelProvider: p.panelProvider,
      };
      if (!groups[p.method]) groups[p.method] = [];
      groups[p.method].push(row);
    }
  }
  const sortedKeys = PAYMENT_ORDER.filter(k => groups[k]);

  function getDoctor(inv: (typeof invoices)[number]) {
    return Array.from(
      new Set(
        inv.visit.treatments
          .filter(t => t.doctor?.user?.name)
          .map(t => t.doctor!.user.name)
      )
    ).join(", ") || "—";
  }

  const COL_HEADERS = ["Payment Method","Branch","Patient Name","IC / Passport","Visit Date","Doctor","Amt (MYR)","Invoice Total (MYR)"];

  // ── CSV ────────────────────────────────────────────────────────────────────
  if (format === "csv") {
    const lines: string[] = [
      `DentalOS — Collection Detail — ${label}`,
      "",
      toCSVRow(COL_HEADERS),
    ];

    for (const key of sortedKeys) {
      lines.push(toCSVRow([`=== ${PAYMENT_LABELS[key] ?? key} ===`,"","","","","","",""]));
      for (const row of groups[key]) {
        const vDate = new Date(row.visitDate);
        const ic = row.patient.isForeigner ? (row.patient.passportNo ?? "—") : (row.patient.icNumber ?? "—");
        lines.push(toCSVRow([
          PAYMENT_LABELS[key] ?? key,
          clinicNameMap[row.clinicId] ?? "—",
          row.patient.name,
          ic,
          vDate.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }),
          row.doctors,
          row.lineAmount.toFixed(2),
          row.total.toFixed(2),
        ]));
      }
      const gAmt = groups[key].reduce((s, r) => s + r.lineAmount, 0);
      lines.push(toCSVRow([`Subtotal — ${PAYMENT_LABELS[key] ?? key}`,"","","","","",gAmt.toFixed(2),""]));
      lines.push("");
    }

    const grandTot = invoices.reduce((s, i) => s + Number(i.total), 0);
    lines.push(toCSVRow(["GRAND TOTAL","","","","","","",grandTot.toFixed(2)]));
    lines.push("");
    lines.push(`Generated: ${new Date().toLocaleString("en-MY")}`);

    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Collection-Detail-${label.replace(/\s/g, "_")}.csv"`,
      },
    });
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  if (format === "pdf") {
    const { default: pdfmake } = await import("pdfmake/build/pdfmake");
    const { default: vfs }     = await import("pdfmake/build/vfs_fonts");
    (pdfmake as any).vfs = vfs.pdfMake?.vfs ?? vfs;

    const m = (n: number | string | { toFixed: (d: number) => string }) => Number(n).toFixed(2);

    const content: any[] = [
      { text: "DentalOS — Collection Detail", style: "title" },
      { text: label, style: "subtitle" },
      { text: `Generated: ${new Date().toLocaleString("en-MY")}`, style: "meta", margin: [0, 0, 0, 14] },
    ];

    const HEADER_COLORS: Record<string, string> = {
      CASH_CURRENT: "#dcfce7", CASH_NEXT: "#ccfbf1", CREDIT_CARD: "#dbeafe",
      FPX: "#e0e7ff", EWALLET: "#ede9fe", ATOME: "#fce7f3", PANEL: "#f3e8ff",
    };

    for (const key of sortedKeys) {
      const rows     = groups[key];
      const gAmt     = rows.reduce((s, r) => s + r.lineAmount, 0);
      const hdrColor = HEADER_COLORS[key] ?? "#f1f5f9";

      const tableHeader = [
        { text: "Patient Name",    style: "th" },
        { text: "IC / Passport",   style: "th" },
        { text: "Branch",          style: "th" },
        { text: "Visit Date",      style: "th" },
        { text: "Doctor",          style: "th" },
        { text: "Amt (MYR)",       style: "th", alignment: "right" },
        { text: "Invoice Total",   style: "th", alignment: "right" },
      ].map(cell => ({ ...cell, fillColor: hdrColor }));

      const tableRows = rows.map(row => {
        const vDate = new Date(row.visitDate);
        const ic = row.patient.isForeigner ? (row.patient.passportNo ?? "—") : (row.patient.icNumber ?? "—");
        return [
          { text: row.patient.name, bold: true },
          { text: ic, fontSize: 7, color: "#374151" },
          { text: clinicNameMap[row.clinicId] ?? "—", color: "#374151" },
          { text: vDate.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) },
          { text: row.doctors, color: "#374151" },
          { text: m(row.lineAmount), alignment: "right", bold: true },
          { text: m(row.total), alignment: "right", color: "#374151" },
        ];
      });

      const subtotalRow = [
        { text: `Subtotal — ${PAYMENT_LABELS[key] ?? key}`, bold: true, colSpan: 5, fillColor: "#f8fafc", color: "#374151" },
        {}, {}, {}, {},
        { text: `MYR ${m(gAmt)}`, alignment: "right", bold: true, fillColor: "#f8fafc", color: "#1d4ed8" },
        { text: "", fillColor: "#f8fafc" },
      ];

      content.push({
        text: `${PAYMENT_LABELS[key] ?? key}  (${rows.length} line${rows.length !== 1 ? "s" : ""})`,
        style: "section", margin: [0, 8, 0, 4],
      });
      content.push({
        table: { headerRows: 1, widths: [100, 65, 70, 60, 80, 55, 55], body: [tableHeader, ...tableRows, subtotalRow] },
        layout: "lightHorizontalLines", style: "table", margin: [0, 0, 0, 6],
      });
    }

    const grandTot = invoices.reduce((s, i) => s + Number(i.total), 0);
    content.push({
      table: {
        widths: ["*", 55],
        body: [[
          { text: `GRAND TOTAL — ${label}  (${invoices.length} invoices)`, bold: true, fillColor: "#1e293b", color: "#ffffff" },
          { text: `MYR ${m(grandTot)}`, alignment: "right", bold: true, fillColor: "#1e293b", color: "#93c5fd", fontSize: 10 },
        ]],
      },
      layout: "noBorders", margin: [0, 10, 0, 0],
    });

    const docDef: any = {
      pageOrientation: "landscape",
      pageSize: "A4",
      pageMargins: [20, 40, 20, 40],
      content,
      styles: {
        title:    { fontSize: 14, bold: true, margin: [0, 0, 0, 2] },
        subtitle: { fontSize: 10, color: "#374151" },
        meta:     { fontSize: 8,  color: "#6b7280" },
        section:  { fontSize: 10, bold: true, color: "#1e3a8a" },
        table:    { fontSize: 7.5 },
        th:       { bold: true, fontSize: 7.5, alignment: "center" },
      },
    };

    const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
      const doc = pdfmake.createPdf(docDef);
      doc.getBuffer((buf: Buffer) => resolve(new Uint8Array(buf)), reject);
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Collection-Detail-${label.replace(/\s/g, "_")}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid format" }, { status: 400 });
}
