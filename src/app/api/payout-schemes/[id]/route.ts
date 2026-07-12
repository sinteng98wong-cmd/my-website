import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MANAGE = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

/** DELETE — remove a saved scheme (the built-in default takes over again). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!MANAGE.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await (prisma as any).payoutScheme.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Scheme not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
