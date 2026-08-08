import {
  DEFAULT_PAYROLL_SETTINGS,
  bankPaymentRef,
  checkApproverPair,
  checkFirstApprover,
  checkHeadNurse,
  checkLunchOt,
  checkSecondApprover,
  isPayable,
  isRunSettled,
  type ClinicPayrollSettings,
} from "@/lib/payroll-workflow";

const settings = (over: Partial<ClinicPayrollSettings> = {}): ClinicPayrollSettings => ({
  ...DEFAULT_PAYROLL_SETTINGS,
  firstApproverId: "user-first",
  secondApproverId: "user-second",
  headNurseStaffProfileId: "staff-head-nurse",
  ...over,
});

describe("1st payment approver", () => {
  it("lets the clinic's configured approver approve", () => {
    expect(checkFirstApprover(settings(), "user-first", "CLINIC_MANAGER").ok).toBe(true);
  });

  it("refuses anyone else", () => {
    const g = checkFirstApprover(settings(), "user-other", "FINANCE");
    expect(g).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses the PV director/PIC purely for being one — only the configured approver counts", () => {
    // "user-director" is the clinic's PV director but not the payroll approver
    expect(checkFirstApprover(settings(), "user-director", "CLINIC_MANAGER").ok).toBe(false);
  });

  it("blocks with a 422 when the clinic has no approver configured", () => {
    const g = checkFirstApprover(settings({ firstApproverId: null }), "user-first", "FINANCE");
    expect(g).toMatchObject({ ok: false, status: 422 });
  });

  it("lets Super Admin stand in", () => {
    expect(checkFirstApprover(settings(), "someone", "SUPER_ADMIN").ok).toBe(true);
  });
});

describe("2nd payment approver", () => {
  it("lets the configured 2nd approver approve a payment prepared by Accounts", () => {
    expect(checkSecondApprover(settings(), "user-second", "CLINIC_MANAGER", "user-accounts").ok).toBe(true);
  });

  it("refuses the preparer — Accounts cannot approve its own bank payment", () => {
    const g = checkSecondApprover(settings({ secondApproverId: "user-accounts" }), "user-accounts", "FINANCE", "user-accounts");
    expect(g).toMatchObject({ ok: false, status: 403 });
    expect((g as any).error).toMatch(/cannot approve/i);
  });

  it("refuses the preparer even when they are Super Admin", () => {
    expect(checkSecondApprover(settings(), "user-admin", "SUPER_ADMIN", "user-admin").ok).toBe(false);
  });

  it("refuses an unrelated user", () => {
    expect(checkSecondApprover(settings(), "user-first", "CLINIC_MANAGER", "user-accounts").ok).toBe(false);
  });

  it("blocks with a 422 when no 2nd approver is configured", () => {
    const g = checkSecondApprover(settings({ secondApproverId: null }), "user-x", "FINANCE", "user-accounts");
    expect(g).toMatchObject({ ok: false, status: 422 });
  });
});

describe("approver pair", () => {
  it("rejects the same person on both signatures", () => {
    expect(checkApproverPair("u1", "u1")).toMatchObject({ ok: false, status: 422 });
  });
  it("accepts two different people", () => {
    expect(checkApproverPair("u1", "u2").ok).toBe(true);
  });
  it("accepts a partially configured clinic", () => {
    expect(checkApproverPair("u1", null).ok).toBe(true);
  });
});

describe("monthly attendance submission", () => {
  it("lets the designated Head Nurse submit", () => {
    expect(checkHeadNurse(settings(), "staff-head-nurse", "NURSE").ok).toBe(true);
  });

  it("refuses any other authenticated staff member", () => {
    const g = checkHeadNurse(settings(), "staff-someone-else", "NURSE");
    expect(g).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a user with no staff profile", () => {
    expect(checkHeadNurse(settings(), null, "RECEPTIONIST").ok).toBe(false);
  });

  it("blocks with a 422 when no Head Nurse is designated", () => {
    const g = checkHeadNurse(settings({ headNurseStaffProfileId: null }), "staff-head-nurse", "NURSE");
    expect(g).toMatchObject({ ok: false, status: 422 });
  });
});

describe("lunch OT is a clinic-level permission", () => {
  it("refuses lunch OT where the clinic does not allow it", () => {
    const g = checkLunchOt(settings({ lunchOtAllowed: false }), 30);
    expect(g).toMatchObject({ ok: false, status: 403 });
  });

  it("allows lunch OT within the clinic's cap", () => {
    expect(checkLunchOt(settings({ lunchOtAllowed: true, lunchOtMaxMinutes: 60 }), 45).ok).toBe(true);
  });

  it("caps lunch OT at the clinic's configured maximum", () => {
    const g = checkLunchOt(settings({ lunchOtAllowed: true, lunchOtMaxMinutes: 60 }), 90);
    expect(g).toMatchObject({ ok: false, status: 422 });
  });

  it("ignores zero minutes regardless of the permission", () => {
    expect(checkLunchOt(settings({ lunchOtAllowed: false }), 0).ok).toBe(true);
  });
});

describe("payment state helpers", () => {
  it("only pays approved payslips not already on a bank payment", () => {
    expect(isPayable({ status: "APPROVED", bankPaymentId: null })).toBe(true);
    expect(isPayable({ status: "APPROVED", bankPaymentId: "bp-1" })).toBe(false);
    expect(isPayable({ status: "PENDING", bankPaymentId: null })).toBe(false);
  });

  it("settles a run only when every payslip is paid or released", () => {
    expect(isRunSettled([{ status: "PAID" }, { status: "RELEASED" }])).toBe(true);
    expect(isRunSettled([{ status: "PAID" }, { status: "APPROVED" }])).toBe(false);
    expect(isRunSettled([])).toBe(false);
  });

  it("formats the bank payment reference", () => {
    expect(bankPaymentRef("2026-06", 1)).toBe("BP-202606-001");
    expect(bankPaymentRef("2026-12", 12)).toBe("BP-202612-012");
  });
});
