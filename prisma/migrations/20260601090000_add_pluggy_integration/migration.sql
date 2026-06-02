CREATE TABLE "PluggyItem" (
    "id" TEXT NOT NULL,
    "pluggyItemId" TEXT NOT NULL,
    "connectorId" INTEGER,
    "connectorName" TEXT,
    "status" TEXT,
    "executionStatus" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "raw" JSONB,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggyItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PluggyAccount" (
    "id" TEXT NOT NULL,
    "pluggyAccountId" TEXT NOT NULL,
    "pluggyItemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "name" TEXT NOT NULL,
    "marketingName" TEXT,
    "number" TEXT,
    "owner" TEXT,
    "currencyCode" TEXT,
    "balance" DOUBLE PRECISION,
    "creditLimit" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggyAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PluggyBill" (
    "id" TEXT NOT NULL,
    "pluggyBillId" TEXT NOT NULL,
    "pluggyAccountId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "closeDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION,
    "minimumPayment" DOUBLE PRECISION,
    "status" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggyBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PluggyTransaction" (
    "id" TEXT NOT NULL,
    "pluggyTransactionId" TEXT NOT NULL,
    "pluggyAccountId" TEXT NOT NULL,
    "importedTransactionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "category" TEXT,
    "categoryId" TEXT,
    "merchantName" TEXT,
    "paymentData" JSONB,
    "creditCardMetadata" JSONB,
    "raw" JSONB,
    "suggestedType" TEXT,
    "suggestedCategory" TEXT,
    "suggestedCompetencia" TEXT,
    "duplicateReason" TEXT,
    "ignoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PluggySyncLog" (
    "id" TEXT NOT NULL,
    "pluggyItemId" TEXT,
    "pluggyAccountId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAccounts" INTEGER NOT NULL DEFAULT 0,
    "createdBills" INTEGER NOT NULL DEFAULT 0,
    "createdTxs" INTEGER NOT NULL DEFAULT 0,
    "updatedTxs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PluggySyncLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluggyItem_pluggyItemId_key" ON "PluggyItem"("pluggyItemId");
CREATE INDEX "PluggyItem_householdId_idx" ON "PluggyItem"("householdId");
CREATE INDEX "PluggyItem_userId_idx" ON "PluggyItem"("userId");
CREATE INDEX "PluggyItem_status_idx" ON "PluggyItem"("status");

CREATE UNIQUE INDEX "PluggyAccount_pluggyAccountId_key" ON "PluggyAccount"("pluggyAccountId");
CREATE INDEX "PluggyAccount_pluggyItemId_idx" ON "PluggyAccount"("pluggyItemId");
CREATE INDEX "PluggyAccount_type_idx" ON "PluggyAccount"("type");

CREATE UNIQUE INDEX "PluggyBill_pluggyBillId_key" ON "PluggyBill"("pluggyBillId");
CREATE INDEX "PluggyBill_pluggyAccountId_idx" ON "PluggyBill"("pluggyAccountId");
CREATE INDEX "PluggyBill_dueDate_idx" ON "PluggyBill"("dueDate");

CREATE UNIQUE INDEX "PluggyTransaction_pluggyTransactionId_key" ON "PluggyTransaction"("pluggyTransactionId");
CREATE INDEX "PluggyTransaction_pluggyAccountId_idx" ON "PluggyTransaction"("pluggyAccountId");
CREATE INDEX "PluggyTransaction_date_idx" ON "PluggyTransaction"("date");
CREATE INDEX "PluggyTransaction_importedTransactionId_idx" ON "PluggyTransaction"("importedTransactionId");
CREATE INDEX "PluggyTransaction_ignoredAt_idx" ON "PluggyTransaction"("ignoredAt");

CREATE INDEX "PluggySyncLog_pluggyItemId_idx" ON "PluggySyncLog"("pluggyItemId");
CREATE INDEX "PluggySyncLog_pluggyAccountId_idx" ON "PluggySyncLog"("pluggyAccountId");
CREATE INDEX "PluggySyncLog_status_idx" ON "PluggySyncLog"("status");

ALTER TABLE "PluggyItem" ADD CONSTRAINT "PluggyItem_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PluggyItem" ADD CONSTRAINT "PluggyItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PluggyAccount" ADD CONSTRAINT "PluggyAccount_pluggyItemId_fkey"
    FOREIGN KEY ("pluggyItemId") REFERENCES "PluggyItem"("pluggyItemId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PluggyBill" ADD CONSTRAINT "PluggyBill_pluggyAccountId_fkey"
    FOREIGN KEY ("pluggyAccountId") REFERENCES "PluggyAccount"("pluggyAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PluggyTransaction" ADD CONSTRAINT "PluggyTransaction_pluggyAccountId_fkey"
    FOREIGN KEY ("pluggyAccountId") REFERENCES "PluggyAccount"("pluggyAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PluggyTransaction" ADD CONSTRAINT "PluggyTransaction_importedTransactionId_fkey"
    FOREIGN KEY ("importedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PluggySyncLog" ADD CONSTRAINT "PluggySyncLog_pluggyItemId_fkey"
    FOREIGN KEY ("pluggyItemId") REFERENCES "PluggyItem"("pluggyItemId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PluggyAccount" ADD COLUMN "linkedCreditCardId" TEXT;
CREATE INDEX "PluggyAccount_linkedCreditCardId_idx" ON "PluggyAccount"("linkedCreditCardId");
ALTER TABLE "PluggyAccount" ADD CONSTRAINT "PluggyAccount_linkedCreditCardId_fkey"
    FOREIGN KEY ("linkedCreditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
