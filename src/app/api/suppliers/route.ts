import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SUPPLIER_READ_ROLES, SUPPLIER_WRITE_ROLES } from "@/lib/clinic-access";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !SUPPLIER_READ_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = new URL(req.url).searchParams.get("search") ?? "";
  const suppliers = await prisma.supplier.findMany({
    where: {
      active: true,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: { _count: { select: { pvs: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !SUPPLIER_WRITE_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const supplier = await prisma.supplier.create({
    data: {
      name: body.name,
      registrationNo: body.registrationNo,
      contactName: body.contactPerson ?? body.contactName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      bankName: body.bankName,
      accountNo: body.accountNo,
      accountName: body.accountName,
    },
  });
  return NextResponse.json(supplier, { status: 201 });
}
