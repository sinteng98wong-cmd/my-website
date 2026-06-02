import { prisma } from "./prisma";

// ── Default account codes (override per clinic in DB) ─────────────────────
export const DEFAULT_CODES: Array<{
  entryType: string; accountCode: string; subCode?: string;
  description: string; module: string; sortOrder: number;
}> = [
  { entryType: "PROF_FEE",       accountCode: "5001",  subCode: undefined,  description: "Professional Fees",                  module: "Sales",         sortOrder: 1  },
  { entryType: "PRODUCT",        accountCode: "5002",  subCode: undefined,  description: "Dental Product",                     module: "Sales",         sortOrder: 2  },
  { entryType: "SST",            accountCode: "4100",  subCode: "SST",      description: "SST Payable",                        module: "Sales",         sortOrder: 3  },
  { entryType: "CASH_CURR",      accountCode: "3010",  subCode: "100",      description: "CASH CIMB (Current mth collection)", module: "Sales-Receipt", sortOrder: 4  },
  { entryType: "CASH_NEXT",      accountCode: "3010",  subCode: "100",      description: "CASH CIMB (Next mth collection)",    module: "Sales-Receipt", sortOrder: 5  },
  { entryType: "CARD",           accountCode: "3010",  subCode: "100",      description: "Credit Card",                        module: "Sales-Receipt", sortOrder: 6  },
  { entryType: "EWALLET_CURR",   accountCode: "3010",  subCode: "100",      description: "E-Wallet (Current mth collection)",  module: "Sales-Receipt", sortOrder: 7  },
  { entryType: "EWALLET_NEXT",   accountCode: "3010",  subCode: "100",      description: "E-Wallet (Next mth collection)",     module: "Sales-Receipt", sortOrder: 8  },
  { entryType: "ATOME_CURR",     accountCode: "3010",  subCode: "100",      description: "Atome (Current mth collection)",     module: "Sales-Receipt", sortOrder: 9  },
  { entryType: "ATOME_NEXT",     accountCode: "3010",  subCode: "100",      description: "Atome (Next mth collection)",        module: "Sales-Receipt", sortOrder: 10 },
  { entryType: "ONLINE",         accountCode: "3010",  subCode: "100",      description: "Online Transfer",                    module: "Sales-Receipt", sortOrder: 11 },
  { entryType: "PANEL",          accountCode: "3009",  subCode: "001",      description: "Panel",                              module: "Sales-Receipt", sortOrder: 12 },
  { entryType: "CARD_VARIANCE",  accountCode: "3040",  subCode: "202",      description: "Credit Card Over/Dbl chg",           module: "Sales-Receipt", sortOrder: 13 },
  { entryType: "PETTY_CASH",     accountCode: "9012",  subCode: undefined,  description: "Petty cash",                         module: "Sales-Receipt", sortOrder: 14 },
  { entryType: "SHORTAGE",       accountCode: "9016",  subCode: undefined,  description: "cash (excess)/shortage",             module: "Sales-Receipt", sortOrder: 15 },
  // Patient deposit entries (liability account)
  { entryType: "DEPOSIT_TOPUP",  accountCode: "2150",  subCode: "DEP",      description: "Patient Deposit Received",           module: "Deposit",       sortOrder: 16 },
  { entryType: "DEPOSIT_REFUND", accountCode: "2150",  subCode: "DEP",      description: "Patient Deposit Refunded",           module: "Deposit",       sortOrder: 17 },
  // Sales return — revenue reversal for treatment failures (posted in current period)
  { entryType: "SALES_RETURN",   accountCode: "5001",  subCode: "RTN",      description: "Sales Return — Treatment Failure",   module: "Sales-Return",  sortOrder: 18 },
];

export type JournalRow = {
  code: string;         // full code e.g. "3010-100" or "5001"
  accountCode: string;
  subCode: string;
  branch: string;
  amount: number;
  description: string;
  date: string;         // "31-May-2026"
  month: string;        // "May-26"
  yaYear: string;       // "YA 2026"
  period: number;       // month number
  module: string;
  entryType: string;
};

/** Load effective account code map for a clinic (DB overrides defaults). */
export async function getAccountCodeMap(clinicId?: string): Promise<Map<string, typeof DEFAULT_CODES[0]>> {
  const map = new Map<string, typeof DEFAULT_CODES[0]>();

  // Start with defaults
  for (const d of DEFAULT_CODES) map.set(d.entryType, d);

  // Override with DB config (global first, then clinic-specific)
  const dbCodes = await prisma.ledgerAccountCode.findMany({
    where: { OR: [{ clinicId: null }, ...(clinicId ? [{ clinicId }] : [])] },
    orderBy: { clinicId: "asc" }, // null first, then specific
  });
  for (const d of dbCodes) {
    map.set(d.entryType, {
      entryType:   d.entryType,
      accountCode: d.accountCode,
      subCode:     d.subCode ?? undefined,
      description: d.description,
      module:      d.module,
      sortOrder:   d.sortOrder,
    });
  }

  return map;
}

function fullCode(accountCode: string, subCode?: string) {
  return subCode ? `${accountCode}-${subCode}` : accountCode;
}

function fmtDate(d: Date)  { return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }).replace(/ /g, "-"); }
function fmtMonth(d: Date) { return d.toLocaleDateString("en-GB", { month:"short", year:"2-digit" }).replace(/ /g, "-"); }
function fmtYA(d: Date)    { return `YA ${d.getFullYear()}`; }

/** Generate all journal rows for a given month + optional clinic filter. */
export async function generateJournal(month: string, clinicId?: string): Promise<JournalRow[]> {
  const [y, m]  = month.split("-").map(Number);
  const from    = new Date(y, m - 1, 1);
  const to      = new Date(y, m, 1);

  const [entries, panelProviders] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: { date: { gte: from, lt: to }, ...(clinicId ? { clinicId } : {}) },
      include: { clinic: { select: { name: true, entity: { select: { legalName: true } } } } },
      orderBy: [{ clinicId: "asc" }, { date: "asc" }],
    }),
    prisma.panelProvider.findMany({
      where: { active: true, ...(clinicId ? { clinicId } : {}) },
      select: { code: true, name: true },
    }),
  ]);

  const codeMap  = await getAccountCodeMap(clinicId);
  const rows: JournalRow[] = [];

  for (const e of entries) {
    const branch  = e.clinic.name;
    const date    = new Date(e.date);
    const dateStr = fmtDate(date);
    const monthStr = fmtMonth(date);
    const yaYear  = fmtYA(date);
    const period  = date.getMonth() + 1;

    function row(entryType: string, amount: number, descOverride?: string): JournalRow | null {
      if (!amount || amount === 0) return null;
      const cfg = codeMap.get(entryType);
      if (!cfg) return null;
      return {
        code:        fullCode(cfg.accountCode, cfg.subCode),
        accountCode: cfg.accountCode,
        subCode:     cfg.subCode ?? "",
        branch,
        amount,
        description: descOverride ?? cfg.description,
        date:        dateStr,
        month:       monthStr,
        yaYear,
        period,
        module:      cfg.module,
        entryType,
      };
    }

    // Sales lines
    const r = (t: string, a: number, d?: string) => { const x = row(t, a, d); if (x) rows.push(x); };

    r("PROF_FEE",        Number(e.professionalFee));
    r("PRODUCT",         Number(e.productSales));
    r("SST",             Number(e.sst));
    r("CASH_CURR",       Number(e.cashCurrent));
    r("CASH_NEXT",       Number(e.cashNext));
    r("CARD",            Number(e.creditCard));
    r("EWALLET_CURR",    Number(e.ewallet));
    r("ONLINE",          Number(e.fpx));
    r("ATOME_CURR",      Number(e.atome));
    r("DEPOSIT_TOPUP",   Number((e as any).depositTopup  ?? 0));
    r("DEPOSIT_REFUND",  Number((e as any).depositRefund ?? 0));
    r("SALES_RETURN",    Number((e as any).salesReturn   ?? 0));

    // Panel per provider
    const pc = e.panelCollections as Record<string, number> | null;
    if (pc) {
      for (const [code, amt] of Object.entries(pc)) {
        if (!amt) continue;
        const provider = panelProviders.find(p => p.code === code);
        const cfg      = codeMap.get("PANEL");
        if (cfg) {
          rows.push({
            code:        fullCode(cfg.accountCode, cfg.subCode),
            accountCode: cfg.accountCode,
            subCode:     cfg.subCode ?? "",
            branch,
            amount:      Number(amt),
            description: `Panel-${provider?.name ?? code}`,
            date:        dateStr,
            month:       monthStr,
            yaYear,
            period,
            module:      cfg.module,
            entryType:   "PANEL",
          });
        }
      }
    }
  }

  return rows.sort((a, b) => {
    const order = DEFAULT_CODES.find(d => d.entryType === a.entryType)?.sortOrder ?? 99;
    const orderB = DEFAULT_CODES.find(d => d.entryType === b.entryType)?.sortOrder ?? 99;
    return order - orderB || a.branch.localeCompare(b.branch) || a.date.localeCompare(b.date);
  });
}
