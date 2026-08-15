import {
  checkPoTransition,
  checkPoolDirectReceive,
  checkReceiptDeltas,
  checkReceivedQtyEdit,
  derivePoStatus,
  isNoOpReceipt,
  isReceiptStatus,
  receiptDelta,
  type ReceivableLine,
} from "@/lib/stock-receipt";

const line = (over: Partial<ReceivableLine> = {}): ReceivableLine => ({
  id: "l1", quantity: 10, receivedQty: null, postedQty: 0, ...over,
});

describe("PO state machine", () => {
  it("allows the ordering path", () => {
    expect(checkPoTransition("DRAFT", "SUBMITTED").ok).toBe(true);
    expect(checkPoTransition("SUBMITTED", "CONFIRMED").ok).toBe(true);
    expect(checkPoTransition("CONFIRMED", "RECEIVED").ok).toBe(true);
    expect(checkPoTransition("RECEIVED", "INVOICED").ok).toBe(true);
  });

  it("allows receiving the remainder of a PARTIAL order", () => {
    expect(checkPoTransition("PARTIAL", "PARTIAL").ok).toBe(true);
    expect(checkPoTransition("PARTIAL", "RECEIVED").ok).toBe(true);
  });

  it("refuses receiving a draft order", () => {
    expect(checkPoTransition("DRAFT", "RECEIVED")).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses re-receiving an already received order", () => {
    expect(checkPoTransition("RECEIVED", "RECEIVED")).toMatchObject({ ok: false, status: 409 });
    expect(checkPoTransition("RECEIVED", "PARTIAL")).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses any movement out of a terminal status", () => {
    expect(checkPoTransition("INVOICED", "RECEIVED").ok).toBe(false);
    expect(checkPoTransition("CANCELLED", "RECEIVED").ok).toBe(false);
    expect(checkPoTransition("INVOICED", "CANCELLED").ok).toBe(false);
  });

  it("refuses cancelling after the goods are in", () => {
    expect(checkPoTransition("RECEIVED", "CANCELLED").ok).toBe(false);
  });

  it("knows which statuses post stock", () => {
    expect(isReceiptStatus("RECEIVED")).toBe(true);
    expect(isReceiptStatus("PARTIAL")).toBe(true);
    expect(isReceiptStatus("CONFIRMED")).toBe(false);
  });
});

describe("duplicate PO receive", () => {
  it("posts the full quantity on a first receipt with no quantities entered", () => {
    expect(receiptDelta(line())).toBe(10);
  });

  it("posts nothing on a second receipt of the same line", () => {
    const posted = line({ receivedQty: 10, postedQty: 10 });
    expect(receiptDelta(posted)).toBe(0);
    expect(isNoOpReceipt([posted])).toBe(true);
  });

  it("treats a repeated whole-order receipt as a no-op", () => {
    const lines = [line({ id: "a", postedQty: 10 }), line({ id: "b", quantity: 4, postedQty: 4 })];
    expect(isNoOpReceipt(lines)).toBe(true);
    expect(lines.map(receiptDelta)).toEqual([0, 0]);
  });
});

describe("PARTIAL then remaining receipt", () => {
  it("posts only the received part first", () => {
    const partial = line({ quantity: 10, receivedQty: 4 });
    expect(receiptDelta(partial)).toBe(4);
    expect(derivePoStatus([{ quantity: 10, postedQty: 4 }])).toBe("PARTIAL");
  });

  it("posts only the remainder on the second receipt, never the earlier goods", () => {
    const remainder = line({ quantity: 10, receivedQty: 10, postedQty: 4 });
    expect(receiptDelta(remainder)).toBe(6);
  });

  it("becomes RECEIVED only when every line is posted in full", () => {
    expect(derivePoStatus([{ quantity: 10, postedQty: 10 }, { quantity: 5, postedQty: 3 }])).toBe("PARTIAL");
    expect(derivePoStatus([{ quantity: 10, postedQty: 10 }, { quantity: 5, postedQty: 5 }])).toBe("RECEIVED");
  });

  it("stays RECEIVED when over-received (free goods)", () => {
    expect(derivePoStatus([{ quantity: 10, postedQty: 12 }])).toBe("RECEIVED");
  });

  it("across a three-step receipt the deltas sum to the ordered quantity", () => {
    const steps = [
      receiptDelta(line({ quantity: 12, receivedQty: 5, postedQty: 0 })),
      receiptDelta(line({ quantity: 12, receivedQty: 9, postedQty: 5 })),
      receiptDelta(line({ quantity: 12, receivedQty: 12, postedQty: 9 })),
    ];
    expect(steps).toEqual([5, 4, 3]);
    expect(steps.reduce((a, b) => a + b, 0)).toBe(12);
  });
});

describe("downward corrections", () => {
  it("refuses a receipt that would have to take stock back out", () => {
    const g = checkReceiptDeltas([line({ quantity: 10, receivedQty: 3, postedQty: 6 })]);
    expect(g).toMatchObject({ ok: false, status: 409 });
  });

  it("accepts a receipt where nothing goes backwards", () => {
    expect(checkReceiptDeltas([line({ receivedQty: 10, postedQty: 4 })]).ok).toBe(true);
  });

  it("refuses editing a line's received qty below what is already posted", () => {
    expect(checkReceivedQtyEdit({ postedQty: 6 }, 3)).toMatchObject({ ok: false, status: 409 });
    expect(checkReceivedQtyEdit({ postedQty: 6 }, 6).ok).toBe(true);
    expect(checkReceivedQtyEdit({ postedQty: 0 }, 2).ok).toBe(true);
  });
});

describe("pool direct receive", () => {
  const ctx = (over: Partial<Parameters<typeof checkPoolDirectReceive>[0]> = {}) => ({
    poolStatus: "DELIVERED",
    deliveryMode: "DIRECT",
    participant: { clinicId: "clinic-a", receivedAt: null as Date | null },
    participantItemIds: ["item-1", "item-2"],
    requestedItemIds: ["item-1"],
    hasGlobalScope: false,
    userClinicIds: ["clinic-a"],
    ...over,
  });

  it("lets a storekeeper receive into their own clinic", () => {
    expect(checkPoolDirectReceive(ctx()).ok).toBe(true);
  });

  it("refuses a duplicate receive once the clinic is marked received", () => {
    const g = checkPoolDirectReceive(ctx({ participant: { clinicId: "clinic-a", receivedAt: new Date() } }));
    expect(g).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses an unauthorized clinic receive", () => {
    const g = checkPoolDirectReceive(ctx({ userClinicIds: ["clinic-b"] }));
    expect(g).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a user with no clinics at all", () => {
    expect(checkPoolDirectReceive(ctx({ userClinicIds: [] })).ok).toBe(false);
  });

  it("lets a group-wide role receive on behalf of a clinic", () => {
    expect(checkPoolDirectReceive(ctx({ hasGlobalScope: true, userClinicIds: [] })).ok).toBe(true);
  });

  it("still refuses a group-wide role a duplicate receive", () => {
    const g = checkPoolDirectReceive(ctx({
      hasGlobalScope: true, userClinicIds: [],
      participant: { clinicId: "clinic-a", receivedAt: new Date() },
    }));
    expect(g).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a clinic that is not a participant", () => {
    expect(checkPoolDirectReceive(ctx({ participant: null })).ok).toBe(false);
  });

  it("refuses lines the clinic never ordered", () => {
    const g = checkPoolDirectReceive(ctx({ requestedItemIds: ["item-1", "item-99"] }));
    expect(g).toMatchObject({ ok: false, status: 422 });
  });

  it("refuses a pool that is not DELIVERED DIRECT", () => {
    expect(checkPoolDirectReceive(ctx({ poolStatus: "SUBMITTED" })).ok).toBe(false);
    expect(checkPoolDirectReceive(ctx({ deliveryMode: "CENTRALISED" })).ok).toBe(false);
  });
});
