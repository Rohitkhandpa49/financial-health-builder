-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'SAVINGS', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SavingsGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'OVERDUE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "openingBalance" DECIMAL(19,4) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "type" "CategoryType" NOT NULL,
    "systemDefined" BOOLEAN NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "categoryId" UUID,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "transferGroupId" UUID,
    "transferDirection" "TransferDirection",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period" "BudgetPeriod" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "targetAmount" DECIMAL(19,4) NOT NULL,
    "currentAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "targetDate" DATE NOT NULL,
    "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_archived_idx" ON "Account"("userId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_currency_key" ON "Account"("id", "userId", "currency");

-- CreateIndex
CREATE INDEX "Category_userId_type_archived_idx" ON "Category"("userId", "type", "archived");

-- CreateIndex
CREATE INDEX "Transaction_userId_effectiveAt_idx" ON "Transaction"("userId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Transaction_accountId_userId_effectiveAt_idx" ON "Transaction"("accountId", "userId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_effectiveAt_idx" ON "Transaction"("categoryId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transferGroupId_transferDirection_key" ON "Transaction"("transferGroupId", "transferDirection");

-- CreateIndex
CREATE INDEX "Budget_userId_startDate_endDate_idx" ON "Budget"("userId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_status_idx" ON "SavingsGoal"("userId", "status");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_currency_fkey" FOREIGN KEY ("accountId", "userId", "currency") REFERENCES "Account"("id", "userId", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "Account"
ADD CONSTRAINT "Account_currency_format_check"
CHECK ("currency" ~ '^[A-Z]{3}$');

-- AddCheckConstraint
ALTER TABLE "Category"
ADD CONSTRAINT "Category_ownership_check"
CHECK (("systemDefined" AND "userId" IS NULL) OR (NOT "systemDefined" AND "userId" IS NOT NULL));

-- AddCheckConstraint
ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_amount_positive_check"
CHECK ("amount" > 0);

-- AddCheckConstraint
ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_currency_format_check"
CHECK ("currency" ~ '^[A-Z]{3}$');

-- AddCheckConstraint
ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_transfer_shape_check"
CHECK (("type" = 'TRANSFER' AND "transferGroupId" IS NOT NULL AND "transferDirection" IS NOT NULL)
    OR ("type" <> 'TRANSFER' AND "transferGroupId" IS NULL AND "transferDirection" IS NULL));

-- AddCheckConstraint
ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_amount_positive_check"
CHECK ("amount" > 0);

-- AddCheckConstraint
ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_currency_format_check"
CHECK ("currency" ~ '^[A-Z]{3}$');

-- AddCheckConstraint
ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_date_order_check"
CHECK ("startDate" <= "endDate");

-- AddCheckConstraint
ALTER TABLE "SavingsGoal"
ADD CONSTRAINT "SavingsGoal_target_amount_positive_check"
CHECK ("targetAmount" > 0);

-- AddCheckConstraint
ALTER TABLE "SavingsGoal"
ADD CONSTRAINT "SavingsGoal_current_amount_nonnegative_check"
CHECK ("currentAmount" >= 0);

-- AddCheckConstraint
ALTER TABLE "SavingsGoal"
ADD CONSTRAINT "SavingsGoal_currency_format_check"
CHECK ("currency" ~ '^[A-Z]{3}$');
