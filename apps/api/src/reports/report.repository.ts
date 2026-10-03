import type { PrismaClient } from "../../../../database/prisma/generated/client/client.js";
import type { DateRangeFilter } from "../analytics/analytics.repository.js";

export interface AccountActivityRow {
  accountId: string;
  accountName: string;
  currency: string;
  openingBalance: string;
  totalIncome: string;
  totalExpenses: string;
  transactionCount: number;
}

export interface ReportRepository {
  getAccountActivity(userId: string, filter: DateRangeFilter): Promise<AccountActivityRow[]>;
}

function decimalToString(value: unknown): string {
  if (value === null || value === undefined) return "0.0000";
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return (value as { toFixed: (n: number) => string }).toFixed(4);
  }
  if (typeof value === "string") {
    const n = parseFloat(value);
    return isNaN(n) ? "0.0000" : n.toFixed(4);
  }
  if (typeof value === "number") return value.toFixed(4);
  return "0.0000";
}

export function createPrismaReportRepository(prisma: PrismaClient): ReportRepository {
  return {
    async getAccountActivity(userId, filter) {
      // Fetch all user accounts
      const accounts = await prisma.account.findMany({
        where: { userId, archived: false },
        select: {
          id: true,
          name: true,
          currency: true,
          openingBalance: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      const result: AccountActivityRow[] = [];

      for (const account of accounts) {
        const [incomeAgg, expenseAgg, incomeCount, expenseCount] = await prisma.$transaction([
          prisma.transaction.aggregate({
            where: {
              userId,
              accountId: account.id,
              type: "INCOME",
              effectiveAt: { gte: filter.startDate, lte: filter.endDate },
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              userId,
              accountId: account.id,
              type: "EXPENSE",
              effectiveAt: { gte: filter.startDate, lte: filter.endDate },
            },
            _sum: { amount: true },
          }),
          prisma.transaction.count({
            where: {
              userId,
              accountId: account.id,
              type: "INCOME",
              effectiveAt: { gte: filter.startDate, lte: filter.endDate },
            },
          }),
          prisma.transaction.count({
            where: {
              userId,
              accountId: account.id,
              type: "EXPENSE",
              effectiveAt: { gte: filter.startDate, lte: filter.endDate },
            },
          }),
        ]);

        result.push({
          accountId: account.id,
          accountName: account.name,
          currency: account.currency.trim(),
          openingBalance: decimalToString(account.openingBalance),
          totalIncome: decimalToString(incomeAgg._sum.amount),
          totalExpenses: decimalToString(expenseAgg._sum.amount),
          transactionCount: incomeCount + expenseCount,
        });
      }

      return result;
    },
  };
}
