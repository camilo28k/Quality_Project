-- Extensión multiempresa, parte 4: consecutivo de factura (SWR-INV-001), anulación y
-- reemisión de ventas (SWR-SALE-V01/V02) y solicitudes de corrección (SWR-SALE-V03).

CREATE TYPE "SaleStatus" AS ENUM ('CONFIRMED', 'VOIDED');

ALTER TABLE "Sale" ADD COLUMN "correctsSaleId" TEXT,
ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" TEXT;

-- Numera las ventas existentes de cada empresa en orden de creación, a partir de su
-- siguiente consecutivo, y deja el contador después de la última.
WITH numbered AS (
  SELECT s."id", s."companyId",
         c."invoicePrefix" || (c."nextInvoiceNumber" + ROW_NUMBER() OVER (PARTITION BY s."companyId" ORDER BY s."createdAt", s."id") - 1) AS num
  FROM "Sale" s JOIN "Company" c ON c."id" = s."companyId"
)
UPDATE "Sale" s SET "invoiceNumber" = n.num FROM numbered n WHERE n."id" = s."id";

UPDATE "Company" c SET "nextInvoiceNumber" = c."nextInvoiceNumber" + x.cnt
FROM (SELECT "companyId", COUNT(*)::int AS cnt FROM "Sale" GROUP BY "companyId") x
WHERE x."companyId" = c."id";

ALTER TABLE "Sale" ALTER COLUMN "invoiceNumber" SET NOT NULL;

CREATE TABLE "SaleCorrectionRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleCorrectionRequest_companyId_status_idx" ON "SaleCorrectionRequest"("companyId", "status");
CREATE UNIQUE INDEX "Sale_correctsSaleId_key" ON "Sale"("correctsSaleId");
CREATE UNIQUE INDEX "Sale_companyId_invoiceNumber_key" ON "Sale"("companyId", "invoiceNumber");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_correctsSaleId_fkey" FOREIGN KEY ("correctsSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleCorrectionRequest" ADD CONSTRAINT "SaleCorrectionRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
