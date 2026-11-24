/**
 * CampusVault – Attack Simulation Test Suite
 * Developer: Abdul (Security Testing)
 *
 * Demonstrates the EXACT attack scenario from the problem statement:
 *
 *   Step 1: Admin grants Student A access.
 *   Step 2: Student A opens the document successfully.
 *   Step 3: Admin revokes Student A's access.
 *   Step 4: Student A tries the same old link.         → DENIED – GRANT_REVOKED
 *   Step 5: Student A tries the direct API request.    → DENIED – GRANT_REVOKED
 *   Step 6: Verify denial is recorded in the audit log.
 */

const { authorizeDocumentAccess } = require('../../src/authorization/authorizeDocumentAccess');
const auditLogger = require('../../src/audit/auditLogger');
const { DECISION, REASON } = require('../../src/constants');

describe('Attack Simulation – Immediate Access Revocation', () => {
  // ─── Synthetic Data for the Attack Scenario ───────────────
  const currentTime = new Date();
  const oneHourFromNow = new Date(currentTime.getTime() + 60 * 60 * 1000);
  const fiveMinutesAgo = new Date(currentTime.getTime() - 5 * 60 * 1000);

  const admin = {
    id: 'atk-admin-001',
    role: 'admin',
    department: 'administration',
    status: 'active',
  };

  const studentA = {
    id: 'atk-student-a-001',
    role: 'student',
    department: 'computer_science',
    status: 'active',
  };

  const targetDocument = {
    id: 'atk-doc-confidential-001',
    department: 'computer_science',
    classification: 'confidential',
    ownerId: 'atk-admin-001',
  };

  // The grant starts ACTIVE (Step 1)
  const activeGrant = {
    id: 'atk-grant-001',
    userId: 'atk-student-a-001',
    documentId: 'atk-doc-confidential-001',
    grantedBy: 'atk-admin-001',
    grantedAt: fiveMinutesAgo.toISOString(),
    expiresAt: oneHourFromNow.toISOString(),
    revoked: false,
    revokedAt: null,
    revokedBy: null,
    status: 'active',
  };

  // The grant AFTER admin revokes it (Step 3)
  const revokedGrant = {
    ...activeGrant,
    revoked: true,
    revokedAt: currentTime.toISOString(),
    revokedBy: 'atk-admin-001',
    status: 'revoked',
  };

  beforeEach(() => {
    auditLogger.clearLogs();
  });

  test('FULL ATTACK SCENARIO – Steps 1 through 6', async () => {
    // ═══════════════════════════════════════════════════════
    // STEP 1: Admin grants Student A access
    // (Simulated – the grant object exists as activeGrant)
    // ═══════════════════════════════════════════════════════
    console.log('Step 1: Admin grants Student A access to confidential document');

    // ═══════════════════════════════════════════════════════
    // STEP 2: Student A opens the document successfully
    // ═══════════════════════════════════════════════════════
    console.log('Step 2: Student A accesses the document...');
    const step2Result = await authorizeDocumentAccess(
      studentA,
      targetDocument,
      activeGrant,
      currentTime,
      {
        action: 'view',
        metadata: {
          sessionId: 'session-student-a-001',
          ip: '10.0.0.50',
          path: '/documents/atk-doc-confidential-001/view',
        },
      }
    );

    expect(step2Result.decision).toBe(DECISION.ALLOW);
    expect(step2Result.reason).toBe(REASON.ACCESS_GRANTED_BY_GRANT);
    console.log(`  → Result: ${step2Result.decision} – ${step2Result.reason}`);

    // ═══════════════════════════════════════════════════════
    // STEP 3: Admin revokes Student A's access
    // (Simulated – the grant object is now revokedGrant)
    // ═══════════════════════════════════════════════════════
    console.log('Step 3: Admin revokes Student A\'s access');

    // ═══════════════════════════════════════════════════════
    // STEP 4: Student A tries the same old link
    // ═══════════════════════════════════════════════════════
    console.log('Step 4: Student A tries the same old document link...');
    const step4Result = await authorizeDocumentAccess(
      studentA,
      targetDocument,
      revokedGrant, // DB now returns the revoked version
      currentTime,
      {
        action: 'view',
        metadata: {
          sessionId: 'session-student-a-001', // same session!
          ip: '10.0.0.50',
          path: '/documents/atk-doc-confidential-001/view',
        },
      }
    );

    expect(step4Result.decision).toBe(DECISION.DENY);
    expect(step4Result.reason).toBe(REASON.GRANT_REVOKED);
    console.log(`  → Result: ${step4Result.decision} – ${step4Result.reason}`);

    // ═══════════════════════════════════════════════════════
    // STEP 5: Student A tries a direct API request
    // ═══════════════════════════════════════════════════════
    console.log('Step 5: Student A tries direct API endpoint...');
    const step5Result = await authorizeDocumentAccess(
      studentA,
      targetDocument,
      revokedGrant, // still revoked
      currentTime,
      {
        action: 'download',
        metadata: {
          sessionId: 'session-student-a-001',
          ip: '10.0.0.50',
          path: '/api/documents/atk-doc-confidential-001/raw',
          userAgent: 'curl/7.88.1', // direct API call
        },
      }
    );

    expect(step5Result.decision).toBe(DECISION.DENY);
    expect(step5Result.reason).toBe(REASON.GRANT_REVOKED);
    console.log(`  → Result: ${step5Result.decision} – ${step5Result.reason}`);

    // ═══════════════════════════════════════════════════════
    // STEP 6: Verify denials are recorded in the audit log
    // ═══════════════════════════════════════════════════════
    console.log('Step 6: Verifying audit log...');
    const allLogs = auditLogger.getAllLogs();
    expect(allLogs.length).toBe(3); // step 2 (allow) + step 4 (deny) + step 5 (deny)

    // Verify the ALLOW entry from Step 2
    const allows = auditLogger.queryLogs({
      userId: 'atk-student-a-001',
      decision: 'ALLOW',
    });
    expect(allows.length).toBe(1);
    expect(allows[0].reason).toBe('ACCESS_GRANTED_BY_GRANT');

    // Verify the DENY entries from Steps 4 & 5
    const denials = auditLogger.queryLogs({
      userId: 'atk-student-a-001',
      decision: 'DENY',
    });
    expect(denials.length).toBe(2);
    denials.forEach((entry) => {
      expect(entry.reason).toBe('GRANT_REVOKED');
      expect(entry.documentId).toBe('atk-doc-confidential-001');
      expect(entry.timestamp).toBeDefined();
      // No sensitive data in logs
      expect(entry.metadata.password).toBeUndefined();
      expect(entry.metadata.fileContent).toBeUndefined();
    });

    console.log('  → Audit log verification: PASSED');
    console.log('  → 1 ALLOW entry, 2 DENY entries with reason GRANT_REVOKED');
    console.log('\n═══ ATTACK SIMULATION COMPLETE – ALL STEPS PASSED ═══');
  });

  // ─── Additional attack vectors ────────────────────────────

  test('Suspended user cannot access even with valid grant', async () => {
    const suspendedStudentA = { ...studentA, status: 'suspended' };

    const result = await authorizeDocumentAccess(
      suspendedStudentA,
      targetDocument,
      activeGrant,
      currentTime
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.USER_SUSPENDED);
  });

  test('Expired grant blocks access even if not explicitly revoked', async () => {
    const pastTime = new Date(currentTime.getTime() - 2 * 60 * 60 * 1000);
    const expiredGrant = {
      ...activeGrant,
      expiresAt: pastTime.toISOString(),
      status: 'expired',
    };

    const result = await authorizeDocumentAccess(
      studentA,
      targetDocument,
      expiredGrant,
      currentTime
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.GRANT_EXPIRED);
  });

  test('Cross-department student blocked even with grant', async () => {
    const mathStudent = {
      id: 'atk-student-math-001',
      role: 'student',
      department: 'mathematics',
      status: 'active',
    };

    const crossDeptGrant = {
      ...activeGrant,
      userId: 'atk-student-math-001',
    };

    const result = await authorizeDocumentAccess(
      mathStudent,
      targetDocument,
      crossDeptGrant,
      currentTime
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.DEPARTMENT_MISMATCH);
  });
});

