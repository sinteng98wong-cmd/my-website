-- Migration: add-invoice-payment-lines
-- Splits Invoice.paymentMethod into a separate InvoicePayment table
-- supporting multiple payment methods per invoice (split payments).

-- 1. Create InvoicePayment table
CREATE TABLE "InvoicePayment" (
  "id"              TEXT         NOT NULL,
  "invoiceId"       TEXT         NOT NULL,
  "method"          "PaymentMethod" NOT NULL,
  "amount"          DECIMAL(10,2) NOT NULL,
  "panelProviderId" TEXT,
  "collectedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- 2. Foreign keys
ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_panelProviderId_fkey"
  FOREIGN KEY ("panelProviderId") REFERENCES "PanelProvider"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Migrate existing Invoice rows into InvoicePayment (one line per invoice)
INSERT INTO "InvoicePayment" ("id", "invoiceId", "method", "amount", "panelProviderId", "collectedAt", "createdAt")
SELECT
  concat('mig_', "id"),
  "id",
  "paymentMethod",
  "total",
  "panelProviderId",
  "collectedAt",
  CURRENT_TIMESTAMP
FROM "Invoice";

-- 4. Drop old columns from Invoice
ALTER TABLE "Invoice" DROP COLUMN "paymentMethod";
ALTER TABLE "Invoice" DROP COLUMN "panelProviderId";
