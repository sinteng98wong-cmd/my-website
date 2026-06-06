/**
 * Tests for src/lib/referral-commission.ts
 *
 * Both exported functions share the same prisma import, so a single module
 * mock covers the duplicate-check inside calculateReferralCommission too.
 */

import {
  hasExistingCommission,
  calculateReferralCommission,
} from "../lib/referral-commission";

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    referralCommission: {
      count:  jest.fn(),
      create: jest.fn(),
    },
    referralCommissionConfig: {
      findUnique: jest.fn(),
    },
    patient: {
      findUnique: jest.fn(),
    },
    invoice: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";

const mockReferralCommission       = prisma.referralCommission       as jest.Mocked<typeof prisma.referralCommission>;
const mockReferralCommissionConfig = prisma.referralCommissionConfig as jest.Mocked<typeof prisma.referralCommissionConfig>;
const mockPatient                  = prisma.patient                  as jest.Mocked<typeof prisma.patient>;
const mockInvoice                  = prisma.invoice                  as jest.Mocked<typeof prisma.invoice>;

beforeEach(() => jest.clearAllMocks());

// ── hasExistingCommission ─────────────────────────────────────────────────────

describe("hasExistingCommission", () => {
  test("returns false when count is 0", async () => {
    (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(0);
    expect(await hasExistingCommission("patient-1")).toBe(false);
  });

  test("returns true when count is 1", async () => {
    (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(1);
    expect(await hasExistingCommission("patient-1")).toBe(true);
  });

  test("returns true when count is greater than 1", async () => {
    (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(3);
    expect(await hasExistingCommission("patient-1")).toBe(true);
  });
});

// ── calculateReferralCommission — early-return guards ────────────────────────

describe("calculateReferralCommission — early-return guards", () => {
  test("returns null when patient is not found", async () => {
    (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect(await calculateReferralCommission("patient-1", "inv-1")).toBeNull();
  });

  test("returns null when patient has no referralType", async () => {
    (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce({ referralType: null });
    expect(await calculateReferralCommission("patient-1", "inv-1")).toBeNull();
  });

  test("returns null when a commission already exists (duplicate prevention)", async () => {
    (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce({
      referralType: "INTERNAL_DOCTOR",
      referredByDoctorId: "doc-1",
    });
    (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(1);
    expect(await calculateReferralCommission("patient-1", "inv-1")).toBeNull();
    expect(mockReferralCommission.create).not.toHaveBeenCalled();
  });

  test("returns null when referral config is not found", async () => {
    (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce({
      referralType: "INTERNAL_DOCTOR",
      referredByDoctorId: "doc-1",
    });
    (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(0);
    (mockReferralCommissionConfig.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect(await calculateReferralCommission("patient-1", "inv-1")).toBeNull();
  });

  test("returns null when config is found but inactive", async () => {
    (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce({
      referralType: "INTERNAL_DOCTOR",
      referredByDoctorId: "doc-1",
    });
    (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(0);
    (mockReferralCommissionConfig.findUnique as jest.Mock).mockResolvedValueOnce({
      commissionType: "FLAT", rate: 200, isActive: false,
    });
    expect(await calculateReferralCommission("patient-1", "inv-1")).toBeNull();
  });
});

// ── calculateReferralCommission — FLAT rate ───────────────────────────────────

function setupFlatScenario(referralType: string, patient: object, rate = 200) {
  (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce({
    referralType,
    referredByDoctorId: null,
    referredByClinicId: null,
    externalReferrerName: null,
    externalReferrerPhone: null,
    externalReferrerEmail: null,
    ...patient,
  });
  (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(0);
  (mockReferralCommissionConfig.findUnique as jest.Mock).mockResolvedValueOnce({
    commissionType: "FLAT", rate, isActive: true,
  });
  (mockReferralCommission.create as jest.Mock).mockResolvedValueOnce({ id: "rc-1" });
}

describe("calculateReferralCommission — FLAT commission", () => {
  test("calculatedAmount equals config rate for FLAT type", async () => {
    setupFlatScenario("INTERNAL_DOCTOR", { referredByDoctorId: "doc-1" });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.calculatedAmount).toBe(200);
  });

  test("basedOnInvoiceId is null for FLAT type (no invoice lookup)", async () => {
    setupFlatScenario("INTERNAL_DOCTOR", { referredByDoctorId: "doc-1" });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.basedOnInvoiceId).toBeNull();
    expect(mockInvoice.findUnique).not.toHaveBeenCalled();
  });

  test("status is PENDING on creation", async () => {
    setupFlatScenario("INTERNAL_DOCTOR", { referredByDoctorId: "doc-1" });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe("PENDING");
  });
});

// ── calculateReferralCommission — PERCENTAGE rate ────────────────────────────

function setupPercentageScenario(invoiceTotal: number | null, rate = 10) {
  (mockPatient.findUnique as jest.Mock).mockResolvedValueOnce({
    referralType: "INTERNAL_DOCTOR",
    referredByDoctorId: "doc-1",
    referredByClinicId: null,
    externalReferrerName: null,
    externalReferrerPhone: null,
    externalReferrerEmail: null,
  });
  (mockReferralCommission.count as jest.Mock).mockResolvedValueOnce(0);
  (mockReferralCommissionConfig.findUnique as jest.Mock).mockResolvedValueOnce({
    commissionType: "PERCENTAGE", rate, isActive: true,
  });
  if (invoiceTotal !== null) {
    (mockInvoice.findUnique as jest.Mock).mockResolvedValueOnce({ total: invoiceTotal });
    (mockReferralCommission.create as jest.Mock).mockResolvedValueOnce({ id: "rc-2" });
  } else {
    (mockInvoice.findUnique as jest.Mock).mockResolvedValueOnce(null);
  }
}

describe("calculateReferralCommission — PERCENTAGE commission", () => {
  test("returns null when invoice is not found", async () => {
    setupPercentageScenario(null);
    expect(await calculateReferralCommission("patient-1", "inv-1")).toBeNull();
  });

  test("calculates 10% of invoice total 500 → calculatedAmount 50", async () => {
    setupPercentageScenario(500, 10);
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.calculatedAmount).toBe(50);
  });

  test("basedOnInvoiceId is set to invoiceId for PERCENTAGE type", async () => {
    setupPercentageScenario(500, 10);
    await calculateReferralCommission("patient-1", "inv-99");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.basedOnInvoiceId).toBe("inv-99");
  });

  test("percentage rounding: 10% of 100.05 → 10.01 (rounded to cents)", async () => {
    setupPercentageScenario(100.05, 10);
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.calculatedAmount).toBe(10.01);
  });
});

// ── calculateReferralCommission — referral type routing ──────────────────────

describe("calculateReferralCommission — referral type routing", () => {
  test("INTERNAL_DOCTOR: sets doctorId, nulls clinicId and external fields", async () => {
    setupFlatScenario("INTERNAL_DOCTOR", {
      referredByDoctorId: "doc-42",
      referredByClinicId: "clinic-1",
      externalReferrerName: "Someone",
    });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.doctorId).toBe("doc-42");
    expect(data.clinicId).toBeNull();
    expect(data.externalName).toBeNull();
    expect(data.externalPhone).toBeNull();
    expect(data.externalEmail).toBeNull();
  });

  test("INTERNAL_CLINIC: sets clinicId, nulls doctorId and external fields", async () => {
    setupFlatScenario("INTERNAL_CLINIC", {
      referredByClinicId: "clinic-99",
      referredByDoctorId: "doc-1",
    });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.clinicId).toBe("clinic-99");
    expect(data.doctorId).toBeNull();
    expect(data.externalName).toBeNull();
  });

  test("EXTERNAL: sets externalName/Phone/Email, nulls doctorId and clinicId", async () => {
    setupFlatScenario("EXTERNAL", {
      externalReferrerName: "Dr Ahmad",
      externalReferrerPhone: "0111234567",
      externalReferrerEmail: "ahmad@example.com",
    });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.externalName).toBe("Dr Ahmad");
    expect(data.externalPhone).toBe("0111234567");
    expect(data.externalEmail).toBe("ahmad@example.com");
    expect(data.doctorId).toBeNull();
    expect(data.clinicId).toBeNull();
  });

  test("referralType is copied from patient to commission record", async () => {
    setupFlatScenario("INTERNAL_DOCTOR", { referredByDoctorId: "doc-1" });
    await calculateReferralCommission("patient-1", "inv-1");
    const data = (mockReferralCommission.create as jest.Mock).mock.calls[0][0].data;
    expect(data.referralType).toBe("INTERNAL_DOCTOR");
  });
});
