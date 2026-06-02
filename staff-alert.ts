import { prisma } from "./prisma";
import { suggestNurses } from "./pairing";

export const DEFAULT_MINIMUMS: Record<string, number> = {
  DOCTOR:       1,
  NURSE:        1,
  RECEPTIONIST: 1,
  STOREKEEPER:  0,
};

const CHECK_ROLES = ["DOCTOR", "NURSE", "RECEPTIONIST", "STOREKEEPER"] as const;

export interface CoverSuggestion {
  staffProfileId: string;
  staffName: string;
  role: string;
  reason: string;
  availability: "OFF_DAY" | "DIFFERENT_SHIFT" | "LOCUM" | "OTHER_CLINIC";
  clinicName?: string;
}

export interface AffectedDate {
  date: Date;
  shift: string;
  role: string;
  currentCount: number;
  minimumRequired: number;
  shortfall: number;
  staffOnLeave: { name: string; leaveType: string }[];
}

export interface LowStaffAlert {
  hasAlert: boolean;
  affectedDates: AffectedDate[];
  coverSuggestions: CoverSuggestion[];
  notices?: string[];   // pairing-related warnings needing manual action
}

type RosterMember = {
  staffProfileId: string;
  name: string;
  role: string;
  employmentType: string;
  clinicId: string;
  clinicName: string;
};

function eachDate(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const last = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
  while (cur <= last) {
    if (cur.getUTCDay() !== 0) out.push(new Date(cur)); // skip Sundays
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function sameDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

async function getMinimums(clinicId: string): Promise<Record<string, number>> {
  const rows = await prisma.clinicStaffMinimum.findMany({ where: { clinicId } });
  const map = { ...DEFAULT_MINIMUMS };
  for (const r of rows) map[r.role] = r.minCount;
  return map;
}

async function getRoster(clinicIds: string[]): Promise<RosterMember[]> {
  const profiles = await prisma.staffProfile.findMany({
    where: { clinicId: { in: clinicIds } },
    select: {
      id: true, clinicId: true, employmentType: true,
      user: { select: { name: true, role: true } },
    },
  });
  // resolve clinic names
  const clinics = await prisma.clinic.findMany({ where: { id: { in: clinicIds } }, select: { id: true, name: true } });
  const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
  return profiles.map((p) => ({
    staffProfileId: p.id,
    name: p.user.name,
    role: p.user.role as string,
    employmentType: p.employmentType as string,
    clinicId: p.clinicId,
    clinicName: nameOf.get(p.clinicId) ?? "",
  }));
}

/**
 * Compute the low-staffing impact of approving (or considering) a leave
 * application, plus cover suggestions.
 */
export async function checkLowStaffAlert(leaveApplicationId: string): Promise<LowStaffAlert | null> {
  const leave = await prisma.leaveApplication.findUnique({
    where: { id: leaveApplicationId },
    include: { staffProfile: { select: { id: true, user: { select: { name: true, role: true } } } } },
  });
  if (!leave) return null;

  const clinicId = leave.clinicId;
  const minimums = await getMinimums(clinicId);

  // Roster for this clinic + sibling clinics in the same entity (for cover)
  const thisClinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { entityId: true } });
  const siblingClinics = thisClinic
    ? await prisma.clinic.findMany({ where: { entityId: thisClinic.entityId }, select: { id: true } })
    : [{ id: clinicId }];
  const siblingIds = siblingClinics.map((c) => c.id);

  const roster = await getRoster([clinicId]);
  const entityRoster = await getRoster(siblingIds);

  const dates = eachDate(leave.startDate, leave.endDate);

  // Approved leaves overlapping the whole window (for this clinic)
  const overlapping = await prisma.leaveApplication.findMany({
    where: {
      clinicId,
      status: "APPROVED",
      startDate: { lte: leave.endDate },
      endDate:   { gte: leave.startDate },
      NOT: { id: leave.id },
    },
    include: { staffProfile: { select: { id: true } } },
  });

  const affectedDates: AffectedDate[] = [];
  const suggestionMap = new Map<string, CoverSuggestion>();

  for (const date of dates) {
    // staff on leave this date = the applicant + other approved overlapping leaves active on this date
    const onLeaveIds = new Set<string>([leave.staffProfileId]);
    const onLeaveDetails: { name: string; leaveType: string }[] = [];
    for (const o of overlapping) {
      if (o.startDate <= date && o.endDate >= date) {
        onLeaveIds.add(o.staffProfileId);
      }
    }
    // names of *other* staff on leave (for context)
    if (onLeaveIds.size > 1) {
      const others = await prisma.leaveApplication.findMany({
        where: { id: { in: overlapping.filter((o) => o.startDate <= date && o.endDate >= date).map((o) => o.id) } },
        include: { staffProfile: { select: { user: { select: { name: true } } } } },
      });
      for (const o of others) onLeaveDetails.push({ name: o.staffProfile.user.name, leaveType: o.leaveType });
    }

    // schedules for this clinic+date
    const schedules = await prisma.staffSchedule.findMany({
      where: { clinicId, date: { gte: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())), lt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)) } },
      include: { shiftTemplate: { select: { name: true } } },
    });
    const schedById = new Map(schedules.map((s) => [s.staffProfileId, s]));

    for (const role of CHECK_ROLES) {
      const min = minimums[role] ?? DEFAULT_MINIMUMS[role] ?? 0;
      if (min <= 0) continue;

      const working = roster.filter((r) => {
        if (r.role !== role) return false;
        if (onLeaveIds.has(r.staffProfileId)) return false;
        const sched = schedById.get(r.staffProfileId);
        if (sched?.isOff) return false;
        return true; // scheduled working, or no schedule row (assume available)
      });

      if (working.length < min) {
        affectedDates.push({
          date,
          shift: "All Day",
          role,
          currentCount: working.length,
          minimumRequired: min,
          shortfall: min - working.length,
          staffOnLeave: onLeaveDetails,
        });

        // ── Cover suggestions for this role + date ──────────────────────
        // a) off-day staff at this clinic
        for (const r of roster.filter((r) => r.role === role && schedById.get(r.staffProfileId)?.isOff)) {
          if (!suggestionMap.has(r.staffProfileId))
            suggestionMap.set(r.staffProfileId, { staffProfileId: r.staffProfileId, staffName: r.name, role, reason: "Off day — can be asked to swap", availability: "OFF_DAY" });
        }
        // b) different-shift staff (has a schedule with a shift template, working)
        for (const r of roster.filter((r) => r.role === role && !onLeaveIds.has(r.staffProfileId))) {
          const s = schedById.get(r.staffProfileId);
          if (s && !s.isOff && s.shiftTemplateId && !suggestionMap.has(r.staffProfileId)) {
            suggestionMap.set(r.staffProfileId, { staffProfileId: r.staffProfileId, staffName: r.name, role, reason: `Working ${s.shiftTemplate?.name ?? "another shift"} — can extend to cover`, availability: "DIFFERENT_SHIFT" });
          }
        }
        // c) locums in the entity with no schedule that date
        for (const r of entityRoster.filter((r) => r.role === role && r.employmentType === "LOCUM")) {
          const hasSchedule = await prisma.staffSchedule.findFirst({
            where: { staffProfileId: r.staffProfileId, date: { gte: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())), lt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)) } },
          });
          if (!hasSchedule && !suggestionMap.has(r.staffProfileId))
            suggestionMap.set(r.staffProfileId, { staffProfileId: r.staffProfileId, staffName: r.name, role, reason: "Locum available on this date", availability: "LOCUM", clinicName: r.clinicName });
        }
        // d) same-role staff from sibling clinics not on leave
        for (const r of entityRoster.filter((r) => r.role === role && r.clinicId !== clinicId)) {
          if (suggestionMap.has(r.staffProfileId)) continue;
          const onLeave = await prisma.leaveApplication.findFirst({
            where: { staffProfileId: r.staffProfileId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } },
          });
          if (!onLeave)
            suggestionMap.set(r.staffProfileId, { staffProfileId: r.staffProfileId, staffName: r.name, role, reason: `Available at ${r.clinicName}`, availability: "OTHER_CLINIC", clinicName: r.clinicName });
        }
      }
    }
  }

  // ── Dentist-nurse pairing impact (Part 4) ───────────────────────────────
  const notices: string[] = [];
  const applicantRole = leave.staffProfile.user.role as string;
  const applicantName = leave.staffProfile.user.name;

  if (applicantRole === "NURSE") {
    // dentists whose (default or date-specific) nurse is the applicant
    const pairings = await prisma.dentistNursePairing.findMany({
      where: {
        clinicId, nurseProfileId: leave.staffProfileId,
        OR: [{ isDefault: true, date: null }, { date: { gte: leave.startDate, lte: leave.endDate } }],
      },
      include: { dentist: { select: { id: true, user: { select: { name: true } } } } },
    });
    const seenDentist = new Set<string>();
    for (const date of dates) {
      for (const p of pairings) {
        const key = `${p.dentistProfileId}|${date.toISOString().slice(0, 10)}`;
        if (seenDentist.has(key)) continue;
        seenDentist.add(key);
        const sugg = await suggestNurses(clinicId, p.dentistProfileId, date);
        const best = sugg.find((s) => s.isAvailable);
        if (best) {
          const id = `pair-${best.nurseProfileId}`;
          if (!suggestionMap.has(id)) {
            suggestionMap.set(id, {
              staffProfileId: best.nurseProfileId, staffName: best.nurseName, role: "NURSE",
              reason: `${applicantName} is Dr. ${p.dentist.user.name}'s paired nurse. Suggested replacement: ${best.nurseName}`,
              availability: "DIFFERENT_SHIFT",
            });
          }
        } else {
          notices.push(`No available nurse for Dr. ${p.dentist.user.name} on ${date.toISOString().slice(0, 10)} — manual assignment needed.`);
        }
      }
    }
  } else if (applicantRole === "DOCTOR") {
    const defPair = await prisma.dentistNursePairing.findFirst({
      where: { clinicId, dentistProfileId: leave.staffProfileId, isDefault: true, date: null },
      include: { nurse: { select: { id: true, user: { select: { name: true } } } } },
    });
    if (defPair) {
      // is that nurse paired with any other dentist by default?
      const otherDentist = await prisma.dentistNursePairing.findFirst({
        where: { clinicId, nurseProfileId: defPair.nurseProfileId, isDefault: true, date: null, dentistProfileId: { not: leave.staffProfileId } },
      });
      if (!otherDentist) {
        notices.push(`Nurse ${defPair.nurse.user.name} will have no assigned dentist during ${applicantName}'s leave.`);
      }
    }
  }

  return {
    hasAlert: affectedDates.length > 0 || notices.length > 0,
    affectedDates,
    coverSuggestions: [...suggestionMap.values()],
    notices: notices.length ? notices : undefined,
  };
}

/**
 * Current staffing status for a single clinic + date.
 */
export async function getStaffingStatus(clinicId: string, date: Date) {
  const minimums = await getMinimums(clinicId);
  const roster = await getRoster([clinicId]);

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd   = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));

  const [schedules, leaves] = await Promise.all([
    prisma.staffSchedule.findMany({ where: { clinicId, date: { gte: dayStart, lt: dayEnd } } }),
    prisma.leaveApplication.findMany({ where: { clinicId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } }, select: { staffProfileId: true } }),
  ]);
  const offIds    = new Set(schedules.filter((s) => s.isOff).map((s) => s.staffProfileId));
  const onLeaveIds = new Set(leaves.map((l) => l.staffProfileId));

  return CHECK_ROLES.map((role) => {
    const ofRole = roster.filter((r) => r.role === role);
    const scheduled = ofRole.filter((r) => !offIds.has(r.staffProfileId)).length;
    const onLeave   = ofRole.filter((r) => onLeaveIds.has(r.staffProfileId)).length;
    const present   = ofRole.filter((r) => !offIds.has(r.staffProfileId) && !onLeaveIds.has(r.staffProfileId)).length;
    const minimum   = minimums[role] ?? DEFAULT_MINIMUMS[role] ?? 0;
    return { role, scheduled, onLeave, present, minimum, isLow: minimum > 0 && present < minimum };
  });
}

export { sameDay };
