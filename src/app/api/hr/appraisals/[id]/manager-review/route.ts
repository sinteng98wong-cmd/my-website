import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const appraisal = await prisma.appraisal.findUnique({ where: { id: params.id } });
  if (!appraisal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role !== "SUPER_ADMIN" && appraisal.reviewerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (appraisal.status !== "SELF_REVIEW") return NextResponse.json({ error: "Manager review requires status SELF_REVIEW" }, { status: 422 });

  const { managerRating, managerComments, finalRating, strengths, improvements, goals, confirmed } = await req.json() as {
    managerRating: number; managerComments: string; finalRating: number;
    strengths?: string; improvements?: string; goals?: string; confirmed?: boolean;
  };

  if (!managerRating || managerRating < 1 || managerRating > 5) return NextResponse.json({ error: "managerRating must be 1.0 – 5.0" }, { status: 422 });
  if (!finalRating || finalRating < 1 || finalRating > 5) return NextResponse.json({ error: "finalRating must be 1.0 – 5.0" }, { status: 422 });

  if (Math.abs(finalRating - managerRating) > 1.0 && !confirmed) {
    return NextResponse.json({ warning: "Final rating differs significantly from manager rating. Confirm?", requiresConfirmation: true }, { status: 200 });
  }

  const updated = await prisma.appraisal.update({
    where: { id: params.id },
    data: { managerRating, managerComments, finalRating, strengths, improvements, goals, status: "MANAGER_REVIEW" },
  });
  return NextResponse.json(updated);
}
