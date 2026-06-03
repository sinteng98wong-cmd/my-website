import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PdfPrinter from "pdfmake";
import { TDocumentDefinitions } from "pdfmake/interfaces";
import { format } from "date-fns";

const fonts = {
  Helvetica: {
    normal: "Helvetica", bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique",
  },
};

function fmt(n: number | string) { return `RM ${Number(n).toFixed(2)}`; }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const invoice = await prisma.stockInvoice.findUnique({
    where: { id: params.id },
    include: {
      fromEntity: true,
      deliveryOrders: {
        include: {
          fromClinic: { select: { name: true } },
          toClinic:   { select: { name: true } },
          lines: { include: { item: { select: { name: true, sku: true, unit: true } } } },
        },
        orderBy: { raisedAt: "asc" },
      },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const grand = Number(invoice.totalAmount) + Number(invoice.sst);

  // Build line rows grouped by DO
  const tableBody: any[][] = [
    [
      { text: "DO Ref",     style: "th" },
      { text: "To Clinic",  style: "th" },
      { text: "Item",       style: "th" },
      { text: "SKU",        style: "th" },
      { text: "Qty",        style: "th", alignment: "center" },
      { text: "Unit Cost",  style: "th", alignment: "right"  },
      { text: "Line Total", style: "th", alignment: "right"  },
    ],
  ];

  for (const do_ of invoice.deliveryOrders) {
    do_.lines.forEach((l, i) => {
      const qty = l.receivedQty ?? l.quantity;
      tableBody.push([
        { text: i === 0 ? do_.doRef : "", fontSize: 8, color: "#6b7280", noWrap: true },
        { text: i === 0 ? do_.toClinic.name : "", fontSize: 9 },
        { text: l.item.name,  fontSize: 9 },
        { text: l.item.sku,   fontSize: 8, color: "#9ca3af" },
        { text: `${qty} ${l.item.unit}`, fontSize: 9, alignment: "center" },
        { text: fmt(Number(l.unitCost)), fontSize: 9, alignment: "right" },
        { text: fmt(qty * Number(l.unitCost)), fontSize: 9, alignment: "right", bold: true },
      ]);
    });
  }

  const docDef: TDocumentDefinitions = {
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    pageSize: "A4",
    pageMargins: [40, 40, 40, 60],

    footer: (cur: number, count: number) => ({
      margin: [40, 0],
      columns: [
        { text: `DentalOS Stock Invoice · ${new Date().toLocaleDateString("en-MY")}`, color: "#9ca3af", fontSize: 8 },
        { text: `Page ${cur} of ${count}`, alignment: "right", color: "#9ca3af", fontSize: 8 },
      ],
    }),

    content: [
      {
        columns: [
          {
            stack: [
              { text: "DentalOS", fontSize: 20, bold: true, color: "#1d4ed8" },
              { text: invoice.fromEntity.legalName, fontSize: 9, color: "#6b7280", margin: [0, 2, 0, 0] },
            ],
          },
          {
            stack: [
              { text: "STOCK INVOICE", fontSize: 16, bold: true, alignment: "right" },
              { text: invoice.invoiceRef, fontSize: 11, alignment: "right", color: "#374151", margin: [0, 4, 0, 0] },
              { text: `Period: ${invoice.month}`, fontSize: 9, alignment: "right", color: "#6b7280" },
              { text: invoice.issuedAt ? `Issued: ${format(new Date(invoice.issuedAt), "d MMM yyyy")}` : "", fontSize: 9, alignment: "right", color: "#6b7280" },
            ],
          },
        ],
        margin: [0, 0, 0, 20],
      },

      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#e5e7eb" }], margin: [0, 0, 0, 16] },

      {
        table: {
          headerRows: 1,
          widths: [60, 80, "*", 50, 50, 55, 60],
          body: tableBody,
        },
        layout: {
          hLineColor: (i: number) => i === 0 || i === 1 ? "#374151" : "#f3f4f6",
          vLineColor: () => "#f3f4f6",
          fillColor: (i: number) => i % 2 === 0 && i > 0 ? "#f9fafb" : null,
        },
        margin: [0, 0, 0, 16],
      },

      {
        columns: [
          { text: "", width: "*" },
          {
            table: {
              widths: [110, 80],
              body: [
                [{ text: "Subtotal", fontSize: 9, margin: [6, 4, 6, 4] }, { text: fmt(Number(invoice.totalAmount)), fontSize: 9, alignment: "right", margin: [0, 4, 6, 4] }],
                [{ text: "SST", fontSize: 9, margin: [6, 4, 6, 4] }, { text: fmt(Number(invoice.sst)), fontSize: 9, alignment: "right", margin: [0, 4, 6, 4] }],
                [
                  { text: "Grand Total", bold: true, fontSize: 11, fillColor: "#1e3a5f", color: "#fff", margin: [6, 6, 6, 6] },
                  { text: fmt(grand), bold: true, fontSize: 11, alignment: "right", fillColor: "#1e3a5f", color: "#fff", margin: [0, 6, 6, 6] },
                ],
              ],
            },
            layout: { hLineColor: () => "#d1d5db", vLineColor: () => "#d1d5db" },
          },
        ],
        margin: [0, 0, 0, 40],
      },

      {
        columns: [
          {
            stack: [
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 1, lineColor: "#374151" }] },
              { text: "Authorised by", fontSize: 8, color: "#6b7280", margin: [0, 4, 0, 0] },
              { text: invoice.fromEntity.legalName, fontSize: 8, color: "#9ca3af" },
            ],
          },
          { text: "", width: "*" },
          {
            stack: [
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 1, lineColor: "#374151" }] },
              { text: "Acknowledged by", fontSize: 8, color: "#6b7280", margin: [0, 4, 0, 0] },
              { text: "Receiving clinic", fontSize: 8, color: "#9ca3af" },
            ],
          },
        ],
      },
    ],

    styles: {
      th: { bold: true, fontSize: 8, color: "#ffffff", fillColor: "#1e3a5f", margin: [4, 5, 4, 5] },
    },
  };

  const printer  = new PdfPrinter(fonts);
  const pdfDoc   = printer.createPdfKitDocument(docDef);
  const chunks: Buffer[] = [];
  pdfDoc.on("data", (c: Buffer) => chunks.push(c));

  const buf = await new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on("end",   () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceRef}.pdf"`,
    },
  });
}
