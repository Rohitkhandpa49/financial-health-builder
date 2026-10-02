import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAccountRouter, type AccountRouterOptions } from "./accounts/account.routes.js";
import { createAuthRouter, type AuthRouterOptions } from "./auth/auth.routes.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { requestIdMiddleware } from "./http/request-id.js";
import { v1Router } from "./routes/v1.js";

export interface AppOptions {
  frontendUrl?: string;
  auth?: AuthRouterOptions;
  accounts?: AccountRouterOptions;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      callback(null, Boolean(origin && origin === options.frontendUrl));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    credentials: true,
  }));
  app.use(express.json({ limit: "100kb", strict: true }));
  app.use("/api/v1", v1Router);
  if (options.auth) {
    app.use("/api/v1/auth", createAuthRouter(options.auth));
  }
  if (options.accounts) {
    app.use("/api/v1/accounts", createAccountRouter(options.accounts));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}