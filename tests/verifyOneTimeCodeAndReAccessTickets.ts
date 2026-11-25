import { PrismaClient } from "@prisma/client";
import {
  generateSecureAccessCode,
  hashAccessCode,
  generateTicketId,
  releaseOneTimeAccessCode,
  redeemOneTimeAccessCode,
  createReAccessTicket,
  reviewReAccessTicket,
  resetRedemptionRateLimit,
} from "../src/lib/security/accessCodes";

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, expected: string, actual: string) {
  results.push({ name, passed: condition, expected, actual });
  const status = condition ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}`);
  if (!condition) {
    console.log(`       Expected: ${expected}`);
    console.log(`       Actual:   ${actual}`);
  }
}

async function runTests() {
  console.log("═════════════════════════════════════════════════════════════════════════════════════");
  console.log("  CAMPUSVAULT – ONE-TIME ACCESS CODE & AI RE-ACCESS TICKETS 15-POINT TEST SUITE    ");
  console.log("═════════════════════════════════════════════════════════════════════════════════════\n");

  // 1. Fetch test actors
  const faculty = await prisma.user.findFirst({ where: { role: "faculty" } });
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const student =
    (await prisma.user.findFirst({ where: { email: "dipanshu@gmail.com" } })) ||
    (await prisma.user.findFirst({ where: { role: "student" } }));
  const otherStudent = await prisma.user.findFirst({
    where: { role: "student", id: { not: student?.id } },
  });

  if (!faculty || !admin || !student || !otherStudent) {
    throw new Error("Missing test users (faculty, admin, student, otherStudent) in database");
  }

  // Ensure department alignment for valid Zero-Trust RBAC & ABAC testing
  const dept =
    (await prisma.department.findFirst()) ||
    (await prisma.department.create({ data: { name: "Computer Science" } }));

  await prisma.user.update({ where: { id: faculty.id }, data: { departmentId: dept.id, status: "active" } });
  await prisma.user.update({ where: { id: student.id }, data: { departmentId: dept.id, status: "active" } });
  await prisma.user.update({ where: { id: otherStudent.id }, data: { departmentId: dept.id, status: "active" } });

  // Create dedicated fresh test document owned by faculty
  const testDoc = await prisma.document.create({
    data: {
      title: `Mathematics_Exam_Paper_${Date.now()}.pdf`,
      fileName: "mathematics_exam_paper.pdf",
      fileSize: 10240,
      mimeType: "application/pdf",
      classification: "confidential",
      storageKey: `math_exam_${Date.now()}.enc`,
      uploadedById: faculty.id,
      departmentId: dept.id,
    },
  });

  resetRedemptionRateLimit();

  console.log(`Test Context:`);
  console.log(`• Document Owner (Faculty): ${faculty.name} (${faculty.id})`);
  console.log(`• Requester (Student A):   ${student.name} (${student.id})`);
  console.log(`• Other User (Student B):   ${otherStudent.name} (${otherStudent.id})`);
  console.log(`• Document:                ${testDoc.title} (${testDoc.id})\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Valid one-time code works once
  // ─────────────────────────────────────────────────────────────────────────
  const releaseRes1 = await releaseOneTimeAccessCode({
    documentId: testDoc.id,
    recipientUserId: student.id,
    createdById: faculty.id,
    expiresAtHours: 24,
  });

  assert(
    "Scenario 1.1: Document owner releases one-time access code successfully",
    Boolean(releaseRes1.success && releaseRes1.code && releaseRes1.code.startsWith("CVLT-")),
    "success === true with CVLT-XXXX-XXXX-XXXX code",
    `success: ${releaseRes1.success}, code: ${releaseRes1.code}`
  );

  const code1 = releaseRes1.code!;
  const redeemRes1 = await redeemOneTimeAccessCode({
    code: code1,
    userId: student.id,
    documentId: testDoc.id,
  });

  const codeRecord1 = await prisma.documentAccessCode.findUnique({
    where: { codeHash: hashAccessCode(code1) },
  });

  assert(
    "Scenario 1.2: Valid one-time code works on first use and transitions to USED",
    Boolean(redeemRes1.success && codeRecord1?.status === "USED" && codeRecord1?.usedAt !== null),
    "success === true and status === 'USED' with usedAt timestamp",
    `success: ${redeemRes1.success}, status: ${codeRecord1?.status}, usedAt: ${codeRecord1?.usedAt}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Reusing the same code is denied
  // ─────────────────────────────────────────────────────────────────────────
  const redeemRes2 = await redeemOneTimeAccessCode({
    code: code1,
    userId: student.id,
    documentId: testDoc.id,
  });

  assert(
    "Scenario 2: Reusing the same code is denied with ACCESS_CODE_ALREADY_USED",
    Boolean(!redeemRes2.success && redeemRes2.reason === "ACCESS_CODE_ALREADY_USED"),
    "success === false and reason === 'ACCESS_CODE_ALREADY_USED'",
    `success: ${redeemRes2.success}, reason: ${redeemRes2.reason}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Another user cannot use the code
  // ─────────────────────────────────────────────────────────────────────────
  const releaseRes3 = await releaseOneTimeAccessCode({
    documentId: testDoc.id,
    recipientUserId: student.id, // Issued to Student A
    createdById: faculty.id,
    expiresAtHours: 24,
  });

  const redeemRes3 = await redeemOneTimeAccessCode({
    code: releaseRes3.code!,
    userId: otherStudent.id, // Student B attempts redemption
    documentId: testDoc.id,
  });

  assert(
    "Scenario 3: Cross-user code usage is strictly denied with ACCESS_CODE_USER_MISMATCH",
    Boolean(!redeemRes3.success && redeemRes3.reason === "ACCESS_CODE_USER_MISMATCH"),
    "success === false and reason === 'ACCESS_CODE_USER_MISMATCH'",
    `success: ${redeemRes3.success}, reason: ${redeemRes3.reason}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Expired code is denied
  // ─────────────────────────────────────────────────────────────────────────
  const releaseRes4 = await releaseOneTimeAccessCode({
    documentId: testDoc.id,
    recipientUserId: student.id,
    createdById: faculty.id,
    expiresAtHours: 1,
  });

  // Manually backdate expiry to the past
  await prisma.documentAccessCode.update({
    where: { codeHash: hashAccessCode(releaseRes4.code!) },
    data: { expiresAt: new Date(Date.now() - 3600 * 1000) },
  });

  const redeemRes4 = await redeemOneTimeAccessCode({
    code: releaseRes4.code!,
    userId: student.id,
    documentId: testDoc.id,
  });

  assert(
    "Scenario 4: Expired access code is denied with ACCESS_CODE_EXPIRED",
    Boolean(!redeemRes4.success && redeemRes4.reason === "ACCESS_CODE_EXPIRED"),
    "success === false and reason === 'ACCESS_CODE_EXPIRED'",
    `success: ${redeemRes4.success}, reason: ${redeemRes4.reason}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Revoked document access is denied
  // ─────────────────────────────────────────────────────────────────────────
  const releaseRes5 = await releaseOneTimeAccessCode({
    documentId: testDoc.id,
    recipientUserId: student.id,
    createdById: faculty.id,
  });

  // Admin/Owner revokes this access code
  await prisma.documentAccessCode.update({
    where: { codeHash: hashAccessCode(releaseRes5.code!) },
    data: { status: "REVOKED" },
  });

  const redeemRes5 = await redeemOneTimeAccessCode({
    code: releaseRes5.code!,
    userId: student.id,
    documentId: testDoc.id,
  });

  assert(
    "Scenario 5: Revoked access code is denied with DOCUMENT_ACCESS_REVOKED",
    Boolean(!redeemRes5.success && redeemRes5.reason === "DOCUMENT_ACCESS_REVOKED"),
    "success === false and reason === 'DOCUMENT_ACCESS_REVOKED'",
    `success: ${redeemRes5.success}, reason: ${redeemRes5.reason}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Empty reason cannot create a ticket
  // ─────────────────────────────────────────────────────────────────────────
  const ticketResEmpty = await createReAccessTicket({
    documentId: testDoc.id,
    requesterId: student.id,
    reason: "   ", // Only whitespace
  });

  assert(
    "Scenario 6: Empty or whitespace reason is strictly rejected",
    Boolean(!ticketResEmpty.success && ticketResEmpty.statusCode === 400),
    "success === false and statusCode === 400",
    `success: ${ticketResEmpty.success}, error: ${ticketResEmpty.error}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 7: A valid reason creates a ticket
  // ─────────────────────────────────────────────────────────────────────────
  const validReason = "I accidentally deleted my downloaded copy and need it for examination revision.";
  const ticketRes7 = await createReAccessTicket({
    documentId: testDoc.id,
    requesterId: student.id,
    reason: validReason,
  });

  assert(
    "Scenario 7: Valid reason creates ticket with format CVLT-REQ-YYYY-XXXXXX and status PENDING",
    Boolean(
      ticketRes7.success &&
        ticketRes7.ticket?.ticketId?.startsWith("CVLT-REQ-") &&
        ticketRes7.ticket?.status === "PENDING" &&
        ticketRes7.ticket?.reason === validReason
    ),
    "success === true, ticketId starting with CVLT-REQ-, status PENDING, exact reason preserved",
    `success: ${ticketRes7.success}, ticketId: ${ticketRes7.ticket?.ticketId}, status: ${ticketRes7.ticket?.status}`
  );

  const ticket7 = ticketRes7.ticket!;

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 8: Only the correct document owner receives the notification
  // ─────────────────────────────────────────────────────────────────────────
  const ownerNotif = await prisma.notification.findFirst({
    where: {
      userId: faculty.id, // Original document owner
      title: "New Document Re-Access Request",
    },
    orderBy: { createdAt: "desc" },
  });

  assert(
    "Scenario 8: Only the original document owner receives the in-app notification with ticket ID",
    Boolean(
      ownerNotif &&
        ownerNotif.userId === faculty.id &&
        ownerNotif.message.includes(ticket7.ticketId) &&
        ownerNotif.message.includes(testDoc.title)
    ),
    "Owner notification exists for faculty with ticket ID and document title",
    `notif found: ${Boolean(ownerNotif)}, userId: ${ownerNotif?.userId}, message: ${ownerNotif?.message?.substring(0, 60)}...`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: Unauthorized users cannot approve tickets
  // ─────────────────────────────────────────────────────────────────────────
  const unauthorizedReview = await reviewReAccessTicket({
    ticketId: ticket7.id,
    reviewerId: otherStudent.id, // Student B is not owner or admin
    action: "APPROVE",
  });

  assert(
    "Scenario 9: Unauthorized user review attempt is rejected with 403 Forbidden",
    Boolean(!unauthorizedReview.success && unauthorizedReview.statusCode === 403),
    "success === false and statusCode === 403",
    `success: ${unauthorizedReview.success}, statusCode: ${unauthorizedReview.statusCode}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 10: Owner approval generates a fresh code
  // ─────────────────────────────────────────────────────────────────────────
  const ownerApproval = await reviewReAccessTicket({
    ticketId: ticket7.id,
    reviewerId: faculty.id, // Legitimate owner
    action: "APPROVE",
    expiryHours: 24,
  });

  assert(
    "Scenario 10: Document owner approval updates status to APPROVED and generates fresh code",
    Boolean(
      ownerApproval.success &&
        ownerApproval.ticket?.status === "APPROVED" &&
        ownerApproval.accessCode &&
        ownerApproval.accessCode.startsWith("CVLT-")
    ),
    "success === true, status === 'APPROVED', fresh access code returned",
    `success: ${ownerApproval.success}, status: ${ownerApproval.ticket?.status}, code: ${ownerApproval.accessCode}`
  );

  const freshCode = ownerApproval.accessCode!;

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 11: Owner rejection does not generate a code
  // ─────────────────────────────────────────────────────────────────────────
  // Create a separate ticket to test rejection
  const ticketRes11 = await createReAccessTicket({
    documentId: testDoc.id,
    requesterId: otherStudent.id,
    reason: "Need document for external study.",
  });

  const ownerRejection = await reviewReAccessTicket({
    ticketId: ticketRes11.ticket.id,
    reviewerId: faculty.id,
    action: "REJECT",
    rejectionReason: "Exam study window has concluded.",
  });

  assert(
    "Scenario 11: Owner rejection updates status to REJECTED and generates NO code",
    Boolean(
      ownerRejection.success &&
        ownerRejection.ticket?.status === "REJECTED" &&
        !ownerRejection.accessCode
    ),
    "success === true, status === 'REJECTED', accessCode === undefined",
    `success: ${ownerRejection.success}, status: ${ownerRejection.ticket?.status}, code: ${ownerRejection.accessCode}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 12: Old codes remain invalid after new code generation
  // ─────────────────────────────────────────────────────────────────────────
  const oldCodeRedeem = await redeemOneTimeAccessCode({
    code: code1, // Code from Scenario 1
    userId: student.id,
    documentId: testDoc.id,
  });

  assert(
    "Scenario 12: Previous code remains permanently invalid after new code issuance",
    Boolean(!oldCodeRedeem.success && oldCodeRedeem.reason === "ACCESS_CODE_ALREADY_USED"),
    "success === false and reason === 'ACCESS_CODE_ALREADY_USED'",
    `success: ${oldCodeRedeem.success}, reason: ${oldCodeRedeem.reason}`
  );

  // And verify the fresh code DOES work:
  const freshCodeRedeem = await redeemOneTimeAccessCode({
    code: freshCode,
    userId: student.id,
    documentId: testDoc.id,
  });

  assert(
    "Scenario 12.2: Newly issued code successfully grants access and is consumed",
    Boolean(freshCodeRedeem.success),
    "success === true",
    `success: ${freshCodeRedeem.success}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 13: Concurrent requests cannot consume the same code twice (Atomicity)
  // ─────────────────────────────────────────────────────────────────────────
  resetRedemptionRateLimit();
  const releaseRes13 = await releaseOneTimeAccessCode({
    documentId: testDoc.id,
    recipientUserId: student.id,
    createdById: faculty.id,
  });
  const concurrencyCode = releaseRes13.code!;

  // Fire 2 concurrent redemption requests simultaneously
  const [resA, resB] = await Promise.all([
    redeemOneTimeAccessCode({ code: concurrencyCode, userId: student.id, documentId: testDoc.id }),
    redeemOneTimeAccessCode({ code: concurrencyCode, userId: student.id, documentId: testDoc.id }),
  ]);

  const oneSuccess = (resA.success && !resB.success) || (!resA.success && resB.success);
  const oneAlreadyUsed =
    resA.reason === "ACCESS_CODE_ALREADY_USED" || resB.reason === "ACCESS_CODE_ALREADY_USED";

  assert(
    "Scenario 13: Concurrent redemption requests atomically permit exactly one success",
    Boolean(oneSuccess && oneAlreadyUsed),
    "Exactly one redemption succeeds and the other receives ACCESS_CODE_ALREADY_USED",
    `resA success: ${resA.success} (${resA.reason}), resB success: ${resB.success} (${resB.reason})`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 14: All important events are recorded in the audit log
  // ─────────────────────────────────────────────────────────────────────────
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      documentId: testDoc.id,
      action: {
        in: [
          "access_code_released",
          "access_code_redeemed",
          "reaccess_request_created",
          "reaccess_request_approved",
          "reaccess_request_rejected",
        ],
      },
    },
  });

  const actionsLogged = new Set(auditLogs.map((l) => l.action));
  const hasRelease = actionsLogged.has("access_code_released");
  const hasRedeem = actionsLogged.has("access_code_redeemed");
  const hasCreated = actionsLogged.has("reaccess_request_created");
  const hasApproved = actionsLogged.has("reaccess_request_approved");
  const hasRejected = actionsLogged.has("reaccess_request_rejected");

  assert(
    "Scenario 14: Audit log records release, redeem, ticket create, approve, and reject events",
    Boolean(hasRelease && hasRedeem && hasCreated && hasApproved && hasRejected),
    "All 5 critical security lifecycle actions present in audit log",
    `Logged actions: ${Array.from(actionsLogged).join(", ")}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 15: Suspended users cannot bypass access restrictions
  // ─────────────────────────────────────────────────────────────────────────
  const releaseRes15 = await releaseOneTimeAccessCode({
    documentId: testDoc.id,
    recipientUserId: otherStudent.id,
    createdById: faculty.id,
  });

  // Temporarily suspend user
  await prisma.user.update({
    where: { id: otherStudent.id },
    data: { status: "suspended" },
  });

  const redeemRes15 = await redeemOneTimeAccessCode({
    code: releaseRes15.code!,
    userId: otherStudent.id,
    documentId: testDoc.id,
  });

  // Restore user to active
  await prisma.user.update({
    where: { id: otherStudent.id },
    data: { status: "active" },
  });

  assert(
    "Scenario 15: Suspended user is denied code redemption with USER_SUSPENDED",
    Boolean(!redeemRes15.success && redeemRes15.reason === "USER_SUSPENDED"),
    "success === false and reason === 'USER_SUSPENDED'",
    `success: ${redeemRes15.success}, reason: ${redeemRes15.reason}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n═════════════════════════════════════════════════════════════════════════");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`  TEST RESULTS: ${passed}/${total} PASSED  (${failed} failed)`);
  console.log("═════════════════════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
