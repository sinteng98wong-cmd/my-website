import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  // Staff can view their own profile
  if (!isManager) {
    const own = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    if (own?.id !== params.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await prisma.staffProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, active: true, userClinics: { include: { clinic: { select: { id: true, name: true } } } } } },
      leaveBalances: { where: { year: new Date().getFullYear() } },
      documents: { orderBy: { createdAt: "desc" } },
      employmentHistory: { include: { performedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { leaveApplications: true, claims: true, kpis: true, appraisals: true, trainings: true, disciplinaries: true } },
    },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, ...profileData } = body;

  const profile = await prisma.staffProfile.findUnique({ where: { id: params.id }, select: { userId: true } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (name || email) {
    await prisma.user.update({ where: { id: profile.userId }, data: { ...(name && { name }), ...(email && { email }) } });
  }

  const updateData: any = {};
  const fields = ["jobTitle","department","employmentType","employmentStatus","joinDate","confirmationDate",
    "basicSalary","bankName","bankAccountNo","epfNo","socsoNo","incomeTaxNo","emergencyName","emergencyPhone",
    "emergencyRelation","icNo","passportNo","phone","dateOfBirth","gender","address","city","state","postcode","noticePeriodDays"];
  for (const f of fields) {
    if (profileData[f] !== undefined) {
      updateData[f] = ["joinDate","confirmationDate","dateOfBirth"].includes(f) && profileData[f]
        ? new Date(profileData[f]) : profileData[f];
    }
  }

  const updated = await prisma.staffProfile.update({ where: { id: params.id }, data: updateData });
  return NextResponse.json(updated);
}
