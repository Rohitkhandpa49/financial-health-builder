import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client.js";

config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before running the development seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const userId = "00000000-0000-4000-8000-000000000001";
const checkingAccountId = "00000000-0000-4000-8000-000000000002";
const savingsAccountId = "00000000-0000-4000-8000-000000000003";
const cashAccountId = "00000000-0000-4000-8000-000000000004";
const salaryCategoryId = "00000000-0000-4000-8000-000000000005";
const groceryCategoryId = "00000000-0000-4000-8000-000000000006";
const diningCategoryId = "00000000-0000-4000-8000-000000000007";

async function seed(): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      name: "Development User",
      email: "dev.user@example.test",
      passwordHash: "$seed$disabled$not-authenticatable",
    },
  });

  await prisma.account.createMany({
    skipDuplicates: true,
    data: [
      {
        id: checkingAccountId,
        userId,
        name: "Primary Account",
        type: "BANK",
        currency: "INR",
        openingBalance: "25000.0000",
      },
      {
        id: savingsAccountId,
        userId,
        name: "Savings Account",
        type: "SAVINGS",
        currency: "INR",
        openingBalance: "10000.0000",
      },
      {
        id: cashAccountId,
        userId,
        name: "Wallet",
        type: "CASH",
        currency: "INR",
        openingBalance: "1500.0000",
      },
    ],
  });

  await prisma.category.createMany({
    skipDuplicates: true,
    data: [
      {
        id: salaryCategoryId,
        name: "Salary",
        type: "INCOME",
        systemDefined: true,
      },
      {
        id: groceryCategoryId,
        name: "Groceries",
        type: "EXPENSE",
        systemDefined: true,
      },
      {
        id: diningCategoryId,
        userId,
        name: "Dining",
        type: "EXPENSE",
        systemDefined: false,
      },
    ],
  });

  await prisma.transaction.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "00000000-0000-4000-8000-000000000008",
        userId,
        accountId: checkingAccountId,
        categoryId: salaryCategoryId,
        type: "INCOME",
        amount: "75000.0000",
        currency: "INR",
        description: "Development sample income",
        effectiveAt: new Date("2026-09-01T09:00:00.000Z"),
      },
      {
        id: "00000000-0000-4000-8000-000000000009",
        userId,
        accountId: checkingAccountId,
        categoryId: groceryCategoryId,
        type: "EXPENSE",
        amount: "2500.0000",
        currency: "INR",
        description: "Development sample groceries",
        effectiveAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    ],
  });

  await prisma.budget.upsert({
    where: { id: "00000000-0000-4000-8000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000010",
      userId,
      categoryId: groceryCategoryId,
      name: "September groceries",
      amount: "12000.0000",
      currency: "INR",
      period: "MONTHLY",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
    },
  });

  await prisma.savingsGoal.upsert({
    where: { id: "00000000-0000-4000-8000-000000000011" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000011",
      userId,
      name: "Emergency reserve",
      targetAmount: "100000.0000",
      currentAmount: "12000.0000",
      currency: "INR",
      targetDate: new Date("2027-09-30T00:00:00.000Z"),
      status: "ACTIVE",
    },
  });
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}