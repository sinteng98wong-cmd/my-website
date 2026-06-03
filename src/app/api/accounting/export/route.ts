import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSalesBook, getCashReceived, getAccountingSummary } from "@/lib/accounting-export";
import { generateAccountingExcel } from "@/lib/accounting-excel";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId") ?? "";
  const year  = parseInt(searchParams.get("year")  ?? "0");
  const month = parseInt(searchParams.get("month") ?? "0");

  if (!clinicId || !year || !month)
    return NextResponse.json({ error: "clinicId, year, month required" }, { status: 422 });

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true, slug: true } });
  if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const mLabel = new Date(year, month - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  const [salesBook, cashReceived, summary] = await Promise.all([
    getSalesBook(clinicId, year, month),
    getCashReceived(clinicId, year, month),
    getAccountingSummary(clinicId, year, month),
  ]);

  const clinicCode = clinic.slug ?? clinic.name.replace(/\s+/g, "-").toUpperCase().slice(0, 10);
  const buf = generateAccountingExcel(clinic.name, clinicCode, mLabel, monthStr, salesBook, cashReceived, summary);
  const filename = `SalesBook-${clinicCode}-${monthStr}.xlsx`;

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
