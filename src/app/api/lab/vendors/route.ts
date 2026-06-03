import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json([], { status: 200 });

    const vendors = await prisma.labVendor.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(vendors);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();
    const { name, contactName, phone, email, address, clinicId } = body;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 422 });
    if (!clinicId) return NextResponse.json({ error: "clinicId is required" }, { status: 422 });

    const vendor = await prisma.labVendor.create({
      data: { name, contactName, phone, email, address, clinicId },
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
