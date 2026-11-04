-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);
