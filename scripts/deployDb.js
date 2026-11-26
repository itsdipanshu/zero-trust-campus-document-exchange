/**
 * CAMPUSVAULT – AUTOMATED VERCEL DATABASE SYNC & SEED
 * 
 * Automatically executed during 'npm run build' on Vercel:
 * - If DATABASE_URL is PostgreSQL (Supabase/Neon), pushes the Prisma schema to create all tables
 *   and runs the idempotent seed script to populate departments and default users.
 * - If DATABASE_URL is SQLite, skips deployment push to avoid altering local development files.
 */

const { execSync } = require("child_process");

const dbUrl = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "").trim();
const isPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
const isCloud = Boolean(process.env.VERCEL || process.env.NETLIFY);

if (isPostgres) {
  console.log("\n=======================================================");
  console.log("[CAMPUSVAULT DEPLOY] Cloud PostgreSQL database detected.");
  console.log("[CAMPUSVAULT DEPLOY] Pushing schema to create all database tables...");
  console.log("=======================================================\n");

  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" });
    console.log("\n[CAMPUSVAULT DEPLOY] Schema synchronized successfully.");

    console.log("[CAMPUSVAULT DEPLOY] Seeding initial departments and campus users...");
    execSync("npx ts-node prisma/seed.ts", { stdio: "inherit" });
    console.log("[CAMPUSVAULT DEPLOY] Database seeding completed successfully!\n");
  } catch (err) {
    console.error("\n[CAMPUSVAULT DEPLOY ERROR] Database migration/seed issue:", err.message);
    // Don't fail the build if DB is temporarily unreachable, Next.js build can still proceed
  }
} else if (isCloud) {
  console.error("\n=======================================================");
  console.error("❌ [CAMPUSVAULT DEPLOY CONFIGURATION ERROR]");
  console.error("Vercel/Netlify deployment detected, but DATABASE_URL is missing or not a PostgreSQL URI!");
  console.error("Serverless environments cannot use SQLite (Error code 14: Unable to open database file).");
  console.error("Please add DATABASE_URL=postgresql://... in Vercel Settings -> Environment Variables");
  console.error("Make sure 'Production' environment checkbox is checked, then Redeploy.");
  console.error("=======================================================\n");
  throw new Error("DATABASE_URL must be a valid PostgreSQL connection URI on Vercel/Netlify.");
} else {
  console.log("[CAMPUSVAULT DEPLOY] Local/SQLite database configuration detected. Skipping cloud DB push.");
}
