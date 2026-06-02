import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const docs = await (prisma as any).staffDocument.findMany({
    where: { staffProfileId: params.id },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(docs);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const uploadedById = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, category, fileUrl, fileSize, mimeType, expiryDate } = await req.json();
  if (!title || !category || !fileUrl) return NextResponse.json({ error: "title, category and fileUrl are required" }, { status: 422 });

  const doc = await (prisma as any).staffDocument.create({
    data: {
      staffProfileId: params.id, title, category, fileUrl, fileSize, mimeType,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      uploadedById,
    },
  });
  return NextResponse.json(doc, { status: 201 });
}
