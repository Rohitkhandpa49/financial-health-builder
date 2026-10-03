import type { RequestHandler } from 'express';
import { HttpError } from '../http/errors.js';
import type { NotificationService } from './notification.service.js';

// Module-level service singleton — set by the router factory
let _service: NotificationService | undefined;

export function setNotificationService(service: NotificationService): void {
  _service = service;
}

function getService(): NotificationService {
  if (!_service) {
    throw new HttpError({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' });
  }
  return _service;
}

function requireUserId(req: Express.Request): string {
  const userId = req.auth?.userId;
  if (!userId) {
    throw new HttpError({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Authentication is required.' });
  }
  return userId;
}

export const list: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const query = req.notificationQuery ?? { page: 1, pageSize: 20 };
    const result = await getService().list(userId, query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const id = req.notificationIdParam!.notificationId;
    const result = await getService().get(userId, id);
    res.status(200).json({ notification: result });
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const id = req.notificationIdParam!.notificationId;
    const result = await getService().markRead(userId, id);
    res.status(200).json({ notification: result });
  } catch (err) {
    next(err);
  }
};

export const markAllRead: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const result = await getService().markAllRead(userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteNotification: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const id = req.notificationIdParam!.notificationId;
    await getService().delete(userId, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const getPreferences: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const result = await getService().getPreferences(userId);
    res.status(200).json({ preferences: result });
  } catch (err) {
    next(err);
  }
};

export const updatePreferences: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const result = await getService().updatePreferences(userId, req.body as import('../../../../packages/contracts/src/notifications/notifications.js').UpdatePreferenceRequest);
    res.status(200).json({ preferences: result });
  } catch (err) {
    next(err);
  }
};

export const generate: RequestHandler = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const result = await getService().generateNotifications(userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
