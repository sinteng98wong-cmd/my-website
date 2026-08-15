import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SUPPLIER_DELETE_ROLES, SUPPLIER_WRITE_ROLES } from "@/lib/clinic-access";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !SUPPLIER_WRITE_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const updated = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.registrationNo !== undefined ? { registrationNo: body.registrationNo } : {}),
      ...(body.contactPerson !== undefined ? { contactName: body.contactPerson } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.bankName !== undefined ? { bankName: body.bankName } : {}),
      ...(body.accountNo !== undefined ? { accountNo: body.accountNo } : {}),
      ...(body.accountName !== undefined ? { accountName: body.accountName } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !SUPPLIER_DELETE_ROLES.includes(role))
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const pvCount = await prisma.paymentVoucher.count({ where: { supplierId: params.id } });
  if (pvCount > 0)
    return NextResponse.json({ error: "Cannot deactivate: supplier has linked payment vouchers" }, { status: 409 });

  const updated = await prisma.supplier.update({
    where: { id: params.id },
    data: { active: false },
  });
  return NextResponse.json(updated);
}
