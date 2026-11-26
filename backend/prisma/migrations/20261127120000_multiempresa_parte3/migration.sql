-- Extensión multiempresa, parte 3: auditoría (SWR-AUD-001), revisión de productos y precios
-- del vendedor (SWR-ROLE-003), movimientos de stock con motivo (SWR-STK-001).

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum


ALTER TYPE "MovementType" ADD VALUE 'ADJUSTMENT_OUT';
ALTER TYPE "MovementType" ADD VALUE 'VOID_RETURN';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "PriceChangeRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "currentPrice" INTEGER NOT NULL,
    "proposedPrice" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceChangeRequest_companyId_status_idx" ON "PriceChangeRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Quién creó cada producto existente: el usuario de su movimiento INITIAL.
UPDATE "Product" p SET "createdById" = m."userId"
FROM "InventoryMovement" m
WHERE m."productId" = p."id" AND m."type" = 'INITIAL' AND p."createdById" IS NULL;

-- SWR-AUD-001: la auditoría no se puede modificar ni borrar, ni siquiera desde la BD.
CREATE OR REPLACE FUNCTION audit_log_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es de solo inserción (SWR-AUD-001)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_inmutable();
