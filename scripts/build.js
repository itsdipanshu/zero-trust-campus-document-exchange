/**
 * CAMPUSVAULT – UNIFIED CROSS-PLATFORM BUILD RUNNER
 * 
 * Works consistently across Windows, Linux, Vercel, and Netlify:
 * 1. Guarantees NODE_ENV='production' to prevent non-standard NODE_ENV errors.
 * 2. Runs preparePrisma to dynamically adapt schema datasource (sqlite vs postgresql).
 * 3. Runs prisma generate.
 * 4. Runs deployDb to push schema and seed when cloud database (PostgreSQL) is connected.
 * 5. Executes 'next build' in production mode.
 */

const { execSync } = require("child_process");
const path = require("path");

// Guarantee production environment for Next.js build
process.env.NODE_ENV = "production";

console.log("=======================================================");
console.log("🚀 CAMPUSVAULT BUILD PIPELINE (NODE_ENV=production)");
console.log("=======================================================\n");

try {
  // Step 1: Adapt Prisma schema provider based on DATABASE_URL
  console.log("--> Step 1/4: Adapting Prisma Schema Provider...");
  require("./preparePrisma");

  // Step 2: Generate Prisma Client
  console.log("\n--> Step 2/4: Generating Prisma Client...");
  execSync("npx prisma generate", {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" }
  });

  // Step 3: Sync & Seed Database if cloud PostgreSQL detected
  console.log("\n--> Step 3/4: Database Sync & Verification...");
  require("./deployDb");

  // Step 4: Run Next.js Production Build
  console.log("\n--> Step 4/4: Building Next.js Application...");
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" }
  });

  console.log("\n=======================================================");
  console.log("✅ CAMPUSVAULT BUILD SUCCEEDED WITH ZERO ERRORS");
  console.log("=======================================================\n");
} catch (error) {
  console.error("\n❌ CAMPUSVAULT BUILD FAILED:", error.message);
  process.exit(1);
}
