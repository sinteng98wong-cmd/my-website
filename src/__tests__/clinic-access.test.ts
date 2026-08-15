import {
  GLOBAL_CLINIC_ROLES,
  INVENTORY_ROLES,
  SUPPLIER_DELETE_ROLES,
  SUPPLIER_READ_ROLES,
  SUPPLIER_WRITE_ROLES,
  checkClinicAccess,
  clinicWhere,
  hasGlobalClinicScope,
  resolveClinicScope,
} from "@/lib/clinic-access";

const A = "clinic-a";
const B = "clinic-b";
const branchUser = [A];
const multiBranchManager = [A, B];

describe("clinic scope resolution", () => {
  it("gives group-wide roles every clinic when nothing is requested", () => {
    for (const role of GLOBAL_CLINIC_ROLES) {
      expect(resolveClinicScope(role, [], undefined)).toEqual({ ok: true, clinicIds: null });
    }
  });

  it("limits a branch user to their own clinics", () => {
    expect(resolveClinicScope("STOREKEEPER", branchUser)).toEqual({ ok: true, clinicIds: [A] });
  });

  it("keeps an authorized multi-clinic manager's full scope", () => {
    expect(resolveClinicScope("CLINIC_MANAGER", multiBranchManager)).toEqual({ ok: true, clinicIds: [A, B] });
  });

  it("refuses a user attached to no clinic at all", () => {
    expect(resolveClinicScope("STOREKEEPER", [])).toMatchObject({ ok: false, status: 403 });
  });
});

describe("clinicId cannot bypass authorization", () => {
  it("refuses Branch A asking for Branch B", () => {
    expect(resolveClinicScope("STOREKEEPER", branchUser, B)).toMatchObject({ ok: false, status: 403 });
  });

  it("narrows rather than replaces: A asking for A stays A", () => {
    expect(resolveClinicScope("STOREKEEPER", branchUser, A)).toEqual({ ok: true, clinicIds: [A] });
  });

  it("narrows a multi-clinic manager to the one requested clinic", () => {
    expect(resolveClinicScope("CLINIC_MANAGER", multiBranchManager, B)).toEqual({ ok: true, clinicIds: [B] });
  });

  it("never lets a requested clinic widen a branch user's scope", () => {
    const scope = resolveClinicScope("CLINIC_MANAGER", branchUser, B);
    expect(scope.ok).toBe(false);
    // and the unfiltered scope is still only their own clinic
    expect(resolveClinicScope("CLINIC_MANAGER", branchUser)).toEqual({ ok: true, clinicIds: [A] });
  });

  it("lets group-wide roles target any single clinic", () => {
    expect(resolveClinicScope("SUPER_ADMIN", [], B)).toEqual({ ok: true, clinicIds: [B] });
    expect(resolveClinicScope("FINANCE", [], B)).toEqual({ ok: true, clinicIds: [B] });
  });

  it("turns a scope into a query filter that is never empty for branch users", () => {
    expect(clinicWhere([A])).toEqual({ clinicId: { in: [A] } });
    expect(clinicWhere(null)).toEqual({});
  });
});

describe("write access to a specific clinic", () => {
  it("Branch A cannot create or receive for Branch B", () => {
    expect(checkClinicAccess("STOREKEEPER", branchUser, B)).toMatchObject({ ok: false, status: 403 });
    expect(checkClinicAccess("CLINIC_MANAGER", branchUser, B)).toMatchObject({ ok: false, status: 403 });
  });

  it("Branch A can act on Branch A", () => {
    expect(checkClinicAccess("STOREKEEPER", branchUser, A).ok).toBe(true);
  });

  it("a manager of both branches can act on either", () => {
    expect(checkClinicAccess("CLINIC_MANAGER", multiBranchManager, A).ok).toBe(true);
    expect(checkClinicAccess("CLINIC_MANAGER", multiBranchManager, B).ok).toBe(true);
  });

  it("group-wide roles can act on any clinic", () => {
    expect(checkClinicAccess("SUPER_ADMIN", [], B).ok).toBe(true);
    expect(checkClinicAccess("FINANCE", [], B).ok).toBe(true);
  });

  it("rejects a missing clinicId rather than defaulting to something", () => {
    expect(checkClinicAccess("STOREKEEPER", branchUser, "")).toMatchObject({ ok: false, status: 422 });
  });

  it("a user with no clinic links cannot act anywhere", () => {
    expect(checkClinicAccess("NURSE", [], A).ok).toBe(false);
  });
});

describe("role sets", () => {
  it("treats exactly Super Admin and Finance as group-wide", () => {
    expect(GLOBAL_CLINIC_ROLES).toEqual(["SUPER_ADMIN", "FINANCE"]);
    expect(hasGlobalClinicScope("CLINIC_MANAGER")).toBe(false);
    expect(hasGlobalClinicScope("STOREKEEPER")).toBe(false);
    expect(hasGlobalClinicScope("DOCTOR")).toBe(false);
  });

  it("keeps clinical roles out of the inventory module", () => {
    for (const role of ["DOCTOR", "NURSE", "RECEPTIONIST"]) {
      expect(INVENTORY_ROLES).not.toContain(role);
    }
  });

  it("applies one supplier policy for both supplier APIs", () => {
    expect(SUPPLIER_READ_ROLES).toEqual(INVENTORY_ROLES);
    expect(SUPPLIER_WRITE_ROLES).toEqual(["SUPER_ADMIN", "FINANCE"]);
    expect(SUPPLIER_DELETE_ROLES).toEqual(["SUPER_ADMIN"]);
    // writing is stricter than reading, deleting stricter than writing
    expect(SUPPLIER_WRITE_ROLES.every((r) => SUPPLIER_READ_ROLES.includes(r))).toBe(true);
    expect(SUPPLIER_DELETE_ROLES.every((r) => SUPPLIER_WRITE_ROLES.includes(r))).toBe(true);
  });
});
