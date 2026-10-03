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

export interface TransactionExportRow {
  id: string;
  type: string;
  amount: { toString(): string };
  currency: string;
  description: string | null;
  effectiveAt: Date;
  categoryId: string | null;
  accountId: string;
  createdAt: Date;
}

export interface ReportRepository {
  getAccountActivity(userId: string, filter: DateRangeFilter): Promise<AccountActivityRow[]>;
  getTransactionsForExport?(
    userId: string,
    filter: { startDate?: Date; endDate?: Date },
  ): Promise<TransactionExportRow[]>;
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

    async getTransactionsForExport(userId, filter) {
      const where: Record<string, unknown> = {
        userId,
        type: { not: 'TRANSFER' },
      };
      if (filter.startDate || filter.endDate) {
        const effectiveAt: Record<string, Date> = {};
        if (filter.startDate) effectiveAt.gte = filter.startDate;
        if (filter.endDate) effectiveAt.lte = filter.endDate;
        where.effectiveAt = effectiveAt;
      }

      return prisma.transaction.findMany({
        where,
        orderBy: { effectiveAt: 'desc' },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          description: true,
          effectiveAt: true,
          categoryId: true,
          accountId: true,
          createdAt: true,
        },
      });
    },
  };
}
