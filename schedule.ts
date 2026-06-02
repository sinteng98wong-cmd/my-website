import { prisma } from "./prisma";

/**
 * Federal Malaysian public holidays for 2025 & 2026 (movable feasts
 * approximated to gazetted dates). State holidays are excluded — use
 * StaffSchedule.isPublicHoliday for manual state overrides.
 */
const HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", // New Year
    "2025-02-11", // Thaipusam
    "2025-02-01", // Federal Territory Day
    "2025-01-29", "2025-01-30", // Chinese New Year
    "2025-05-01", // Labour Day
    "2025-05-12", // Wesak
    "2025-06-02", // Agong's Birthday
    "2025-03-31", "2025-04-01", // Hari Raya Aidilfitri
    "2025-06-07", // Hari Raya Aidiladha
    "2025-06-27", // Awal Muharram
    "2025-08-31", // Merdeka
    "2025-09-16", // Malaysia Day
    "2025-09-05", // Prophet Muhammad's Birthday
    "2025-10-20", // Deepavali
    "2025-12-25", // Christmas
  ],
  2026: [
    "2026-01-01",
    "2026-02-01", // Federal Territory Day
    "2026-02-03", // Thaipusam
    "2026-02-17", "2026-02-18", // Chinese New Year
    "2026-03-21", "2026-03-22", // Hari Raya Aidilfitri
    "2026-05-01", // Labour Day
    "2026-05-01", // Wesak (approx; dedup below)
    "2026-05-28", // Hari Raya Aidiladha
    "2026-06-06", // Agong's Birthday
    "2026-06-17", // Awal Muharram
    "2026-08-26", // Prophet Muhammad's Birthday
    "2026-08-31", // Merdeka
    "2026-09-16", // Malaysia Day
    "2026-11-08", // Deepavali
    "2026-12-25", // Christmas
  ],
};

export function getMalaysianPublicHolidays(year: number): Date[] {
  const list = HOLIDAYS[year] ?? [];
  const unique = Array.from(new Set(list));
  return unique.map((s) => new Date(`${s}T00:00:00.000Z`));
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some((h) =>
    h.getUTCFullYear() === date.getUTCFullYear() &&
    h.getUTCMonth() === date.getUTCMonth() &&
    h.getUTCDate() === date.getUTCDate()
  );
}

/** Active staff (with a StaffProfile) at a clinic, via UserClinic. */
async function activeStaffProfiles(clinicId: string) {
  const links = await prisma.userClinic.findMany({
    where: { clinicId, user: { active: true, staffProfile: { isNot: null } } },
    include: { user: { select: { staffProfile: { select: { id: true } } } } },
  });
  const ids = new Set<string>();
  for (const l of links) if (l.user.staffProfile) ids.add(l.user.staffProfile.id);
  // Also include staff whose home clinic is this clinic
  const homed = await prisma.staffProfile.findMany({ where: { clinicId }, select: { id: true } });
  for (const s of homed) ids.add(s.id);
  return [...ids];
}

/**
 * Generate a month of schedule for a clinic, assigning the default shift
 * to every active staff member on each working day (skips Sundays).
 */
export async function generateMonthlySchedule(
  clinicId: string,
  year: number,
  month: number, // 1-12
  _generatedById: string
): Promise<{ created: number; skipped: number }> {
  const defaultShift = await prisma.shiftTemplate.findFirst({
    where: { clinicId, isDefault: true, isActive: true },
  }) ?? await prisma.shiftTemplate.findFirst({ where: { clinicId, isActive: true }, orderBy: { order: "asc" } });

  const holidays = getMalaysianPublicHolidays(year);
  const staffIds = await activeStaffProfiles(clinicId);

  const daysInMonth = new Date(year, month, 0).getDate();
  let created = 0, skipped = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    if (date.getUTCDay() === 0) continue; // skip Sundays
    const ph = isHoliday(date, holidays);

    for (const staffProfileId of staffIds) {
      const exists = await prisma.staffSchedule.findUnique({
        where: { staffProfileId_clinicId_date: { staffProfileId, clinicId, date } },
      });
      if (exists) { skipped++; continue; }

      await prisma.staffSchedule.create({
        data: {
          staffProfileId, clinicId, date,
          shiftTemplateId: ph ? null : defaultShift?.id ?? null,
          isOff: false,
          isPublicHoliday: ph,
        },
      });
      created++;
    }
  }

  return { created, skipped };
}

/** Copy one week's schedule (Mon–Sat) to another week. */
export async function copyWeekSchedule(
  clinicId: string,
  fromWeekStart: Date,
  toWeekStart: Date
): Promise<{ copied: number; skipped: number }> {
  const start = new Date(Date.UTC(fromWeekStart.getUTCFullYear(), fromWeekStart.getUTCMonth(), fromWeekStart.getUTCDate()));
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);

  const source = await prisma.staffSchedule.findMany({
    where: { clinicId, date: { gte: start, lt: end }, isOff: false },
  });

  const offsetMs = Date.UTC(toWeekStart.getUTCFullYear(), toWeekStart.getUTCMonth(), toWeekStart.getUTCDate()) - start.getTime();
  let copied = 0, skipped = 0;

  for (const row of source) {
    const newDate = new Date(row.date.getTime() + offsetMs);
    const exists = await prisma.staffSchedule.findUnique({
      where: { staffProfileId_clinicId_date: { staffProfileId: row.staffProfileId, clinicId, date: newDate } },
    });
    if (exists) { skipped++; continue; }
    await prisma.staffSchedule.create({
      data: {
        staffProfileId: row.staffProfileId, clinicId, date: newDate,
        shiftTemplateId: row.shiftTemplateId, startTime: row.startTime, endTime: row.endTime,
        isOff: false, isPublicHoliday: row.isPublicHoliday, notes: row.notes,
      },
    });
    copied++;
  }

  return { copied, skipped };
}
