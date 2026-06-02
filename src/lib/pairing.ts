import { prisma } from "./prisma";
import type { DentistNursePairing } from "@prisma/client";

function dayRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Effective pairing for a dentist on a date/shift.
 * Resolution order: exact date+shift → exact date (any shift) → default → null.
 */
export async function getEffectivePairing(
  dentistProfileId: string,
  clinicId: string,
  date: Date,
  shiftTemplateId?: string
): Promise<DentistNursePairing | null> {
  const { start, end } = dayRange(date);

  if (shiftTemplateId) {
    const exact = await prisma.dentistNursePairing.findFirst({
      where: { dentistProfileId, clinicId, date: { gte: start, lt: end }, shiftTemplateId },
    });
    if (exact) return exact;
  }

  const dateAny = await prisma.dentistNursePairing.findFirst({
    where: { dentistProfileId, clinicId, date: { gte: start, lt: end }, shiftTemplateId: null },
  });
  if (dateAny) return dateAny;

  const def = await prisma.dentistNursePairing.findFirst({
    where: { dentistProfileId, clinicId, isDefault: true, date: null },
  });
  return def ?? null;
}

/** All effective pairings for a clinic on a date: dentistProfileId → pairing. */
export async function getDayPairings(clinicId: string, date: Date): Promise<Map<string, DentistNursePairing>> {
  const dentists = await prisma.staffProfile.findMany({
    where: { clinicId, user: { role: "DOCTOR" } },
    select: { id: true },
  });

  const map = new Map<string, DentistNursePairing>();
  for (const d of dentists) {
    const pairing = await getEffectivePairing(d.id, clinicId, date);
    if (pairing) map.set(d.id, pairing);
  }
  return map;
}

/** Whether a nurse is already paired with another dentist on a date+shift. */
export async function isNursePaired(
  nurseProfileId: string,
  clinicId: string,
  date: Date,
  shiftTemplateId?: string,
  excludePairingId?: string
): Promise<boolean> {
  const { start, end } = dayRange(date);
  const conflict = await prisma.dentistNursePairing.findFirst({
    where: {
      clinicId, nurseProfileId,
      ...(excludePairingId ? { id: { not: excludePairingId } } : {}),
      OR: [
        { date: { gte: start, lt: end }, ...(shiftTemplateId ? { OR: [{ shiftTemplateId }, { shiftTemplateId: null }] } : {}) },
        { isDefault: true, date: null },
      ],
    },
  });
  return !!conflict;
}

/**
 * Suggest available nurses for a dentist on a date/shift.
 * Returns nurses scheduled (not off / on leave), not already paired,
 * ranked by prior pairing familiarity.
 */
export async function suggestNurses(
  clinicId: string,
  dentistProfileId: string,
  date: Date,
  shiftTemplateId?: string
) {
  const { start, end } = dayRange(date);

  const nurses = await prisma.staffProfile.findMany({
    where: { clinicId, user: { role: "NURSE", active: true } },
    select: { id: true, user: { select: { name: true } } },
  });

  // Historical pairing counts with this dentist
  const history = await prisma.dentistNursePairing.groupBy({
    by: ["nurseProfileId"],
    where: { dentistProfileId, clinicId },
    _count: { _all: true },
  });
  const histMap = new Map(history.map((h) => [h.nurseProfileId, h._count._all]));

  const results = [];
  for (const n of nurses) {
    // scheduled & working?
    const sched = await prisma.staffSchedule.findFirst({
      where: { staffProfileId: n.id, clinicId, date: { gte: start, lt: end } },
    });
    const onLeave = await prisma.leaveApplication.findFirst({
      where: { staffProfileId: n.id, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } },
    });
    const alreadyPaired = await isNursePaired(n.id, clinicId, date, shiftTemplateId);

    let isAvailable = true;
    let unavailableReason: string | undefined;
    if (onLeave)            { isAvailable = false; unavailableReason = "On leave"; }
    else if (sched?.isOff)  { isAvailable = false; unavailableReason = "Off day"; }
    else if (alreadyPaired) { isAvailable = false; unavailableReason = "Already paired"; }

    const pairingCount = histMap.get(n.id) ?? 0;
    results.push({
      nurseProfileId: n.id,
      nurseName: n.user.name,
      isPreviouslyPaired: pairingCount > 0,
      pairingCount,
      isAvailable,
      unavailableReason,
    });
  }

  // available first, then familiarity, then name
  results.sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    if (b.pairingCount !== a.pairingCount) return b.pairingCount - a.pairingCount;
    return a.nurseName.localeCompare(b.nurseName);
  });

  return results;
}
