import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SUPPLIER_DELETE_ROLES, SUPPLIER_WRITE_ROLES } from "@/lib/clinic-access";


export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!SUPPLIER_WRITE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, code, contactName, email, phone, address, active } = body;

  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined      && { name: name.trim() }),
      ...(code !== undefined      && { code: code?.trim() || null }),
      ...(contactName !== undefined && { contactName: contactName?.trim() || null }),
      ...(email !== undefined     && { email: email?.trim() || null }),
      ...(phone !== undefined     && { phone: phone?.trim() || null }),
      ...(address !== undefined   && { address: address?.trim() || null }),
      ...(active !== undefined    && { active }),
    },
  });

  return NextResponse.json(supplier);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!SUPPLIER_DELETE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Soft-delete: just deactivate
  await prisma.supplier.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
