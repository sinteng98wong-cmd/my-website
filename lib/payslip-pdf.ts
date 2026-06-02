import { prisma } from "./prisma";
import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

const fonts = {
  Helvetica: {
    normal: "Helvetica", bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique",
  },
};

const rm = (n: any) => `RM ${Number(n).toFixed(2)}`;
const maskAcc = (a?: string | null) => (a ? `****${a.slice(-4)}` : "—");

export async function generatePaySlipPdf(paySlipId: string): Promise<Buffer> {
  const slip = await prisma.paySlip.findUnique({
    where: { id: paySlipId },
    include: {
      payrollRun: { include: { clinic: { include: { entity: { select: { legalName: true } } } } } },
      staffProfile: { select: {
        employeeId: true, jobTitle: true, department: true, bankName: true, bankAccountNo: true,
        epfNo: true, socsoNo: true, user: { select: { name: true } },
      } },
    },
  });
  if (!slip) throw new Error("Payslip not found");

  const sp = slip.staffProfile;
  const [y, m] = slip.payrollRun.month.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  const totalDeductions =
    Number(slip.epfEmployee) + Number(slip.socsoEmployee) + Number(slip.eisEmployee) +
    Number(slip.incomeTax) + Number(slip.unpaidLeaveDeduction) + Number(slip.otherDeductions);

  const earnings: [string, string][] = [
    ["Basic Salary", rm(slip.basicSalary)],
    ["Allowances", rm(slip.allowances)],
    ["Overtime", rm(slip.overtime)],
    ["Commission", rm(slip.commission)],
    ["Reimbursements", rm(slip.claims)],
  ];
  const deductions: [string, string][] = [
    ["EPF (Employee)", rm(slip.epfEmployee)],
    ["SOCSO (Employee)", rm(slip.socsoEmployee)],
    ["EIS (Employee)", rm(slip.eisEmployee)],
    ["Income Tax (PCB)", rm(slip.incomeTax)],
    ["Unpaid Leave", rm(slip.unpaidLeaveDeduction)],
  ];

  const docDef: TDocumentDefinitions = {
    defaultStyle: { font: "Helvetica", fontSize: 9 },
    pageMargins: [40, 40, 40, 40],
    content: [
      { columns: [
        [{ text: slip.payrollRun.clinic.entity.legalName, bold: true, fontSize: 13 },
         { text: slip.payrollRun.clinic.name, fontSize: 9, color: "#555" }],
        { text: "SALARY SLIP", bold: true, fontSize: 16, alignment: "right" },
      ] },
      { text: `Month: ${monthLabel}`, alignment: "right", margin: [0, 2, 0, 10], color: "#555" },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#ccc" }], margin: [0, 0, 0, 10] },

      // Employee block
      { columns: [
        [{ text: `Employee: ${sp.user.name}`, bold: true },
         { text: `Employee ID: ${sp.employeeId ?? "—"}` },
         { text: `Position: ${sp.jobTitle ?? "—"}   Department: ${sp.department ?? "—"}` }],
        [{ text: `Bank: ${sp.bankName ?? "—"}   Acc: ${maskAcc(sp.bankAccountNo)}`, alignment: "right" },
         { text: `EPF No: ${sp.epfNo ?? "—"}   SOCSO No: ${sp.socsoNo ?? "—"}`, alignment: "right" }],
      ], margin: [0, 0, 0, 12] },

      // Earnings / Deductions table
      { columns: [
        { width: "50%", table: { widths: ["*", "auto"], body: [
          [{ text: "EARNINGS", style: "th", colSpan: 2 }, {}],
          ...earnings.map(([k, v]) => [{ text: k }, { text: v, alignment: "right" }]),
          [{ text: "Gross", bold: true }, { text: rm(slip.grossSalary), bold: true, alignment: "right" }],
        ] } },
        { width: 10, text: "" },
        { width: "50%", table: { widths: ["*", "auto"], body: [
          [{ text: "DEDUCTIONS", style: "th", colSpan: 2 }, {}],
          ...deductions.map(([k, v]) => [{ text: k }, { text: v, alignment: "right" }]),
          [{ text: "Total Deductions", bold: true }, { text: rm(totalDeductions), bold: true, alignment: "right" }],
        ] } },
      ] },

      // Net
      { table: { widths: ["*", "auto"], body: [[
        { text: "NET SALARY", bold: true, fontSize: 12, fillColor: "#1e3a5f", color: "#fff", margin: [6, 6, 6, 6] },
        { text: rm(slip.netSalary), bold: true, fontSize: 12, fillColor: "#1e3a5f", color: "#fff", alignment: "right", margin: [6, 6, 6, 6] },
      ]] }, margin: [0, 12, 0, 12] },

      // Attendance
      { text: "Attendance Summary", bold: true, margin: [0, 0, 0, 4] },
      { text: `Days Worked: ${slip.daysWorked}   Absent: ${slip.daysAbsent}   Leave: ${slip.daysLeave}   Public Holiday: ${slip.daysPublicHoliday}   OT: ${slip.overtimeMinutes} min`, color: "#555" },

      { text: "This is a computer generated document. No signature is required.", italics: true, fontSize: 7, color: "#999", margin: [0, 20, 0, 0], alignment: "center" },
    ],
    styles: { th: { bold: true, fontSize: 9, color: "#ffffff", fillColor: "#1e3a5f", margin: [4, 4, 4, 4] } },
  };

  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDef);
  const chunks: Buffer[] = [];
  pdfDoc.on("data", (c: Buffer) => chunks.push(c));
  return new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
