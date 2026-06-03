// Financial year label
export function getFinancialYearLabel(date: Date, fyStartMonth: number): string {
  const m = date.getMonth() + 1; // 1-12
  const y = date.getFullYear();
  if (fyStartMonth === 1) return `FY${y}`;
  // If current month >= fyStartMonth, FY started this year
  const fyStartYear = m >= fyStartMonth ? y : y - 1;
  const fyEndYear = fyStartYear + 1;
  return `FY${fyStartYear}/${String(fyEndYear).slice(2)}`;
}

// Get start and end of a financial year
export function getFinancialYearRange(fyStartMonth: number, startYear: number): {
  start: Date; end: Date; label: string;
} {
  const start = new Date(startYear, fyStartMonth - 1, 1);
  let end: Date;
  if (fyStartMonth === 1) {
    end = new Date(startYear, 11, 31);
  } else {
    // last day before the next FY start
    end = new Date(startYear + 1, fyStartMonth - 1, 0); // day 0 = last day of prev month
  }
  const label = fyStartMonth === 1 ? `FY${startYear}` : `FY${startYear}/${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}

// Get current FY
export function getCurrentFinancialYear(fyStartMonth: number): {
  start: Date; end: Date; label: string;
} {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const fyStartYear = currentMonth >= fyStartMonth ? currentYear : currentYear - 1;
  return getFinancialYearRange(fyStartMonth, fyStartYear);
}

// Get FY options (last 3 + current + next)
export function getFinancialYearOptions(fyStartMonth: number): {
  value: string; label: string; start: Date; end: Date;
}[] {
  const current = getCurrentFinancialYear(fyStartMonth);
  const currentStartYear = current.start.getFullYear();
  const options = [];
  for (let offset = -3; offset <= 1; offset++) {
    const r = getFinancialYearRange(fyStartMonth, currentStartYear + offset);
    options.push({ value: r.label, label: r.label, start: r.start, end: r.end });
  }
  return options;
}

// SST filing periods (bi-monthly by default)
export function getSstFilingPeriods(fyStartMonth: number, fyYear: number): {
  period: string; startDate: Date; endDate: Date; dueDate: Date; label: string;
}[] {
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const periods = [];
  for (let i = 0; i < 6; i++) {
    const startMonthOffset = (fyStartMonth - 1 + i * 2) % 12;
    const startYear = fyYear + Math.floor((fyStartMonth - 1 + i * 2) / 12);
    const endMonthOffset = (fyStartMonth - 1 + i * 2 + 1) % 12;
    const endYear = fyYear + Math.floor((fyStartMonth - 1 + i * 2 + 1) / 12);

    const startDate = new Date(startYear, startMonthOffset, 1);
    const endDate = new Date(endYear, endMonthOffset + 1, 0); // last day of end month
    // Due date: last day of month after endDate
    const dueDate = new Date(endYear, endMonthOffset + 2, 0);

    const label = `${MONTH_NAMES[startMonthOffset]}-${MONTH_NAMES[endMonthOffset]} ${startYear === endYear ? startYear : `${startYear}/${String(endYear).slice(2)}`}`;

    periods.push({ period: `Period ${i + 1}`, startDate, endDate, dueDate, label });
  }
  return periods;
}

// Get which FY a date falls in
export function getDateFYPeriod(date: Date, fyStartMonth: number): {
  fyLabel: string; fyStart: Date; fyEnd: Date;
} {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const fyStartYear = m >= fyStartMonth ? y : y - 1;
  const r = getFinancialYearRange(fyStartMonth, fyStartYear);
  return { fyLabel: r.label, fyStart: r.start, fyEnd: r.end };
}

// Leave reset date
export function getLeaveResetDate(fyStartMonth: number, year: number): Date {
  return new Date(year, fyStartMonth - 1, 1);
}
