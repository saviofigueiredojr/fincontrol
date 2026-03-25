-- AlterTable
ALTER TABLE "RecurringTemplate" ADD COLUMN     "interval" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "intervalCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isVariable" BOOLEAN NOT NULL DEFAULT false;
