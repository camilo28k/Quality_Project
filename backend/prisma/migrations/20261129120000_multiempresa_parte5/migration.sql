-- Extensión multiempresa, parte 5: verificación del correo de la empresa (SWR-MAIL-001)
-- y registro de envíos de facturas (SWR-MAIL-002).

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('INVOICE', 'VOID_NOTICE', 'REISSUE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEmail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailVerification_companyId_createdAt_idx" ON "EmailVerification"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceEmail_saleId_createdAt_idx" ON "InvoiceEmail"("saleId", "createdAt");

-- AddForeignKey
ALTER TABLE "InvoiceEmail" ADD CONSTRAINT "InvoiceEmail_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

