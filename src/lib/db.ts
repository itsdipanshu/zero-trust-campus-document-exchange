import { PrismaClient } from "@prisma/client";
import { validateEnvironment } from "./env";

// Perform safe startup environment validation
const envCheck = validateEnvironment();
if (envCheck.warnings.length > 0) {
  envCheck.warnings.forEach((w) => console.warn(w));
}
if (!envCheck.valid) {
  console.error("[CAMPUSVAULT CONFIGURATION ERROR] Environment validation warnings/errors:");
  envCheck.errors.forEach((e) => console.error(`  - ${e}`));
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

/**
 * Classifies Prisma / database runtime errors into safe, actionable messages
 * without ever exposing credentials, passwords, or raw connection strings.
 */
export function classifyDatabaseError(error: unknown): string | null {
  const errObj = error as { code?: string; message?: string } | null;
  const msg = errObj?.message || "";
  const code = errObj?.code || "";
  const rawDbUrl = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");

  if (!rawDbUrl) {
    return "DATABASE_URL is missing in Vercel/Netlify environment variables. Add your Supabase PostgreSQL URI (postgresql://...) and Redeploy.";
  }

  if (rawDbUrl.startsWith("https://") || rawDbUrl.startsWith("http://")) {
    return "DATABASE_URL is set to an HTTPS URL instead of a PostgreSQL URI. Copy the PostgreSQL Session Pooler URI (starting with postgresql://) from Supabase -> Connect and Redeploy.";
  }

  if (msg.includes("the URL must start with the protocol `file:`") || msg.includes("the URL must start with the protocol 'file:'")) {
    return "Prisma Client was built for SQLite while runtime DATABASE_URL is PostgreSQL. Trigger a fresh Redeploy (with Clear Cache) so the build regenerates Prisma for PostgreSQL.";
  }

  if (
    msg.includes("the URL must start with the protocol `postgresql://`") ||
    msg.includes("the URL must start with the protocol 'postgresql://'") ||
    msg.includes("Error validating datasource") ||
    msg.includes("must start with the protocol")
  ) {
    return "DATABASE_URL has an invalid protocol or surrounding quotes. Set it to a clean postgresql://... URI from Supabase -> Connect and Redeploy.";
  }

  if (msg.includes("Unable to open the database file") || (rawDbUrl.startsWith("file:") && process.env.NODE_ENV === "production")) {
    return "DATABASE_URL is pointing to local SQLite (file:...). Serverless deployments require a Supabase PostgreSQL URI (postgresql://...) and a fresh Redeploy.";
  }

  if (
    msg.includes("tenant/user") ||
    msg.includes("Tenant or user not found") ||
    (msg.includes("ENOTFOUND") && msg.includes("not found"))
  ) {
    return "Supabase Pooler region/host mismatch (tenant/user not found). Copy the exact Session Pooler URI directly from Supabase Dashboard -> Connect -> Session Pooler (do not manually assume aws-0-ap-south-1), update DATABASE_URL in Vercel, and Redeploy.";
  }

  if (code === "P1000" || msg.includes("Authentication failed against database server") || msg.includes("password authentication failed")) {
    return "Database authentication failed (P1000). Verify the database password inside DATABASE_URL (and URL-encode special characters like @, #, %) in Vercel/Netlify, then Redeploy.";
  }

  if (code === "P1001" || msg.includes("Can't reach database server")) {
    return "Cannot reach PostgreSQL server (P1001). On Vercel/Netlify, use Supabase's IPv4 Session Pooler URI (aws-0-...pooler.supabase.com:5432), not the IPv6-only db.*.supabase.co host.";
  }

  if (code === "P2021" || msg.includes("does not exist in the current database") || (msg.includes("relation") && msg.includes("does not exist"))) {
    return "Connected to Supabase PostgreSQL, but tables do not exist yet (P2021). Trigger a fresh Redeploy on Vercel/Netlify (so build runs prisma db push) or run 'npx prisma db push'.";
  }

  return null;
}

export default prisma;
