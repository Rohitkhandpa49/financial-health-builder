import { Router } from 'express';
import type { AccessTokenService } from '../auth/access-token.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { NotificationService } from './notification.service.js';
import { setNotificationService } from './notification.controller.js';
import {
  validateNotificationQuery,
  validateNotificationIdParam,
  validateUpdatePreference,
} from './notification.validation.js';
import * as controller from './notification.controller.js';

export interface NotificationRouterOptions {
  service: NotificationService;
  accessTokenService: AccessTokenService;
}

export function createNotificationRouter(options: NotificationRouterOptions): Router {
  // Register the service singleton used by the controllers
  setNotificationService(options.service);

  const router = Router();
  const authenticate = requireAuthentication(options.accessTokenService);

  // Static routes FIRST (must come before dynamic param routes)
  router.get('/preferences', authenticate, controller.getPreferences);
  router.patch('/preferences', authenticate, validateUpdatePreference, controller.updatePreferences);
  router.patch('/read-all', authenticate, controller.markAllRead);
  router.post('/generate', authenticate, controller.generate);

  // Dynamic routes AFTER static
  router.get('/', authenticate, validateNotificationQuery, controller.list);
  router.get('/:notificationId', authenticate, validateNotificationIdParam, controller.get);
  router.patch('/:notificationId/read', authenticate, validateNotificationIdParam, controller.markRead);
  router.delete('/:notificationId', authenticate, validateNotificationIdParam, controller.deleteNotification);

  return router;
}
