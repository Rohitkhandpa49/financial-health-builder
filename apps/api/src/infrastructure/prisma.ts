import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../database/prisma/generated/client/client.js";

let prismaClient: PrismaClient | undefined;

export function getPrismaClient(databaseUrl: string): PrismaClient {
  prismaClient ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  return prismaClient;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = undefined;
  }
}