/**
 * CAMPUSVAULT – DYNAMIC PRISMA PROVIDER ADAPTER
 * 
 * Automatically synchronizes the Prisma schema provider based on the active DATABASE_URL:
 * - When DATABASE_URL starts with "postgresql://" or "postgres://" (e.g. Supabase / Neon in production):
 *   Sets provider = "postgresql".
 * - When DATABASE_URL starts with "file:" or is local/default:
 *   Sets provider = "sqlite".
 * 
 * This ensures seamless deployment on Vercel while preserving local SQLite development workflow.
 */

const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const envPath = path.join(__dirname, "..", ".env");

let dbUrl = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "").trim();

// If process.env.DATABASE_URL is not set, load it from .env
if (!dbUrl && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(/DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
  if (match) {
    dbUrl = match[1].trim();
  }
}

const isCloud = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

// On cloud serverless (Vercel/Netlify), SQLite is never supported; always require PostgreSQL
const targetProvider = (isCloud || isPostgres) ? "postgresql" : "sqlite";

if (fs.existsSync(schemaPath)) {
  let schema = fs.readFileSync(schemaPath, "utf8");

  const match = schema.match(/provider\s*=\s*"(\w+)"/);
  const currentProvider = match ? match[1] : null;

  if (currentProvider && currentProvider !== targetProvider) {
    schema = schema.replace(
      /provider\s*=\s*"(\w+)"/,
      `provider = "${targetProvider}"`
    );
    fs.writeFileSync(schemaPath, schema, "utf8");
    console.log(`[CAMPUSVAULT PRISMA] Synced datasource provider to '${targetProvider}' for DATABASE_URL protocol.`);
  } else {
    console.log(`[CAMPUSVAULT PRISMA] Datasource provider is already '${currentProvider || targetProvider}'.`);
  }
}
