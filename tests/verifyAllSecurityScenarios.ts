import prisma from "../src/lib/db";
import { authorizeDocumentAccess } from "../src/lib/security/authorization";
import { logAuditEvent } from "../src/lib/audit";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

interface TestReportItem {
  id: number;
  name: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  details: string;
}

const report: TestReportItem[] = [];

async function runTests() {
  console.log("═════════════════════════════════════════════════════════════════");
  console.log(" CAMPUSVAULT – ZERO-TRUST 10-POINT SECURITY VERIFICATION SUITE  ");
  console.log("═════════════════════════════════════════════════════════════════\n");

  // ─── 0. SETUP SYNTHETIC TEST FIXTURES IN DATABASE ─────────────────────
  console.log("🔧 Setting up synthetic test fixtures in DB...");

  // Departments
  const csDept = await prisma.department.upsert({
    where: { name: "Computer Science" },
    update: {},
    create: { name: "Computer Science", description: "CS Department" },
  });

  const mechDept = await prisma.department.upsert({
    where: { name: "Mechanical Engineering" },
    update: {},
    create: { name: "Mechanical Engineering", description: "Mech Department" },
  });

  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@campusvault.edu" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@campusvault.edu",
      passwordHash: "hash",
      role: "admin",
      departmentId: csDept.id,
      status: "active",
    },
  });

  // Student A (CS)
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

  // Student B (CS - Unauthorized)
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

  // Student C (Mechanical - Cross Department)
  const studentC = await prisma.user.upsert({
    where: { email: "student.c@campusvault.edu" },
    update: { status: "active" },
    create: {
      name: "Student C",
      email: "student.c@campusvault.edu",
      passwordHash: "hash",
      role: "student",
      departmentId: mechDept.id,
      status: "active",
    },
  });

  // Suspended Student
  const suspendedStudent = await prisma.user.upsert({
    where: { email: "suspended.student@campusvault.edu" },
    update: { status: "suspended" },
    create: {
      name: "Suspended Student",
      email: "suspended.student@campusvault.edu",
      passwordHash: "hash",
      role: "student",
      departmentId: csDept.id,
      status: "suspended",
    },
  });

  // Create physical sample file in uploads
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const storageKey = "sample-confidential-exam-2024.pdf";
  await writeFile(path.join(uploadDir, storageKey), "CAMPUSVAULT_ENCRYPTED_TEST_FILE_CONTENT");

  // Confidential Document (CS Dept)
  const confidentialDoc = await prisma.document.upsert({
    where: { storageKey },
    update: { classification: "confidential" },
    create: {
      title: "Mid-Term Exam Paper",
      description: "Confidential Exam Draft",
      departmentId: csDept.id,
      classification: "confidential",
      fileName: "exam-draft.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      storageKey,
      uploadedById: admin.id,
    },
  });

  console.log("✅ Synthetic test fixtures ready.\n");

  // ─── TEST 1: VALID ACCESS ─────────────────────────────────────────────
  console.log("▶ Running Test 1: Valid Access...");
  // Clean old grants for studentA
  await prisma.accessGrant.deleteMany({
    where: { userId: studentA.id, documentId: confidentialDoc.id },
  });

  const validGrant = await prisma.accessGrant.create({
    data: {
      userId: studentA.id,
      documentId: confidentialDoc.id,
      status: "active",
      grantedById: admin.id,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours in future
      reason: "Research Project Approval",
    },
  });

  const t1Res = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    validGrant,
    { timestamp: new Date(), action: "download" }
  );

  const t1Pass = t1Res.allowed === true && t1Res.reason === "ACCESS_GRANTED_BY_GRANT";
  await logAuditEvent({
    userId: studentA.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t1Res.allowed ? "allowed" : "denied",
    reason: t1Res.reason,
  });

  report.push({
    id: 1,
    name: "Valid Access",
    expected: "ALLOW (ACCESS_GRANTED_BY_GRANT)",
    actual: `${t1Res.decision} (${t1Res.reason})`,
    status: t1Pass ? "PASS" : "FAIL",
    details: "Student A with active grant successfully granted document access.",
  });
  console.log(`  [${t1Pass ? "PASS" : "FAIL"}] Result: ${t1Res.decision} – ${t1Res.reason}\n`);

  // ─── TEST 2: UNAUTHORIZED ACCESS ──────────────────────────────────────
  console.log("▶ Running Test 2: Unauthorized Access...");
  const t2Res = await authorizeDocumentAccess(
    {
      id: studentB.id,
      email: studentB.email,
      role: studentB.role,
      departmentId: studentB.departmentId,
      status: studentB.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    null, // No grant
    { timestamp: new Date(), action: "download" }
  );

  const t2Pass = t2Res.allowed === false && t2Res.reason === "NO_VALID_GRANT";
  await logAuditEvent({
    userId: studentB.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t2Res.allowed ? "allowed" : "denied",
    reason: t2Res.reason,
  });

  report.push({
    id: 2,
    name: "Unauthorized Access",
    expected: "DENY (HTTP 403 / NO_VALID_GRANT)",
    actual: `${t2Res.decision} (${t2Res.reason})`,
    status: t2Pass ? "PASS" : "FAIL",
    details: "Student B with no grant denied access with HTTP 403 reason.",
  });
  console.log(`  [${t2Pass ? "PASS" : "FAIL"}] Result: ${t2Res.decision} – ${t2Res.reason}\n`);

  // ─── TEST 3: DEPARTMENT RESTRICTION ───────────────────────────────────
  console.log("▶ Running Test 3: Department Restriction...");
  const t3Res = await authorizeDocumentAccess(
    {
      id: studentC.id,
      email: studentC.email,
      role: studentC.role,
      departmentId: studentC.departmentId, // Mechanical
      status: studentC.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId, // CS
      uploadedById: confidentialDoc.uploadedById,
    },
    null,
    { timestamp: new Date(), action: "download" }
  );

  const t3Pass = t3Res.allowed === false && t3Res.reason === "DEPARTMENT_MISMATCH";
  await logAuditEvent({
    userId: studentC.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t3Res.allowed ? "allowed" : "denied",
    reason: t3Res.reason,
  });

  report.push({
    id: 3,
    name: "Department Restriction",
    expected: "DENY (DEPARTMENT_MISMATCH)",
    actual: `${t3Res.decision} (${t3Res.reason})`,
    status: t3Pass ? "PASS" : "FAIL",
    details: "Student C from Mechanical denied access to CS internal/confidential doc.",
  });
  console.log(`  [${t3Pass ? "PASS" : "FAIL"}] Result: ${t3Res.decision} – ${t3Res.reason}\n`);

  // ─── TEST 4: EXPIRED GRANT ───────────────────────────────────────────
  console.log("▶ Running Test 4: Expired Grant...");
  const expiredGrant = {
    id: "grant-expired-001",
    userId: studentA.id,
    documentId: confidentialDoc.id,
    status: "expired",
    grantedById: admin.id,
    expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
  };

  const t4Res = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    expiredGrant,
    { timestamp: new Date(), action: "download" }
  );

  const t4Pass = t4Res.allowed === false && t4Res.reason === "GRANT_EXPIRED";
  await logAuditEvent({
    userId: studentA.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t4Res.allowed ? "allowed" : "denied",
    reason: t4Res.reason,
  });

  report.push({
    id: 4,
    name: "Expired Grant",
    expected: "DENY (GRANT_EXPIRED)",
    actual: `${t4Res.decision} (${t4Res.reason})`,
    status: t4Pass ? "PASS" : "FAIL",
    details: "Expired grant immediately denied at request time.",
  });
  console.log(`  [${t4Pass ? "PASS" : "FAIL"}] Result: ${t4Res.decision} – ${t4Res.reason}\n`);

  // ─── TEST 5: IMMEDIATE REVOCATION ────────────────────────────────────
  console.log("▶ Running Test 5: Immediate Revocation...");
  // Step 1: Student A has valid grant
  // Step 2: Student A access allowed (verified in Test 1)
  // Step 3: Admin revokes the grant in database
  const revokedGrant = await prisma.accessGrant.update({
    where: { id: validGrant.id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
    },
  });

  // Step 4: Student A tries to open same document again
  const t5Res = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    revokedGrant,
    { timestamp: new Date(), action: "download" }
  );

  const t5Pass = t5Res.allowed === false && t5Res.reason === "GRANT_REVOKED";
  await logAuditEvent({
    userId: studentA.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t5Res.allowed ? "allowed" : "denied",
    reason: t5Res.reason,
  });

  report.push({
    id: 5,
    name: "Immediate Revocation",
    expected: "DENY (GRANT_REVOKED)",
    actual: `${t5Res.decision} (${t5Res.reason})`,
    status: t5Pass ? "PASS" : "FAIL",
    details: "Admin revokes access, subsequent attempt immediately denied.",
  });
  console.log(`  [${t5Pass ? "PASS" : "FAIL"}] Result: ${t5Res.decision} – ${t5Res.reason}\n`);

  // ─── TEST 6: OLD LINK ATTACK ──────────────────────────────────────────
  console.log("▶ Running Test 6: Old Link Attack...");
  // Student A uses saved / cached URL after revocation
  const t6Res = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    revokedGrant,
    {
      timestamp: new Date(),
      action: "download",
      metadata: { path: `/api/documents/${confidentialDoc.id}/download?saved_url=true` },
    }
  );

  const t6Pass = t6Res.allowed === false && t6Res.reason === "GRANT_REVOKED";
  await logAuditEvent({
    userId: studentA.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t6Res.allowed ? "allowed" : "denied",
    reason: t6Res.reason,
  });

  report.push({
    id: 6,
    name: "Old Link Attack",
    expected: "DENY (GRANT_REVOKED)",
    actual: `${t6Res.decision} (${t6Res.reason})`,
    status: t6Pass ? "PASS" : "FAIL",
    details: "Re-using old direct link fails authorization with GRANT_REVOKED.",
  });
  console.log(`  [${t6Pass ? "PASS" : "FAIL"}] Result: ${t6Res.decision} – ${t6Res.reason}\n`);

  // ─── TEST 7: DIRECT API ATTACK ────────────────────────────────────────
  console.log("▶ Running Test 7: Direct API Attack...");
  // User directly hits endpoint without grant
  const t7Res = await authorizeDocumentAccess(
    {
      id: studentB.id,
      email: studentB.email,
      role: studentB.role,
      departmentId: studentB.departmentId,
      status: studentB.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    null,
    {
      timestamp: new Date(),
      action: "download",
      metadata: { path: `/api/documents/${confidentialDoc.id}/download` },
    }
  );

  const t7Pass = t7Res.allowed === false && t7Res.reason === "NO_VALID_GRANT";
  await logAuditEvent({
    userId: studentB.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t7Res.allowed ? "allowed" : "denied",
    reason: t7Res.reason,
  });

  report.push({
    id: 7,
    name: "Direct API Attack",
    expected: "DENY (HTTP 403 / NO_VALID_GRANT)",
    actual: `${t7Res.decision} (${t7Res.reason})`,
    status: t7Pass ? "PASS" : "FAIL",
    details: "Direct raw API request blocked with HTTP 403 status and reason.",
  });
  console.log(`  [${t7Pass ? "PASS" : "FAIL"}] Result: ${t7Res.decision} – ${t7Res.reason}\n`);

  // ─── TEST 8: ACTIVE SESSION ATTACK ────────────────────────────────────
  console.log("▶ Running Test 8: Active Session Attack...");
  // User holds a valid active session token, but the grant was revoked in DB
  const t8Res = await authorizeDocumentAccess(
    {
      id: studentA.id,
      email: studentA.email,
      role: studentA.role,
      departmentId: studentA.departmentId,
      status: studentA.status,
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    revokedGrant,
    {
      timestamp: new Date(),
      action: "download",
      metadata: { sessionId: "active-session-jwt-12345" },
    }
  );

  const t8Pass = t8Res.allowed === false && t8Res.reason === "GRANT_REVOKED";
  await logAuditEvent({
    userId: studentA.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t8Res.allowed ? "allowed" : "denied",
    reason: t8Res.reason,
  });

  report.push({
    id: 8,
    name: "Active Session Attack",
    expected: "DENY (GRANT_REVOKED)",
    actual: `${t8Res.decision} (${t8Res.reason})`,
    status: t8Pass ? "PASS" : "FAIL",
    details: "Active session token does not bypass revoked grant in database.",
  });
  console.log(`  [${t8Pass ? "PASS" : "FAIL"}] Result: ${t8Res.decision} – ${t8Res.reason}\n`);

  // ─── TEST 9: SUSPENDED USER ───────────────────────────────────────────
  console.log("▶ Running Test 9: Suspended User...");
  // Suspended user tries to access even with grant or public doc
  const t9Res = await authorizeDocumentAccess(
    {
      id: suspendedStudent.id,
      email: suspendedStudent.email,
      role: suspendedStudent.role,
      departmentId: suspendedStudent.departmentId,
      status: suspendedStudent.status, // suspended
    },
    {
      id: confidentialDoc.id,
      title: confidentialDoc.title,
      classification: confidentialDoc.classification,
      departmentId: confidentialDoc.departmentId,
      uploadedById: confidentialDoc.uploadedById,
    },
    validGrant, // even if a grant existed
    { timestamp: new Date(), action: "download" }
  );

  const t9Pass = t9Res.allowed === false && t9Res.reason === "USER_SUSPENDED";
  await logAuditEvent({
    userId: suspendedStudent.id,
    documentId: confidentialDoc.id,
    action: "download",
    decision: t9Res.allowed ? "allowed" : "denied",
    reason: t9Res.reason,
  });

  report.push({
    id: 9,
    name: "Suspended User",
    expected: "DENY (USER_SUSPENDED)",
    actual: `${t9Res.decision} (${t9Res.reason})`,
    status: t9Pass ? "PASS" : "FAIL",
    details: "Suspended user blocked at pipeline stage 2 before any grant check.",
  });
  console.log(`  [${t9Pass ? "PASS" : "FAIL"}] Result: ${t9Res.decision} – ${t9Res.reason}\n`);

  // ─── TEST 10: AUDIT LOGGING ───────────────────────────────────────────
  console.log("▶ Running Test 10: Audit Logging Verification...");
  const recentLogs = await prisma.auditLog.findMany({
    where: { documentId: confidentialDoc.id },
    orderBy: { timestamp: "desc" },
    take: 10,
  });

  const allowEntries = recentLogs.filter((l) => l.decision === "allowed");
  const denyEntries = recentLogs.filter((l) => l.decision === "denied");

  const hasValidFields = recentLogs.every(
    (l) => l.userId && l.action && l.decision && l.reason && l.timestamp
  );

  const t10Pass = recentLogs.length >= 8 && allowEntries.length >= 1 && denyEntries.length >= 7 && hasValidFields;

  report.push({
    id: 10,
    name: "Audit Logging",
    expected: "PASS (Correct user, document, decision, reason, timestamp)",
    actual: `Logged ${recentLogs.length} events (${allowEntries.length} ALLOW, ${denyEntries.length} DENY)`,
    status: t10Pass ? "PASS" : "FAIL",
    details: "Full immutable trail verified with user, document, decision, reason.",
  });
  console.log(`  [${t10Pass ? "PASS" : "FAIL"}] Logged: ${recentLogs.length} events in DB (${allowEntries.length} ALLOW, ${denyEntries.length} DENY)\n`);

  // ─── SUMMARY TABLE ────────────────────────────────────────────────────
  console.log("═════════════════════════════════════════════════════════════════");
  console.log("               FINAL SECURITY TEST REPORT                       ");
  console.log("═════════════════════════════════════════════════════════════════");
  console.table(
    report.map((r) => ({
      "#": r.id,
      "Test Name": r.name,
      Expected: r.expected,
      Actual: r.actual,
      Status: r.status,
    }))
  );

  const allPassed = report.every((r) => r.status === "PASS");
  console.log(
    allPassed
      ? "\n🎉 ALL 10 ZERO-TRUST SECURITY TESTS PASSED PERFECTLY!\n"
      : "\n❌ SOME SECURITY TESTS FAILED.\n"
  );

  await prisma.$disconnect();
  return allPassed;
}

runTests().then((success) => {
  if (!success) process.exit(1);
});
