import {
  MAX_STORED_FINDINGS,
  SCHEDULE_MAX_AGE_HOURS,
  assessSchedule,
  classifyRun,
  describeRun,
  runAndRecordDrift,
  scopeFindings,
  storableFindings,
  summarise,
} from "@/lib/stock-drift-run";
import type { DriftFinding, DriftReport } from "@/lib/stock-drift";

const finding = (over: Partial<DriftFinding> = {}): DriftFinding => ({
  code: "BALANCE_MISMATCH", severity: "ERROR", detail: "mismatch", ...over,
});

const infoFinding = finding({ code: "MISSING_MOVEMENTS", severity: "INFO", detail: "pre-ledger stock" });

const report = (over: Partial<DriftReport["totals"]> = {}, findings: DriftFinding[] = []): DriftReport => ({
  generatedAt: new Date().toISOString(),
  scope: { clinicIds: null },
  totals: { positions: 10, movements: 25, errors: 0, warnings: 0, infos: 0, ...over },
  findings,
  clean: (over.errors ?? 0) === 0,
});

const t0 = new Date("2026-08-09T18:00:00Z");
const t1 = new Date("2026-08-09T18:00:02Z");

describe("run classification", () => {
  it("calls a run with no errors clean", () => {
    expect(classifyRun(report())).toBe("CLEAN");
  });

  it("calls a run with errors drifted", () => {
    expect(classifyRun(report({ errors: 3 }))).toBe("ERRORS");
  });

  it("treats informational findings as clean", () => {
    expect(classifyRun(report({ infos: 26 }))).toBe("CLEAN");
  });

  it("treats warnings alone as clean", () => {
    expect(classifyRun(report({ warnings: 2 }))).toBe("CLEAN");
  });

  it("calls a crashed run failed, whatever the report said", () => {
    expect(classifyRun(report(), "connection lost")).toBe("FAILED");
    expect(classifyRun(null)).toBe("FAILED");
  });
});

describe("stored findings", () => {
  it("keeps errors and warnings", () => {
    const kept = storableFindings([finding(), finding({ severity: "WARNING" })]);
    expect(kept).toHaveLength(2);
  });

  it("drops the pre-ledger informational noise", () => {
    expect(storableFindings([infoFinding, infoFinding, finding()])).toEqual([finding()]);
  });

  it("caps how many it stores", () => {
    const many = Array.from({ length: MAX_STORED_FINDINGS + 40 }, () => finding());
    expect(storableFindings(many)).toHaveLength(MAX_STORED_FINDINGS);
  });
});

describe("run summary", () => {
  it("summarises a clean run", () => {
    const s = summarise(report({ positions: 29, movements: 100 }), t0, t1);
    expect(s).toMatchObject({
      status: "SUCCESS", outcome: "CLEAN", clean: true,
      errorCount: 0, positions: 29, movements: 100, durationMs: 2000, needsAlert: false,
    });
  });

  it("summarises an error run and asks for an alert", () => {
    const s = summarise(report({ errors: 2 }, [finding(), finding()]), t0, t1);
    expect(s).toMatchObject({ status: "SUCCESS", outcome: "ERRORS", clean: false, errorCount: 2, needsAlert: true });
    expect(s.findings).toHaveLength(2);
  });

  it("summarises an informational-only run as a clean success", () => {
    const s = summarise(report({ infos: 26 }, [infoFinding, infoFinding]), t0, t1);
    expect(s.status).toBe("SUCCESS");
    expect(s.clean).toBe(true);
    expect(s.needsAlert).toBe(false);
    expect(s.infoCount).toBe(26);
    // informational rows are counted but not stored
    expect(s.findings).toHaveLength(0);
  });

  it("summarises a failed execution and asks for an alert", () => {
    const s = summarise(null, t0, t1, "connection lost");
    expect(s).toMatchObject({
      status: "FAILED", outcome: "FAILED", clean: false,
      errorMessage: "connection lost", needsAlert: true, durationMs: 2000,
    });
  });

  it("never reports a negative duration", () => {
    expect(summarise(report(), t1, t0).durationMs).toBe(0);
  });
});

describe("runAndRecordDrift", () => {
  const persisted: any[] = [];
  const persist = jest.fn(async (summary: any, trigger: string) => {
    persisted.push({ summary, trigger });
    return { id: `run-${persisted.length}` };
  });

  beforeEach(() => { persisted.length = 0; persist.mockClear(); });

  it("records a clean run", async () => {
    const s = await runAndRecordDrift({ detector: async () => report({ infos: 3 }), persist });
    expect(s.status).toBe("SUCCESS");
    expect(s.clean).toBe(true);
    expect(s.needsAlert).toBe(false);
    expect(s.runId).toBe("run-1");
    expect(persisted[0].trigger).toBe("CRON");
  });

  it("records an error run and flags it for an administrator", async () => {
    const s = await runAndRecordDrift({
      detector: async () => report({ errors: 4 }, [finding(), finding({ severity: "WARNING" })]),
      persist,
    });
    expect(s.outcome).toBe("ERRORS");
    expect(s.needsAlert).toBe(true);
    expect(persisted[0].summary.errorCount).toBe(4);
  });

  it("records an informational-only run without alerting", async () => {
    const s = await runAndRecordDrift({
      detector: async () => report({ infos: 26 }, [infoFinding]),
      persist,
    });
    expect(s.clean).toBe(true);
    expect(s.needsAlert).toBe(false);
    expect(persisted[0].summary.infoCount).toBe(26);
    expect(persisted[0].summary.findings).toHaveLength(0);
  });

  it("records a failed execution instead of throwing", async () => {
    const s = await runAndRecordDrift({
      detector: async () => { throw new Error("database unavailable"); },
      persist,
    });
    expect(s.status).toBe("FAILED");
    expect(s.errorMessage).toBe("database unavailable");
    expect(s.needsAlert).toBe(true);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].summary.status).toBe("FAILED");
  });

  it("still returns the outcome when the audit record cannot be written", async () => {
    const s = await runAndRecordDrift({
      detector: async () => report({ errors: 1 }, [finding()]),
      persist: async () => { throw new Error("insert failed"); },
    });
    expect(s.runId).toBeNull();
    expect(s.needsAlert).toBe(true);
    expect(s.errorCount).toBe(1);
  });

  it("records the trigger it was started by", async () => {
    await runAndRecordDrift({ trigger: "MANUAL", detector: async () => report(), persist });
    expect(persisted[0].trigger).toBe("MANUAL");
  });

  it("times the run", async () => {
    const s = await runAndRecordDrift({
      detector: async () => { await new Promise((r) => setTimeout(r, 15)); return report(); },
      persist,
    });
    expect(s.durationMs).toBeGreaterThanOrEqual(10);
    expect(s.startedAt.getTime()).toBeLessThanOrEqual(s.finishedAt.getTime());
  });
});

describe("run descriptions", () => {
  it("describes each outcome distinctly", () => {
    expect(describeRun(summarise(report({ infos: 26 }), t0, t1))).toContain("reconciles");
    expect(describeRun(summarise(report({ errors: 2 }), t0, t1))).toContain("2 error");
    expect(describeRun(summarise(null, t0, t1, "boom"))).toContain("FAILED");
  });
});

describe("schedule health", () => {
  const now = new Date("2026-08-10T09:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it("flags a schedule that has never run", () => {
    expect(assessSchedule(null, now)).toEqual({ state: "NEVER_RUN", hoursSince: null });
    expect(assessSchedule(undefined, now).state).toBe("NEVER_RUN");
  });

  it("accepts a run from last night", () => {
    expect(assessSchedule(hoursAgo(11), now).state).toBe("OK");
  });

  it("tolerates one missed night before complaining", () => {
    expect(assessSchedule(hoursAgo(SCHEDULE_MAX_AGE_HOURS - 1), now).state).toBe("OK");
  });

  it("flags a schedule that has stopped firing", () => {
    const s = assessSchedule(hoursAgo(50), now);
    expect(s.state).toBe("STALE");
    expect(Math.round(s.hoursSince!)).toBe(50);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(assessSchedule(hoursAgo(2).toISOString(), now).state).toBe("OK");
  });

  it("treats an unparseable timestamp as never having run", () => {
    expect(assessSchedule("not-a-date", now).state).toBe("NEVER_RUN");
  });

  it("does not read a silent non-execution as success", () => {
    // The whole point: no runs must never look like a healthy schedule.
    expect(assessSchedule(null, now).state).not.toBe("OK");
  });
});

describe("clinic scoping of run history", () => {
  const findings = [
    finding({ clinicId: "clinic-a", detail: "A problem" }),
    finding({ clinicId: "clinic-b", detail: "B problem" }),
    finding({ code: "DUPLICATE_POSTING_KEY", detail: "ledger-wide" }),
  ];

  it("gives a group-wide role everything", () => {
    expect(scopeFindings(findings, null)).toHaveLength(3);
  });

  it("gives a branch user only their own clinic's findings", () => {
    const scoped = scopeFindings(findings, ["clinic-a"]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].detail).toBe("A problem");
  });

  it("does not leak another branch's stock through the run history", () => {
    expect(scopeFindings(findings, ["clinic-a"]).some((f) => f.clinicId === "clinic-b")).toBe(false);
  });

  it("withholds ledger-wide findings from branch users", () => {
    expect(scopeFindings(findings, ["clinic-a"]).some((f) => f.code === "DUPLICATE_POSTING_KEY")).toBe(false);
  });

  it("gives a multi-clinic manager both of their branches", () => {
    expect(scopeFindings(findings, ["clinic-a", "clinic-b"])).toHaveLength(2);
  });
});
