/**
 * Tier 3A stock ledger check (requires a live database).
 *
 *   npx tsx scripts/stock-ledger-check.ts
 *
 * Verifies what unit tests cannot: that every dual-write path really appends a
 * movement with a meaningful type and source, that posting keys are idempotent
 * at the database level, that the ledger is immutable, and that the drift
 * detector both reports clean on consistent data and catches injected drift.
 */
import { prisma } from "../src/lib/prisma";
import { deductStock, receiveStock, receivePoolStock } from "../src/lib/stock";
import { postingKeys } from "../src/lib/stock-ledger";
import { runDriftDetection } from "../src/lib/stock-drift";

const S = `t3-${Date.now()}-`;
let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const entity   = await prisma.entity.create({ data: { legalName: `${S}entity` } });
  const clinicA  = await prisma.clinic.create({ data: { name: `${S}clinicA`, entityId: entity.id } });
  const clinicB  = await prisma.clinic.create({ data: { name: `${S}clinicB`, entityId: entity.id } });
  const user     = await prisma.user.create({
    data: { name: `${S}user`, email: `${S}u@x.my`, passwordHash: "x", role: "STOREKEEPER" },
  });
  const item     = await prisma.stockItem.create({ data: { sku: `${S}sku`, name: `${S}item`, category: "Test" } });

  const movementsFor = (clinicId: string) =>
    prisma.stockMovement.findMany({ where: { clinicId, itemId: item.id }, orderBy: { seq: "asc" } });

  // ── PO receipt dual-write ─────────────────────────────────────────────────
  await receiveStock(
    clinicA.id,
    [{ itemId: item.id, receivedQty: 10, unitCost: 5, postingKey: `${S}PO:1`, sourceLineId: "line-1" }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", sourceId: "po-1", reference: `${S}PO-REF`, userId: user.id }
  );
  let mv = await movementsFor(clinicA.id);
  ok("PO receipt appends one movement", mv.length === 1, `count=${mv.length}`);
  ok("PO movement carries type and source", mv[0].type === "RECEIPT_PO" && mv[0].sourceType === "PURCHASE_ORDER");
  ok("PO movement records direction and quantity", mv[0].direction === "IN" && mv[0].qtyIn === 10 && mv[0].qtyOut === 0);
  ok("PO movement records the balance after", mv[0].balanceAfter === 10, `balanceAfter=${mv[0].balanceAfter}`);
  ok("PO movement records value and cost", Number(mv[0].valueDelta) === 50 && Number(mv[0].avgCostAfter) === 5,
    `valueDelta=${mv[0].valueDelta} avg=${mv[0].avgCostAfter}`);
  ok("PO movement records the acting user", mv[0].createdById === user.id);
  ok("PO movement stamps the period", /^\d{4}-\d{2}$/.test(mv[0].period), mv[0].period);

  // ── FOC receipt at zero cost ──────────────────────────────────────────────
  await receiveStock(
    clinicA.id,
    [{ itemId: item.id, receivedQty: 2, unitCost: 0, postingKey: `${S}FOC:1`, type: "RECEIPT_FOC" }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", sourceId: "po-1", reference: `${S}PO-REF`, userId: user.id }
  );
  mv = await movementsFor(clinicA.id);
  const foc = mv.find((m) => m.type === "RECEIPT_FOC")!;
  ok("FOC receipt posts as its own type", !!foc);
  ok("FOC enters at zero value", Number(foc.valueDelta) === 0, `valueDelta=${foc.valueDelta}`);
  ok("FOC lowers the weighted average", Number(foc.avgCostAfter) < 5, `avg=${foc.avgCostAfter}`);

  // ── Idempotency: the same posting key cannot be posted twice ──────────────
  let duplicateRejected = false;
  try {
    await receiveStock(
      clinicA.id,
      [{ itemId: item.id, receivedQty: 10, unitCost: 5, postingKey: `${S}PO:1` }],
      { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", sourceId: "po-1", reference: `${S}PO-REF` }
    );
  } catch { duplicateRejected = true; }
  ok("replaying a posting key is rejected", duplicateRejected);
  ok("the rejected replay left stock untouched",
    (await prisma.clinicStock.findUnique({
      where: { clinicId_itemId: { clinicId: clinicA.id, itemId: item.id } },
    }))?.quantity === 12);

  // ── Transfer out / in / variance ──────────────────────────────────────────
  await deductStock(
    clinicA.id,
    [{ itemId: item.id, quantity: 6, postingKey: `${S}DO:out`, sourceLineId: "do-line-1" }],
    { type: "TRANSFER_OUT", sourceType: "DELIVERY_ORDER", sourceId: "do-1", reference: `${S}DO-REF`, userId: user.id }
  );
  const out = (await movementsFor(clinicA.id)).find((m) => m.type === "TRANSFER_OUT")!;
  ok("transfer out posts an OUT movement", out.direction === "OUT" && out.qtyOut === 6);
  ok("transfer out removes value at average cost", Number(out.valueDelta) < 0, `valueDelta=${out.valueDelta}`);
  ok("transfer out records the new balance", out.balanceAfter === 6, `balanceAfter=${out.balanceAfter}`);

  await receiveStock(
    clinicB.id,
    [{ itemId: item.id, receivedQty: 6, unitCost: 5, postingKey: `${S}DO:in`, sourceLineId: "do-line-1" }],
    { type: "TRANSFER_IN", sourceType: "DELIVERY_ORDER", sourceId: "do-1", reference: `${S}DO-REF`, userId: user.id }
  );
  await deductStock(
    clinicB.id,
    [{ itemId: item.id, quantity: 2, postingKey: `${S}DO:var`, sourceLineId: "do-line-1", note: "short delivery" }],
    { type: "TRANSFER_VARIANCE_OUT", sourceType: "DELIVERY_ORDER", sourceId: "do-1", reference: `${S}DO-REF`, userId: user.id }
  );
  const bMovements = await movementsFor(clinicB.id);
  ok("transfer in and variance are both recorded",
    bMovements.map((m) => m.type).join(",") === "TRANSFER_IN,TRANSFER_VARIANCE_OUT",
    bMovements.map((m) => m.type).join(","));
  ok("the shortfall is explicit, not silently lost",
    bMovements[1].qtyOut === 2 && bMovements[1].note === "short delivery");
  ok("receiving branch ends with the quantity actually received", bMovements[1].balanceAfter === 4);

  // ── Pool receipt carries cost ─────────────────────────────────────────────
  await receivePoolStock(
    clinicB.id,
    [{ itemId: item.id, totalQty: 5, unitCost: 4, postingKey: `${S}POOL:1` }],
    { type: "RECEIPT_POOL", sourceType: "POOL_ORDER", sourceId: "pool-1", reference: `${S}POOL-REF`, userId: user.id }
  );
  const poolMv = (await movementsFor(clinicB.id)).find((m) => m.type === "RECEIPT_POOL")!;
  ok("pool receipt no longer enters at zero cost", Number(poolMv.unitCost) === 4, `unitCost=${poolMv.unitCost}`);
  ok("pool receipt adds value", Number(poolMv.valueDelta) === 20, `valueDelta=${poolMv.valueDelta}`);

  // ── Immutability ──────────────────────────────────────────────────────────
  let updateBlocked = false, deleteBlocked = false;
  try { await prisma.$executeRawUnsafe(`UPDATE "StockMovement" SET note = 'tampered' WHERE id = $1`, mv[0].id); }
  catch { updateBlocked = true; }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "StockMovement" WHERE id = $1`, mv[0].id); }
  catch { deleteBlocked = true; }
  ok("historical movements cannot be updated", updateBlocked);
  ok("historical movements cannot be deleted", deleteBlocked);
  ok("the movement survived both attempts",
    (await prisma.stockMovement.findUnique({ where: { id: mv[0].id } }))?.note !== "tampered");

  // ── Drift detector: clean, then catches injected drift ────────────────────
  const clean = await runDriftDetection([clinicA.id, clinicB.id]);
  ok("drift detector reports clean on consistent data", clean.clean,
    clean.findings.filter((f) => f.severity === "ERROR").map((f) => f.code).join(",") || "no errors");

  await prisma.clinicStock.update({
    where: { clinicId_itemId: { clinicId: clinicA.id, itemId: item.id } },
    data:  { quantity: { increment: 99 } },
  });
  const drifted = await runDriftDetection([clinicA.id, clinicB.id]);
  ok("drift detector catches a bypassing mutation",
    !drifted.clean && drifted.findings.some((f) => f.code === "BALANCE_MISMATCH"),
    drifted.findings.map((f) => f.code).join(","));
  ok("drift detector also flags the broken in/out reconciliation",
    drifted.findings.some((f) => f.code === "SUM_MISMATCH"));

  await prisma.clinicStock.update({
    where: { clinicId_itemId: { clinicId: clinicA.id, itemId: item.id } },
    data:  { quantity: { decrement: 99 } },
  });
  const restored = await runDriftDetection([clinicA.id, clinicB.id]);
  ok("drift clears once the balance is corrected", restored.clean);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL "dentalos.ledger_maintenance" = 'on'`);
    await tx.stockMovement.deleteMany({ where: { clinicId: { in: [clinicA.id, clinicB.id] } } });
  });
  await prisma.stockBatch.deleteMany({ where: { clinicId: { in: [clinicA.id, clinicB.id] } } });
  await prisma.clinicStock.deleteMany({ where: { clinicId: { in: [clinicA.id, clinicB.id] } } });
  await prisma.stockItem.deleteMany({ where: { sku: { startsWith: S } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  await prisma.clinic.deleteMany({ where: { id: { in: [clinicA.id, clinicB.id] } } });
  await prisma.entity.deleteMany({ where: { id: entity.id } });

  console.log(failures === 0 ? "\nAll Tier 3A ledger checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
