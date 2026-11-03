-- AlterEnum
ALTER TYPE "ExpenseType" ADD VALUE 'refund';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "refundOfId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_refundOfId_idx" ON "Expense"("refundOfId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
