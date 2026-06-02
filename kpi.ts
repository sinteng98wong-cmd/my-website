import { prisma } from "./prisma";
import type { KpiMetric, KpiResult } from "@prisma/client";

export function calculateKpiScore(
  metrics: KpiMetric[],
  results: KpiResult[]
): number {
  const resultMap = new Map(results.map((r) => [r.metricId, r]));
  let total = 0;
  for (const metric of metrics) {
    const result = resultMap.get(metric.id);
    if (!result?.actual || !metric.target || Number(metric.target) === 0) continue;
    const pct = Math.min(100, (Number(result.actual) / Number(metric.target)) * 100);
    total += pct * (Number(metric.weight) / 100);
  }
  return Math.round(total * 100) / 100;
}

export function parsePeriod(period: string): { startDate: Date; endDate: Date; label: string } {
  const [year, qualifier] = period.split("-");
  const y = parseInt(year, 10);
  if (!qualifier) {
    return { startDate: new Date(y, 0, 1), endDate: new Date(y, 11, 31, 23, 59, 59), label: `Year ${y}` };
  }
  if (qualifier === "Q1") return { startDate: new Date(y, 0, 1), endDate: new Date(y, 2, 31, 23, 59, 59), label: `Q1 ${y}` };
  if (qualifier === "Q2") return { startDate: new Date(y, 3, 1), endDate: new Date(y, 5, 30, 23, 59, 59), label: `Q2 ${y}` };
  if (qualifier === "Q3") return { startDate: new Date(y, 6, 1), endDate: new Date(y, 8, 30, 23, 59, 59), label: `Q3 ${y}` };
  if (qualifier === "Q4") return { startDate: new Date(y, 9, 1), endDate: new Date(y, 11, 31, 23, 59, 59), label: `Q4 ${y}` };
  if (qualifier === "H1") return { startDate: new Date(y, 0, 1), endDate: new Date(y, 5, 30, 23, 59, 59), label: `H1 ${y}` };
  if (qualifier === "H2") return { startDate: new Date(y, 6, 1), endDate: new Date(y, 11, 31, 23, 59, 59), label: `H2 ${y}` };
  throw new Error(`Unknown period format: ${period}`);
}

const SYSTEM_METRICS = ["Patient Count", "Revenue Generated", "Treatment Count", "No-show Rate", "Attendance Rate", "Late Count"];

export async function autoPopulateKpiActuals(staffKpiId: string, period: string): Promise<string[]> {
  const { startDate, endDate } = parsePeriod(period);
  const staffKpi = await prisma.staffKpi.findUnique({
    where: { id: staffKpiId },
    include: {
      results: { include: { metric: true } },
      staffProfile: { select: { id: true, user: { select: { id: true } } } },
    },
  });
  if (!staffKpi) return [];

  const userId = staffKpi.staffProfile.user.id;
  const staffProfileId = staffKpi.staffProfile.id;

  // Look up doctor profile for treatment-based metrics
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId }, select: { id: true } });

  const updated: string[] = [];

  for (const result of staffKpi.results) {
    const name = result.metric.name;
    if (!SYSTEM_METRICS.includes(name)) continue;

    let actual: number | null = null;

    if (name === "Patient Count" && doctorProfile) {
      actual = await prisma.visit.count({
        where: { treatments: { some: { doctorId: doctorProfile.id } }, visitDate: { gte: startDate, lte: endDate }, deletedAt: null },
      });
    } else if (name === "Revenue Generated" && doctorProfile) {
      const agg = await prisma.treatment.aggregate({
        where: { doctorId: doctorProfile.id, visit: { visitDate: { gte: startDate, lte: endDate }, deletedAt: null } },
        _sum: { billedAmount: true },
      });
      actual = Number(agg._sum.billedAmount ?? 0);
    } else if (name === "Treatment Count" && doctorProfile) {
      actual = await prisma.treatment.count({
        where: { doctorId: doctorProfile.id, visit: { visitDate: { gte: startDate, lte: endDate }, deletedAt: null } },
      });
    } else if (name === "No-show Rate") {
      const total = await prisma.appointment.count({
        where: { doctorId: userId, startTime: { gte: startDate, lte: endDate } },
      });
      const noShow = await prisma.appointment.count({
        where: { doctorId: userId, status: "NO_SHOW", startTime: { gte: startDate, lte: endDate } },
      });
      actual = total > 0 ? Math.round((noShow / total) * 10000) / 100 : 0;
    } else if (name === "Attendance Rate") {
      const records = await prisma.attendanceRecord.findMany({
        where: { staffProfileId, date: { gte: startDate, lte: endDate } },
        select: { status: true },
      });
      const present = records.filter((r) => ["PRESENT", "LATE", "ON_LEAVE"].includes(r.status)).length;
      actual = records.length > 0 ? Math.round((present / records.length) * 10000) / 100 : 0;
    } else if (name === "Late Count") {
      actual = await prisma.attendanceRecord.count({
        where: { staffProfileId, status: "LATE", date: { gte: startDate, lte: endDate } },
      });
    }

    if (actual !== null) {
      await prisma.kpiResult.update({ where: { id: result.id }, data: { actual } });
      updated.push(name);
    }
  }

  return updated;
}
