import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import Decimal from "decimal.js";
import { buildPayload, serialisePayload, type RawTreatmentInput, type DeductionItem } from "../src/services/commission.service";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 10);

  // ── Entities ──────────────────────────────────────────────────────────
  const entity1 = await prisma.entity.upsert({
    where: { id: "entity-1" },
    update: {},
    create: { id: "entity-1", legalName: "DentalOS KL Sdn Bhd", sstRegistered: true, sstOnForeigner: true },
  });
  const entity2 = await prisma.entity.upsert({
    where: { id: "entity-2" },
    update: {},
    create: { id: "entity-2", legalName: "DentalOS PJ Sdn Bhd", sstRegistered: false, sstOnForeigner: false },
  });

  // ── Clinics ───────────────────────────────────────────────────────────
  const clinicA = await prisma.clinic.upsert({
    where: { id: "clinic-a" },
    update: { slug: "clinic-a-kl" },
    create: { id: "clinic-a", name: "Clinic A (KL)", slug: "clinic-a-kl", entityId: entity1.id, isHQ: true },
  });
  const clinicB = await prisma.clinic.upsert({
    where: { id: "clinic-b" },
    update: { slug: "clinic-b-pj" },
    create: { id: "clinic-b", name: "Clinic B (PJ)", slug: "clinic-b-pj", entityId: entity2.id, isHQ: false },
  });
  const clinicC = await prisma.clinic.upsert({
    where: { id: "clinic-c" },
    update: { slug: "clinic-c-subang" },
    create: { id: "clinic-c", name: "Clinic C (Subang)", slug: "clinic-c-subang", entityId: entity2.id, isHQ: false },
  });

  // ── Panel Providers ───────────────────────────────────────────────────
  const panelAIA = await prisma.panelProvider.upsert({
    where: { id: "panel-aia" },
    update: {},
    create: { id: "panel-aia", clinicId: clinicA.id, name: "AIA", code: "AIA", active: true },
  });

  // ── Users ─────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@dentalos.com" },
    update: {},
    create: { name: "Super Admin", email: "admin@dentalos.com", passwordHash: password, role: "SUPER_ADMIN", active: true },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@dentalos.com" },
    update: {},
    create: { name: "Azman Clinic Manager", email: "manager@dentalos.com", passwordHash: password, role: "CLINIC_MANAGER", active: true },
  });
  const doctorHafiz = await prisma.user.upsert({
    where: { email: "doctor@dentalos.com" },
    update: {},
    create: { name: "Dr. Hafiz Rahman", email: "doctor@dentalos.com", passwordHash: password, role: "DOCTOR", active: true },
  });
  const doctorPriya = await prisma.user.upsert({
    where: { email: "priya@dentalos.com" },
    update: {},
    create: { name: "Dr. Priya Nair", email: "priya@dentalos.com", passwordHash: password, role: "DOCTOR", active: true },
  });
  const receptionist = await prisma.user.upsert({
    where: { email: "receptionist@dentalos.com" },
    update: {},
    create: { name: "Siti Rahimah", email: "receptionist@dentalos.com", passwordHash: password, role: "RECEPTIONIST", active: true },
  });
  const nurse = await prisma.user.upsert({
    where: { email: "nurse@dentalos.com" },
    update: {},
    create: { name: "Norzahra Ismail", email: "nurse@dentalos.com", passwordHash: password, role: "NURSE", active: true },
  });
  const finance = await prisma.user.upsert({
    where: { email: "finance@dentalos.com" },
    update: {},
    create: { name: "Finance Manager", email: "finance@dentalos.com", passwordHash: password, role: "FINANCE", active: true },
  });
  const storekeeper = await prisma.user.upsert({
    where: { email: "store@dentalos.com" },
    update: {},
    create: { name: "Kevin Ooi", email: "store@dentalos.com", passwordHash: password, role: "STOREKEEPER", active: true },
  });

  // ── UserClinic links ──────────────────────────────────────────────────
  const userClinicLinks = [
    { userId: admin.id, clinicId: clinicA.id },
    { userId: manager.id, clinicId: clinicA.id },
    { userId: doctorHafiz.id, clinicId: clinicA.id },
    { userId: doctorPriya.id, clinicId: clinicB.id },
    { userId: receptionist.id, clinicId: clinicA.id },
    { userId: nurse.id, clinicId: clinicA.id },
    { userId: finance.id, clinicId: clinicA.id },
    { userId: storekeeper.id, clinicId: clinicA.id },
  ];
  for (const link of userClinicLinks) {
    await prisma.userClinic.upsert({
      where: { userId_clinicId: link },
      update: {},
      create: link,
    });
  }

  // ── Additional users for demo pay types ───────────────────────────────────
  const doctorRaj = await prisma.user.upsert({
    where: { email: "raj@dentalos.com" },
    update: {},
    create: { name: "Dr. Raj Kumar", email: "raj@dentalos.com", passwordHash: password, role: "DOCTOR", active: true },
  });
  await prisma.userClinic.upsert({
    where: { userId_clinicId: { userId: doctorRaj.id, clinicId: clinicA.id } },
    update: {}, create: { userId: doctorRaj.id, clinicId: clinicA.id },
  });

  // ── Doctor Profiles ───────────────────────────────────────────────────
  // Dr. Hafiz — LOCUM (TYPE 2: Locum with Floor)
  const doctorHafizProfile = await prisma.doctorProfile.upsert({
    where: { userId: doctorHafiz.id },
    update: {},
    create: { userId: doctorHafiz.id, type: "LOCUM", defaultRate: 18, dayRate: 500, rateType: "DAY" },
  });
  // Dr. Priya — PERMANENT, no basicSalary (TYPE 3: Pure Prof Fees)
  const doctorPriyaProfile = await prisma.doctorProfile.upsert({
    where: { userId: doctorPriya.id },
    update: {},
    create: { userId: doctorPriya.id, type: "PERMANENT", defaultRate: 15 },
  });
  // Dr. Raj — PERMANENT + salary (TYPE 1: Pure Salaried)
  const doctorRajProfile = await prisma.doctorProfile.upsert({
    where: { userId: doctorRaj.id },
    update: {},
    create: { userId: doctorRaj.id, type: "PERMANENT", defaultRate: 15 },
  });
  // Raj has a StaffProfile with basicSalary → resolves to PURE_SALARIED
  await prisma.staffProfile.upsert({
    where: { userId: doctorRaj.id },
    update: {},
    create: {
      userId: doctorRaj.id, clinicId: clinicA.id, isFullTime: true,
      basicSalary: 7000, employmentStatus: "ACTIVE", employmentType: "FULL_TIME",
    },
  });

  // ── Staff Profiles ────────────────────────────────────────────────────
  await prisma.staffProfile.upsert({
    where: { userId: receptionist.id },
    update: {},
    create: { userId: receptionist.id, clinicId: clinicA.id, isFullTime: true },
  });
  await prisma.staffProfile.upsert({
    where: { userId: nurse.id },
    update: {},
    create: { userId: nurse.id, clinicId: clinicA.id, isFullTime: true },
  });

  // ── Treatment Types ───────────────────────────────────────────────────
  const treatments = [
    { id: "tx-scaling",   code: "SCALING",   name: "Scaling & Polishing",   defaultPrice: 120,  sstApplicable: false },
    { id: "tx-filling",   code: "FILLING",   name: "Composite Filling",      defaultPrice: 180,  sstApplicable: false },
    { id: "tx-rct",       code: "RCT",       name: "Root Canal Treatment",   defaultPrice: 1200, sstApplicable: false },
    { id: "tx-crown",     code: "CROWN",     name: "Crown (Porcelain)",       defaultPrice: 1800, sstApplicable: false },
    { id: "tx-implant",   code: "IMPLANT",   name: "Implant",                 defaultPrice: 4500, sstApplicable: false },
    { id: "tx-extraction",code: "EXTRACT",   name: "Extraction",              defaultPrice: 80,   sstApplicable: false },
    { id: "tx-veneer",    code: "VENEER",    name: "Veneer",                  defaultPrice: 900,  sstApplicable: false },
    { id: "tx-xray",      code: "XRAY",      name: "X-Ray (Periapical)",      defaultPrice: 30,   sstApplicable: false },
    { id: "tx-consult",   code: "CONSULT",   name: "Consultation",            defaultPrice: 50,   sstApplicable: false },
    { id: "tx-braces",    code: "BRACES",    name: "Braces Consultation",     defaultPrice: 200,  sstApplicable: false },
  ];
  for (const t of treatments) {
    await prisma.treatmentType.upsert({ where: { id: t.id }, update: {}, create: t });
  }

  // ── Commission Config ─────────────────────────────────────────────────
  await prisma.commissionConfig.upsert({
    where: { id: "config-clinic-a" },
    update: {},
    create: {
      id: "config-clinic-a",
      clinicId: clinicA.id,
      method: "INDIVIDUAL",
      tierType: "PROGRESSIVE",
      forfeitThreshold: 5,
      tiers: {
        create: [
          { tierOrder: 1, floorAmount: 0,    ceilAmount: 8000, rate: 5 },
          { tierOrder: 2, floorAmount: 8001, ceilAmount: null, rate: 8 },
        ],
      },
    },
  });

  // ── Schedules ─────────────────────────────────────────────────────────
  // Build today's date as YYYY-MM-DD in MYT
  const todayMYT = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const today = new Date(todayMYT + "T00:00:00Z"); // keep for use in visits section below
  const scheduleData = [
    {
      date:      new Date(todayMYT + "T00:00:00Z"),
      startTime: new Date(todayMYT + "T08:00:00+08:00"),
      endTime:   new Date(todayMYT + "T13:00:00+08:00"),
      doctorId: doctorHafiz.id, nurseId: nurse.id, receptionistId: receptionist.id, clinicId: clinicA.id,
    },
    {
      date:      new Date(todayMYT + "T00:00:00Z"),
      startTime: new Date(todayMYT + "T14:00:00+08:00"),
      endTime:   new Date(todayMYT + "T18:00:00+08:00"),
      doctorId: doctorPriya.id, nurseId: nurse.id, receptionistId: receptionist.id, clinicId: clinicB.id,
    },
  ];
  for (const s of scheduleData) {
    await prisma.schedule.upsert({
      where: { clinicId_doctorId_startTime: { clinicId: s.clinicId, doctorId: s.doctorId, startTime: s.startTime } },
      update: {},
      create: s,
    });
  }

  // ── Patients ──────────────────────────────────────────────────────────
  const patientData = [
    { id: "pat-1", patientRef: "P-CLNICA-00001", name: "Amirah Binti Zulkifli",  icNumber: "920314-10-5821", isForeigner: false, homeClinicId: clinicA.id, phone: "011-2345678", email: "amirah@email.com" },
    { id: "pat-2", patientRef: "P-CLNICA-00002", name: "James Lim Wei Keat",     icNumber: "880506-14-3321", isForeigner: false, homeClinicId: clinicA.id, phone: "012-3456789" },
    { id: "pat-3", patientRef: "P-CLNICA-00003", name: "Sarah Muthu",            icNumber: "950821-07-1234", isForeigner: false, homeClinicId: clinicA.id, phone: "013-4567890" },
    { id: "pat-4", patientRef: "P-CLNICA-00004", name: "David Tan Ah Kow",       icNumber: "791103-14-4412", isForeigner: false, homeClinicId: clinicA.id, phone: "016-5678901" },
    { id: "pat-5", patientRef: "P-CLNICA-00005", name: "Nurul Ain Hassan",       icNumber: "010203-10-9988", isForeigner: false, homeClinicId: clinicA.id, phone: "017-6789012" },
    { id: "pat-6", patientRef: "P-CLNICB-00001", name: "John Smith",             passportNo: "A12345678",    isForeigner: true,  homeClinicId: clinicB.id, phone: "018-7890123" },
    { id: "pat-7", patientRef: "P-CLNICA-00006", name: "Tan Mei Ling",           icNumber: "850715-10-1122", isForeigner: false, homeClinicId: clinicA.id, phone: "019-8901234" },
    { id: "pat-8", patientRef: "P-CLNICA-00007", name: "Mohd Farid Ismail",      icNumber: "990228-14-7788", isForeigner: false, homeClinicId: clinicA.id, phone: "011-9012345" },
  ];
  for (const p of patientData) {
    await prisma.patient.upsert({ where: { id: p.id }, update: {}, create: p });
  }

  // ── Lab Vendors ───────────────────────────────────────────────────────
  const labVendor = await prisma.labVendor.upsert({
    where: { id: "lab-bestdent" },
    update: {},
    create: { id: "lab-bestdent", clinicId: clinicA.id, name: "Bestdent Lab KL", contactName: "Mr. Lim", phone: "03-7890 1234", email: "orders@bestdent.com" },
  });
  const labVendor2 = await prisma.labVendor.upsert({
    where: { id: "lab-osseodent" },
    update: {},
    create: { id: "lab-osseodent", clinicId: clinicA.id, name: "OsseoDent KL", contactName: "Ms. Rina", phone: "03-6677 8899", email: "lab@osseodent.com.my" },
  });

  // ── Visits & Treatments & Invoices ────────────────────────────────────
  const visitDate1 = new Date(); visitDate1.setDate(visitDate1.getDate() - 1);
  const visitDate2 = new Date(); visitDate2.setDate(visitDate2.getDate() - 2);
  const visitDate3 = new Date(); visitDate3.setDate(visitDate3.getDate() - 3);
  const visitDate4 = new Date(); visitDate4.setDate(visitDate4.getDate() - 4);
  const visitDate5 = new Date(); visitDate5.setDate(visitDate5.getDate() - 5);

  type PaymentMethod = "CASH_CURRENT"|"CASH_NEXT"|"CREDIT_CARD"|"FPX"|"EWALLET"|"ATOME"|"PANEL";
  const visitsData: Array<{
    id: string; visitRef: string; patientId: string; clinicId: string; visitDate: Date;
    treatments: Array<{ treatmentTypeId: string; billedAmount: number; collectedAmount: number; doctorId: string; doctorSplit: number; labFee: number; sst: number }>;
    invoice: { invoiceRef: string; subtotal: number; sst: number; total: number; paymentMethod: PaymentMethod; collectedAt: Date | null };
  }> = [
    {
      id: "visit-1", visitRef: "V-001", patientId: "pat-1", clinicId: clinicA.id, visitDate: visitDate1,
      treatments: [{ treatmentTypeId: "tx-scaling", billedAmount: 120, collectedAmount: 120, doctorId: doctorHafizProfile.id, doctorSplit: 100, labFee: 0, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-001", subtotal: 120, sst: 0, total: 120, paymentMethod: "CASH_CURRENT", collectedAt: visitDate1 },
    },
    {
      id: "visit-2", visitRef: "V-002", patientId: "pat-2", clinicId: clinicA.id, visitDate: visitDate2,
      treatments: [{ treatmentTypeId: "tx-crown", billedAmount: 1800, collectedAmount: 1800, doctorId: doctorHafizProfile.id, doctorSplit: 100, labFee: 350, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-002", subtotal: 1800, sst: 0, total: 1800, paymentMethod: "CREDIT_CARD", collectedAt: visitDate2 },
    },
    {
      id: "visit-3", visitRef: "V-003", patientId: "pat-3", clinicId: clinicA.id, visitDate: visitDate3,
      treatments: [{ treatmentTypeId: "tx-rct", billedAmount: 1200, collectedAmount: 1200, doctorId: doctorPriyaProfile.id, doctorSplit: 100, labFee: 0, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-003", subtotal: 1200, sst: 0, total: 1200, paymentMethod: "FPX", collectedAt: visitDate3 },
    },
    {
      id: "visit-4", visitRef: "V-004", patientId: "pat-4", clinicId: clinicA.id, visitDate: visitDate4,
      treatments: [{ treatmentTypeId: "tx-extraction", billedAmount: 80, collectedAmount: 80, doctorId: doctorHafizProfile.id, doctorSplit: 100, labFee: 0, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-004", subtotal: 80, sst: 0, total: 80, paymentMethod: "CASH_CURRENT", collectedAt: visitDate4 },
    },
    {
      id: "visit-5", visitRef: "V-005", patientId: "pat-6", clinicId: clinicB.id, visitDate: visitDate5,
      treatments: [{ treatmentTypeId: "tx-consult", billedAmount: 50, collectedAmount: 50, doctorId: doctorPriyaProfile.id, doctorSplit: 100, labFee: 0, sst: 3 }],
      invoice: { invoiceRef: "INV-2026-005", subtotal: 50, sst: 3, total: 53, paymentMethod: "CASH_CURRENT", collectedAt: visitDate5 },
    },
    {
      id: "visit-6", visitRef: "V-006", patientId: "pat-5", clinicId: clinicA.id, visitDate: today,
      treatments: [{ treatmentTypeId: "tx-braces", billedAmount: 200, collectedAmount: 0, doctorId: doctorHafizProfile.id, doctorSplit: 100, labFee: 0, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-006", subtotal: 200, sst: 0, total: 200, paymentMethod: "FPX", collectedAt: null },
    },
    {
      id: "visit-7", visitRef: "V-007", patientId: "pat-7", clinicId: clinicA.id, visitDate: visitDate1,
      treatments: [{ treatmentTypeId: "tx-filling", billedAmount: 180, collectedAmount: 180, doctorId: doctorHafizProfile.id, doctorSplit: 100, labFee: 0, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-007", subtotal: 180, sst: 0, total: 180, paymentMethod: "EWALLET", collectedAt: visitDate1 },
    },
    {
      id: "visit-8", visitRef: "V-008", patientId: "pat-8", clinicId: clinicA.id, visitDate: visitDate2,
      treatments: [{ treatmentTypeId: "tx-implant", billedAmount: 4500, collectedAmount: 4500, doctorId: doctorPriyaProfile.id, doctorSplit: 100, labFee: 800, sst: 0 }],
      invoice: { invoiceRef: "INV-2026-008", subtotal: 4500, sst: 0, total: 4500, paymentMethod: "CREDIT_CARD", collectedAt: visitDate2 },
    },
  ];

  for (const v of visitsData) {
    const visit = await prisma.visit.upsert({
      where: { id: v.id },
      update: {},
      create: { id: v.id, visitRef: v.visitRef, patientId: v.patientId, clinicId: v.clinicId, visitDate: v.visitDate },
    });

    for (const t of v.treatments) {
      const existing = await prisma.treatment.findFirst({ where: { visitId: visit.id, treatmentTypeId: t.treatmentTypeId } });
      if (!existing) {
        const treatment = await prisma.treatment.create({
          data: { visitId: visit.id, ...t },
        });

        // Doctor commission
        const commAmt = (t.billedAmount - t.labFee) * (t.doctorSplit / 100) * 0.18;
        await prisma.doctorCommission.create({
          data: {
            treatmentId: treatment.id,
            doctorId: t.doctorId!,
            month: "2026-05",
            txAmount: t.billedAmount,
            labFee: t.labFee,
            doctorSplit: t.doctorSplit,
            doctorRate: 18,
            commission: commAmt,
            finalPayout: commAmt,
            status: v.invoice.collectedAt ? "PENDING_LOCK" : "DRAFT",
          },
        });
      }
    }

    // Invoice with nested payment line (schema uses InvoicePayment table, not paymentMethod column)
    const existingInv = await prisma.invoice.findUnique({ where: { invoiceRef: v.invoice.invoiceRef } });
    if (!existingInv) {
      await prisma.invoice.create({
        data: {
          invoiceRef:  v.invoice.invoiceRef,
          visitId:     visit.id,
          subtotal:    v.invoice.subtotal,
          sst:         v.invoice.sst,
          total:       v.invoice.total,
          collectedAt: v.invoice.collectedAt,
          payments: {
            create: [{
              method:      v.invoice.paymentMethod,
              amount:      v.invoice.total,
              collectedAt: v.invoice.collectedAt,
            }],
          },
        },
      });
    }
  }

  // ── Lab Jobs ──────────────────────────────────────────────────────────
  // Find the crown treatment from visit-2 (James Lim)
  const crownTx = await prisma.treatment.findFirst({ where: { visitId: "visit-2", treatmentTypeId: "tx-crown" } });
  const implantTx = await prisma.treatment.findFirst({ where: { visitId: "visit-8", treatmentTypeId: "tx-implant" } });

  if (crownTx) {
    await prisma.labJob.upsert({
      where: { id: "lj-001" },
      update: {},
      create: {
        id: "lj-001",
        labJobRef: "LJ-00001",
        visitId: "visit-2",
        vendorId: labVendor.id,
        clinicId: clinicA.id,
        status: "RECEIVED",
        workDescription: "PFM Crown — Upper Right Molar",
        estimatedFee: 350,
        invoiceNumber: "BD-2026-0441",
        invoiceDate: visitDate2,
        invoiceAmount: 360,
        sentDate: new Date(visitDate2.getTime() - 3 * 86400000),
        receivedDate: visitDate1,
        paidToVendor: false,
        treatments: { connect: [{ id: crownTx.id }] },
      },
    });
  }

  if (implantTx) {
    await prisma.labJob.upsert({
      where: { id: "lj-002" },
      update: {},
      create: {
        id: "lj-002",
        labJobRef: "LJ-00002",
        visitId: "visit-8",
        vendorId: labVendor2.id,
        clinicId: clinicA.id,
        status: "SENT_TO_LAB",
        workDescription: "Implant Abutment + Crown",
        estimatedFee: 800,
        sentDate: visitDate2,
        expectedDate: new Date(visitDate2.getTime() + 14 * 86400000),
        treatments: { connect: [{ id: implantTx.id }] },
      },
    });
  }

  // A pending lab job for denture (partial payment scenario)
  await prisma.labJob.upsert({
    where: { id: "lj-003" },
    update: {},
    create: {
      id: "lj-003",
      labJobRef: "LJ-00003",
      visitId: "visit-3",
      vendorId: labVendor.id,
      clinicId: clinicA.id,
      status: "ORDERED",
      workDescription: "Full Upper Denture",
      estimatedFee: 600,
      notes: "Patient paid RM 600 deposit. Remaining RM 600 on delivery.",
    },
  });

  // ── Daily Ledger ──────────────────────────────────────────────────────
  const ledgerDates = [
    { daysAgo: 1, patients: 28, profFee: 7820, products: 180,  sst: 215, total: 8215, cash: 5300, card: 1650, fpx: 600,  ewallet: 390, atome: 175 },
    { daysAgo: 2, patients: 34, profFee: 9100, products: 450,  sst: 298, total: 9848, cash: 5500, card: 2800, fpx: 750,  ewallet: 380, atome: 218 },
    { daysAgo: 3, patients: 26, profFee: 6350, products: 220,  sst: 190, total: 6760, cash: 3900, card: 1450, fpx: 500,  ewallet: 310, atome: 150 },
    { daysAgo: 4, patients: 31, profFee: 8200, products: 310,  sst: 241, total: 8751, cash: 4800, card: 2100, fpx: 850,  ewallet: 620, atome: 181 },
    { daysAgo: 5, patients: 22, profFee: 5400, products: 120,  sst: 163, total: 5683, cash: 3200, card: 1200, fpx: 450,  ewallet: 280, atome: 100 },
  ];

  for (const l of ledgerDates) {
    const d = new Date(); d.setDate(d.getDate() - l.daysAgo); d.setHours(0,0,0,0);
    await prisma.dailyLedger.upsert({
      where: { clinicId_date: { clinicId: clinicA.id, date: d } },
      update: {},
      create: {
        clinicId: clinicA.id, date: d,
        patientCount: l.patients, professionalFee: l.profFee, productSales: l.products,
        sst: l.sst, totalSales: l.total, cashCurrent: l.cash, cashNext: 0,
        creditCard: l.card, fpx: l.fpx, ewallet: l.ewallet, atome: l.atome,
        panelCollections: {},
      },
    });
  }

  // ── Stock Items ───────────────────────────────────────────────────────
  const stockItems = [
    { id: "sku-001", sku: "CON-001", name: "Nitrile Gloves (M) Box 100",       category: "Consumables",  unit: "box"      },
    { id: "sku-002", sku: "MAT-014", name: "Composite Resin A2 4g",             category: "Materials",    unit: "syringe"  },
    { id: "sku-003", sku: "ANE-003", name: "Lignospan 2% Cartridge x50",        category: "Anaesthetic",  unit: "box"      },
    { id: "sku-004", sku: "EQP-007", name: "Saliva Ejectors Pack 100",          category: "Disposables",  unit: "pack"     },
    { id: "sku-005", sku: "MAT-021", name: "Alginate Impression Material 500g", category: "Materials",    unit: "tub"      },
    { id: "sku-006", sku: "CON-002", name: "Nitrile Gloves (L) Box 100",        category: "Consumables",  unit: "box"      },
    { id: "sku-007", sku: "MAT-031", name: "GIC Fuji IX 15g",                   category: "Materials",    unit: "capsule"  },
    { id: "sku-008", sku: "ANE-007", name: "Topical Anaesthetic 30g",           category: "Anaesthetic",  unit: "tube"     },
    { id: "sku-009", sku: "DIS-011", name: "Disposable Bib 500pcs",             category: "Disposables",  unit: "box"      },
    { id: "sku-010", sku: "MAT-045", name: "Zinc Oxide Eugenol Powder",         category: "Materials",    unit: "bottle"   },
    { id: "sku-011", sku: "EQP-012", name: "Suction Tips 100pcs",               category: "Disposables",  unit: "pack"     },
    { id: "sku-012", sku: "MAT-052", name: "Etch Gel 37% 5ml",                  category: "Materials",    unit: "syringe"  },
    { id: "sku-013", sku: "CON-008", name: "Surgical Mask Box 50",              category: "Consumables",  unit: "box"      },
    { id: "sku-014", sku: "ANE-009", name: "27G Dental Needle Short 100pcs",    category: "Anaesthetic",  unit: "box"      },
    { id: "sku-015", sku: "EQP-021", name: "Prophy Paste 200g",                 category: "Materials",    unit: "tub"      },
  ];
  for (const s of stockItems) {
    await prisma.stockItem.upsert({ where: { id: s.id }, update: {}, create: s });
  }

  // ── Clinic Stock Levels ───────────────────────────────────────────────
  // Clinic A (HQ) — some items low stock to trigger the warning banner
  const clinicAStock = [
    { itemId: "sku-001", quantity: 12, parLevel: 20 }, // LOW
    { itemId: "sku-002", quantity: 8,  parLevel: 10 }, // LOW
    { itemId: "sku-003", quantity: 15, parLevel: 12 }, // OK
    { itemId: "sku-004", quantity: 5,  parLevel: 15 }, // LOW
    { itemId: "sku-005", quantity: 3,  parLevel: 5  }, // LOW
    { itemId: "sku-006", quantity: 18, parLevel: 15 }, // OK
    { itemId: "sku-007", quantity: 40, parLevel: 30 }, // OK
    { itemId: "sku-008", quantity: 6,  parLevel: 10 }, // LOW
    { itemId: "sku-009", quantity: 4,  parLevel: 8  }, // LOW
    { itemId: "sku-010", quantity: 12, parLevel: 10 }, // OK
    { itemId: "sku-011", quantity: 10, parLevel: 10 }, // LOW (at par)
    { itemId: "sku-012", quantity: 20, parLevel: 15 }, // OK
    { itemId: "sku-013", quantity: 0,  parLevel: 10 }, // OUT OF STOCK
    { itemId: "sku-014", quantity: 8,  parLevel: 6  }, // OK
    { itemId: "sku-015", quantity: 3,  parLevel: 5  }, // LOW
  ];
  for (const cs of clinicAStock) {
    await prisma.clinicStock.upsert({
      where: { clinicId_itemId: { clinicId: clinicA.id, itemId: cs.itemId } },
      update: {},
      create: { clinicId: clinicA.id, ...cs },
    });
  }

  // Clinic B (PJ) — different stock levels
  const clinicBStock = [
    { itemId: "sku-001", quantity: 6,  parLevel: 10 }, // LOW
    { itemId: "sku-002", quantity: 12, parLevel: 10 }, // OK
    { itemId: "sku-003", quantity: 4,  parLevel: 8  }, // LOW
    { itemId: "sku-004", quantity: 20, parLevel: 15 }, // OK
    { itemId: "sku-006", quantity: 3,  parLevel: 10 }, // LOW
    { itemId: "sku-008", quantity: 8,  parLevel: 8  }, // LOW (at par)
    { itemId: "sku-009", quantity: 10, parLevel: 8  }, // OK
    { itemId: "sku-013", quantity: 5,  parLevel: 10 }, // LOW
    { itemId: "sku-014", quantity: 10, parLevel: 6  }, // OK
  ];
  for (const cs of clinicBStock) {
    await prisma.clinicStock.upsert({
      where: { clinicId_itemId: { clinicId: clinicB.id, itemId: cs.itemId } },
      update: {},
      create: { clinicId: clinicB.id, ...cs },
    });
  }

  // Clinic C (Subang) — newly opened, low stock across the board
  const clinicCStock = [
    { itemId: "sku-001", quantity: 2,  parLevel: 10 }, // LOW
    { itemId: "sku-003", quantity: 1,  parLevel: 8  }, // LOW
    { itemId: "sku-006", quantity: 0,  parLevel: 10 }, // OUT
    { itemId: "sku-009", quantity: 2,  parLevel: 8  }, // LOW
    { itemId: "sku-013", quantity: 0,  parLevel: 10 }, // OUT
  ];
  for (const cs of clinicCStock) {
    await prisma.clinicStock.upsert({
      where: { clinicId_itemId: { clinicId: clinicC.id, itemId: cs.itemId } },
      update: {},
      create: { clinicId: clinicC.id, ...cs },
    });
  }

  // ── Storekeeper & Manager links to all clinics ────────────────────────
  for (const clinicId of [clinicB.id, clinicC.id]) {
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId: storekeeper.id, clinicId } },
      update: {},
      create: { userId: storekeeper.id, clinicId },
    });
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId: manager.id, clinicId } },
      update: {},
      create: { userId: manager.id, clinicId },
    });
  }

  // ── Pool Orders ───────────────────────────────────────────────────────
  // Pool 1: OPEN — accepting participants, deadline in 3 days
  const deadline3days = new Date();
  deadline3days.setDate(deadline3days.getDate() + 3);

  const pool1 = await prisma.poolOrder.upsert({
    where: { id: "pool-001" },
    update: {},
    create: {
      id:                  "pool-001",
      poRef:               "PO-202606-001",
      initiatingClinicId:  clinicA.id,
      supplierName:        "DentSupply Sdn Bhd",
      deliveryMode:        "CENTRALISED",
      moqTarget:           2000,
      status:              "OPEN",
      deadline:            deadline3days,
      notes:               "Monthly consumables pool order. All branches please join by deadline.",
      raisedById:          manager.id,
    },
  });

  // Pool 1 lines (the master item list)
  const pool1Lines = [
    { id: "pl-001-1", poolId: pool1.id, itemId: "sku-001", totalQty: 30, unitCost: 28.50 },
    { id: "pl-001-2", poolId: pool1.id, itemId: "sku-003", totalQty: 20, unitCost: 45.00 },
    { id: "pl-001-3", poolId: pool1.id, itemId: "sku-006", totalQty: 20, unitCost: 28.50 },
    { id: "pl-001-4", poolId: pool1.id, itemId: "sku-013", totalQty: 40, unitCost: 12.00 },
  ];
  for (const l of pool1Lines) {
    await prisma.poolOrderLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // Pool 1 participants
  // Clinic A (initiator) — joined automatically
  const pool1ParticipantA = await prisma.poolParticipant.upsert({
    where: { poolId_clinicId: { poolId: pool1.id, clinicId: clinicA.id } },
    update: {},
    create: {
      id:              "pp-001-a",
      poolId:          pool1.id,
      clinicId:        clinicA.id,
      requestedAmount: 855,  // 10×28.50 + 8×45 + 5×28.50 + 5×12
      joinedById:      manager.id,
    },
  });
  const pool1LineA = [
    { id: "ppl-001-a-1", participantId: pool1ParticipantA.id, itemId: "sku-001", requestedQty: 10, unitCost: 28.50 },
    { id: "ppl-001-a-2", participantId: pool1ParticipantA.id, itemId: "sku-003", requestedQty: 8,  unitCost: 45.00 },
    { id: "ppl-001-a-3", participantId: pool1ParticipantA.id, itemId: "sku-006", requestedQty: 5,  unitCost: 28.50 },
    { id: "ppl-001-a-4", participantId: pool1ParticipantA.id, itemId: "sku-013", requestedQty: 5,  unitCost: 12.00 },
  ];
  for (const l of pool1LineA) {
    await prisma.poolParticipantLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // Clinic B — joined
  const pool1ParticipantB = await prisma.poolParticipant.upsert({
    where: { poolId_clinicId: { poolId: pool1.id, clinicId: clinicB.id } },
    update: {},
    create: {
      id:              "pp-001-b",
      poolId:          pool1.id,
      clinicId:        clinicB.id,
      requestedAmount: 712.50, // 15×28.50 + 5×45 + 5×12
      joinedById:      storekeeper.id,
    },
  });
  const pool1LineB = [
    { id: "ppl-001-b-1", participantId: pool1ParticipantB.id, itemId: "sku-001", requestedQty: 15, unitCost: 28.50 },
    { id: "ppl-001-b-2", participantId: pool1ParticipantB.id, itemId: "sku-003", requestedQty: 5,  unitCost: 45.00 },
    { id: "ppl-001-b-3", participantId: pool1ParticipantB.id, itemId: "sku-013", requestedQty: 5,  unitCost: 12.00 },
  ];
  for (const l of pool1LineB) {
    await prisma.poolParticipantLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // Pool 2: SUBMITTED — already sent to supplier
  const pool2 = await prisma.poolOrder.upsert({
    where: { id: "pool-002" },
    update: {},
    create: {
      id:                  "pool-002",
      poRef:               "PO-202605-003",
      initiatingClinicId:  clinicA.id,
      supplierName:        "MedDent Trading",
      deliveryMode:        "DIRECT",
      moqTarget:           1500,
      status:              "SUBMITTED",
      notes:               "Direct delivery — supplier will deliver to each clinic separately.",
      raisedById:          manager.id,
      approvedById:        manager.id,
      approvedAt:          new Date(Date.now() - 2 * 86400000),
    },
  });

  const pool2Lines = [
    { id: "pl-002-1", poolId: pool2.id, itemId: "sku-002", totalQty: 50, unitCost: 22.00 },
    { id: "pl-002-2", poolId: pool2.id, itemId: "sku-007", totalQty: 60, unitCost: 8.50  },
    { id: "pl-002-3", poolId: pool2.id, itemId: "sku-012", totalQty: 40, unitCost: 15.00 },
  ];
  for (const l of pool2Lines) {
    await prisma.poolOrderLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  const pool2ParticipantA = await prisma.poolParticipant.upsert({
    where: { poolId_clinicId: { poolId: pool2.id, clinicId: clinicA.id } },
    update: {},
    create: {
      id:              "pp-002-a",
      poolId:          pool2.id,
      clinicId:        clinicA.id,
      requestedAmount: 805, // 20×22 + 30×8.50 + 10×15
      joinedById:      manager.id,
    },
  });
  for (const l of [
    { id: "ppl-002-a-1", participantId: pool2ParticipantA.id, itemId: "sku-002", requestedQty: 20, unitCost: 22.00 },
    { id: "ppl-002-a-2", participantId: pool2ParticipantA.id, itemId: "sku-007", requestedQty: 30, unitCost: 8.50  },
    { id: "ppl-002-a-3", participantId: pool2ParticipantA.id, itemId: "sku-012", requestedQty: 10, unitCost: 15.00 },
  ]) {
    await prisma.poolParticipantLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  const pool2ParticipantC = await prisma.poolParticipant.upsert({
    where: { poolId_clinicId: { poolId: pool2.id, clinicId: clinicC.id } },
    update: {},
    create: {
      id:              "pp-002-c",
      poolId:          pool2.id,
      clinicId:        clinicC.id,
      requestedAmount: 727, // 15×22 + 22×8.50 + 10×15 (approx)
      joinedById:      storekeeper.id,
    },
  });
  for (const l of [
    { id: "ppl-002-c-1", participantId: pool2ParticipantC.id, itemId: "sku-002", requestedQty: 15, unitCost: 22.00 },
    { id: "ppl-002-c-2", participantId: pool2ParticipantC.id, itemId: "sku-007", requestedQty: 22, unitCost: 8.50  },
    { id: "ppl-002-c-3", participantId: pool2ParticipantC.id, itemId: "sku-012", requestedQty: 10, unitCost: 15.00 },
  ]) {
    await prisma.poolParticipantLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // ── Delivery Orders ───────────────────────────────────────────────────
  // DO 1: IN_TRANSIT — Clinic A dispatching to Clinic B
  const do1 = await prisma.deliveryOrder.upsert({
    where: { id: "do-001" },
    update: {},
    create: {
      id:          "do-001",
      doRef:       "DO-202606-001",
      fromClinicId: clinicA.id,
      toClinicId:   clinicB.id,
      status:      "IN_TRANSIT",
      notes:       "Urgent — Clinic B running out of gloves and masks.",
      raisedById:  storekeeper.id,
      approvedById: manager.id,
      approvedAt:  new Date(Date.now() - 1 * 86400000),
      dispatchedAt: new Date(Date.now() - 12 * 3600000),
    },
  });
  for (const l of [
    { id: "dol-001-1", doId: do1.id, itemId: "sku-001", quantity: 5, unitCost: 28.50 },
    { id: "dol-001-2", doId: do1.id, itemId: "sku-006", quantity: 5, unitCost: 28.50 },
    { id: "dol-001-3", doId: do1.id, itemId: "sku-013", quantity: 8, unitCost: 12.00 },
  ]) {
    await prisma.dOLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // DO 2: PENDING approval — Clinic C requesting from Clinic A
  const do2 = await prisma.deliveryOrder.upsert({
    where: { id: "do-002" },
    update: {},
    create: {
      id:          "do-002",
      doRef:       "DO-202606-002",
      fromClinicId: clinicA.id,
      toClinicId:   clinicC.id,
      status:      "PENDING",
      notes:       "Clinic C opening stock replenishment request.",
      raisedById:  storekeeper.id,
    },
  });
  for (const l of [
    { id: "dol-002-1", doId: do2.id, itemId: "sku-001", quantity: 8,  unitCost: 28.50 },
    { id: "dol-002-2", doId: do2.id, itemId: "sku-003", quantity: 7,  unitCost: 45.00 },
    { id: "dol-002-3", doId: do2.id, itemId: "sku-006", quantity: 10, unitCost: 28.50 },
    { id: "dol-002-4", doId: do2.id, itemId: "sku-013", quantity: 10, unitCost: 12.00 },
  ]) {
    await prisma.dOLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // DO 3: RECEIVED — completed transfer, Clinic A → Clinic B last week
  const do3 = await prisma.deliveryOrder.upsert({
    where: { id: "do-003" },
    update: {},
    create: {
      id:          "do-003",
      doRef:       "DO-202605-008",
      fromClinicId: clinicA.id,
      toClinicId:   clinicB.id,
      status:      "RECEIVED",
      raisedById:  storekeeper.id,
      approvedById: manager.id,
      approvedAt:  new Date(Date.now() - 8 * 86400000),
      dispatchedAt: new Date(Date.now() - 7 * 86400000),
      receivedAt:  new Date(Date.now() - 6 * 86400000),
    },
  });
  for (const l of [
    { id: "dol-003-1", doId: do3.id, itemId: "sku-002", quantity: 10, receivedQty: 10, unitCost: 22.00 },
    { id: "dol-003-2", doId: do3.id, itemId: "sku-007", quantity: 20, receivedQty: 18, unitCost: 8.50  }, // discrepancy — 2 short
    { id: "dol-003-3", doId: do3.id, itemId: "sku-015", quantity: 3,  receivedQty: 3,  unitCost: 35.00 },
  ]) {
    await prisma.dOLine.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // ── Staff Commission ──────────────────────────────────────────────────
  const receptionistProfile = await prisma.staffProfile.findUnique({ where: { userId: receptionist.id } });
  const nurseProfile = await prisma.staffProfile.findUnique({ where: { userId: nurse.id } });

  if (receptionistProfile) {
    await prisma.staffCommission.upsert({
      where: { id: "sc-receptionist-may" },
      update: {},
      create: {
        id: "sc-receptionist-may",
        staffProfileId: receptionistProfile.id,
        month: "2026-05",
        totalSales: 18000,
        grossCommission: 720,
        attendedDays: 20,
        totalWorkDays: 26,
        proRatedComm: 554,
        forfeited: false,
        status: "DRAFT",
      },
    });
  }

  if (nurseProfile) {
    await prisma.staffCommission.upsert({
      where: { id: "sc-nurse-may" },
      update: {},
      create: {
        id: "sc-nurse-may",
        staffProfileId: nurseProfile.id,
        month: "2026-05",
        totalSales: 28500,
        grossCommission: 1140,
        attendedDays: 26,
        totalWorkDays: 26,
        proRatedComm: 1140,
        forfeited: false,
        status: "DRAFT",
      },
    });
  }

  // ── LocumEngagements — gives Dr. Hafiz a guaranteed floor each month ────
  for (const [mo, sessions, floor] of [
    ["2026-05", 10, 5000],
    ["2026-04",  8, 4000],
    ["2026-06",  9, 4500],
  ] as const) {
    const exists = await prisma.locumEngagement.findFirst({
      where: { doctorProfileId: doctorHafizProfile.id, month: mo },
    });
    if (!exists) {
      await prisma.locumEngagement.create({
        data: { doctorProfileId: doctorHafizProfile.id, clinicId: clinicA.id, month: mo, sessionsWorked: sessions, guaranteedFloor: floor },
      });
    }
  }

  // ── Treatments for Dr. Raj (PURE_SALARIED demo) ───────────────────────
  // Visit + treatments in May 2026 so the payroll calc has data to show
  const rajPatient = await prisma.patient.findUnique({ where: { id: "pat-3" } }); // Sarah Muthu
  if (rajPatient) {
    const rajVisit = await prisma.visit.upsert({
      where: { id: "visit-raj-1" },
      update: {},
      create: { id: "visit-raj-1", visitRef: "V-RAJ-001", patientId: "pat-3", clinicId: clinicA.id, visitDate: new Date("2026-05-07") },
    });
    const existingRajTx = await prisma.treatment.findFirst({ where: { visitId: rajVisit.id } });
    if (!existingRajTx) {
      await prisma.treatment.create({
        data: { visitId: rajVisit.id, treatmentTypeId: "tx-scaling", billedAmount: 120, collectedAmount: 120, doctorId: doctorRajProfile.id, doctorSplit: 100, labFee: 0, sst: 0 },
      });
      await prisma.treatment.create({
        data: { visitId: rajVisit.id, treatmentTypeId: "tx-filling",  billedAmount: 180, collectedAmount: 180, doctorId: doctorRajProfile.id, doctorSplit: 100, labFee: 0, sst: 0 },
      });
    }
    // OPG ancillary — earns flat RM20 bonus
    const rajVisit2 = await prisma.visit.upsert({
      where: { id: "visit-raj-2" },
      update: {},
      create: { id: "visit-raj-2", visitRef: "V-RAJ-002", patientId: "pat-1", clinicId: clinicA.id, visitDate: new Date("2026-05-14") },
    });
    const existingRajTx2 = await prisma.treatment.findFirst({ where: { visitId: rajVisit2.id } });
    if (!existingRajTx2) {
      // Upsert OPG treatment type first (not in seed yet)
      await prisma.treatmentType.upsert({
        where: { id: "tx-opg" },
        update: {},
        create: { id: "tx-opg", code: "OPG", name: "OPG X-Ray", defaultPrice: 120, sstApplicable: false },
      });
      await prisma.treatment.create({
        data: { visitId: rajVisit2.id, treatmentTypeId: "tx-opg", billedAmount: 120, collectedAmount: 120, doctorId: doctorRajProfile.id, doctorSplit: 100, labFee: 0, sst: 0 },
      });
    }
  }

  // ── Locum Reconciliation Statements ──────────────────────────────────
  // Build two realistic statements for Dr. Hafiz (LOCUM) for 2026-05 and 2026-04

  const d = (v: number | string) => new Decimal(v);

  // May 2026 — full clinical slip with all bucket types
  const mayTreatments: RawTreatmentInput[] = [
    // STANDARD daily collections
    { id: "lt-s1", visitDate: new Date("2026-05-02"), patientName: "Amirah Binti Zulkifli", typeCode: "SCALING",  billedAmount: d(120),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-s2", visitDate: new Date("2026-05-02"), patientName: "James Lim Wei Keat",    typeCode: "FILLING",   billedAmount: d(180),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-s3", visitDate: new Date("2026-05-05"), patientName: "David Tan Ah Kow",      typeCode: "EXTRACT",   billedAmount: d(80),   labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-s4", visitDate: new Date("2026-05-05"), patientName: "Nurul Ain Hassan",      typeCode: "CONSULT",   billedAmount: d(50),   labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-s5", visitDate: new Date("2026-05-09"), patientName: "Tan Mei Ling",          typeCode: "SCALING",   billedAmount: d(120),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-s6", visitDate: new Date("2026-05-12"), patientName: "Mohd Farid Ismail",     typeCode: "FILLING",   billedAmount: d(180),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-s7", visitDate: new Date("2026-05-12"), patientName: "Sarah Muthu",           typeCode: "CONSULT",   billedAmount: d(50),   labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    // ENDO cases
    { id: "lt-e1", visitDate: new Date("2026-05-06"), patientName: "Ahmad bin Rosli",       typeCode: "RCT",       billedAmount: d(1500), labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "16", paidLocum: d(0) },
    { id: "lt-e2", visitDate: new Date("2026-05-14"), patientName: "Lim Ah Kow",            typeCode: "RCT",       billedAmount: d(1200), labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "26", paidLocum: d(0) },
    // DENTURE / BRIDGE / CROWN
    { id: "lt-d1", visitDate: new Date("2026-05-08"), patientName: "Rajan s/o Munusamy",   typeCode: "CROWN",     billedAmount: d(3500), labFee: d(800),  sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-d2", visitDate: new Date("2026-05-16"), patientName: "Fatimah binti Kadir",  typeCode: "ZIRCONIA",  billedAmount: d(2800), labFee: d(600),  sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    // ALIGNER
    { id: "lt-a1", visitDate: new Date("2026-05-10"), patientName: "Siti Nurhaliza",        typeCode: "ALIGNER",   billedAmount: d(8000), labFee: d(2000), sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(1000) },
    // ANCILLARIES
    { id: "lt-x1", visitDate: new Date("2026-05-04"), patientName: "Amirah Binti Zulkifli",typeCode: "OPG",        billedAmount: d(120),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-x2", visitDate: new Date("2026-05-04"), patientName: "Ahmad bin Rosli",       typeCode: "LATERALXRAY",billedAmount: d(60),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-x3", visitDate: new Date("2026-05-20"), patientName: "Tan Mei Ling",          typeCode: "EMS",        billedAmount: d(200),  labFee: d(0),    sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
  ];
  const mayDeductions: DeductionItem[] = [
    { description: "DEDUCT ADDITIONAL ALIGNER", patientName: "Siti Nurhaliza", amount: d(500) },
  ];
  const mayPayload = buildPayload(doctorHafizProfile.id, "2026-05", d(42), mayTreatments, mayDeductions);

  await (prisma as any).locumReconciliationStatement.upsert({
    where:  { doctorId_month: { doctorId: doctorHafizProfile.id, month: "2026-05" } },
    update: {
      splitRate:   42,
      payload:     serialisePayload(mayPayload),
      finalPayout: mayPayload.summary.finalPayout.toNumber(),
      status:      "DRAFT",
    },
    create: {
      doctorId:    doctorHafizProfile.id,
      month:       "2026-05",
      splitRate:   42,
      payload:     serialisePayload(mayPayload),
      finalPayout: mayPayload.summary.finalPayout.toNumber(),
      status:      "DRAFT",
    },
  });

  // April 2026 — simpler slip, already APPROVED
  const aprTreatments: RawTreatmentInput[] = [
    { id: "lt-apr-s1", visitDate: new Date("2026-04-03"), patientName: "James Lim Wei Keat",  typeCode: "SCALING",  billedAmount: d(120),  labFee: d(0),   sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-apr-s2", visitDate: new Date("2026-04-03"), patientName: "Sarah Muthu",         typeCode: "FILLING",  billedAmount: d(180),  labFee: d(0),   sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-apr-s3", visitDate: new Date("2026-04-10"), patientName: "Nurul Ain Hassan",    typeCode: "EXTRACT",  billedAmount: d(80),   labFee: d(0),   sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-apr-e1", visitDate: new Date("2026-04-07"), patientName: "Mohd Farid Ismail",   typeCode: "RCT",      billedAmount: d(1200), labFee: d(0),   sst: d(0), doctorSplit: d(100), toothCodes: "36", paidLocum: d(0) },
    { id: "lt-apr-d1", visitDate: new Date("2026-04-14"), patientName: "David Tan Ah Kow",    typeCode: "CROWN",    billedAmount: d(1800), labFee: d(400), sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
    { id: "lt-apr-x1", visitDate: new Date("2026-04-03"), patientName: "James Lim Wei Keat",  typeCode: "OPG",      billedAmount: d(120),  labFee: d(0),   sst: d(0), doctorSplit: d(100), toothCodes: "", paidLocum: d(0) },
  ];
  const aprPayload = buildPayload(doctorHafizProfile.id, "2026-04", d(42), aprTreatments, []);

  await (prisma as any).locumReconciliationStatement.upsert({
    where:  { doctorId_month: { doctorId: doctorHafizProfile.id, month: "2026-04" } },
    update: {
      splitRate:   42,
      payload:     serialisePayload(aprPayload),
      finalPayout: aprPayload.summary.finalPayout.toNumber(),
      status:      "APPROVED",
    },
    create: {
      doctorId:    doctorHafizProfile.id,
      month:       "2026-04",
      splitRate:   42,
      payload:     serialisePayload(aprPayload),
      finalPayout: aprPayload.summary.finalPayout.toNumber(),
      status:      "APPROVED",
    },
  });

  // ── RoleModuleConfig — action-based permissions ───────────────────────
  const ROLE_MODULE_ACTIONS: Record<string, Record<string, string[]>> = {
    FINANCE: {
      dashboard:    ["view"],
      invoices:     ["view", "export"],
      daily_ledger: ["view", "create", "edit", "export"],
      commissions:  ["view", "approve", "export"],
      cash_banking: ["view", "create", "edit", "export"],
      reports:      ["view", "export"],
      patients:     ["view"],
      settings:     ["view", "edit"],
      appointments: [], dental_chart: [], treatments: [],
      staff: [], leave: [], schedule: [], inventory: [], lab: [],
    },
    CLINIC_MANAGER: {
      dashboard:    ["view"],
      appointments: ["view", "create", "edit", "delete"],
      patients:     ["view", "create", "edit", "delete", "export"],
      dental_chart: ["view", "create", "edit"],
      treatments:   ["view", "create", "edit", "delete"],
      invoices:     ["view", "create", "edit", "delete", "export"],
      daily_ledger: ["view", "create", "edit", "export"],
      commissions:  ["view", "approve", "export"],
      staff:        ["view", "create", "edit", "delete"],
      leave:        ["view", "approve", "delete"],
      schedule:     ["view", "create", "edit", "delete"],
      inventory:    ["view", "create", "edit", "delete", "export"],
      lab:          ["view", "create", "edit", "delete"],
      reports:      ["view", "export"],
      cash_banking: ["view", "create", "edit", "export"],
      settings:     [],
    },
    DOCTOR: {
      dashboard:    ["view"],
      appointments: ["view"],
      patients:     ["view", "create", "edit"],
      dental_chart: ["view", "create", "edit"],
      treatments:   ["view", "create", "edit"],
      lab:          ["view", "create", "edit"],
      leave:        ["view", "create"],
      schedule:     ["view"],
      invoices: [], daily_ledger: [], commissions: [], staff: [],
      reports: [], cash_banking: [], inventory: [], settings: [],
    },
    NURSE: {
      dashboard:    ["view"],
      appointments: ["view"],
      patients:     ["view", "create", "edit"],
      dental_chart: ["view", "create", "edit"],
      treatments:   ["view", "create", "edit"],
      lab:          ["view"],
      schedule:     ["view"],
      invoices: [], daily_ledger: [], commissions: [], staff: [],
      leave: [], reports: [], cash_banking: [], inventory: [], settings: [],
    },
    RECEPTIONIST: {
      dashboard:    ["view"],
      appointments: ["view", "create", "edit", "delete"],
      patients:     ["view", "create", "edit"],
      invoices:     ["view", "create"],
      schedule:     ["view"],
      dental_chart: [], treatments: [], daily_ledger: [], commissions: [],
      staff: [], leave: [], reports: [], cash_banking: [], inventory: [], lab: [], settings: [],
    },
    STOREKEEPER: {
      dashboard:    ["view"],
      inventory:    ["view", "create", "edit", "delete", "export"],
      leave:        ["view", "create"],
      appointments: [], patients: [], dental_chart: [], treatments: [],
      invoices: [], daily_ledger: [], commissions: [], staff: [],
      schedule: [], reports: [], cash_banking: [], lab: [], settings: [],
    },
  };

  const ALL_MODULES = ["dashboard","appointments","patients","dental_chart","treatments","invoices","daily_ledger","commissions","staff","leave","schedule","inventory","lab","reports","cash_banking","settings"] as const;

  for (const [role, modules] of Object.entries(ROLE_MODULE_ACTIONS)) {
    for (const mod of ALL_MODULES) {
      const actions = modules[mod] ?? [];
      await prisma.roleModuleConfig.upsert({
        where:  { role_module: { role, module: mod } },
        update: { actions: JSON.stringify(actions) },
        create: { role, module: mod, actions: JSON.stringify(actions) },
      });
    }
  }

  // ── Patient Sources ───────────────────────────────────────────────────
  const sources = [
    { name: "Walk-in",        order: 1 },
    { name: "Google Ads",     order: 2 },
    { name: "Facebook Ads",   order: 3 },
    { name: "Referral",       order: 4 },
    { name: "Instagram",      order: 5 },
    { name: "Website",        order: 6 },
    { name: "Flyer / Poster", order: 7 },
    { name: "Other",          order: 8 },
  ];
  for (const s of sources) {
    const existing = await prisma.patientSource.findFirst({ where: { name: s.name } });
    if (!existing) await prisma.patientSource.create({ data: s });
  }

  // ── Referral Commission Config ────────────────────────────────────────
  const referralConfigs = [
    { referralType: "PATIENT"         as const, commissionType: "FLAT"       as const, rate: 50 },
    { referralType: "INTERNAL_DOCTOR" as const, commissionType: "PERCENTAGE" as const, rate: 5 },
    { referralType: "INTERNAL_CLINIC" as const, commissionType: "PERCENTAGE" as const, rate: 5 },
    { referralType: "EXTERNAL"        as const, commissionType: "FLAT"       as const, rate: 30 },
  ];
  for (const c of referralConfigs) {
    await prisma.referralCommissionConfig.upsert({
      where:  { referralType: c.referralType },
      update: {},
      create: c,
    });
  }

  // ── Shift Templates (per clinic) ──────────────────────────────────────
  const shiftDefs = [
    { name: "Morning",  shiftType: "MORNING"  as const, startTime: "08:00", endTime: "14:00", breakMins: 30, isDefault: true,  order: 1 },
    { name: "Evening",  shiftType: "EVENING"  as const, startTime: "14:00", endTime: "20:00", breakMins: 30, isDefault: false, order: 2 },
    { name: "Night",    shiftType: "NIGHT"    as const, startTime: "20:00", endTime: "24:00", breakMins: 30, isDefault: false, order: 3 },
    { name: "Full Day", shiftType: "FULL_DAY" as const, startTime: "08:00", endTime: "20:00", breakMins: 60, isDefault: false, order: 4 },
  ];
  for (const clinic of [clinicA, clinicB, clinicC]) {
    for (const s of shiftDefs) {
      const exists = await prisma.shiftTemplate.findFirst({ where: { clinicId: clinic.id, name: s.name } });
      if (!exists) await prisma.shiftTemplate.create({ data: { ...s, clinicId: clinic.id } });
    }
  }

  // ── License Types ─────────────────────────────────────────────────
  const licenseTypeSeed = [
    { id: "lt-phfsa",    name: "Private Healthcare Facility License", code: "PHFSA",    scope: "CLINIC", issuingBody: "KKM (Ministry of Health)",       order: 1 },
    { id: "lt-premise",  name: "Premise License",                     code: "PREMISE",  scope: "CLINIC", issuingBody: "Local Council",                   order: 2 },
    { id: "lt-aelb",     name: "Radiology/X-ray License",             code: "AELB",     scope: "CLINIC", issuingBody: "Atomic Energy Licensing Board",    order: 3 },
    { id: "lt-biz",      name: "Business License",                    code: "BIZ",      scope: "CLINIC", issuingBody: "Local Council",                   order: 4 },
    { id: "lt-bomba",    name: "Fire Certificate",                    code: "BOMBA",    scope: "CLINIC", issuingBody: "Fire & Rescue Department",         order: 5 },
    { id: "lt-sign",     name: "Signboard License",                   code: "SIGN",     scope: "CLINIC", issuingBody: "Local Council",                   order: 6 },
    { id: "lt-apc",      name: "Annual Practising Certificate",       code: "APC",      scope: "DOCTOR", issuingBody: "Malaysian Dental Council",         order: 7 },
    { id: "lt-mdc",      name: "MDC Registration",                    code: "MDC",      scope: "DOCTOR", issuingBody: "Malaysian Dental Council",         order: 8 },
    { id: "lt-indemnity",name: "Professional Indemnity Insurance",    code: "INDEMNITY",scope: "DOCTOR", issuingBody: "Insurance Provider",               order: 9 },
  ] as const;

  for (const lt of licenseTypeSeed) {
    await (prisma as any).licenseType.upsert({
      where: { id: lt.id },
      update: {},
      create: lt,
    });
  }

  // ── Settlement Banks / Acquirers ──────────────────────────────────
  const bankSeed = [
    { id: "bank-maybank", name: "Maybank",              settlementDays: 2  },
    { id: "bank-cimb",    name: "CIMB Bank",            settlementDays: 2  },
    { id: "bank-pbb",     name: "Public Bank",          settlementDays: 3  },
    { id: "bank-rhb",     name: "RHB Bank",             settlementDays: 2  },
    { id: "bank-fpx",     name: "FPX (Online Banking)", settlementDays: 1  },
    { id: "bank-tng",     name: "Touch 'n Go eWallet",  settlementDays: 1  },
    { id: "bank-grabpay", name: "GrabPay",              settlementDays: 2  },
    { id: "bank-atome",   name: "Atome",                settlementDays: 14 },
    { id: "bank-cash",    name: "Cash Deposit",         settlementDays: 0  },
  ];
  for (const b of bankSeed) {
    await (prisma as any).settlementBank.upsert({ where: { id: b.id }, update: {}, create: b });
  }

  // ── Treatment Stage Templates ──────────────────────────────────────
  const stageTemplates = [
    // Root Canal Treatment
    { id:"tst-rct-1", treatmentTypeId:"tx-rct",     order:1,  name:"Access Opening & Pulp Removal",      description:"Anaesthesia, access cavity preparation, pulp chamber removal",  defaultCost:150,  estimatedDays:7   },
    { id:"tst-rct-2", treatmentTypeId:"tx-rct",     order:2,  name:"Cleaning & Shaping (BMP)",           description:"Biomechanical preparation, irrigation, and canal measurement",   defaultCost:200,  estimatedDays:7   },
    { id:"tst-rct-3", treatmentTypeId:"tx-rct",     order:3,  name:"Obturation (Canal Filling)",          description:"Gutta-percha obturation and temporary restoration",              defaultCost:200,  estimatedDays:14  },
    { id:"tst-rct-4", treatmentTypeId:"tx-rct",     order:4,  name:"Post & Core Build-Up",                description:"Post placement and core build-up prior to crown",                defaultCost:250,  estimatedDays:7   },
    { id:"tst-rct-5", treatmentTypeId:"tx-rct",     order:5,  name:"Crown Cementation",                   description:"Permanent crown fitting and cementation",                        defaultCost:600,  estimatedDays:null },
    // Implant
    { id:"tst-imp-1", treatmentTypeId:"tx-implant", order:1,  name:"Consultation & Assessment",           description:"Clinical exam, OPG/CBCT review, treatment planning",             defaultCost:100,  estimatedDays:7   },
    { id:"tst-imp-2", treatmentTypeId:"tx-implant", order:2,  name:"Implant Placement (Surgery)",         description:"Surgical placement of titanium implant fixture",                 defaultCost:2500, estimatedDays:90  },
    { id:"tst-imp-3", treatmentTypeId:"tx-implant", order:3,  name:"Osseointegration Review",             description:"3-month review to confirm osseointegration, take impressions",   defaultCost:100,  estimatedDays:14  },
    { id:"tst-imp-4", treatmentTypeId:"tx-implant", order:4,  name:"Abutment Placement",                  description:"Abutment connection and soft-tissue contouring",                 defaultCost:500,  estimatedDays:14  },
    { id:"tst-imp-5", treatmentTypeId:"tx-implant", order:5,  name:"Crown Delivery",                      description:"Final implant crown fitting and occlusion check",                defaultCost:1200, estimatedDays:null },
    // Braces
    { id:"tst-brc-1",  treatmentTypeId:"tx-braces", order:1,  name:"Records & Study Models",              description:"Clinical photos, X-rays (OPG/Ceph), dental impressions",        defaultCost:200,  estimatedDays:14  },
    { id:"tst-brc-2",  treatmentTypeId:"tx-braces", order:2,  name:"Banding / Bonding",                   description:"Bracket bonding or band placement, archwire insertion",          defaultCost:1500, estimatedDays:28  },
    { id:"tst-brc-3",  treatmentTypeId:"tx-braces", order:3,  name:"Monthly Adjustment #1",               description:"Wire change, tooth movement check",                              defaultCost:80,   estimatedDays:28  },
    { id:"tst-brc-4",  treatmentTypeId:"tx-braces", order:4,  name:"Monthly Adjustment #2",               description:"Wire change and progress review",                                defaultCost:80,   estimatedDays:28  },
    { id:"tst-brc-5",  treatmentTypeId:"tx-braces", order:5,  name:"Monthly Adjustment #3",               description:"Wire change and progress review",                                defaultCost:80,   estimatedDays:28  },
    { id:"tst-brc-6",  treatmentTypeId:"tx-braces", order:6,  name:"Monthly Adjustment #4",               description:"Wire change and progress review",                                defaultCost:80,   estimatedDays:28  },
    { id:"tst-brc-7",  treatmentTypeId:"tx-braces", order:7,  name:"Monthly Adjustment #5",               description:"Wire change and progress review",                                defaultCost:80,   estimatedDays:28  },
    { id:"tst-brc-8",  treatmentTypeId:"tx-braces", order:8,  name:"Monthly Adjustment #6",               description:"Wire change and progress review",                                defaultCost:80,   estimatedDays:28  },
    { id:"tst-brc-9",  treatmentTypeId:"tx-braces", order:9,  name:"De-banding",                          description:"Bracket removal, polishing, retainer impressions",               defaultCost:200,  estimatedDays:14  },
    { id:"tst-brc-10", treatmentTypeId:"tx-braces", order:10, name:"Retainer Delivery",                   description:"Upper and lower retainer fitting and patient instruction",        defaultCost:300,  estimatedDays:null },
    // Crown
    { id:"tst-crn-1", treatmentTypeId:"tx-crown",   order:1,  name:"Tooth Preparation & Impression",      description:"Tooth reduction, temporary crown, final impression sent to lab",  defaultCost:300,  estimatedDays:10  },
    { id:"tst-crn-2", treatmentTypeId:"tx-crown",   order:2,  name:"Crown Try-In",                        description:"Check fit, shade, and occlusion; adjust if needed",              defaultCost:0,    estimatedDays:7   },
    { id:"tst-crn-3", treatmentTypeId:"tx-crown",   order:3,  name:"Crown Cementation",                   description:"Final cementation and occlusion check",                          defaultCost:600,  estimatedDays:null },
    // Veneer
    { id:"tst-ven-1", treatmentTypeId:"tx-veneer",  order:1,  name:"Consultation & Shade Selection",      description:"Digital smile design, shade matching, prep discussion",          defaultCost:100,  estimatedDays:7   },
    { id:"tst-ven-2", treatmentTypeId:"tx-veneer",  order:2,  name:"Tooth Preparation & Impression",      description:"Minimal enamel reduction, impression, temporaries placed",       defaultCost:400,  estimatedDays:10  },
    { id:"tst-ven-3", treatmentTypeId:"tx-veneer",  order:3,  name:"Veneer Try-In",                       description:"Check translucency, shade, contour; approve with patient",       defaultCost:0,    estimatedDays:7   },
    { id:"tst-ven-4", treatmentTypeId:"tx-veneer",  order:4,  name:"Veneer Bonding",                      description:"Acid etch, silane, resin bonding, occlusion check",              defaultCost:900,  estimatedDays:null },
    // Scaling
    { id:"tst-scl-1", treatmentTypeId:"tx-scaling", order:1,  name:"Full-Mouth Scaling & Polishing",      description:"Supragingival scaling, subgingival debridement, AIR polish",     defaultCost:120,  estimatedDays:21  },
    { id:"tst-scl-2", treatmentTypeId:"tx-scaling", order:2,  name:"Periodontal Review",                  description:"Pocket depth check, plaque score, oral hygiene reinforcement",   defaultCost:50,   estimatedDays:null },
  ] as const;

  for (const t of stageTemplates) {
    await (prisma as any).treatmentStageTemplate.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    });
  }

  // ── Upcoming Appointments & Treatment Plans ───────────────────────────

  function nextDate(daysFromNow: number, hourMYT: number, minMYT = 0): Date {
    const base = new Date();
    base.setDate(base.getDate() + daysFromNow);
    const dateStr = base.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    return new Date(`${dateStr}T${String(hourMYT).padStart(2, "0")}:${String(minMYT).padStart(2, "0")}:00+08:00`);
  }

  const acceptedAt14 = new Date(); acceptedAt14.setDate(acceptedAt14.getDate() - 14);
  const acceptedAt10 = new Date(); acceptedAt10.setDate(acceptedAt10.getDate() - 10);
  const acceptedAt120 = new Date(); acceptedAt120.setDate(acceptedAt120.getDate() - 120);
  const acceptedAt2 = new Date(); acceptedAt2.setDate(acceptedAt2.getDate() - 2);
  const completedAt14 = new Date(); completedAt14.setDate(completedAt14.getDate() - 14);
  const completedAt10 = new Date(); completedAt10.setDate(completedAt10.getDate() - 10);
  const completedAt120 = new Date(); completedAt120.setDate(completedAt120.getDate() - 120);
  const completedAt90 = new Date(); completedAt90.setDate(completedAt90.getDate() - 90);

  // Treatment Plans
  const plan1 = await prisma.treatmentPlan.upsert({
    where: { planRef: "TP-2026-001" },
    update: {},
    create: {
      planRef: "TP-2026-001",
      patientId: "pat-1",
      clinicId: clinicA.id,
      dentistId: doctorHafiz.id,
      title: "Root Canal Treatment — Tooth 16",
      status: "IN_PROGRESS",
      toothCodes: ["16"],
      subtotal: 1200,
      totalAmount: 1200,
      depositRequired: 300,
      totalPaid: 300,
      acceptedAt: acceptedAt14,
    },
  });

  const plan2 = await prisma.treatmentPlan.upsert({
    where: { planRef: "TP-2026-002" },
    update: {},
    create: {
      planRef: "TP-2026-002",
      patientId: "pat-2",
      clinicId: clinicA.id,
      dentistId: doctorHafiz.id,
      title: "Porcelain Crown — Tooth 26",
      status: "IN_PROGRESS",
      toothCodes: ["26"],
      subtotal: 1800,
      totalAmount: 1800,
      depositRequired: 500,
      totalPaid: 1800,
      acceptedAt: acceptedAt10,
    },
  });

  const plan3 = await prisma.treatmentPlan.upsert({
    where: { planRef: "TP-2026-003" },
    update: {},
    create: {
      planRef: "TP-2026-003",
      patientId: "pat-4",
      clinicId: clinicA.id,
      dentistId: doctorPriya.id,
      title: "Single Implant — Tooth 46",
      status: "IN_PROGRESS",
      toothCodes: ["46"],
      subtotal: 4500,
      totalAmount: 4500,
      depositRequired: 1000,
      totalPaid: 3000,
      paymentMode: "PAY_PER_STAGE",
      acceptedAt: acceptedAt120,
    },
  });

  const plan4 = await prisma.treatmentPlan.upsert({
    where: { planRef: "TP-2026-004" },
    update: {},
    create: {
      planRef: "TP-2026-004",
      patientId: "pat-5",
      clinicId: clinicA.id,
      dentistId: doctorHafiz.id,
      title: "Orthodontic Braces Treatment",
      status: "ACCEPTED",
      toothCodes: [],
      subtotal: 5500,
      totalAmount: 5500,
      depositRequired: 1000,
      totalPaid: 1000,
      acceptedAt: acceptedAt2,
    },
  });

  // Treatment Stages
  const stagesData = [
    // Plan 1 — RCT
    { id: "ts-1-1", planId: plan1.id, templateId: "tst-rct-1", name: "Access Opening & Pulp Removal",  order: 1, status: "COMPLETED" as const, cost: 150, completedAt: completedAt14 },
    { id: "ts-1-2", planId: plan1.id, templateId: "tst-rct-2", name: "Cleaning & Shaping (BMP)",        order: 2, status: "IN_PROGRESS" as const, cost: 200, completedAt: null },
    { id: "ts-1-3", planId: plan1.id, templateId: "tst-rct-3", name: "Obturation (Canal Filling)",      order: 3, status: "PENDING" as const, cost: 200, completedAt: null },
    { id: "ts-1-4", planId: plan1.id, templateId: "tst-rct-4", name: "Post & Core Build-Up",            order: 4, status: "PENDING" as const, cost: 250, completedAt: null },
    { id: "ts-1-5", planId: plan1.id, templateId: "tst-rct-5", name: "Crown Cementation",               order: 5, status: "PENDING" as const, cost: 600, completedAt: null },
    // Plan 2 — Crown
    { id: "ts-2-1", planId: plan2.id, templateId: "tst-crn-1", name: "Tooth Preparation & Impression",  order: 1, status: "COMPLETED" as const, cost: 300, completedAt: completedAt10 },
    { id: "ts-2-2", planId: plan2.id, templateId: "tst-crn-2", name: "Crown Try-In",                    order: 2, status: "IN_PROGRESS" as const, cost: 0,   completedAt: null },
    { id: "ts-2-3", planId: plan2.id, templateId: "tst-crn-3", name: "Crown Cementation",               order: 3, status: "PENDING" as const, cost: 600, completedAt: null },
    // Plan 3 — Implant
    { id: "ts-3-1", planId: plan3.id, templateId: "tst-imp-1", name: "Consultation & Assessment",        order: 1, status: "COMPLETED" as const, cost: 100,  completedAt: completedAt120 },
    { id: "ts-3-2", planId: plan3.id, templateId: "tst-imp-2", name: "Implant Placement (Surgery)",      order: 2, status: "COMPLETED" as const, cost: 2500, completedAt: completedAt90 },
    { id: "ts-3-3", planId: plan3.id, templateId: "tst-imp-3", name: "Osseointegration Review",          order: 3, status: "IN_PROGRESS" as const, cost: 100,  completedAt: null },
    { id: "ts-3-4", planId: plan3.id, templateId: "tst-imp-4", name: "Abutment Placement",               order: 4, status: "PENDING" as const, cost: 500,  completedAt: null },
    { id: "ts-3-5", planId: plan3.id, templateId: "tst-imp-5", name: "Crown Delivery",                   order: 5, status: "PENDING" as const, cost: 1200, completedAt: null },
    // Plan 4 — Braces
    { id: "ts-4-1", planId: plan4.id, templateId: "tst-brc-1", name: "Records & Study Models",           order: 1, status: "PENDING" as const, cost: 200,  completedAt: null },
    { id: "ts-4-2", planId: plan4.id, templateId: "tst-brc-2", name: "Banding / Bonding",                order: 2, status: "PENDING" as const, cost: 1500, completedAt: null },
    { id: "ts-4-3", planId: plan4.id, templateId: "tst-brc-3", name: "Monthly Adjustment #1",            order: 3, status: "PENDING" as const, cost: 80,   completedAt: null },
    { id: "ts-4-4", planId: plan4.id, templateId: "tst-brc-4", name: "Monthly Adjustment #2",            order: 4, status: "PENDING" as const, cost: 80,   completedAt: null },
    { id: "ts-4-5", planId: plan4.id, templateId: "tst-brc-5", name: "Monthly Adjustment #3",            order: 5, status: "PENDING" as const, cost: 80,   completedAt: null },
    { id: "ts-4-6", planId: plan4.id, templateId: "tst-brc-6", name: "Monthly Adjustment #4",            order: 6, status: "PENDING" as const, cost: 80,   completedAt: null },
    { id: "ts-4-7", planId: plan4.id, templateId: "tst-brc-7", name: "Monthly Adjustment #5",            order: 7, status: "PENDING" as const, cost: 80,   completedAt: null },
    { id: "ts-4-8", planId: plan4.id, templateId: "tst-brc-9", name: "De-banding",                       order: 8, status: "PENDING" as const, cost: 200,  completedAt: null },
    { id: "ts-4-9", planId: plan4.id, templateId: "tst-brc-10", name: "Retainer Delivery",               order: 9, status: "PENDING" as const, cost: 300,  completedAt: null },
  ];

  for (const s of stagesData) {
    await prisma.treatmentStage.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        planId: s.planId,
        templateId: s.templateId,
        name: s.name,
        order: s.order,
        status: s.status,
        cost: s.cost,
        ...(s.completedAt ? { completedAt: s.completedAt } : {}),
      },
    });
  }

  // Upcoming Appointments
  const appointmentsData = [
    { id: "appt-001", apptRef: "APPT-001", patientId: "pat-1", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(1, 9),     duration: 60, type: "TREATMENT"     as const, status: "CONFIRMED"  as const, chiefComplaint: "RCT — Cleaning & Shaping (Tooth 16)" },
    { id: "appt-002", apptRef: "APPT-002", patientId: "pat-2", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(1, 10, 30), duration: 45, type: "TREATMENT"     as const, status: "SCHEDULED"  as const, chiefComplaint: "Crown Try-In — Tooth 26" },
    { id: "appt-003", apptRef: "APPT-003", patientId: "pat-7", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(1, 14),    duration: 30, type: "CLEANING"      as const, status: "SCHEDULED"  as const, chiefComplaint: "Scaling & polishing follow-up" },
    { id: "appt-004", apptRef: "APPT-004", patientId: "pat-4", clinicId: clinicA.id, doctorId: doctorPriya.id, startTime: nextDate(2, 9),     duration: 60, type: "FOLLOWUP"      as const, status: "SCHEDULED"  as const, chiefComplaint: "Implant osseointegration review — Tooth 46" },
    { id: "appt-005", apptRef: "APPT-005", patientId: "pat-5", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(2, 11),    duration: 60, type: "CONSULTATION"  as const, status: "SCHEDULED"  as const, chiefComplaint: "Braces — Records & Study Models" },
    { id: "appt-006", apptRef: "APPT-006", patientId: "pat-8", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(2, 14, 30),duration: 30, type: "CHECKUP"       as const, status: "SCHEDULED"  as const, chiefComplaint: "Routine dental check-up" },
    { id: "appt-007", apptRef: "APPT-007", patientId: "pat-3", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(3, 9, 30), duration: 30, type: "FOLLOWUP"      as const, status: "SCHEDULED"  as const, chiefComplaint: "Post-RCT follow-up" },
    { id: "appt-008", apptRef: "APPT-008", patientId: "pat-6", clinicId: clinicB.id, doctorId: doctorPriya.id, startTime: nextDate(3, 15),    duration: 45, type: "CONSULTATION"  as const, status: "SCHEDULED"  as const, chiefComplaint: "Consultation for denture options" },
    { id: "appt-009", apptRef: "APPT-009", patientId: "pat-1", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(5, 9),     duration: 60, type: "TREATMENT"     as const, status: "SCHEDULED"  as const, chiefComplaint: "RCT — Obturation (Tooth 16)" },
    { id: "appt-010", apptRef: "APPT-010", patientId: "pat-2", clinicId: clinicA.id, doctorId: doctorHafiz.id, startTime: nextDate(7, 10),    duration: 60, type: "TREATMENT"     as const, status: "SCHEDULED"  as const, chiefComplaint: "Crown Cementation — Tooth 26" },
  ];

  for (const a of appointmentsData) {
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        apptRef: a.apptRef,
        patientId: a.patientId,
        clinicId: a.clinicId,
        doctorId: a.doctorId,
        startTime: a.startTime,
        duration: a.duration,
        type: a.type,
        status: a.status,
        chiefComplaint: a.chiefComplaint,
      },
    });
  }

  console.log("✅ Sample data seeded!");
  console.log("");
  console.log("Login accounts (password: admin123)");
  console.log("────────────────────────────────────────────────");
  console.log("Super Admin    → admin@dentalos.com");
  console.log("Clinic Manager → manager@dentalos.com");
  console.log("Doctor         → doctor@dentalos.com");
  console.log("Doctor 2       → priya@dentalos.com");
  console.log("Receptionist   → receptionist@dentalos.com");
  console.log("Nurse          → nurse@dentalos.com");
  console.log("Finance        → finance@dentalos.com");
  console.log("Storekeeper    → store@dentalos.com");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
