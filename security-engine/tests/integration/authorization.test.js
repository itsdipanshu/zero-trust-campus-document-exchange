/**
 * CampusVault – Integration Tests for Authorization Engine
 * Developer: Abdul (Security Testing)
 *
 * Tests the complete authorizeDocumentAccess() pipeline with
 * all 10 required test cases from the problem statement.
 */

const { authorizeDocumentAccess } = require('../../src/authorization/authorizeDocumentAccess');
const auditLogger = require('../../src/audit/auditLogger');
const { users, documents, grants, now } = require('../../tests/fixtures');
const { DECISION, REASON } = require('../../src/constants');

describe('Authorization Engine – Integration Tests', () => {
  beforeEach(() => {
    auditLogger.clearLogs();
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 1: Valid user accessing an authorized document
  // ═══════════════════════════════════════════════════════════
  test('TC-01: Valid user with valid grant → ACCESS GRANTED', async () => {
    const result = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      grants.validGrant,
      now
    );

    expect(result.decision).toBe(DECISION.ALLOW);
    expect(result.reason).toBe(REASON.ACCESS_GRANTED_BY_GRANT);
    expect(result.auditEntry.decision).toBe('ALLOW');
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 2: Unauthorized user accessing a document
  // ═══════════════════════════════════════════════════════════
  test('TC-02: Student accessing confidential doc without grant → DENIED', async () => {
    const result = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      null, // no grant
      now
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.NO_VALID_GRANT);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 3: User from another department attempting access
  // ═══════════════════════════════════════════════════════════
  test('TC-03: Math student accessing CS internal doc → DEPARTMENT_MISMATCH', async () => {
    const result = await authorizeDocumentAccess(
      users.studentMath,
      documents.internalDoc,
      null,
      now
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.DEPARTMENT_MISMATCH);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 4: Expired grant
  // ═══════════════════════════════════════════════════════════
  test('TC-04: Expired grant → GRANT_EXPIRED', async () => {
    const result = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      grants.expiredGrant,
      now
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.GRANT_EXPIRED);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 5: Revoked grant
  // ═══════════════════════════════════════════════════════════
  test('TC-05: Revoked grant → GRANT_REVOKED', async () => {
    const result = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      grants.revokedGrant,
      now
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.GRANT_REVOKED);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 6: Suspended user
  // ═══════════════════════════════════════════════════════════
  test('TC-06: Suspended user → USER_SUSPENDED', async () => {
    const result = await authorizeDocumentAccess(
      users.suspendedStudent,
      documents.publicDoc,
      null,
      now
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.USER_SUSPENDED);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 7: User accessing an old document link
  //              (grant was revoked, user uses saved URL)
  // ═══════════════════════════════════════════════════════════
  test('TC-07: Old document link after revocation → GRANT_REVOKED', async () => {
    const result = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      grants.revokedGrant,
      now,
      { action: 'view', metadata: { path: '/documents/doc-confidential-001/download?token=old-link' } }
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.GRANT_REVOKED);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 8: Direct API access without permission
  // ═══════════════════════════════════════════════════════════
  test('TC-08: Direct API request without grant → NO_VALID_GRANT', async () => {
    const result = await authorizeDocumentAccess(
      users.studentCS,
      documents.restrictedDoc,
      null, // no grant
      now,
      { action: 'download', metadata: { path: '/api/documents/doc-restricted-001/raw' } }
    );

    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.NO_VALID_GRANT);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 9: Access after revocation while already logged in
  // ═══════════════════════════════════════════════════════════
  test('TC-09: Logged-in user tries access after grant revocation → GRANT_REVOKED', async () => {
    // Simulate: user was granted access, used it, then admin revoked
    // User is still logged in and tries again

    // Step 1: Access WITH valid grant → ALLOW
    const result1 = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      grants.validGrant,
      now,
      { metadata: { sessionId: 'session-abc-123' } }
    );
    expect(result1.decision).toBe(DECISION.ALLOW);

    // Step 2: Admin revokes the grant (simulated by using revokedGrant)
    // Step 3: Same session tries again → DENY
    const result2 = await authorizeDocumentAccess(
      users.studentCS,
      documents.confidentialDoc,
      grants.revokedGrant,  // grant is now revoked in DB
      now,
      { metadata: { sessionId: 'session-abc-123' } }  // same session
    );
    expect(result2.decision).toBe(DECISION.DENY);
    expect(result2.reason).toBe(REASON.GRANT_REVOKED);
  });

  // ═══════════════════════════════════════════════════════════
  // TEST CASE 10: Audit log verification
  // ═══════════════════════════════════════════════════════════
  test('TC-10: Audit log records all decisions correctly', async () => {
    // Make several authorization calls
    await authorizeDocumentAccess(users.adminUser, documents.restrictedDoc, null, now);
    await authorizeDocumentAccess(users.studentCS, documents.confidentialDoc, null, now);
    await authorizeDocumentAccess(users.suspendedStudent, documents.publicDoc, null, now);

    const allLogs = auditLogger.getAllLogs();
    expect(allLogs.length).toBe(3);

    // Verify ALLOW entry
    const allows = auditLogger.queryLogs({ decision: 'ALLOW' });
    expect(allows.length).toBe(1);
    expect(allows[0].userId).toBe('user-admin-001');

    // Verify DENY entries
    const denials = auditLogger.queryLogs({ decision: 'DENY' });
    expect(denials.length).toBe(2);

    // Verify each entry has required fields
    allLogs.forEach((entry) => {
      expect(entry.userId).toBeDefined();
      expect(entry.documentId).toBeDefined();
      expect(entry.action).toBeDefined();
      expect(entry.decision).toBeDefined();
      expect(entry.reason).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      // Ensure no sensitive data
      expect(entry.metadata.password).toBeUndefined();
      expect(entry.metadata.fileContent).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ADDITIONAL: Role-based access (no grant needed)
  // ═══════════════════════════════════════════════════════════
  test('Admin accesses restricted doc without grant → ALLOW by role', async () => {
    const result = await authorizeDocumentAccess(
      users.adminUser,
      documents.restrictedDoc,
      null,
      now
    );

    expect(result.decision).toBe(DECISION.ALLOW);
    expect(result.reason).toBe(REASON.ACCESS_GRANTED_BY_ROLE);
  });

  test('Teacher accesses public doc → ALLOW by role', async () => {
    const result = await authorizeDocumentAccess(
      users.teacherCS,
      documents.publicDoc,
      null,
      now
    );

    expect(result.decision).toBe(DECISION.ALLOW);
    expect(result.reason).toBe(REASON.ACCESS_GRANTED_BY_ROLE);
  });

  test('Department Manager accesses confidential doc in own dept → ALLOW by role', async () => {
    const result = await authorizeDocumentAccess(
      users.deptManagerCS,
      documents.confidentialDoc,
      null,
      now
    );

    expect(result.decision).toBe(DECISION.ALLOW);
    expect(result.reason).toBe(REASON.ACCESS_GRANTED_BY_ROLE);
  });

  test('Null user → USER_NOT_FOUND', async () => {
    const result = await authorizeDocumentAccess(null, documents.publicDoc, null, now);
    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.USER_NOT_FOUND);
  });

  test('Null document → DOCUMENT_NOT_FOUND', async () => {
    const result = await authorizeDocumentAccess(users.studentCS, null, null, now);
    expect(result.decision).toBe(DECISION.DENY);
    expect(result.reason).toBe(REASON.DOCUMENT_NOT_FOUND);
  });
});
