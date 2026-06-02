import { NextRequest, NextResponse } from "next/server";
import {
  guardAnalytics, resolveClinicIds,
  sourceReport, referralReport, ageReport, addressReport, genderReport,
  type DateRange,
} from "@/lib/patient-analytics";

export async function GET(req: NextRequest) {
  if (!(await guardAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clinicId = req.nextUrl.searchParams.get("clinicId");
  const range = (req.nextUrl.searchParams.get("dateRange") ?? "all") as DateRange;
  const ids = await resolveClinicIds(clinicId);

  const [base, referral, age, address, gender] = await Promise.all([
    sourceReport(ids, range), referralReport(ids, range),
    ageReport(ids, range), addressReport(ids, range), genderReport(ids, range),
  ]);

  return NextResponse.json({
    source: { ...base, ...referral },
    age, address, gender,
  });
}
