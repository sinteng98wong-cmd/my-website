import { NextRequest, NextResponse } from "next/server";
import { guardAnalytics, resolveClinicIds, genderReport, type DateRange } from "@/lib/patient-analytics";

export async function GET(req: NextRequest) {
  if (!(await guardAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clinicId = req.nextUrl.searchParams.get("clinicId");
  const range = (req.nextUrl.searchParams.get("dateRange") ?? "all") as DateRange;
  const ids = await resolveClinicIds(clinicId);
  return NextResponse.json(await genderReport(ids, range));
}
