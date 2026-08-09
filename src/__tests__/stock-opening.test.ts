/**
 * Opening Balance — rules.
 *
 * The cost rule is the important one: there is no cost basis anywhere else in
 * the system, so a positive quantity without a positive cost must be refused
 * rather than defaulted. Posting behaviour against a real database lives in
 * src/__integration__/stock-opening.verify.test.ts.
 */
import {
  checkLine, checkSubmittable, checkTransition, isEditable, isPostable,
  lineValue, totalsOf, checkApprover, canReviewOpening, openingRef,
  type OpeningLine,
} from "@/lib/stock-opening";

const line = (over: Partial<OpeningLine> = {}): OpeningLine => ({
  itemId: "item-1", quantity: 10, unitCost: 5, ...over,
});

describe("state machine", () => {
  it("allows the intended path", () => {
    expect(checkTransition("DRAFT", "SUBMITTED").ok).toBe(true);
    expect(checkTransition("SUBMITTED", "APPROVED").ok).toBe(true);
    expect(checkTransition("SUBMITTED", "REJECTED").ok).toBe(true);
    expect(checkTransition("REJECTED", "DRAFT").ok).toBe(true);
  });

  it("refuses skipping review", () => {
    expect(checkTransition("DRAFT", "APPROVED").ok).toBe(false);
  });

  it("treats APPROVED as terminal — the ledger is already written", () => {
    for (const next of ["DRAFT", "SUBMITTED", "REJECTED", "APPROVED"]) {
      expect(checkTransition("APPROVED", next).ok).toBe(false);
    }
  });

  it("only allows editing a draft", () => {
    expect(isEditable("DRAFT")).toBe(true);
    for (const s of ["SUBMITTED", "APPROVED", "REJECTED"]) expect(isEditable(s)).toBe(false);
  });
});

describe("cost is mandatory above zero quantity", () => {
  it("accepts a positive quantity with a positive cost", () => {
    expect(checkLine(line()).ok).toBe(true);
  });

  it("refuses a positive quantity with no cost", () => {
    const g = checkLine(line({ unitCost: null }), "Gloves");
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.status).toBe(422);
      expect(g.error).toMatch(/unit cost is required/i);
      expect(g.error).toContain("Gloves");
    }
  });

  it("refuses a zero or negative cost — never defaults it", () => {
    for (const c of [0, -1, -0.5]) {
      const g = checkLine(line({ unitCost: c }));
      expect(g.ok).toBe(false);
      if (!g.ok) expect(g.error).toMatch(/greater than zero|required/i);
    }
  });

  it("refuses a negative quantity", () => {
    const g = checkLine(line({ quantity: -5 }));
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toMatch(/cannot be negative/i);
  });

  it("refuses a fractional quantity", () => {
    expect(checkLine(line({ quantity: 2.5 })).ok).toBe(false);
  });

  it("refuses a missing quantity at submission", () => {
    const g = checkLine(line({ quantity: null }));
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toMatch(/quantity is required/i);
  });

  it("accepts a counted zero without a cost — nothing will be posted", () => {
    expect(checkLine(line({ quantity: 0, unitCost: null })).ok).toBe(true);
  });
});

describe("postability and value", () => {
  it("treats only positive quantity with positive cost as postable", () => {
    expect(isPostable(line())).toBe(true);
    expect(isPostable(line({ quantity: 0 }))).toBe(false);
    expect(isPostable(line({ unitCost: null }))).toBe(false);
    expect(isPostable(line({ unitCost: 0 }))).toBe(false);
  });

  it("computes line value", () => {
    expect(lineValue(line({ quantity: 10, unitCost: 5 }))).toBe(50);
    expect(lineValue(line({ quantity: 3, unitCost: 1.335 }))).toBe(4.01);
  });

  it("values a zero line at nothing", () => {
    expect(lineValue(line({ quantity: 0 }))).toBe(0);
    expect(lineValue(line({ unitCost: null }))).toBe(0);
  });

  it("totals quantity and value across lines", () => {
    const t = totalsOf([
      line({ quantity: 10, unitCost: 5 }),
      line({ itemId: "i2", quantity: 4, unitCost: 2.5 }),
      line({ itemId: "i3", quantity: 0, unitCost: null }),
    ]);
    expect(t.quantity).toBe(14);
    expect(t.value).toBe(60);
  });
});

describe("submission", () => {
  it("refuses an empty document", () => {
    const g = checkSubmittable([]);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toMatch(/at least one item/i);
  });

  it("refuses a document where every line is zero", () => {
    const g = checkSubmittable([line({ quantity: 0, unitCost: null }), line({ itemId: "i2", quantity: 0, unitCost: null })]);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toMatch(/no ledger position/i);
  });

  it("accepts a mix of counted stock and counted zeroes", () => {
    expect(checkSubmittable([line(), line({ itemId: "i2", quantity: 0, unitCost: null })]).ok).toBe(true);
  });

  it("reports the offending item by name", () => {
    const names = new Map([["item-9", "Composite Resin A2"]]);
    const g = checkSubmittable([line({ itemId: "item-9", unitCost: null })], names);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toContain("Composite Resin A2");
  });
});

describe("approval authority and separation of duties", () => {
  const base = { role: "CLINIC_MANAGER", userId: "u-reviewer", createdById: "u-branch", submittedById: "u-branch" };

  it("lets a reviewer who had no hand in the document approve", () => {
    expect(checkApprover(base).ok).toBe(true);
    expect(checkApprover({ ...base, role: "FINANCE" }).ok).toBe(true);
    expect(checkApprover({ ...base, role: "SUPER_ADMIN" }).ok).toBe(true);
  });

  it("refuses the person who raised it", () => {
    const g = checkApprover({ ...base, userId: "u-branch" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error).toMatch(/raised or submitted/i);
  });

  it("refuses the person who submitted it, even a super admin", () => {
    const g = checkApprover({ ...base, role: "SUPER_ADMIN", userId: "u-sub", submittedById: "u-sub", createdById: "u-other" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.status).toBe(403);
  });

  it("refuses a storekeeper as reviewer", () => {
    const g = checkApprover({ ...base, role: "STOREKEEPER" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.status).toBe(403);
  });

  it("exposes the reviewer roles", () => {
    for (const r of ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"]) expect(canReviewOpening(r)).toBe(true);
    for (const r of ["STOREKEEPER", "DOCTOR", "NURSE", ""]) expect(canReviewOpening(r)).toBe(false);
  });
});

describe("document reference", () => {
  it("formats as OB-YYYYMM-NNN", () => {
    expect(openingRef("2026-08", 1)).toBe("OB-202608-001");
    expect(openingRef("2026-12", 42)).toBe("OB-202612-042");
  });
});
