import { NextRequest, NextResponse } from "next/server";
import { guardAnalytics, resolveClinicIds, sourceReport, referralReport, type DateRange } from "@/lib/patient-analytics";

export async function GET(req: NextRequest) {
  if (!(await guardAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clinicId = req.nextUrl.searchParams.get("clinicId");
  const range = (req.nextUrl.searchParams.get("dateRange") ?? "all") as DateRange;
  const ids = await resolveClinicIds(clinicId);
  const [base, referral] = await Promise.all([sourceReport(ids, range), referralReport(ids, range)]);
  return NextResponse.json({ ...base, ...referral });
}
