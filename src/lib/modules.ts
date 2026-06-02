/**
 * Canonical module registry for DentalOS.
 * Used by the Module Access Control admin page and the sidebar.
 */

// ── Action definitions ────────────────────────────────────────────────────

export type ActionKey = "view" | "create" | "edit" | "delete" | "export" | "approve";

export const ACTION_LABELS: Record<ActionKey, string> = {
  view:    "View",
  create:  "Create",
  edit:    "Edit",
  delete:  "Delete",
  export:  "Export",
  approve: "Approve",
};

export const ACTION_SHORT: Record<ActionKey, string> = {
  view:    "V",
  create:  "C",
  edit:    "E",
  delete:  "D",
  export:  "X",
  approve: "A",
};

export const ALL_ACTIONS: ActionKey[] = ["view", "create", "edit", "delete", "export", "approve"];

/** Which actions are meaningful for each module */
export const MODULE_ACTIONS: Record<string, ActionKey[]> = {
  dashboard:    ["view"],
  appointments: ["view", "create", "edit", "delete"],
  patients:     ["view", "create", "edit", "delete", "export"],
  dental_chart: ["view", "create", "edit"],
  treatments:   ["view", "create", "edit", "delete"],
  invoices:     ["view", "create", "edit", "delete", "export"],
  daily_ledger: ["view", "create", "edit", "export"],
  commissions:  ["view", "approve", "export"],
  staff:        ["view", "create", "edit", "delete"],
  leave:        ["view", "create", "approve", "delete"],
  schedule:     ["view", "create", "edit", "delete"],
  hr:           ["view", "create", "edit", "approve"],
  inventory:    ["view", "create", "edit", "delete", "export"],
  lab:          ["view", "create", "edit", "delete"],
  reports:      ["view", "export"],
  cash_banking: ["view", "create", "edit", "export"],
  settings:     ["view", "edit"],
};

/** Sensible default action sets per role per module.
 *  Empty array = no access to that module. */
export const DEFAULT_ROLE_ACTIONS: Record<string, Record<string, ActionKey[]>> = {
  FINANCE: {
    dashboard:    ["view"],
    invoices:     ["view", "export"],
    daily_ledger: ["view", "create", "edit", "export"],
    commissions:  ["view", "approve", "export"],
    cash_banking: ["view", "create", "edit", "export"],
    reports:      ["view", "export"],
    patients:     ["view"],
    settings:     ["view", "edit"],
    hr:           ["view"],
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
    hr:           ["view", "create", "edit", "approve"],
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
    hr:           ["view"],
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
    hr:           ["view"],
    invoices: [], daily_ledger: [], commissions: [], staff: [],
    leave: [], reports: [], cash_banking: [], inventory: [], settings: [],
  },
  RECEPTIONIST: {
    dashboard:    ["view"],
    appointments: ["view", "create", "edit", "delete"],
    patients:     ["view", "create", "edit"],
    invoices:     ["view", "create"],
    schedule:     ["view"],
    hr:           ["view"],
    dental_chart: [], treatments: [], daily_ledger: [], commissions: [],
    staff: [], leave: [], reports: [], cash_banking: [], inventory: [], lab: [], settings: [],
  },
  STOREKEEPER: {
    dashboard:    ["view"],
    inventory:    ["view", "create", "edit", "delete", "export"],
    leave:        ["view", "create"],
    hr:           ["view"],
    appointments: [], patients: [], dental_chart: [], treatments: [],
    invoices: [], daily_ledger: [], commissions: [], staff: [],
    schedule: [], reports: [], cash_banking: [], lab: [], settings: [],
  },
};

// ── Module registry ───────────────────────────────────────────────────────

export const MODULES = [
  { key: "dashboard"    },
  { key: "appointments" },
  { key: "patients"     },
  { key: "dental_chart" },
  { key: "treatments"   },
  { key: "invoices"     },
  { key: "daily_ledger" },
  { key: "commissions"  },
  { key: "staff"        },
  { key: "leave"        },
  { key: "schedule"     },
  { key: "inventory"    },
  { key: "lab"          },
  { key: "reports"      },
  { key: "cash_banking" },
  { key: "settings"     },
  { key: "hr"           },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard:    "Dashboard",
  appointments: "Appointments",
  patients:     "Patients",
  dental_chart: "Dental Chart",
  treatments:   "Treatments",
  invoices:     "Invoices",
  daily_ledger: "Daily Ledger",
  commissions:  "Commissions",
  staff:        "Staff",
  leave:        "Leave",
  schedule:     "Schedule",
  inventory:    "Inventory",
  lab:          "Lab Jobs",
  reports:      "Reports",
  cash_banking: "Cash Banking",
  settings:     "Settings",
  hr:           "Human Resources",
};

export const CONFIGURABLE_ROLES = [
  "FINANCE",
  "CLINIC_MANAGER",
  "DOCTOR",
  "NURSE",
  "RECEPTIONIST",
  "STOREKEEPER",
] as const;

export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export const ROLE_LABELS: Record<ConfigurableRole, string> = {
  FINANCE:        "Finance",
  CLINIC_MANAGER: "Clinic Manager",
  DOCTOR:         "Doctor",
  NURSE:          "Nurse",
  RECEPTIONIST:   "Receptionist",
  STOREKEEPER:    "Storekeeper",
};
