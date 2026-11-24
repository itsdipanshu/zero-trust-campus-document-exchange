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

if (fs.existsSync(schemaPath)) {
  let schema = fs.readFileSync(schemaPath, "utf8");
  const dbUrl = (process.env.DATABASE_URL || "").trim();

  const isPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
  const targetProvider = isPostgres ? "postgresql" : "sqlite";

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
