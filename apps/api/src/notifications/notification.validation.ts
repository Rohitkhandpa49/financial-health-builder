import type { Request, RequestHandler } from 'express';
import { z, type ZodType } from 'zod';
import { HttpError } from '../http/errors.js';

declare global {
  namespace Express {
    interface Request {
      notificationQuery?: { page: number; pageSize: number; read?: boolean };
      notificationIdParam?: { notificationId: string };
    }
  }
}

function validationError(error: z.ZodError): HttpError {
  return new HttpError({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'The request is invalid.',
    details: {
      fields: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    },
  });
}

function validate<T>(
  schema: ZodType<T>,
  read: (request: Request) => unknown,
  write: (request: Request, value: T) => void,
): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(read(request));
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    write(request, result.data);
    next();
  };
}

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  read: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const notificationIdParamSchema = z.object({
  notificationId: z.string().uuid(),
});

export const updatePreferenceSchema = z.strictObject({
  budgetAlerts: z.boolean().optional(),
  goalAlerts: z.boolean().optional(),
  recurringReminders: z.boolean().optional(),
  financialHealthAlerts: z.boolean().optional(),
  billReminders: z.boolean().optional(),
  generalAlerts: z.boolean().optional(),
});

type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

export const validateNotificationQuery = validate<NotificationListQuery>(
  notificationListQuerySchema,
  (req) => req.query,
  (req, v) => { req.notificationQuery = v; },
);

export const validateNotificationIdParam = validate<NotificationIdParam>(
  notificationIdParamSchema,
  (req) => req.params,
  (req, v) => { req.notificationIdParam = v; },
);

export const validateUpdatePreference = validate<z.infer<typeof updatePreferenceSchema>>(
  updatePreferenceSchema,
  (req) => req.body,
  (_req, _v) => { /* validation only, body accessed directly */ },
);
