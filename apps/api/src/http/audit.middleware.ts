import type { Request, Response, NextFunction } from 'express';
import { logAuditEvent } from '../infrastructure/audit-logger.js';

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const method = req.method;
    // Only audit mutating methods
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      const userId = req.auth?.userId;
      logAuditEvent({
        event: `${method.toLowerCase()}.${req.path.split('/').filter(Boolean).slice(0, 3).join('.')}`,
        method,
        path: req.path,
        userId: userId ? userId.substring(0, 8) : undefined,
        requestId: req.requestId,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
      });
    }
  });
  next();
}
