import {
  startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  subMonths, parseISO,
  differenceInCalendarDays,
} from "date-fns"

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom"

export interface DateRange { start: Date; end: Date }

export function parsePeriod(period: string, from?: string | null, to?: string | null, ref = new Date()): DateRange {
  switch (period as PeriodKey) {
    case "this_month":
      return { start: startOfMonth(ref), end: endOfMonth(ref) }
    case "last_month": {
      const p = subMonths(ref, 1)
      return { start: startOfMonth(p), end: endOfMonth(p) }
    }
    case "this_quarter":
      return { start: startOfQuarter(ref), end: endOfQuarter(ref) }
    case "this_year":
      return { start: startOfYear(ref), end: endOfYear(ref) }
    case "custom":
      if (!from || !to) throw new Error("custom period requires from and to")
      return { start: parseISO(from), end: parseISO(to) }
    default:
      return { start: startOfMonth(ref), end: endOfMonth(ref) }
  }
}

export function getPrevPeriod(start: Date, end: Date): DateRange {
  const ms = end.getTime() - start.getTime() + 1
  return { start: new Date(start.getTime() - ms), end: new Date(start.getTime() - 1) }
}

export function changePct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

export function periodDays(start: Date, end: Date): number {
  return Math.max(1, differenceInCalendarDays(end, start) + 1)
}

export const PERIOD_LABELS: Record<string, string> = {
  this_month:    "This Month",
  last_month:    "Last Month",
  this_quarter:  "This Quarter",
  this_year:     "This Year",
  custom:        "Custom",
}
