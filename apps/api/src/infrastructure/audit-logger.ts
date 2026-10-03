export interface AuditEvent {
  event: string;
  method: string;
  path: string;
  userId?: string; // first 8 chars only
  requestId?: string;
  statusCode: number;
  timestamp: string;
}

export function logAuditEvent(auditEvent: AuditEvent): void {
  const { event: eventName, ...rest } = auditEvent;
  console.info(JSON.stringify({ event: 'api.audit', name: eventName, ...rest }));
}
