import { TreatmentPlanStatus, StageStatus, type TreatmentStage } from "@prisma/client";
import { prisma } from "./prisma";
import { generateTreatmentPlanRef } from "./ref-generator";

// ── Financials ───────────────────────────────────────────────────────────────

export async function getPlanFinancials(planId: string) {
  const plan = await prisma.treatmentPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      stages:   { select: { cost: true, status: true } },
      payments: { select: { amount: true, paymentType: true } },
    },
  });

  const totalAmount    = Number(plan.totalAmount);
  const totalPaid      = Number(plan.totalPaid);
  const outstanding    = Math.max(0, totalAmount - totalPaid);
  const depositRequired = Number(plan.depositRequired);
  const depositPaid    = plan.payments
    .filter(p => p.paymentType === "DEPOSIT")
    .reduce((s, p) => s + Number(p.amount), 0);
  const isDepositMet   = depositPaid >= depositRequired;
  const stagesPaid     = plan.payments
    .filter(p => p.paymentType === "STAGE")
    .reduce((s, p) => s + Number(p.amount), 0);
  const stagesTotal    = plan.stages.reduce((s, st) => s + Number(st.cost), 0);

  return { totalAmount, totalPaid, outstanding, depositRequired, depositPaid, isDepositMet, stagesPaid, stagesTotal };
}

// ── Create plan from templates ────────────────────────────────────────────────

export async function createPlanFromTemplate(params: {
  patientId:       string;
  clinicId:        string;
  dentistId:       string;
  title:           string;
  toothCodes:      string[];
  treatmentTypeId: string;
  paymentMode:     string;
  discount:        number;
  depositRequired: number;
  notes?:          string;
  createdById:     string;
}) {
  const templates = await prisma.treatmentStageTemplate.findMany({
    where: { treatmentTypeId: params.treatmentTypeId, isActive: true },
    orderBy: { order: "asc" },
  });

  const subtotal = templates.reduce((s, t) => s + Number(t.defaultCost ?? 0), 0);
  const discounted = Math.max(0, subtotal - params.discount);
  const totalAmount = Math.round(discounted * 100) / 100;
  const planRef = await generateTreatmentPlanRef();

  return prisma.treatmentPlan.create({
    data: {
      planRef,
      patientId:       params.patientId,
      clinicId:        params.clinicId,
      dentistId:       params.dentistId,
      title:           params.title,
      toothCodes:      params.toothCodes,
      paymentMode:     params.paymentMode as any,
      subtotal,
      discount:        params.discount,
      sstAmount:       0,
      totalAmount,
      depositRequired: params.depositRequired,
      notes:           params.notes,
      createdById:     params.createdById,
      stages: {
        create: templates.map(t => ({
          name:        t.name,
          description: t.description,
          order:       t.order,
          cost:        t.defaultCost ?? 0,
          templateId:  t.id,
        })),
      },
    },
    include: { stages: { orderBy: { order: "asc" } } },
  });
}

// ── Accept quotation ──────────────────────────────────────────────────────────

export async function acceptPlan(
  planId: string,
  acceptedByName: string,
  signatureUrl?: string,
) {
  const plan = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: planId } });
  if (plan.status !== TreatmentPlanStatus.QUOTED)
    throw new Error("Plan must be in QUOTED status to accept");

  return prisma.treatmentPlan.update({
    where: { id: planId },
    data: {
      status:                TreatmentPlanStatus.ACCEPTED,
      acceptedAt:            new Date(),
      acceptedByName,
      acceptanceSignatureUrl: signatureUrl ?? null,
    },
  });
}

// ── Complete a stage ──────────────────────────────────────────────────────────

export async function completeStage(
  stageId:       string,
  visitId:       string,
  performedById: string,
  clinicalNotes?: string,
  nextStageDate?: Date,
) {
  const stage = await prisma.treatmentStage.findUniqueOrThrow({
    where: { id: stageId },
    include: { plan: { include: { stages: true } } },
  });

  const updatedStage = await prisma.treatmentStage.update({
    where: { id: stageId },
    data: {
      status:        StageStatus.COMPLETED,
      visitId,
      performedById,
      clinicalNotes: clinicalNotes ?? null,
      nextStageDate: nextStageDate ?? null,
      completedAt:   new Date(),
    },
  });

  // Update plan status
  const allStages = stage.plan.stages.map(s =>
    s.id === stageId ? { ...s, status: StageStatus.COMPLETED } : s
  );
  const allDone = allStages.every(s =>
    s.status === StageStatus.COMPLETED || s.status === StageStatus.SKIPPED
  );
  const planStatus = allDone
    ? TreatmentPlanStatus.COMPLETED
    : TreatmentPlanStatus.IN_PROGRESS;

  await prisma.treatmentPlan.update({
    where: { id: stage.planId },
    data: {
      status:      planStatus,
      completedAt: allDone ? new Date() : undefined,
    },
  });

  // Stage progress may unlock payout percentages — re-check linked lines
  try {
    const { recheckLinesForPlan } = await import("@/services/locum-payout.service");
    await recheckLinesForPlan(stage.planId);
  } catch {
    // payout recheck is best-effort; never block clinical stage completion
  }

  return updatedStage;
}

// ── Record payment ────────────────────────────────────────────────────────────

export async function recordPlanPayment(params: {
  planId:       string;
  amount:       number;
  paymentType:  string;
  stageId?:     string;
  notes?:       string;
  recordedById: string;
}) {
  const payment = await prisma.treatmentPlanPayment.create({
    data: {
      planId:       params.planId,
      amount:       params.amount,
      paymentType:  params.paymentType,
      stageId:      params.stageId ?? null,
      notes:        params.notes ?? null,
      recordedById: params.recordedById,
    },
  });

  // Update totalPaid on the plan
  const allPayments = await prisma.treatmentPlanPayment.findMany({
    where: { planId: params.planId },
    select: { amount: true },
  });
  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
  await prisma.treatmentPlan.update({
    where: { id: params.planId },
    data:  { totalPaid: Math.round(totalPaid * 100) / 100 },
  });

  // Payment progress may cross a release threshold (e.g. aligner 70%) —
  // re-check payout lines linked to this plan
  try {
    const { recheckLinesForPlan } = await import("@/services/locum-payout.service");
    await recheckLinesForPlan(params.planId);
  } catch {
    // best-effort; never block payment recording
  }

  return payment;
}
