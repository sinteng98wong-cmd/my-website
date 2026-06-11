/**
 * Tests for src/lib/rbac.ts — hasPermission pure function.
 * No mocking needed. Verifies every role's grants and key denials.
 */

// Mock the auth module to prevent the ESM @auth/prisma-adapter from loading.
// Only hasPermission (a pure function) is tested here — no session is needed.
jest.mock("../lib/auth", () => ({}));
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { hasPermission } from "../lib/rbac";
import type { Permission } from "../lib/rbac";

// ── SUPER_ADMIN ───────────────────────────────────────────────────────────────

describe("SUPER_ADMIN", () => {
  test("has clinic:all", () => {
    expect(hasPermission("SUPER_ADMIN", "clinic:all")).toBe(true);
  });

  test("has commission:lock", () => {
    expect(hasPermission("SUPER_ADMIN", "commission:lock")).toBe(true);
  });

  test("has ledger:full", () => {
    expect(hasPermission("SUPER_ADMIN", "ledger:full")).toBe(true);
  });

  test("has admin:manage", () => {
    expect(hasPermission("SUPER_ADMIN", "admin:manage")).toBe(true);
  });

  test("has users:manage", () => {
    expect(hasPermission("SUPER_ADMIN", "users:manage")).toBe(true);
  });

  test("does NOT have clinic:own (that belongs to CLINIC_MANAGER)", () => {
    expect(hasPermission("SUPER_ADMIN", "clinic:own")).toBe(false);
  });

  test("does NOT have commission:view:own (that belongs to DOCTOR)", () => {
    expect(hasPermission("SUPER_ADMIN", "commission:view:own")).toBe(false);
  });
});

// ── FINANCE ───────────────────────────────────────────────────────────────────

describe("FINANCE", () => {
  test("has clinic:all", () => {
    expect(hasPermission("FINANCE", "clinic:all")).toBe(true);
  });

  test("has ledger:full", () => {
    expect(hasPermission("FINANCE", "ledger:full")).toBe(true);
  });

  test("has ledger:view", () => {
    expect(hasPermission("FINANCE", "ledger:view")).toBe(true);
  });

  test("has commission:view:all", () => {
    expect(hasPermission("FINANCE", "commission:view:all")).toBe(true);
  });

  test("has config:manage", () => {
    expect(hasPermission("FINANCE", "config:manage")).toBe(true);
  });

  test("does NOT have commission:lock", () => {
    expect(hasPermission("FINANCE", "commission:lock")).toBe(false);
  });

  test("does NOT have staff:manage", () => {
    expect(hasPermission("FINANCE", "staff:manage")).toBe(false);
  });

  test("does NOT have admin:manage", () => {
    expect(hasPermission("FINANCE", "admin:manage")).toBe(false);
  });
});

// ── CLINIC_MANAGER ────────────────────────────────────────────────────────────

describe("CLINIC_MANAGER", () => {
  test("has clinic:own", () => {
    expect(hasPermission("CLINIC_MANAGER", "clinic:own")).toBe(true);
  });

  test("has commission:lock", () => {
    expect(hasPermission("CLINIC_MANAGER", "commission:lock")).toBe(true);
  });

  test("has commission:view:all", () => {
    expect(hasPermission("CLINIC_MANAGER", "commission:view:all")).toBe(true);
  });

  test("has staff:manage", () => {
    expect(hasPermission("CLINIC_MANAGER", "staff:manage")).toBe(true);
  });

  test("has ledger:view", () => {
    expect(hasPermission("CLINIC_MANAGER", "ledger:view")).toBe(true);
  });

  test("does NOT have clinic:all", () => {
    expect(hasPermission("CLINIC_MANAGER", "clinic:all")).toBe(false);
  });

  test("does NOT have ledger:full", () => {
    expect(hasPermission("CLINIC_MANAGER", "ledger:full")).toBe(false);
  });

  test("does NOT have users:manage", () => {
    expect(hasPermission("CLINIC_MANAGER", "users:manage")).toBe(false);
  });
});

// ── DOCTOR ────────────────────────────────────────────────────────────────────

describe("DOCTOR", () => {
  test("has commission:view:own", () => {
    expect(hasPermission("DOCTOR", "commission:view:own")).toBe(true);
  });

  test("has schedule:view", () => {
    expect(hasPermission("DOCTOR", "schedule:view")).toBe(true);
  });

  test("has patient:manage", () => {
    expect(hasPermission("DOCTOR", "patient:manage")).toBe(true);
  });

  test("does NOT have commission:view:all", () => {
    expect(hasPermission("DOCTOR", "commission:view:all")).toBe(false);
  });

  test("does NOT have invoice:manage", () => {
    expect(hasPermission("DOCTOR", "invoice:manage")).toBe(false);
  });

  test("does NOT have ledger:view", () => {
    expect(hasPermission("DOCTOR", "ledger:view")).toBe(false);
  });
});

// ── NURSE ─────────────────────────────────────────────────────────────────────

describe("NURSE", () => {
  test("has schedule:view", () => {
    expect(hasPermission("NURSE", "schedule:view")).toBe(true);
  });

  test("has patient:manage", () => {
    expect(hasPermission("NURSE", "patient:manage")).toBe(true);
  });

  test("does NOT have invoice:manage", () => {
    expect(hasPermission("NURSE", "invoice:manage")).toBe(false);
  });

  test("does NOT have schedule:manage", () => {
    expect(hasPermission("NURSE", "schedule:manage")).toBe(false);
  });

  test("does NOT have commission:view:own", () => {
    expect(hasPermission("NURSE", "commission:view:own")).toBe(false);
  });

  test("does NOT have stock:manage", () => {
    expect(hasPermission("NURSE", "stock:manage")).toBe(false);
  });
});

// ── RECEPTIONIST ──────────────────────────────────────────────────────────────

describe("RECEPTIONIST", () => {
  test("has schedule:view", () => {
    expect(hasPermission("RECEPTIONIST", "schedule:view")).toBe(true);
  });

  test("has patient:manage", () => {
    expect(hasPermission("RECEPTIONIST", "patient:manage")).toBe(true);
  });

  test("has invoice:manage", () => {
    expect(hasPermission("RECEPTIONIST", "invoice:manage")).toBe(true);
  });

  test("does NOT have ledger:view", () => {
    expect(hasPermission("RECEPTIONIST", "ledger:view")).toBe(false);
  });

  test("does NOT have commission:view:own", () => {
    expect(hasPermission("RECEPTIONIST", "commission:view:own")).toBe(false);
  });

  test("does NOT have stock:manage", () => {
    expect(hasPermission("RECEPTIONIST", "stock:manage")).toBe(false);
  });
});

// ── STOREKEEPER ───────────────────────────────────────────────────────────────

describe("STOREKEEPER", () => {
  test("has stock:manage", () => {
    expect(hasPermission("STOREKEEPER", "stock:manage")).toBe(true);
  });

  test("has do:manage", () => {
    expect(hasPermission("STOREKEEPER", "do:manage")).toBe(true);
  });

  test("has pool:manage", () => {
    expect(hasPermission("STOREKEEPER", "pool:manage")).toBe(true);
  });

  test("does NOT have patient:manage", () => {
    expect(hasPermission("STOREKEEPER", "patient:manage")).toBe(false);
  });

  test("does NOT have invoice:manage", () => {
    expect(hasPermission("STOREKEEPER", "invoice:manage")).toBe(false);
  });

  test("does NOT have schedule:view", () => {
    expect(hasPermission("STOREKEEPER", "schedule:view")).toBe(false);
  });
});

// ── Boundary distinctions ─────────────────────────────────────────────────────

describe("own vs all permission distinctions", () => {
  test("DOCTOR has commission:view:own but NOT commission:view:all", () => {
    expect(hasPermission("DOCTOR", "commission:view:own")).toBe(true);
    expect(hasPermission("DOCTOR", "commission:view:all")).toBe(false);
  });

  test("CLINIC_MANAGER has clinic:own but NOT clinic:all", () => {
    expect(hasPermission("CLINIC_MANAGER", "clinic:own")).toBe(true);
    expect(hasPermission("CLINIC_MANAGER", "clinic:all")).toBe(false);
  });

  test("FINANCE has clinic:all but NOT commission:lock", () => {
    expect(hasPermission("FINANCE", "clinic:all")).toBe(true);
    expect(hasPermission("FINANCE", "commission:lock")).toBe(false);
  });
});

// ── Unknown / empty roles ─────────────────────────────────────────────────────

describe("unknown and empty roles", () => {
  test("unknown role returns false", () => {
    expect(hasPermission("INTERN", "schedule:view")).toBe(false);
  });

  test("empty string role returns false", () => {
    expect(hasPermission("", "patient:manage")).toBe(false);
  });

  test("role with missing underscore returns false", () => {
    expect(hasPermission("SUPERADMIN", "clinic:all")).toBe(false);
  });
});
