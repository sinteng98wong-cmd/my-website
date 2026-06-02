import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  clinicId:     z.string().cuid(),
  periodFrom:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCash: z.number().nonnegative(),
  bankInAmount: z.number().nonnegative(),
  bankInDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referenceNo:  z.string().optional(),
  bankName:     z.string().optional(),
  notes:        z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp       = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const month    = sp.get("month");

  let dateFilter: { gte?: Date; lte?: Date } = {};
  if (month) {
    const [y, m] = month.split("-").map(Number);
    dateFilter = { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) };
  }

  const records = await prisma.cashBanking.findMany({
    where: {
      ...(clinicId ? { clinicId } : {}),
      ...(month ? { periodFrom: dateFilter } : {}),
    },
    include: { clinic: { select: { name: true } } },
    orderBy: { bankInDate: "desc" },
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const d = parsed.data;
  const variance = d.bankInAmount - d.expectedCash;

  const record = await prisma.cashBanking.create({
    data: {
      clinicId:     d.clinicId,
      periodFrom:   new Date(d.periodFrom + "T00:00:00"),
      periodTo:     new Date(d.periodTo   + "T23:59:59"),
      expectedCash: d.expectedCash,
      bankInAmount: d.bankInAmount,
      variance,
      bankInDate:   new Date(d.bankInDate + "T00:00:00"),
      referenceNo:  d.referenceNo,
      bankName:     d.bankName,
      notes:        d.notes,
      recordedById: (session.user as any)?.id,
    },
  });

  return NextResponse.json(record, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.cashBanking.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
