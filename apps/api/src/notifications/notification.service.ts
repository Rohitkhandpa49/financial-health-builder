import type {
  NotificationResponse,
  NotificationListResponse,
  NotificationPreferenceResponse,
  UpdatePreferenceRequest,
} from '../../../../packages/contracts/src/notifications/notifications.js';
import { HttpError } from '../http/errors.js';
import type { INotificationRepository, NotificationRow, PreferenceRow } from './notification.repository.js';
import type { AnalyticsService } from '../analytics/analytics.service.js';
import { buildDateRange } from '../analytics/analytics.service.js';

function toResponse(row: NotificationRow): NotificationResponse {
  return {
    id: row.id,
    type: row.type as NotificationResponse['type'],
    title: row.title,
    message: row.message,
    read: row.read,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPreferenceResponse(row: PreferenceRow): NotificationPreferenceResponse {
  return {
    id: row.id,
    budgetAlerts: row.budgetAlerts,
    goalAlerts: row.goalAlerts,
    recurringReminders: row.recurringReminders,
    financialHealthAlerts: row.financialHealthAlerts,
    billReminders: row.billReminders,
    generalAlerts: row.generalAlerts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class NotificationService {
  constructor(
    private readonly repo: INotificationRepository,
    private readonly analytics?: AnalyticsService,
  ) {}

  async list(
    userId: string,
    query: { page: number; pageSize: number; read?: boolean },
  ): Promise<NotificationListResponse> {
    const { data, total } = await this.repo.listForUser(userId, query);
    return {
      data: data.map(toResponse),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(userId: string, id: string): Promise<NotificationResponse> {
    const row = await this.repo.findByIdForUser(id, userId);
    if (!row) {
      throw new HttpError({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
    }
    return toResponse(row);
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    const row = await this.repo.markReadForUser(id, userId);
    if (!row) {
      throw new HttpError({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
    }
    return toResponse(row);
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const count = await this.repo.markAllReadForUser(userId);
    return { count };
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteForUser(id, userId);
    if (!deleted) {
      throw new HttpError({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
    }
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceResponse> {
    const existing = await this.repo.getPreferences(userId);
    if (existing) return toPreferenceResponse(existing);
    // Create defaults on first access
    const created = await this.repo.upsertPreferences(userId, {});
    return toPreferenceResponse(created);
  }

  async updatePreferences(userId: string, prefs: UpdatePreferenceRequest): Promise<NotificationPreferenceResponse> {
    const row = await this.repo.upsertPreferences(userId, prefs);
    return toPreferenceResponse(row);
  }

  async generateNotifications(userId: string): Promise<{ generated: number }> {
    if (!this.analytics) return { generated: 0 };

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let generated = 0;

    // Helper: skip if we already generated this type in the last 24h
    const alreadySent = async (type: string): Promise<boolean> => {
      const recent = await this.repo.findRecentByType(userId, type, since24h);
      return recent.length > 0;
    };

    // 1. Budget alerts
    try {
      const budgets = await this.analytics.getBudgetsAnalytics(userId);
      for (const budget of budgets.budgets) {
        const util = parseFloat(budget.utilizationPercentage);
        if (util >= 100) {
          if (!(await alreadySent('BUDGET_EXCEEDED'))) {
            await this.repo.create({
              userId,
              type: 'BUDGET_EXCEEDED',
              title: 'Budget exceeded',
              message: `Your budget "${budget.name}" has been exceeded (${util.toFixed(1)}% utilized).`,
              metadata: { budgetId: budget.budgetId, utilizationPercentage: budget.utilizationPercentage },
            });
            generated++;
          }
        } else if (util >= 80) {
          if (!(await alreadySent('BUDGET_THRESHOLD'))) {
            await this.repo.create({
              userId,
              type: 'BUDGET_THRESHOLD',
              title: 'Budget nearing limit',
              message: `Your budget "${budget.name}" is ${util.toFixed(1)}% utilized.`,
              metadata: { budgetId: budget.budgetId, utilizationPercentage: budget.utilizationPercentage },
            });
            generated++;
          }
        }
      }
    } catch {
      // analytics failure should not break the rest
    }

    // 2. Overdue goals
    try {
      const goals = await this.analytics.getGoalsAnalytics(userId);
      const now = new Date();
      for (const goal of goals.goals) {
        if (goal.status === 'OVERDUE') {
          if (!(await alreadySent('GOAL_PROGRESS'))) {
            await this.repo.create({
              userId,
              type: 'GOAL_PROGRESS',
              title: 'Goal overdue',
              message: `Your savings goal "${goal.name}" is overdue. Current progress: ${goal.progressPercentage}%.`,
              metadata: { goalId: goal.goalId, progressPercentage: goal.progressPercentage },
            });
            generated++;
            void now; // suppress unused warning
          }
        }
      }
    } catch {
      // analytics failure should not break the rest
    }

    // 3. Negative cash flow this month
    try {
      const filter = buildDateRange();
      const summary = await this.analytics.getSummary(userId, filter);
      const net = parseFloat(summary.netCashFlow);
      if (net < 0) {
        if (!(await alreadySent('FINANCIAL_HEALTH'))) {
          await this.repo.create({
            userId,
            type: 'FINANCIAL_HEALTH',
            title: 'Negative cash flow this month',
            message: `Your expenses exceed income this month by ${Math.abs(net).toFixed(2)}.`,
            metadata: { netCashFlow: summary.netCashFlow },
          });
          generated++;
        }
      }
    } catch {
      // analytics failure should not break the rest
    }

    return { generated };
  }
}
