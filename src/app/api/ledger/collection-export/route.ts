import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function parseDateRange(sp: URLSearchParams): { from: Date; to: Date; label: string } {
  const rawFrom = sp.get("from");
  const rawTo   = sp.get("to");
  const month   = sp.get("month") ?? new Date().toISOString().slice(0, 7);

  if (rawFrom && rawTo) {
    return {
      from:  new Date(rawFrom + "T00:00:00"),
      to:    new Date(rawTo   + "T23:59:59"),
      label: `${rawFrom} to ${rawTo}`,
    };
  }

  const [year, mon] = month.split("-").map(Number);
  return {
    from:  new Date(year, mon - 1, 1),
    to:    new Date(year, mon, 0, 23, 59, 59),
    label: month,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp       = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const format   = sp.get("format") ?? "csv";
  const { from, to, label } = parseDateRange(sp);

  const [entries, panelProviders] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: { date: { gte: from, lte: to }, ...(clinicId ? { clinicId } : {}) },
      include: { clinic: { select: { id: true, name: true } } },
      orderBy: [{ clinicId: "asc" }, { date: "asc" }],
    }),
    prisma.panelProvider.findMany({
      where: { active: true, ...(clinicId ? { clinicId } : {}) },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Per-clinic rollup
  type ClinicRow = {
    name: string; patients: number; profFee: number; products: number; sst: number; total: number;
    cashCurr: number; cashNext: number; card: number; fpx: number; ewallet: number; atome: number;
    panel: Record<string, number>; days: number;
  };
  const clinicMap: Record<string, ClinicRow> = {};
  for (const e of entries) {
    if (!clinicMap[e.clinicId]) {
      clinicMap[e.clinicId] = { name: e.clinic.name, patients: 0, profFee: 0, products: 0, sst: 0, total: 0, cashCurr: 0, cashNext: 0, card: 0, fpx: 0, ewallet: 0, atome: 0, panel: {}, days: 0 };
    }
    const c = clinicMap[e.clinicId];
    c.patients += e.patientCount;
    c.profFee  += Number(e.professionalFee);
    c.products += Number(e.productSales);
    c.sst      += Number(e.sst);
    c.total    += Number(e.totalSales);
    c.cashCurr += Number(e.cashCurrent);
    c.cashNext += Number(e.cashNext);
    c.card     += Number(e.creditCard);
    c.fpx      += Number(e.fpx);
    c.ewallet  += Number(e.ewallet);
    c.atome    += Number(e.atome);
    c.days     += 1;
    const pc = e.panelCollections as Record<string, number>;
    if (pc) {
      for (const [k, v] of Object.entries(pc)) {
        c.panel[k] = (c.panel[k] ?? 0) + Number(v);
      }
    }
  }
  const clinicRows = Object.values(clinicMap).sort((a, b) => b.total - a.total);

  const panelCodes = panelProviders.map(p => p.code);
  const panelNames = panelProviders.map(p => p.name);

  const T = {
    patients: clinicRows.reduce((s, c) => s + c.patients, 0),
    profFee:  clinicRows.reduce((s, c) => s + c.profFee, 0),
    products: clinicRows.reduce((s, c) => s + c.products, 0),
    sst:      clinicRows.reduce((s, c) => s + c.sst, 0),
    total:    clinicRows.reduce((s, c) => s + c.total, 0),
    cashCurr: clinicRows.reduce((s, c) => s + c.cashCurr, 0),
    cashNext: clinicRows.reduce((s, c) => s + c.cashNext, 0),
    card:     clinicRows.reduce((s, c) => s + c.card, 0),
    fpx:      clinicRows.reduce((s, c) => s + c.fpx, 0),
    ewallet:  clinicRows.reduce((s, c) => s + c.ewallet, 0),
    atome:    clinicRows.reduce((s, c) => s + c.atome, 0),
  };

  const COLS = [
    "Branch","Days","Patients",
    "Prof Fee","Products","SST","Total Sales",
    "Cash (Curr)","Cash (Next)","Credit Card","FPX","eWallet","Atome",
    ...panelNames,
    "Panel Total",
  ];

  if (format === "csv") {
    const lines = [
      `DentalOS — Collection Ledger — ${label}`,
      "",
      toCSVRow(COLS),
      ...clinicRows.map(c => {
        const panelVals  = panelCodes.map(k => (c.panel[k] ?? 0).toFixed(2));
        const panelTotal = Object.values(c.panel).reduce((s, v) => s + v, 0);
        return toCSVRow([
          c.name, c.days, c.patients,
          c.profFee.toFixed(2), c.products.toFixed(2), c.sst.toFixed(2), c.total.toFixed(2),
          c.cashCurr.toFixed(2), c.cashNext.toFixed(2), c.card.toFixed(2), c.fpx.toFixed(2), c.ewallet.toFixed(2), c.atome.toFixed(2),
          ...panelVals, panelTotal.toFixed(2),
        ]);
      }),
      toCSVRow([
        "TOTAL","","",
        T.profFee.toFixed(2), T.products.toFixed(2), T.sst.toFixed(2), T.total.toFixed(2),
        T.cashCurr.toFixed(2), T.cashNext.toFixed(2), T.card.toFixed(2), T.fpx.toFixed(2), T.ewallet.toFixed(2), T.atome.toFixed(2),
        ...panelCodes.map(k => clinicRows.reduce((s, c) => s + (c.panel[k] ?? 0), 0).toFixed(2)),
        clinicRows.reduce((s, c) => s + Object.values(c.panel).reduce((ps, v) => ps + v, 0), 0).toFixed(2),
      ]),
      "",
      `Generated: ${new Date().toLocaleString("en-MY")}`,
    ];

    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Collection-Ledger-${label.replace(/\s/g, "_")}.csv"`,
      },
    });
  }

  if (format === "pdf") {
    const { default: pdfmake } = await import("pdfmake/build/pdfmake");
    const { default: vfs }     = await import("pdfmake/build/vfs_fonts");
    (pdfmake as any).vfs = vfs.pdfMake?.vfs ?? vfs;

    function m(n: number) { return n.toFixed(2); }

    const headerRow = COLS.map(h => ({ text: h, style: "th" }));
    const dataRows  = clinicRows.map(c => {
      const panelVals  = panelCodes.map(k => ({ text: m(c.panel[k] ?? 0), alignment: "right" }));
      const panelTotal = Object.values(c.panel).reduce((s, v) => s + v, 0);
      return [
        { text: c.name, bold: true }, c.days, c.patients,
        { text: m(c.profFee), alignment: "right" }, { text: m(c.products), alignment: "right" },
        { text: m(c.sst), alignment: "right", color: "#b45309" }, { text: m(c.total), alignment: "right", bold: true },
        { text: m(c.cashCurr), alignment: "right", color: "#15803d" }, { text: m(c.cashNext), alignment: "right", color: "#15803d" },
        { text: m(c.card), alignment: "right", color: "#1d4ed8" }, { text: m(c.fpx), alignment: "right", color: "#4338ca" },
        { text: m(c.ewallet), alignment: "right", color: "#6d28d9" }, { text: m(c.atome), alignment: "right", color: "#be185d" },
        ...panelVals, { text: m(panelTotal), alignment: "right", color: "#7e22ce" },
      ];
    });
    const totalsRow = [
      { text: "TOTAL", bold: true, fillColor: "#f1f5f9" }, "", "",
      { text: m(T.profFee), alignment: "right", bold: true, fillColor: "#f1f5f9" },
      { text: m(T.products), alignment: "right", bold: true, fillColor: "#f1f5f9" },
      { text: m(T.sst), alignment: "right", bold: true, color: "#b45309", fillColor: "#f1f5f9" },
      { text: m(T.total), alignment: "right", bold: true, color: "#1d4ed8", fillColor: "#f1f5f9" },
      { text: m(T.cashCurr), alignment: "right", bold: true, color: "#15803d", fillColor: "#f1f5f9" },
      { text: m(T.cashNext), alignment: "right", bold: true, color: "#15803d", fillColor: "#f1f5f9" },
      { text: m(T.card), alignment: "right", bold: true, color: "#1d4ed8", fillColor: "#f1f5f9" },
      { text: m(T.fpx), alignment: "right", bold: true, color: "#4338ca", fillColor: "#f1f5f9" },
      { text: m(T.ewallet), alignment: "right", bold: true, color: "#6d28d9", fillColor: "#f1f5f9" },
      { text: m(T.atome), alignment: "right", bold: true, color: "#be185d", fillColor: "#f1f5f9" },
      ...panelCodes.map(k => ({
        text: m(clinicRows.reduce((s, c) => s + (c.panel[k] ?? 0), 0)),
        alignment: "right", bold: true, color: "#7e22ce", fillColor: "#f1f5f9",
      })),
      {
        text: m(clinicRows.reduce((s, c) => s + Object.values(c.panel).reduce((ps, v) => ps + v, 0), 0)),
        alignment: "right", bold: true, color: "#7e22ce", fillColor: "#f1f5f9",
      },
    ];

    const colCount = COLS.length;
    const widths   = ["*", 25, 30, 45, 45, 40, 50, 50, 50, 50, 40, 45, 40, ...panelCodes.map(() => 45), 50];

    const docDef: any = {
      pageOrientation: "landscape",
      pageSize: "A4",
      pageMargins: [20, 40, 20, 40],
      content: [
        { text: "DentalOS — Collection Ledger", style: "title" },
        { text: label, style: "subtitle" },
        { text: `Generated: ${new Date().toLocaleString("en-MY")}`, style: "meta", margin: [0, 0, 0, 12] },
        {
          table: {
            headerRows: 1,
            widths: widths.slice(0, colCount),
            body: [headerRow, ...dataRows, totalsRow],
          },
          layout: "lightHorizontalLines",
          style: "table",
        },
        {
          columns: [
            { text: `Cash: MYR ${(T.cashCurr + T.cashNext).toFixed(2)}`, style: "kpi", color: "#15803d" },
            { text: `Card: MYR ${T.card.toFixed(2)}`, style: "kpi", color: "#1d4ed8" },
            { text: `Digital: MYR ${(T.fpx + T.ewallet + T.atome).toFixed(2)}`, style: "kpi", color: "#4338ca" },
            { text: `Grand Total: MYR ${T.total.toFixed(2)}`, style: "kpi", bold: true },
          ],
          margin: [0, 10, 0, 0],
        },
      ],
      styles: {
        title:    { fontSize: 14, bold: true, margin: [0, 0, 0, 2] },
        subtitle: { fontSize: 10, color: "#374151", margin: [0, 0, 0, 2] },
        meta:     { fontSize: 8,  color: "#6b7280" },
        table:    { fontSize: 7.5 },
        th:       { bold: true, fillColor: "#f1f5f9", fontSize: 7, alignment: "center" },
        kpi:      { fontSize: 9, margin: [0, 0, 0, 0] },
      },
    };

    const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
      const doc = pdfmake.createPdf(docDef);
      doc.getBuffer((buf: Buffer) => resolve(new Uint8Array(buf)), reject);
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Collection-Ledger-${label.replace(/\s/g, "_")}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid format" }, { status: 400 });
}
