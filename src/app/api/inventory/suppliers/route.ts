import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SUPPLIER_READ_ROLES, SUPPLIER_WRITE_ROLES } from "@/lib/clinic-access";



export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!SUPPLIER_READ_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, code: true,
      contactName: true, email: true, phone: true, active: true,
    },
  });

  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!SUPPLIER_WRITE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, code, contactName, email, phone, address } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 422 });

  const supplier = await prisma.supplier.create({
    data: {
      name: name.trim(),
      code: code?.trim() || null,
      contactName: contactName?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
    },
  });

  return NextResponse.json(supplier, { status: 201 });
}
