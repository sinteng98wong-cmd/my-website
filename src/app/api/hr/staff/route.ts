import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { calculateEntitlement } from "@/lib/leave";

const MANAGER_ROLES = ["SUPER_ADMIN", "CLINIC_MANAGER"];
const LEAVE_TYPES = ["ANNUAL","MEDICAL","EMERGENCY","MATERNITY","PATERNITY","UNPAID","REPLACEMENT","HOSPITALISATION","COMPASSIONATE"] as const;

async function nextEmployeeId(): Promise<string> {
  const last = await prisma.staffProfile.findFirst({
    where: { employeeId: { not: null } },
    orderBy: { employeeId: "desc" },
    select: { employeeId: true },
  });
  const num = last?.employeeId ? parseInt(last.employeeId.replace(/\D/g, ""), 10) + 1 : 1;
  return `EMP-${String(num).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!MANAGER_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get("clinicId")) where.clinicId = sp.get("clinicId");
  if (sp.get("employmentStatus")) where.employmentStatus = sp.get("employmentStatus");
  if (sp.get("employmentType")) where.employmentType = sp.get("employmentType");
  if (sp.get("search")) {
    where.OR = [
      { user: { name: { contains: sp.get("search")!, mode: "insensitive" } } },
      { employeeId: { contains: sp.get("search")!, mode: "insensitive" } },
      { phone: { contains: sp.get("search")! } },
    ];
  }

  const staff = await prisma.staffProfile.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, role: true, active: true } },
      _count: { select: { leaveApplications: true, claims: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return NextResponse.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!MANAGER_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, userRole, clinicId, employmentType, employmentStatus, joinDate,
    jobTitle, department, basicSalary, bankName, bankAccountNo, epfNo, socsoNo, incomeTaxNo,
    emergencyName, emergencyPhone, emergencyRelation, icNo, passportNo, phone,
    dateOfBirth, gender, address, city, state, postcode, employeeId: reqEmployeeId,
    createAccount, generateSchedule, clinicAssignments } = body;

  if (!name || !clinicId || !userRole) {
    return NextResponse.json({ error: "name, clinicId and role are required" }, { status: 422 });
  }

  const employeeId = reqEmployeeId || await nextEmployeeId();
  const tempPassword = Math.random().toString(36).slice(-8);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: email || `${employeeId.toLowerCase()}@dentalos.internal`,
      passwordHash,
      role: userRole,
      active: true,
    },
  });

  const staffProfile = await prisma.staffProfile.create({
    data: {
      userId: user.id, clinicId, employeeId, employmentType, employmentStatus: employmentStatus || "PROBATION",
      joinDate: joinDate ? new Date(joinDate) : undefined,
      jobTitle, department, basicSalary: basicSalary || undefined,
      bankName, bankAccountNo, epfNo, socsoNo, incomeTaxNo,
      emergencyName, emergencyPhone, emergencyRelation,
      icNo, passportNo, phone, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender, address, city, state, postcode,
    },
  });

  // Assign to clinics
  const assignedClinics: string[] = clinicAssignments?.length
    ? clinicAssignments.map((a: any) => a.clinicId)
    : [clinicId];
  for (const cid of assignedClinics) {
    const override = clinicAssignments?.find((a: any) => a.clinicId === cid)?.roleOverride;
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId: user.id, clinicId: cid } },
      create: { userId: user.id, clinicId: cid, roleOverride: override || null },
      update: { roleOverride: override || null },
    });
  }

  // Create leave balances
  const year = new Date().getFullYear();
  const jd = joinDate ? new Date(joinDate) : new Date();
  for (const lt of LEAVE_TYPES) {
    const entitled = calculateEntitlement(lt as any, jd, new Date(year, 11, 31));
    await prisma.leaveBalance.create({
      data: { staffProfileId: staffProfile.id, year, leaveType: lt as any, entitled, balance: entitled, taken: 0, pending: 0 },
    });
  }

  return NextResponse.json({ ...staffProfile, user, tempPassword: createAccount ? tempPassword : undefined }, { status: 201 });
}
