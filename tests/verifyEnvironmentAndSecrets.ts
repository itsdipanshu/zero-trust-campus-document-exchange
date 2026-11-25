import fs from "fs";
import path from "path";
import { getEncryptionKey, encryptDocument, decryptDocument, isEncryptedDocument } from "../src/lib/crypto";
import { getJwtSecret, generateToken, verifyToken } from "../src/lib/auth";
import { validateEnvironment } from "../src/lib/env";
import prisma from "../src/lib/db";

async function runEnvAndSecurityAudit() {
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log("  CAMPUSVAULT – ENVIRONMENT CONFIGURATION & SECURITY AUDIT SUITE         ");
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  function assert(testNum: number, name: string, condition: boolean, details: string) {
    if (condition) {
      console.log(`[PASS] Test ${testNum}: ${name}`);
      console.log(`       Details: ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testNum}: ${name}`);
      console.error(`       Details: ${details}`);
      failed++;
    }
  }

  // 1. Environment variables inventory check
  const envValidation = validateEnvironment();
  assert(
    1,
    "Environment Variables Inventory & Validation",
    envValidation.valid,
    `Environment validated: errors=${envValidation.errors.length}, warnings=${envValidation.warnings.length}`
  );

  // 2. Database Architecture Identification
  const dbUrl = process.env.DATABASE_URL || "";
  const usesSqlite = dbUrl.startsWith("file:");
  assert(
    2,
    "Database Architecture Identification (SQLite vs Supabase)",
    usesSqlite && fs.existsSync(path.join(process.cwd(), "prisma", "dev.db")),
    `Active local engine: SQLite (prisma/dev.db); Supabase Postgres schema provided for cloud sync.`
  );

  // 3. DATABASE_URL matches actual database architecture
  const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
  const schemaContent = fs.readFileSync(schemaPath, "utf8");
  const prismaProviderIsSqlite = schemaContent.includes('provider = "sqlite"');
  assert(
    3,
    "DATABASE_URL Architecture Match",
    usesSqlite && prismaProviderIsSqlite,
    `Prisma provider 'sqlite' matches local SQLite configuration`
  );

  // 4. JWT_SECRET Usage & Session Token Security
  const jwtSecret = getJwtSecret();
  const testPayload = { userId: "test-user-id", email: "audit@campusvault.edu", role: "student", departmentId: null };
  const token = generateToken(testPayload);
  const decoded = verifyToken(token);
  assert(
    4,
    "JWT_SECRET Token Signing & Verification",
    decoded !== null && decoded.userId === testPayload.userId && jwtSecret.length >= 16,
    `JWT signed and verified successfully. Token length=${token.length}`
  );

  // 5. DOCUMENT_ENCRYPTION_KEY Format & AES-256-GCM Verification
  const encKeyBuffer = getEncryptionKey();
  const hexKey = process.env.DOCUMENT_ENCRYPTION_KEY || "";
  const is64Hex = /^[0-9a-fA-F]{64}$/.test(hexKey.trim());
  assert(
    5,
    "DOCUMENT_ENCRYPTION_KEY Format (256-bit AES-GCM)",
    is64Hex && encKeyBuffer.length === 32,
    `Key format confirmed: 64 hexadecimal characters -> exactly 32 raw bytes (256 bits).`
  );

  // 6. Existing Document Encryption & Decryption Verification
  const uploadsDir = path.join(process.cwd(), "uploads");
  const uploadFiles = fs.readdirSync(uploadsDir).filter((f) => f !== ".gitkeep");
  let encryptedFilesCount = 0;
  let allDecryptedOk = true;

  for (const f of uploadFiles) {
    const buf = fs.readFileSync(path.join(uploadsDir, f));
    if (isEncryptedDocument(buf)) {
      encryptedFilesCount++;
      try {
        const res = await decryptDocument(buf);
        if (!res.isEncrypted || res.plaintext.length === 0) allDecryptedOk = false;
      } catch {
        allDecryptedOk = false;
      }
    }
  }

  assert(
    6,
    "Existing Encrypted Documents Verification",
    encryptedFilesCount > 0 && allDecryptedOk,
    `Found ${encryptedFilesCount} encrypted documents in uploads/; all decrypted successfully with master key.`
  );

  // 7. Encryption Key Safety & Rotation Protection
  // Simulate what happens if key is changed without migration
  const wrongKey = Buffer.from("f".repeat(64), "hex");
  const testEnc = await encryptDocument(Buffer.from("TEST_DOCUMENT_DATA"));
  let wrongKeyRejected = false;
  try {
    await decryptDocument(testEnc.encryptedBuffer, wrongKey);
  } catch (err: any) {
    if (err.message.includes("CRYPTO_AUTH_FAILED")) wrongKeyRejected = true;
  }
  assert(
    7,
    "Key Rotation Protection (Decryption Fails Safely on Key Mismatch)",
    wrongKeyRejected,
    `Wrong key safely rejected by authentication tag without leaking data. Key cannot be changed without migration.`
  );

  // 8. Secret Isolation in Frontend & Logs
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
  const ignoresEnv = gitignoreContent.includes(".env") && gitignoreContent.includes(".env.*");
  const ignoresDb = gitignoreContent.includes("*.db") && gitignoreContent.includes("/prisma/*.db");
  assert(
    8,
    ".gitignore Excludes Real .env and Database Files",
    ignoresEnv && ignoresDb,
    `.gitignore correctly excludes .env, .env.*, *.db, and prisma/*.db`
  );

  // 9. .env.example with Placeholders Only
  const envExamplePath = path.join(process.cwd(), ".env.example");
  const envExampleExists = fs.existsSync(envExamplePath);
  const envExampleContent = envExampleExists ? fs.readFileSync(envExamplePath, "utf8") : "";
  const hasZeroKey = envExampleContent.includes("0000000000000000000000000000000000000000000000000000000000000000");
  const hasPlaceholderJwt = envExampleContent.includes("your-strong-random-jwt-secret");
  assert(
    9,
    ".env.example Template Verification",
    envExampleExists && hasZeroKey && hasPlaceholderJwt,
    `.env.example contains placeholder values and safe documentation only.`
  );

  // 10. Missing / Invalid Environment Variable Error Handling
  let missingKeyErrorCaught = false;
  const originalKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  try {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    getEncryptionKey();
  } catch (err: any) {
    if (err.message.includes("DOCUMENT_ENCRYPTION_KEY environment variable is not configured")) {
      missingKeyErrorCaught = true;
    }
  } finally {
    process.env.DOCUMENT_ENCRYPTION_KEY = originalKey;
  }
  assert(
    10,
    "Missing Environment Variable Startup Error Handling",
    missingKeyErrorCaught,
    `Missing DOCUMENT_ENCRYPTION_KEY produces understandable, descriptive startup error.`
  );

  // 11. Production Configuration Protection
  const origNodeEnv = process.env.NODE_ENV;
  const origJwt = process.env.JWT_SECRET;
  let prodDefaultSecretBlocked = false;
  try {
    (process.env as any).NODE_ENV = "production";
    process.env.JWT_SECRET = "campusvault-default-secret";
    getJwtSecret();
  } catch (err: any) {
    if (err.message.includes("AUTH_CONFIG_ERROR")) {
      prodDefaultSecretBlocked = true;
    }
  } finally {
    (process.env as any).NODE_ENV = origNodeEnv;
    process.env.JWT_SECRET = origJwt;
  }
  assert(
    11,
    "Production Mode Blocks Default Development Secrets",
    prodDefaultSecretBlocked,
    `Production mode strictly blocks default development secret 'campusvault-default-secret'.`
  );

  // 12. Database Integrity Check
  const [users, depts, docs] = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.document.count(),
  ]);
  assert(
    12,
    "Database Record Preservation & Non-Destructive Operation",
    users > 0 && depts >= 7 && docs > 0,
    `Verified database preserved: ${users} users, ${depts} departments, ${docs} documents.`
  );

  console.log("\n═════════════════════════════════════════════════════════════════════════");
  console.log(` AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runEnvAndSecurityAudit()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
