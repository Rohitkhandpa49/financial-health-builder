import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../database/prisma/generated/client/client.js";
import type {
  TransferResponse,
  TransferSideResponse,
  TransferListQuery,
} from "../../../../packages/contracts/src/transfers/transfers.js";

export interface TransferPair {
  outgoing: {
    id: string;
    userId: string;
    accountId: string;
    amount: string;
    currency: string;
    description: string;
    effectiveAt: Date;
    transferGroupId: string;
    createdAt: Date;
  };
  incoming: {
    id: string;
    userId: string;
    accountId: string;
    amount: string;
    currency: string;
    description: string;
    effectiveAt: Date;
    transferGroupId: string;
    createdAt: Date;
  };
}

export interface TransferListResult {
  transfers: TransferPair[];
  totalItems: number;
}

export interface ResolvedTransferListQuery {
  page: number;
  pageSize: number;
  accountId?: string;
}

export interface TransferRepository {
  createTransfer(
    userId: string,
    data: {
      sourceAccountId: string;
      destinationAccountId: string;
      sourceCurrency: string;
      destinationCurrency: string;
      amount: string;
      description: string;
      effectiveAt: Date;
    },
  ): Promise<TransferPair>;
  listForUser(userId: string, query: ResolvedTransferListQuery): Promise<TransferListResult>;
  findByGroupId(transferGroupId: string, userId: string): Promise<TransferPair | null>;
  deleteByGroupId(transferGroupId: string, userId: string): Promise<boolean>;
}

const transferSelect = {
  id: true,
  userId: true,
  accountId: true,
  amount: true,
  currency: true,
  description: true,
  effectiveAt: true,
  transferGroupId: true,
  transferDirection: true,
  createdAt: true,
} as const;

export function createPrismaTransferRepository(prisma: PrismaClient): TransferRepository {
  return {
    async createTransfer(userId, data) {
      const transferGroupId = randomUUID();

      const [outgoing, incoming] = await prisma.$transaction([
        prisma.transaction.create({
          data: {
            userId,
            accountId: data.sourceAccountId,
            type: "TRANSFER",
            amount: data.amount,
            currency: data.sourceCurrency,
            description: data.description,
            effectiveAt: data.effectiveAt,
            transferGroupId,
            transferDirection: "OUTGOING",
          },
          select: transferSelect,
        }),
        prisma.transaction.create({
          data: {
            userId,
            accountId: data.destinationAccountId,
            type: "TRANSFER",
            amount: data.amount,
            currency: data.destinationCurrency,
            description: data.description,
            effectiveAt: data.effectiveAt,
            transferGroupId,
            transferDirection: "INCOMING",
          },
          select: transferSelect,
        }),
      ]);

      return {
        outgoing: { ...outgoing, amount: outgoing.amount.toFixed(4), currency: outgoing.currency.trim(), transferGroupId: outgoing.transferGroupId! },
        incoming: { ...incoming, amount: incoming.amount.toFixed(4), currency: incoming.currency.trim(), transferGroupId: incoming.transferGroupId! },
      };
    },

    async listForUser(userId, query) {
      const where: Record<string, unknown> = { userId, type: "TRANSFER" };
      if (query.accountId !== undefined) where.accountId = query.accountId;

      // Get distinct transferGroupIds for this user, paginated
      const allTransactions = await prisma.transaction.findMany({
        where,
        select: transferSelect,
        orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      });

      // Group by transferGroupId
      const groups = new Map<string, typeof allTransactions>();
      for (const tx of allTransactions) {
        if (!tx.transferGroupId) continue;
        if (!groups.has(tx.transferGroupId)) groups.set(tx.transferGroupId, []);
        groups.get(tx.transferGroupId)!.push(tx);
      }

      const groupIds = [...groups.keys()];
      const totalItems = groupIds.length;
      const start = (query.page - 1) * query.pageSize;
      const pageGroupIds = groupIds.slice(start, start + query.pageSize);

      const transfers: TransferPair[] = [];
      for (const groupId of pageGroupIds) {
        const sides = groups.get(groupId)!;
        const outgoing = sides.find((s) => s.transferDirection === "OUTGOING");
        const incoming = sides.find((s) => s.transferDirection === "INCOMING");
        if (outgoing && incoming) {
          transfers.push({
            outgoing: { ...outgoing, amount: outgoing.amount.toFixed(4), currency: outgoing.currency.trim(), transferGroupId: groupId },
            incoming: { ...incoming, amount: incoming.amount.toFixed(4), currency: incoming.currency.trim(), transferGroupId: groupId },
          });
        }
      }

      return { transfers, totalItems };
    },

    async findByGroupId(transferGroupId, userId) {
      const sides = await prisma.transaction.findMany({
        where: { transferGroupId, userId, type: "TRANSFER" },
        select: transferSelect,
      });

      const outgoing = sides.find((s) => s.transferDirection === "OUTGOING");
      const incoming = sides.find((s) => s.transferDirection === "INCOMING");
      if (!outgoing || !incoming) return null;

      return {
        outgoing: { ...outgoing, amount: outgoing.amount.toFixed(4), currency: outgoing.currency.trim(), transferGroupId },
        incoming: { ...incoming, amount: incoming.amount.toFixed(4), currency: incoming.currency.trim(), transferGroupId },
      };
    },

    async deleteByGroupId(transferGroupId, userId) {
      const result = await prisma.transaction.deleteMany({
        where: { transferGroupId, userId, type: "TRANSFER" },
      });
      return result.count > 0;
    },
  };
}

export function toTransferResponse(pair: TransferPair): TransferResponse {
  const outSide: TransferSideResponse = {
    transactionId: pair.outgoing.id,
    accountId: pair.outgoing.accountId,
    direction: "OUTGOING",
    amount: pair.outgoing.amount,
    currency: pair.outgoing.currency,
  };
  const inSide: TransferSideResponse = {
    transactionId: pair.incoming.id,
    accountId: pair.incoming.accountId,
    direction: "INCOMING",
    amount: pair.incoming.amount,
    currency: pair.incoming.currency,
  };
  return {
    transferGroupId: pair.outgoing.transferGroupId,
    amount: pair.outgoing.amount,
    description: pair.outgoing.description,
    effectiveAt: pair.outgoing.effectiveAt.toISOString(),
    outgoing: outSide,
    incoming: inSide,
    createdAt: pair.outgoing.createdAt.toISOString(),
  };
}
