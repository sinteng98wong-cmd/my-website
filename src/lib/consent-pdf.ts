import { prisma } from "./prisma";
import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import fs from "fs";
import path from "path";

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

const printer = new PdfPrinter(fonts);

function formatFieldValue(fieldType: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (fieldType === "DATE" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString("en-MY", { dateStyle: "medium" });
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export async function generateConsentPdf(requestId: string): Promise<string> {
  const request = await prisma.consentRequest.findUnique({
    where: { id: requestId },
    include: {
      template: { include: { fields: { orderBy: { order: "asc" } } } },
      clinic: { select: { name: true, address: true, phone: true } },
    },
  });

  if (!request) throw new Error("ConsentRequest not found");

  const responses = (request.responses as Record<string, unknown>) ?? {};
  const signedAt = request.signedAt
    ? new Date(request.signedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const fieldRows: any[] = request.template.fields.map((f) => ({
    columns: [
      { text: f.label + ":", bold: true, width: "40%", fontSize: 9 },
      {
        text: formatFieldValue(f.fieldType, responses[f.id]),
        width: "60%",
        fontSize: 9,
      },
    ],
    margin: [0, 0, 0, 4],
  }));

  const content: any[] = [
    // Letterhead
    { text: request.clinic.name, style: "clinicName" },
    request.clinic.address
      ? { text: request.clinic.address, style: "clinicAddress" }
      : null,
    request.clinic.phone
      ? { text: "Tel: " + request.clinic.phone, style: "clinicAddress" }
      : null,
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#cbd5e1" }], margin: [0, 8, 0, 8] },

    // Form title
    { text: request.template.name, style: "formTitle" },
    { text: `Version ${request.template.version}  ·  Ref: ${request.id.slice(-8).toUpperCase()}`, style: "subTitle" },
    "\n",

    // Intro
    ...(request.template.introText
      ? [
          { text: "Introduction", style: "sectionHeader" },
          { text: request.template.introText, style: "body" },
          "\n",
        ]
      : []),

    // Fields
    ...(fieldRows.length > 0
      ? [{ text: "Patient Responses", style: "sectionHeader" }, ...fieldRows, "\n"]
      : []),

    // Consent clause
    ...(request.template.consentText
      ? [
          { text: "Consent Agreement", style: "sectionHeader" },
          { text: request.template.consentText, style: "body" },
          "\n",
        ]
      : []),

    // Signature block
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#e2e8f0" }], margin: [0, 4, 0, 8] },
    { text: "Signature", style: "sectionHeader" },

    ...(request.signatureUrl && request.signatureUrl.startsWith("data:image")
      ? [{ image: request.signatureUrl, width: 200, height: 80, margin: [0, 0, 0, 8] }]
      : [{ text: "[Signature not available]", italics: true, fontSize: 9, color: "#94a3b8", margin: [0, 0, 0, 8] }]),

    {
      columns: [
        { text: `Signed by: ${request.signedByName ?? "—"}`, bold: true, fontSize: 9, width: "50%" },
        { text: `Date/Time: ${signedAt}`, fontSize: 9, width: "50%" },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      text: `IP Address: ${request.signedIp ?? "—"}`,
      fontSize: 8,
      color: "#64748b",
    },

    "\n",
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#e2e8f0" }], margin: [0, 0, 0, 6] },
    {
      text: `Digitally signed via ${request.signMethod ?? "digital_signature"} on ${signedAt}`,
      style: "footer",
    },
  ].filter(Boolean);

  const docDef: TDocumentDefinitions = {
    content,
    defaultStyle: { font: "Helvetica", fontSize: 10, lineHeight: 1.4 },
    styles: {
      clinicName: { fontSize: 16, bold: true, color: "#0f172a", marginBottom: 2 },
      clinicAddress: { fontSize: 9, color: "#64748b", marginBottom: 1 },
      formTitle: { fontSize: 14, bold: true, color: "#1e40af", marginBottom: 2 },
      subTitle: { fontSize: 9, color: "#64748b", marginBottom: 4 },
      sectionHeader: { fontSize: 11, bold: true, color: "#0f172a", marginBottom: 4, marginTop: 4 },
      body: { fontSize: 10, lineHeight: 1.5, color: "#334155" },
      footer: { fontSize: 8, italics: true, color: "#64748b" },
    },
    pageMargins: [40, 40, 40, 40],
  };

  const dir = path.join(process.cwd(), "public", "consent-pdfs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${requestId}.pdf`;
  const filepath = path.join(dir, filename);
  const pdfUrl = `/consent-pdfs/${filename}`;

  await new Promise<void>((resolve, reject) => {
    const doc = printer.createPdfKitDocument(docDef);
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => {
      fs.writeFile(filepath, Buffer.concat(chunks), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    doc.on("error", reject);
    doc.end();
  });

  await prisma.consentRequest.update({ where: { id: requestId }, data: { pdfUrl } });
  return pdfUrl;
}
