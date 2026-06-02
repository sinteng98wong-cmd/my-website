import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { clinicId } = await req.json();
  const res = NextResponse.json({ ok: true });
  res.cookies.set("selected_clinic", clinicId ?? "all", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: false,
  });
  return res;
}
