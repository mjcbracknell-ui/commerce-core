-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "passwordResetCodeHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN "pendingEmail" TEXT,
ADD COLUMN "emailChangeCodeHash" TEXT,
ADD COLUMN "emailChangeExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "refundedTotal" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "resolution" TEXT NOT NULL DEFAULT 'refund',
    "reason" TEXT,
    "note" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "exchangeItems" JSONB NOT NULL DEFAULT '[]',
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "refundAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "requestedBy" TEXT NOT NULL DEFAULT 'customer',
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "exchangeFulfilledAt" TIMESTAMP(3),
    "exchangeCarrier" TEXT,
    "exchangeTrackingNumber" TEXT,
    "exchangeTrackingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "minSubtotal" DECIMAL(65,30),
    "maxSubtotal" DECIMAL(65,30),
    "freeOver" DECIMAL(65,30),
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRegion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRegion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderReturn_orderId_status_idx" ON "OrderReturn"("orderId", "status");

-- CreateIndex
CREATE INDEX "ShippingZone_storeId_position_idx" ON "ShippingZone"("storeId", "position");

-- CreateIndex
CREATE INDEX "ShippingRate_zoneId_position_idx" ON "ShippingRate"("zoneId", "position");

-- CreateIndex
CREATE INDEX "TaxRegion_storeId_country_idx" ON "TaxRegion"("storeId", "country");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingZone" ADD CONSTRAINT "ShippingZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ShippingZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRegion" ADD CONSTRAINT "TaxRegion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
