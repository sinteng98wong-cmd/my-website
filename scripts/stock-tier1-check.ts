/**
 * Tier 1 stock-safety regression check (requires a live database).
 *
 *   npx tsx scripts/stock-tier1-check.ts
 *
 * The pure guards are unit tested in src/__tests__/stock-receipt.test.ts. This
 * script covers what those cannot: that the receipt and stock-mutation paths
 * really are atomic against a concurrent caller, and that a repeated receipt
 * posts nothing to ClinicStock.
 */
import { prisma } from "../src/lib/prisma";
import { deductStock, receiveStock } from "../src/lib/stock";
import { derivePoStatus, receiptDelta } from "../src/lib/stock-receipt";

const S = `t1-${Date.now()}-`;
let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const qtyAt = async (clinicId: string, itemId: string) =>
  (await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } }))?.quantity ?? 0;

/** Post a PO receipt exactly as the route does. */
async function postReceipt(poId: string) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true } });
  const toPost = po.lines.map((l) => ({ line: l, delta: receiptDelta(l) })).filter((x) => x.delta > 0);
  if (!toPost.length) return { posted: 0, status: po.status };

  const updated = await prisma.$transaction(async (tx) => {
    await receiveStock(
      po.clinicId,
      toPost.map(({ line, delta }) => ({ itemId: line.itemId, receivedQty: delta, unitCost: Number(line.unitCost) })),
      tx
    );
    for (const { line, delta } of toPost) {
      await tx.pOLine.update({ where: { id: line.id }, data: { postedQty: line.postedQty + delta } });
    }
    const posted = po.lines.map((l) => ({
      quantity: l.quantity,
      postedQty: l.postedQty + (toPost.find((x) => x.line.id === l.id)?.delta ?? 0),
    }));
    return tx.purchaseOrder.update({ where: { id: po.id }, data: { status: derivePoStatus(posted) } });
  });
  return { posted: toPost.reduce((s, x) => s + x.delta, 0), status: updated.status };
}

async function main() {
  const entity = await prisma.entity.create({ data: { legalName: `${S}entity` } });
  const clinic = await prisma.clinic.create({ data: { name: `${S}clinic`, entityId: entity.id } });
  const supplier = await prisma.supplier.create({ data: { name: `${S}supplier` } });
  const item = await prisma.stockItem.create({ data: { sku: `${S}sku`, name: `${S}item`, category: "Test" } });
  const item2 = await prisma.stockItem.create({ data: { sku: `${S}sku2`, name: `${S}item2`, category: "Test" } });

  // ── duplicate PO receive ──────────────────────────────────────────────────
  const po = await prisma.purchaseOrder.create({
    data: {
      poRef: `${S}PO1`, clinicId: clinic.id, supplierId: supplier.id, status: "CONFIRMED",
      lines: { create: [{ itemId: item.id, quantity: 10, unitCost: "5.00" }] },
    },
  });

  const first = await postReceipt(po.id);
  ok("first PO receipt posts the full quantity", first.posted === 10 && (await qtyAt(clinic.id, item.id)) === 10,
    `posted=${first.posted} stock=${await qtyAt(clinic.id, item.id)}`);
  ok("first receipt derives RECEIVED", first.status === "RECEIVED", first.status);

  const second = await postReceipt(po.id);
  ok("duplicate PO receipt posts nothing", second.posted === 0 && (await qtyAt(clinic.id, item.id)) === 10,
    `stock=${await qtyAt(clinic.id, item.id)}`);

  // ── PARTIAL then remaining ────────────────────────────────────────────────
  const po2 = await prisma.purchaseOrder.create({
    data: {
      poRef: `${S}PO2`, clinicId: clinic.id, supplierId: supplier.id, status: "CONFIRMED",
      lines: { create: [{ itemId: item2.id, quantity: 12, receivedQty: 5, unitCost: "2.00" }] },
    },
  });

  const p1 = await postReceipt(po2.id);
  ok("partial receipt posts only what arrived", p1.posted === 5 && (await qtyAt(clinic.id, item2.id)) === 5,
    `stock=${await qtyAt(clinic.id, item2.id)}`);
  ok("partial receipt derives PARTIAL", p1.status === "PARTIAL", p1.status);

  await prisma.pOLine.updateMany({ where: { poId: po2.id }, data: { receivedQty: 12 } });
  const p2 = await postReceipt(po2.id);
  ok("remaining receipt posts only the balance", p2.posted === 7, `posted=${p2.posted}`);
  ok("stock equals the ordered quantity, not the sum of both receipts",
    (await qtyAt(clinic.id, item2.id)) === 12, `stock=${await qtyAt(clinic.id, item2.id)}`);
  ok("full receipt derives RECEIVED", p2.status === "RECEIVED", p2.status);

  // ── duplicate pool direct-receive (concurrent claim) ──────────────────────
  const pool = await prisma.poolOrder.create({
    data: {
      poRef: `${S}POOL`, initiatingClinicId: clinic.id, supplierName: `${S}supplier`,
      deliveryMode: "DIRECT", moqTarget: "100.00", status: "DELIVERED",
      participants: { create: { clinicId: clinic.id, requestedAmount: "50.00" } },
    },
    include: { participants: true },
  });
  const participantId = pool.participants[0].id;

  const claimReceive = () =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.poolParticipant.updateMany({
        where: { id: participantId, receivedAt: null },
        data:  { receivedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await receiveStock(clinic.id, [{ itemId: item.id, receivedQty: 4, unitCost: 5 }], tx);
      return true;
    });

  const before = await qtyAt(clinic.id, item.id);
  const [r1, r2] = await Promise.all([claimReceive(), claimReceive()]);
  ok("concurrent pool direct-receive posts exactly once", [r1, r2].filter(Boolean).length === 1,
    `results=${r1},${r2}`);
  ok("pool direct-receive stock moved by one receipt only",
    (await qtyAt(clinic.id, item.id)) === before + 4, `stock=${await qtyAt(clinic.id, item.id)}`);
  ok("a third pool receive is still refused", (await claimReceive()) === false);

  // ── concurrent deduct cannot go negative ──────────────────────────────────
  const scarce = await prisma.stockItem.create({ data: { sku: `${S}sku3`, name: `${S}scarce`, category: "Test" } });
  await receiveStock(clinic.id, [{ itemId: scarce.id, receivedQty: 10, unitCost: 1 }]);

  const results = await Promise.allSettled([
    deductStock(clinic.id, [{ itemId: scarce.id, quantity: 8 }]),
    deductStock(clinic.id, [{ itemId: scarce.id, quantity: 8 }]),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const finalQty = await qtyAt(clinic.id, scarce.id);
  ok("only one of two competing deductions succeeds", fulfilled === 1, `fulfilled=${fulfilled}`);
  ok("stock never goes negative", finalQty === 2, `stock=${finalQty}`);

  // ── concurrent receipts do not lose quantity ──────────────────────────────
  const hot = await prisma.stockItem.create({ data: { sku: `${S}sku4`, name: `${S}hot`, category: "Test" } });
  await Promise.all(
    Array.from({ length: 8 }, () => receiveStock(clinic.id, [{ itemId: hot.id, receivedQty: 5, unitCost: 3 }]))
  );
  const hotQty = await qtyAt(clinic.id, hot.id);
  const hotCost = (await prisma.clinicStock.findUnique({
    where: { clinicId_itemId: { clinicId: clinic.id, itemId: hot.id } },
  }))?.avgUnitCost;
  ok("eight concurrent receipts all land", hotQty === 40, `stock=${hotQty}`);
  ok("average cost survives concurrent receipts", Number(hotCost) === 3, `avgUnitCost=${hotCost}`);

  // Cleanup
  await prisma.stockBatch.deleteMany({ where: { clinicId: clinic.id } });
  await prisma.pOLine.deleteMany({ where: { po: { clinicId: clinic.id } } });
  await prisma.purchaseOrder.deleteMany({ where: { clinicId: clinic.id } });
  await prisma.poolParticipantLine.deleteMany({ where: { participant: { poolId: pool.id } } });
  await prisma.poolParticipant.deleteMany({ where: { poolId: pool.id } });
  await prisma.poolOrder.deleteMany({ where: { id: pool.id } });
  await prisma.clinicStock.deleteMany({ where: { clinicId: clinic.id } });
  await prisma.stockItem.deleteMany({ where: { sku: { startsWith: S } } });
  await prisma.supplier.deleteMany({ where: { id: supplier.id } });
  await prisma.clinic.deleteMany({ where: { id: clinic.id } });
  await prisma.entity.deleteMany({ where: { id: entity.id } });

  console.log(failures === 0 ? "\nAll Tier 1 stock checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
