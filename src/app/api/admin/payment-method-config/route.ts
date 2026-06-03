import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clinicId = new URL(req.url).searchParams.get("clinicId") ?? "";
  const configs = await (prisma as any).paymentMethodConfig.findMany({
    where: { clinicId },
    orderBy: [{ method: "asc" }, { subType: "asc" }],
  });
  return NextResponse.json(configs);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { clinicId, method, subType, chargeRate, settlementDays } = await req.json();
  const config = await (prisma as any).paymentMethodConfig.upsert({
    where: { clinicId_method_subType: { clinicId, method, subType: subType ?? null } },
    create: {
      clinicId,
      method,
      subType: subType ?? null,
      chargeRate: Number(chargeRate),
      settlementDays: Number(settlementDays),
    },
    update: {
      chargeRate: Number(chargeRate),
      settlementDays: Number(settlementDays),
    },
  });
  return NextResponse.json(config);
}
