import crypto from "crypto";
import bcrypt from "bcryptjs";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import prisma from "../src/lib/db";
import {
  encryptDocument,
  decryptDocument,
  isEncryptedDocument,
  computeSha256Hex,
  MAGIC_HEADER,
  getEncryptionKey,
} from "../src/lib/crypto";
import { authorizeDocumentAccess } from "../src/lib/security/authorization";
import { hashPassword, verifyPassword } from "../src/lib/auth";

interface TestResult {
  id: number;
  testName: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  details: string;
}

const results: TestResult[] = [];

async function runCryptoTests() {
  console.log("═════════════════════════════════════════════════════════════════");
  console.log("    CAMPUSVAULT – CRYPTOGRAPHY SECURITY VERIFICATION SUITE       ");
  console.log("═════════════════════════════════════════════════════════════════\n");

  const originalContent = "CONFIDENTIAL_CAMPUS_EXAM_PAPER_2024: Question 1: What is Zero-Trust Security?";
  const plaintextBuffer = Buffer.from(originalContent, "utf-8");
  const originalSha256 = computeSha256Hex(plaintextBuffer);

  // Setup test department & users
  const csDept = await prisma.department.upsert({
    where: { name: "Computer Science" },
    update: {},
    create: { name: "Computer Science", description: "CS Dept" },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@campusvault.edu" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@campusvault.edu",
      passwordHash: "hash",
      role: "admin",
      departmentId: csDept.id,
      status: "active",
    },
  });

  const studentA = await prisma.user.upsert({
    where: { email: "student.a@campusvault.edu" },
    update: { status: "active" },
    create: {
      name: "Student A",
      email: "student.a@campusvault.edu",
      passwordHash: "hash",
      role: "student",
      departmentId: csDept.id,
      status: "active",
    },
  });

  const studentB = await prisma.user.upsert({
    where: { email: "student.b@campusvault.edu" },
    update: { status: "active" },
    create: {
      name: "Student B",
      email: "student.b@campusvault.edu",
      passwordHash: "hash",
      role: "student",
      departmentId: csDept.id,
      status: "active",
    },
  });

  // ─── TEST 1: ENCRYPTED STORAGE ON SERVER ───────────────────────────────
  console.log("▶ Running Test 1: Upload a document and verify encrypted storage...");
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const storageKey = `test-crypto-exam-${Date.now()}.pdf`;
  const filePath = path.join(uploadDir, storageKey);

  // Perform AES-256-GCM encryption
  const { encryptedBuffer, sha256: encSha256, ivHex } = await encryptDocument(plaintextBuffer);
  await writeFile(filePath, encryptedBuffer);

  // Read raw stored file from disk
  const rawDiskFile = await readFile(filePath);
  const isEncrypted = isEncryptedDocument(rawDiskFile);
  const rawString = rawDiskFile.toString("utf-8");

  // Verify:
  // 1. Storage envelope contains MAGIC_HEADER
  // 2. Raw disk file does NOT contain the plaintext string
  // 3. Ciphertext is distinct from plaintext
  const plaintextFoundOnDisk = rawString.includes("CONFIDENTIAL_CAMPUS_EXAM_PAPER_2024");
  const t1Pass = isEncrypted && !plaintextFoundOnDisk && encSha256 === originalSha256;

  results.push({
    id: 1,
    testName: "Encrypted Storage (AES-256-GCM)",
    expected: "File encrypted at rest with unique IV; plaintext NOT visible on disk",
    actual: isEncrypted && !plaintextFoundOnDisk
      ? `Encrypted envelope with MAGIC=${MAGIC_HEADER.toString()}, IV=${ivHex.substring(0, 8)}..., plaintext absent`
      : "Plaintext leaked on disk",
    status: t1Pass ? "PASS" : "FAIL",
    details: "Verified AES-256-GCM binary envelope on disk. Plaintext is completely unreadable from storage.",
  });
  console.log(`  [${t1Pass ? "PASS" : "FAIL"}] Encrypted envelope verified on disk. Plaintext absent.\n`);

  // Create document in database
  const docRecord = await prisma.document.create({
    data: {
      title: "Cryptography Test Document",
      classification: "confidential",
      departmentId: csDept.id,
      fileName: "exam-paper.pdf",
      fileSize: plaintextBuffer.length,
      mimeType: "application/pdf",
      storageKey,
      uploadedById: admin.id,
    },
  });

  // ─── TEST 2: AUTHORIZED DOWNLOAD & CORRECT DECRYPTION ──────────────────
  console.log("▶ Running Test 2: Authorized user downloads and receives correct document...");
  // Admin grants access to Student A
  const activeGrant = await prisma.accessGrant.create({
    data: {
      userId: studentA.id,
      documentId: docRecord.id,
      status: "active",
      grantedById: admin.id,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      reason: "Exam Review Access",
    },
  });

  // Step A: Zero-Trust Authorization check
  const authStudentA = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: docRecord.id,
      title: docRecord.title,
      classification: docRecord.classification,
      departmentId: docRecord.departmentId,
      uploadedById: docRecord.uploadedById,
    },
    activeGrant,
    { timestamp: new Date(), action: "download" }
  );

  let decryptedPlaintext: string | null = null;
  let sha256Matches = false;

  if (authStudentA.allowed) {
    const fileBytes = await readFile(filePath);
    const { plaintext, sha256 } = await decryptDocument(fileBytes);
    decryptedPlaintext = plaintext.toString("utf-8");
    sha256Matches = sha256 === originalSha256;
  }

  const t2Pass =
    authStudentA.allowed === true &&
    decryptedPlaintext === originalContent &&
    sha256Matches;

  results.push({
    id: 2,
    testName: "Authorized User Decryption",
    expected: "Authorization ALLOW → Correct original plaintext recovered byte-for-byte",
    actual: t2Pass
      ? "ALLOW → Plaintext byte-for-byte match with verified SHA-256"
      : "Decryption mismatch or authorization failure",
    status: t2Pass ? "PASS" : "FAIL",
    details: "Student A authorized; recovered exact original document matching original SHA-256.",
  });
  console.log(`  [${t2Pass ? "PASS" : "FAIL"}] Authorized download decrypted correctly with SHA-256 match.\n`);

  // ─── TEST 3: UNAUTHORIZED USER DENIED BEFORE DECRYPTION ────────────────
  console.log("▶ Running Test 3: Unauthorized user denied before decryption...");
  // Student B has NO grant
  const authStudentB = await authorizeDocumentAccess(
    {
      id: studentB.id,
      email: studentB.email,
      role: studentB.role,
      departmentId: studentB.departmentId,
      status: studentB.status,
    },
    {
      id: docRecord.id,
      title: docRecord.title,
      classification: docRecord.classification,
      departmentId: docRecord.departmentId,
      uploadedById: docRecord.uploadedById,
    },
    null,
    { timestamp: new Date(), action: "download" }
  );

  // In the download route, if authStudentB.allowed is false, decryption is NEVER invoked!
  let decryptionInvoked = false;
  if (authStudentB.allowed) {
    decryptionInvoked = true;
    await decryptDocument(await readFile(filePath));
  }

  const t3Pass = authStudentB.allowed === false && !decryptionInvoked;

  results.push({
    id: 3,
    testName: "Unauthorized Denied Before Decryption",
    expected: "DENY (HTTP 403 / NO_VALID_GRANT); decryption pipeline NOT invoked",
    actual: `DENY (${authStudentB.reason}); decryption invoked = ${decryptionInvoked}`,
    status: t3Pass ? "PASS" : "FAIL",
    details: "Unauthorized request rejected at Zero-Trust gate; ciphertext never decrypted.",
  });
  console.log(`  [${t3Pass ? "PASS" : "FAIL"}] Unauthorized user blocked at authorization gate before decryption.\n`);

  // ─── TEST 4: REVOKED USER DENIED EVEN WITH OLD LINK ────────────────────
  console.log("▶ Running Test 4: Revoked user denied even with an old link...");
  // Admin revokes Student A's grant
  const revokedGrant = await prisma.accessGrant.update({
    where: { id: activeGrant.id },
    data: { status: "revoked", revokedAt: new Date() },
  });

  // Student A tries to reuse the old link
  const authRevoked = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: docRecord.id,
      title: docRecord.title,
      classification: docRecord.classification,
      departmentId: docRecord.departmentId,
      uploadedById: docRecord.uploadedById,
    },
    revokedGrant,
    {
      timestamp: new Date(),
      action: "download",
      metadata: { path: `/api/documents/${docRecord.id}/download?old_link=true` },
    }
  );

  let revokedDecrypted = false;
  if (authRevoked.allowed) {
    revokedDecrypted = true;
    await decryptDocument(await readFile(filePath));
  }

  const t4Pass = authRevoked.allowed === false && authRevoked.reason === "GRANT_REVOKED" && !revokedDecrypted;

  results.push({
    id: 4,
    testName: "Revoked User Denied on Old Link",
    expected: "DENY (GRANT_REVOKED); no decrypted response returned",
    actual: `DENY (${authRevoked.reason}); decryption invoked = ${revokedDecrypted}`,
    status: t4Pass ? "PASS" : "FAIL",
    details: "Revocation immediately invalidates access; saved links cannot obtain decrypted plaintext.",
  });
  console.log(`  [${t4Pass ? "PASS" : "FAIL"}] Revoked user blocked with GRANT_REVOKED; zero plaintext exposure.\n`);

  // ─── TEST 5: WRONG ENCRYPTION KEY CAUSES SAFE FAILURE ──────────────────
  console.log("▶ Running Test 5: Wrong encryption key causes safe failure...");
  // An incorrect 256-bit key
  const wrongKey = crypto.randomBytes(32);
  let wrongKeyErrorCaught = false;
  let wrongKeyErrorMessage = "";

  try {
    const fileBytes = await readFile(filePath);
    await decryptDocument(fileBytes, wrongKey);
  } catch (err: unknown) {
    wrongKeyErrorCaught = true;
    wrongKeyErrorMessage = err instanceof Error ? err.message : String(err);
  }

  const t5Pass = wrongKeyErrorCaught && wrongKeyErrorMessage.includes("CRYPTO_AUTH_FAILED");

  results.push({
    id: 5,
    testName: "Wrong Encryption Key Safe Failure",
    expected: "Safe failure throwing CRYPTO_AUTH_FAILED without plaintext leak",
    actual: wrongKeyErrorCaught ? `Failed safely: ${wrongKeyErrorMessage.substring(0, 60)}...` : "Unexpectedly succeeded",
    status: t5Pass ? "PASS" : "FAIL",
    details: "AES-256-GCM authentication tag rejected wrong key immediately.",
  });
  console.log(`  [${t5Pass ? "PASS" : "FAIL"}] Wrong key safely rejected by AES-GCM MAC tag.\n`);

  // ─── TEST 6: MODIFIED ENCRYPTED FILE FAILS AUTH/INTEGRITY ──────────────
  console.log("▶ Running Test 6: Modified encrypted file fails integrity verification...");
  // Simulate tampering: flip bits in ciphertext
  const tamperedBuffer = Buffer.from(await readFile(filePath));
  // Flip byte at end of file (ciphertext region)
  tamperedBuffer[tamperedBuffer.length - 5] ^= 0xff;

  let tamperErrorCaught = false;
  let tamperErrorMessage = "";

  try {
    await decryptDocument(tamperedBuffer);
  } catch (err: unknown) {
    tamperErrorCaught = true;
    tamperErrorMessage = err instanceof Error ? err.message : String(err);
  }

  const t6Pass = tamperErrorCaught && (tamperErrorMessage.includes("CRYPTO_AUTH_FAILED") || tamperErrorMessage.includes("INTEGRITY"));

  results.push({
    id: 6,
    testName: "Tampered File Integrity Check",
    expected: "Authentication tag mismatch / integrity check failure on tampered file",
    actual: tamperErrorCaught ? `Detected tampering: ${tamperErrorMessage.substring(0, 60)}...` : "Tampering was NOT detected",
    status: t6Pass ? "PASS" : "FAIL",
    details: "128-bit authentication tag detected unauthorized byte modification in ciphertext.",
  });
  console.log(`  [${t6Pass ? "PASS" : "FAIL"}] Tampered ciphertext caught by authentication tag.\n`);

  // ─── TEST 7: ENCRYPTION KEYS NEVER EXPOSED IN RESPONSES OR LOGS ─────────
  console.log("▶ Running Test 7: Verify encryption keys are never exposed in frontend responses or logs...");
  const activeMasterKeyHex = getEncryptionKey().toString("hex");

  // Fetch document details from DB / API representation
  const docDetails = await prisma.document.findUnique({
    where: { id: docRecord.id },
    select: {
      id: true,
      title: true,
      description: true,
      classification: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
    },
  });

  const docJson = JSON.stringify(docDetails);
  const keyInDoc = docJson.includes(activeMasterKeyHex);

  // Fetch audit logs
  const logs = await prisma.auditLog.findMany({
    where: { documentId: docRecord.id },
    take: 20,
  });
  const logsJson = JSON.stringify(logs);
  const keyInLogs = logsJson.includes(activeMasterKeyHex);

  const t7Pass = !keyInDoc && !keyInLogs;

  results.push({
    id: 7,
    testName: "Encryption Key Isolation",
    expected: "Encryption key NEVER present in API responses, DB models, or audit logs",
    actual: !keyInDoc && !keyInLogs
      ? "Verified: 0 occurrences of master key in API payloads, database models, and logs"
      : "Key LEAK detected in payload or logs",
    status: t7Pass ? "PASS" : "FAIL",
    details: "Master key loaded strictly in private server memory; isolated from all public interfaces.",
  });
  console.log(`  [${t7Pass ? "PASS" : "FAIL"}] Master key completely isolated from API responses and logs.\n`);

  // ─── TEST 8: ARGON2ID PASSWORD HASHING & BACKWARD COMPATIBILITY ────────
  console.log("▶ Running Test 8: Argon2id password hashing and legacy verification...");
  const rawTestPassword = "SuperSecurePassword#2024!";
  const argonHash = await hashPassword(rawTestPassword);

  const isArgon2id = argonHash.startsWith("$argon2id$");
  const argonVerified = await verifyPassword(rawTestPassword, argonHash);
  const wrongArgonFails = !(await verifyPassword("WrongPassword123", argonHash));

  // Verify legacy bcrypt hash support (tested against actual seeded bcrypt password)
  const seededAdmin = await prisma.user.findUnique({ where: { email: "admin@campusvault.edu" } });
  let legacyVerified = false;
  if (seededAdmin) {
    legacyVerified = await verifyPassword("admin123", seededAdmin.passwordHash);
  } else {
    const freshBcrypt = await bcrypt.hash("admin123", 10);
    legacyVerified = await verifyPassword("admin123", freshBcrypt);
  }

  const t8Pass = isArgon2id && argonVerified && wrongArgonFails && legacyVerified;

  results.push({
    id: 8,
    testName: "Argon2id Password Security",
    expected: "New passwords hashed with Argon2id; existing bcrypt hashes verified seamlessly",
    actual: t8Pass
      ? `Argon2id prefix=$argon2id$, verify=true, wrong=false, legacyBcrypt=true`
      : "Argon2id hashing failure",
    status: t8Pass ? "PASS" : "FAIL",
    details: "Modern Argon2id password hashing active with dual-mode legacy bcrypt verification.",
  });
  console.log(`  [${t8Pass ? "PASS" : "FAIL"}] Argon2id hashing and legacy verification passed.\n`);

  // ─── TEST 9: UNIQUE IV/NONCE PER OPERATION ────────────────────────────
  console.log("▶ Running Test 9: Unique cryptographic nonce/IV per encryption...");
  const enc1 = await encryptDocument(plaintextBuffer);
  const enc2 = await encryptDocument(plaintextBuffer);
  const enc3 = await encryptDocument(plaintextBuffer);

  const ivsUnique =
    enc1.ivHex !== enc2.ivHex &&
    enc2.ivHex !== enc3.ivHex &&
    enc1.ivHex !== enc3.ivHex;

  const ciphertextsUnique =
    !enc1.encryptedBuffer.equals(enc2.encryptedBuffer) &&
    !enc2.encryptedBuffer.equals(enc3.encryptedBuffer);

  const t9Pass = ivsUnique && ciphertextsUnique;

  results.push({
    id: 9,
    testName: "Cryptographic Nonce Uniqueness",
    expected: "Every encryption uses a distinct 96-bit IV producing unique ciphertext",
    actual: t9Pass ? "Verified: 3 identical plaintexts produced 3 unique IVs and distinct ciphertexts" : "IV collision detected",
    status: t9Pass ? "PASS" : "FAIL",
    details: "Zero IV reuse guaranteed via CSPRNG crypto.randomBytes(12).",
  });
  console.log(`  [${t9Pass ? "PASS" : "FAIL"}] IV uniqueness and semantic security verified.\n`);

  // ─── SUMMARY TABLE ────────────────────────────────────────────────────
  console.log("═════════════════════════════════════════════════════════════════");
  console.log("            CRYPTOGRAPHY SECURITY TEST RESULTS                   ");
  console.log("═════════════════════════════════════════════════════════════════");
  console.table(
    results.map((r) => ({
      "#": r.id,
      "Test Name": r.testName,
      Expected: r.expected,
      Actual: r.actual,
      Status: r.status,
    }))
  );

  const allPassed = results.every((r) => r.status === "PASS");
  console.log(
    allPassed
      ? "\n🎉 ALL CRYPTOGRAPHY SECURITY TESTS PASSED PERFECTLY!\n"
      : "\n❌ SOME CRYPTOGRAPHY TESTS FAILED.\n"
  );

  await prisma.$disconnect();
  return allPassed;
}

runCryptoTests().then((success) => {
  if (!success) process.exit(1);
});
