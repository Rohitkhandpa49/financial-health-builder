import { createApp } from "./app.js";
import { Argon2PasswordHasher } from "./auth/password-hasher.js";
import { createPrismaAuthRepository } from "./auth/auth.repository.js";
import { AuthenticationService } from "./auth/auth.service.js";
import { JoseAccessTokenService } from "./auth/access-token.js";
import { loadConfig } from "./config.js";
import { disconnectPrismaClient, getPrismaClient } from "./infrastructure/prisma.js";

const config = loadConfig();
const prisma = getPrismaClient(config.databaseUrl);
const authService = new AuthenticationService(
  createPrismaAuthRepository(prisma),
  new Argon2PasswordHasher(),
);
const accessTokenService = new JoseAccessTokenService(config.jwtSecret);

const app = createApp({
  frontendUrl: config.frontendUrl,
  auth: {
    authService,
    accessTokenService,
    frontendUrl: config.frontendUrl,
    secureCookies: config.nodeEnv === "production",
  },
});
const server = app.listen(config.port, () => {
  console.info(JSON.stringify({
    event: "http.server.started",
    port: config.port,
    environment: config.nodeEnv,
  }));
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(JSON.stringify({ event: "http.server.stopping", signal }));

  server.close(async (error) => {
    try {
      await disconnectPrismaClient();
      process.exitCode = error ? 1 : 0;
    } catch {
      console.error(JSON.stringify({ event: "database.disconnect_failed" }));
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));