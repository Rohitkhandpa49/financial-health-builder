export const NOTIFICATION_TYPES = [
  'BUDGET_THRESHOLD',
  'BUDGET_EXCEEDED',
  'RECURRING_TRANSACTION',
  'GOAL_PROGRESS',
  'BILL_REMINDER',
  'FINANCIAL_HEALTH',
  'GENERAL',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // NOTE: userId is intentionally NOT included here (user-scoped, never leak it)
}

export interface NotificationListQuery {
  page?: number;
  pageSize?: number;
  read?: boolean;
}

export interface NotificationListResponse {
  data: NotificationResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NotificationPreferenceResponse {
  id: string;
  budgetAlerts: boolean;
  goalAlerts: boolean;
  recurringReminders: boolean;
  financialHealthAlerts: boolean;
  billReminders: boolean;
  generalAlerts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePreferenceRequest {
  budgetAlerts?: boolean;
  goalAlerts?: boolean;
  recurringReminders?: boolean;
  financialHealthAlerts?: boolean;
  billReminders?: boolean;
  generalAlerts?: boolean;
}
