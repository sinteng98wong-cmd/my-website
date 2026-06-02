import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateJournal } from "@/lib/journal";

const HEADERS = ["Code","Branch","Amount","Description","Month","YA Year","Perd","Module","Account Code","Sub-Code"];

function toCSVRow(cells: (string | number)[]) {
  return cells.map(c => {
    const s = String(c ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(",");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month    = searchParams.get("month")    ?? new Date().toISOString().slice(0, 7);
  const clinicId = searchParams.get("clinicId") ?? undefined;
  const format   = searchParams.get("format")   ?? "csv"; // "csv" | "pdf"

  const rows = await generateJournal(month, clinicId);

  // ── CSV ──────────────────────────────────────────────────────────────
  if (format === "csv") {
    const lines = [
      toCSVRow(HEADERS),
      ...rows.map(r => toCSVRow([
        r.code, r.branch, r.amount.toFixed(2), r.description,
        r.date, r.yaYear, r.period, r.module, r.accountCode, r.subCode,
      ])),
    ];

    // Summary totals at bottom
    lines.push("");
    lines.push(toCSVRow(["TOTAL","","",`${rows.length} entries`,"","","","","",""]));

    const salesTotal   = rows.filter(r => r.module === "Sales").reduce((s, r) => s + r.amount, 0);
    const receiptTotal = rows.filter(r => r.module === "Sales-Receipt").reduce((s, r) => s + r.amount, 0);
    lines.push(toCSVRow(["Sales Total","",salesTotal.toFixed(2),"","","","","","",""]));
    lines.push(toCSVRow(["Sales-Receipt Total","",receiptTotal.toFixed(2),"","","","","","",""]));

    const csv = lines.join("\r\n");
    const filename = `Sales-Journal-${month}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // ── PDF ──────────────────────────────────────────────────────────────
  if (format === "pdf") {
    // Build pdfmake document
    const { default: pdfmake } = await import("pdfmake/build/pdfmake");
    const { default: vfs }     = await import("pdfmake/build/vfs_fonts");
    (pdfmake as any).vfs = vfs.pdfMake?.vfs ?? vfs;

    const salesRows    = rows.filter(r => r.module === "Sales");
    const receiptRows  = rows.filter(r => r.module === "Sales-Receipt");
    const salesTotal   = salesRows.reduce((s, r) => s + r.amount, 0);
    const receiptTotal = receiptRows.reduce((s, r) => s + r.amount, 0);

    function tableBody(data: typeof rows) {
      const header = HEADERS.map(h => ({ text: h, style: "tableHeader" }));
      const body = data.map(r => [
        r.code, r.branch,
        { text: r.amount.toFixed(2), alignment: "right" },
        r.description, r.date, r.yaYear,
        String(r.period), r.module, r.accountCode, r.subCode,
      ]);
      return [header, ...body];
    }

    const docDef: any = {
      pageOrientation: "landscape",
      pageSize: "A4",
      pageMargins: [20, 40, 20, 40],
      content: [
        { text: `Sales Journal — ${month}`, style: "title" },
        { text: `Generated: ${new Date().toLocaleString("en-MY")}`, style: "subtitle", margin: [0, 0, 0, 12] },

        { text: "SALES", style: "section" },
        {
          table: { headerRows: 1, widths: [50,60,45,130,55,40,20,60,40,30], body: tableBody(salesRows) },
          layout: "lightHorizontalLines", style: "table",
        },
        { text: `Sales Total: MYR ${salesTotal.toFixed(2)}`, style: "subtotal", margin: [0, 4, 0, 16] },

        { text: "RECEIPTS", style: "section" },
        {
          table: { headerRows: 1, widths: [50,60,45,130,55,40,20,60,40,30], body: tableBody(receiptRows) },
          layout: "lightHorizontalLines", style: "table",
        },
        { text: `Receipts Total: MYR ${receiptTotal.toFixed(2)}`, style: "subtotal", margin: [0, 4, 0, 0] },
      ],
      styles: {
        title:       { fontSize: 14, bold: true, margin: [0, 0, 0, 4] },
        subtitle:    { fontSize: 9,  color: "#64748b" },
        section:     { fontSize: 10, bold: true, margin: [0, 8, 0, 4], color: "#1e40af" },
        table:       { fontSize: 7.5 },
        tableHeader: { bold: true, fillColor: "#f1f5f9", fontSize: 7.5 },
        subtotal:    { fontSize: 9, bold: true, color: "#1e40af", alignment: "right" },
      },
    };

    const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
      const doc = pdfmake.createPdf(docDef);
      doc.getBuffer((buf: Buffer) => resolve(new Uint8Array(buf)), reject);
    });

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Sales-Journal-${month}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid format" }, { status: 400 });
}
