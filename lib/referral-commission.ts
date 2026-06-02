import { prisma } from "./prisma";

/** True if this patient already has any referral commission (prevents duplicates). */
export async function hasExistingCommission(patientId: string): Promise<boolean> {
  const count = await prisma.referralCommission.count({ where: { patientId } });
  return count > 0;
}

/**
 * Create a ReferralCommission for a patient based on their referral + the
 * active config for that referral type. Returns null if not applicable.
 * Intended to be called when the patient's FIRST invoice is PAID.
 */
export async function calculateReferralCommission(patientId: string, invoiceId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      referralType: true,
      referredByDoctorId: true, referredByClinicId: true,
      externalReferrerName: true, externalReferrerPhone: true, externalReferrerEmail: true,
    },
  });
  if (!patient?.referralType) return null;

  // Prevent duplicates
  if (await hasExistingCommission(patientId)) return null;

  const config = await prisma.referralCommissionConfig.findUnique({ where: { referralType: patient.referralType } });
  if (!config || !config.isActive) return null;

  let calculatedAmount: number;
  let basedOnInvoiceId: string | null = null;

  if (config.commissionType === "FLAT") {
    calculatedAmount = Number(config.rate);
  } else {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { total: true } });
    if (!invoice) return null;
    calculatedAmount = Math.round(Number(invoice.total) * (Number(config.rate) / 100) * 100) / 100;
    basedOnInvoiceId = invoiceId;
  }

  return prisma.referralCommission.create({
    data: {
      patientId,
      referralType:   patient.referralType,
      doctorId:       patient.referralType === "INTERNAL_DOCTOR" ? patient.referredByDoctorId : null,
      clinicId:       patient.referralType === "INTERNAL_CLINIC" ? patient.referredByClinicId : null,
      externalName:   patient.referralType === "EXTERNAL" ? patient.externalReferrerName  : null,
      externalPhone:  patient.referralType === "EXTERNAL" ? patient.externalReferrerPhone : null,
      externalEmail:  patient.referralType === "EXTERNAL" ? patient.externalReferrerEmail : null,
      commissionType: config.commissionType,
      rate:           config.rate,
      basedOnInvoiceId,
      calculatedAmount,
      status:         "PENDING",
    },
  });
}
