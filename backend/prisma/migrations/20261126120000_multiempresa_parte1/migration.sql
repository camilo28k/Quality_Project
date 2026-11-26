-- Extensión multiempresa, parte 1 (SWR-TEN-001/002/003, SWR-ROLE-001/002).
-- Los datos existentes pasan a una "empresa inicial" sin perder usuarios, catálogo ni ventas.

-- 1) Nuevo rol
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- 2) Empresa
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC-',
    "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
    "invoiceFooter" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- 3) Empresa inicial: id fijo para poder rastrearla. Ya operaba, así que no se le exige el asistente.
INSERT INTO "Company" ("id", "tradeName", "onboardingCompleted")
VALUES ('00000000-0000-4000-8000-000000000001', 'TiendApp (empresa inicial)', true);
-- Prisma asigna updatedAt desde la aplicación; el default solo servía para la fila inicial.
ALTER TABLE "Company" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 4) Columnas companyId: se agregan nulas, se rellenan con la empresa inicial y luego se exigen.
ALTER TABLE "User" ADD COLUMN "companyId" TEXT,
                   ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Product" ADD COLUMN "companyId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "companyId" TEXT;

UPDATE "User"              SET "companyId" = '00000000-0000-4000-8000-000000000001';
UPDATE "Category"          SET "companyId" = '00000000-0000-4000-8000-000000000001';
UPDATE "Product"           SET "companyId" = '00000000-0000-4000-8000-000000000001';
UPDATE "InventoryMovement" SET "companyId" = '00000000-0000-4000-8000-000000000001';
UPDATE "Sale"              SET "companyId" = '00000000-0000-4000-8000-000000000001';

ALTER TABLE "Category" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "InventoryMovement" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "companyId" SET NOT NULL;

-- Solo el SUPER_ADMIN no pertenece a una empresa. Se compara como texto porque el valor
-- nuevo del enum no puede usarse como literal en la misma transacción.
ALTER TABLE "User" ADD CONSTRAINT "User_company_by_role_chk"
  CHECK (("role"::text = 'SUPER_ADMIN') = ("companyId" IS NULL));

-- 5) Unicidad por empresa (antes global)
DROP INDEX "Category_name_key";
DROP INDEX "Sale_idempotencyKey_key";
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");
CREATE UNIQUE INDEX "Sale_companyId_idempotencyKey_key" ON "Sale"("companyId", "idempotencyKey");
CREATE INDEX "Product_companyId_active_idx" ON "Product"("companyId", "active");
CREATE INDEX "Sale_companyId_createdAt_idx" ON "Sale"("companyId", "createdAt");

-- 6) Llaves foráneas: no se puede borrar una empresa con datos.
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
