export interface Patient {
  id: string;
  patientRef: string;
  name: string;
  isForeigner: boolean;
  icNumber?: string;
  passportNo?: string;
  phone?: string;
  email?: string;
  homeClinic: { name: string };
}

export interface ScheduleItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  clinic: { name: string };
  nurseId?: string;
  nurseName?: string;
}

export interface Visit {
  id: string;
  visitRef: string;
  visitDate: string;
  patient: Patient;
  treatments: Treatment[];
}

export interface Treatment {
  id: string;
  billedAmount: number;
  collectedAmount: number;
  treatmentType: { name: string };
}

export interface Commission {
  id: string;
  month: string;
  txAmount: number;
  labFee: number;
  doctorSplit: number;
  doctorRate: number;
  finalPayout: number;
  status: string;
  treatment: {
    treatmentType: { name: string };
    visit: { patient: { name: string } };
  };
}

export interface Doctor {
  id: string;
  name: string;
  email: string;
  role: string;
  clinics: { id: string; name: string }[];
}

export interface QueueItem {
  id: string;
  visitRef: string;
  visitDate: string;
  startTime?: string;
  status: "waiting" | "in_progress" | "done";
  patient: Patient;
  treatments: Treatment[];
}
