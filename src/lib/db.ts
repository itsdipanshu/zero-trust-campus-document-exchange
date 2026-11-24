import { PrismaClient } from "@prisma/client";
import { validateEnvironment } from "./env";

// Perform safe startup environment validation
const envCheck = validateEnvironment();
if (envCheck.warnings.length > 0) {
  envCheck.warnings.forEach((w) => console.warn(w));
}
if (!envCheck.valid) {
  console.error("[CAMPUSVAULT CONFIGURATION ERROR] Environment validation failed:");
  envCheck.errors.forEach((e) => console.error(`  - ${e}`));
  if (process.env.NODE_ENV === "production") {
    throw new Error("[CAMPUSVAULT FATAL] Cannot start in production with invalid environment variables.");
  }
}

// Global Prisma client instance - prevents hot-reload creating multiple connections
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
