import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const suppliedRequestId = request.get("X-Request-Id");
  const requestId = suppliedRequestId && requestIdPattern.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();

  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
};