import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../../database/prisma/generated/client/client.js';

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreferenceRow {
  id: string;
  userId: string;
  budgetAlerts: boolean;
  goalAlerts: boolean;
  recurringReminders: boolean;
  financialHealthAlerts: boolean;
  billReminders: boolean;
  generalAlerts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationRepository {
  create(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationRow>;

  listForUser(
    userId: string,
    query: { page: number; pageSize: number; read?: boolean },
  ): Promise<{ data: NotificationRow[]; total: number }>;

  findByIdForUser(id: string, userId: string): Promise<NotificationRow | null>;

  markReadForUser(id: string, userId: string): Promise<NotificationRow | null>;

  markAllReadForUser(userId: string): Promise<number>;

  deleteForUser(id: string, userId: string): Promise<boolean>;

  getPreferences(userId: string): Promise<PreferenceRow | null>;

  upsertPreferences(userId: string, prefs: Partial<Omit<PreferenceRow, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<PreferenceRow>;

  findRecentByType(userId: string, type: string, since: Date): Promise<NotificationRow[]>;
}

// ── Prisma implementation ─────────────────────────────────────────────────────

const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  message: true,
  read: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

const preferenceSelect = {
  id: true,
  userId: true,
  budgetAlerts: true,
  goalAlerts: true,
  recurringReminders: true,
  financialHealthAlerts: true,
  billReminders: true,
  generalAlerts: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toNotificationRow(n: {
  id: string; userId: string; type: string; title: string;
  message: string; read: boolean; metadata: unknown;
  createdAt: Date; updatedAt: Date;
}): NotificationRow {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    metadata: n.metadata as Record<string, unknown> | null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

export function createPrismaNotificationRepository(prisma: PrismaClient): INotificationRepository {
  return {
    async create(data) {
      const row = await prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type as import('../../../../database/prisma/generated/client/enums.js').NotificationType,
          title: data.title,
          message: data.message,
          metadata: data.metadata ?? undefined,
        },
        select: notificationSelect,
      });
      return toNotificationRow(row);
    },

    async listForUser(userId, query) {
      const where: Record<string, unknown> = { userId };
      if (query.read !== undefined) where.read = query.read;
      const skip = (query.page - 1) * query.pageSize;

      const [data, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.pageSize,
          select: notificationSelect,
        }),
        prisma.notification.count({ where }),
      ]);

      return { data: data.map(toNotificationRow), total };
    },

    async findByIdForUser(id, userId) {
      const row = await prisma.notification.findFirst({
        where: { id, userId },
        select: notificationSelect,
      });
      return row ? toNotificationRow(row) : null;
    },

    async markReadForUser(id, userId) {
      const existing = await prisma.notification.findFirst({ where: { id, userId } });
      if (!existing) return null;
      const row = await prisma.notification.update({
        where: { id },
        data: { read: true },
        select: notificationSelect,
      });
      return toNotificationRow(row);
    },

    async markAllReadForUser(userId) {
      const result = await prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return result.count;
    },

    async deleteForUser(id, userId) {
      const result = await prisma.notification.deleteMany({ where: { id, userId } });
      return result.count > 0;
    },

    async getPreferences(userId) {
      const row = await prisma.notificationPreference.findUnique({
        where: { userId },
        select: preferenceSelect,
      });
      return row ?? null;
    },

    async upsertPreferences(userId, prefs) {
      const row = await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...prefs },
        update: prefs,
        select: preferenceSelect,
      });
      return row;
    },

    async findRecentByType(userId, type, since) {
      const rows = await prisma.notification.findMany({
        where: {
          userId,
          type: type as import('../../../../database/prisma/generated/client/enums.js').NotificationType,
          createdAt: { gte: since },
        },
        select: notificationSelect,
      });
      return rows.map(toNotificationRow);
    },
  };
}

// ── In-memory implementation for tests ───────────────────────────────────────

export class MemoryNotificationRepository implements INotificationRepository {
  private notifications = new Map<string, NotificationRow>();
  private preferences = new Map<string, PreferenceRow>();

  async create(data: {
    userId: string; type: string; title: string; message: string; metadata?: Record<string, unknown>;
  }): Promise<NotificationRow> {
    const now = new Date();
    const row: NotificationRow = {
      id: randomUUID(),
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      read: false,
      metadata: data.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.notifications.set(row.id, row);
    return row;
  }

  async listForUser(userId: string, query: { page: number; pageSize: number; read?: boolean }): Promise<{ data: NotificationRow[]; total: number }> {
    let rows = [...this.notifications.values()].filter((n) => n.userId === userId);
    if (query.read !== undefined) rows = rows.filter((n) => n.read === query.read);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = rows.length;
    const skip = (query.page - 1) * query.pageSize;
    return { data: rows.slice(skip, skip + query.pageSize), total };
  }

  async findByIdForUser(id: string, userId: string): Promise<NotificationRow | null> {
    const row = this.notifications.get(id);
    return row && row.userId === userId ? row : null;
  }

  async markReadForUser(id: string, userId: string): Promise<NotificationRow | null> {
    const row = this.notifications.get(id);
    if (!row || row.userId !== userId) return null;
    const updated = { ...row, read: true, updatedAt: new Date() };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAllReadForUser(userId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.notifications) {
      if (row.userId === userId && !row.read) {
        this.notifications.set(id, { ...row, read: true, updatedAt: new Date() });
        count++;
      }
    }
    return count;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const row = this.notifications.get(id);
    if (!row || row.userId !== userId) return false;
    this.notifications.delete(id);
    return true;
  }

  async getPreferences(userId: string): Promise<PreferenceRow | null> {
    return this.preferences.get(userId) ?? null;
  }

  async upsertPreferences(userId: string, prefs: Partial<Omit<PreferenceRow, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<PreferenceRow> {
    const existing = this.preferences.get(userId);
    const now = new Date();
    const defaults = { budgetAlerts: true, goalAlerts: true, recurringReminders: true, financialHealthAlerts: true, billReminders: true, generalAlerts: true };
    const row: PreferenceRow = {
      id: existing?.id ?? randomUUID(),
      userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...defaults,
      ...existing,
      ...prefs,
    };
    this.preferences.set(userId, row);
    return row;
  }

  async findRecentByType(userId: string, type: string, since: Date): Promise<NotificationRow[]> {
    return [...this.notifications.values()].filter(
      (n) => n.userId === userId && n.type === type && n.createdAt >= since,
    );
  }
}
