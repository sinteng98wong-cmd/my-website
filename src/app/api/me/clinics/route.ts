import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserClinics } from "@/lib/selected-clinic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinics = await getUserClinics();
  return NextResponse.json(clinics.map((c) => ({ id: c.id, name: c.name })));
}
