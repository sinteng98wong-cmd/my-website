import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suggestNurses } from "@/lib/pairing";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const dentistProfileId = sp.get("dentistProfileId");
  const dateStr = sp.get("date");
  const shiftTemplateId = sp.get("shiftTemplateId") || undefined;
  if (!clinicId || !dentistProfileId || !dateStr) {
    return NextResponse.json({ error: "clinicId, dentistProfileId, date required" }, { status: 422 });
  }

  const suggestions = await suggestNurses(clinicId, dentistProfileId, new Date(dateStr), shiftTemplateId);
  return NextResponse.json(suggestions);
}
