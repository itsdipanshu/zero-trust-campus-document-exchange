/**
 * CampusVault – Unit Tests for ABAC Engine
 * Developer: Abdul (Security Testing)
 */

const { checkUserStatus, checkDepartment, checkGrant, checkABAC } = require('../../src/abac/abacEngine');
const { users, documents, grants, now, oneHourFromNow } = require('../../tests/fixtures');

describe('ABAC Engine', () => {
  // ─── User Status ──────────────────────────────────────────
  describe('checkUserStatus()', () => {
    test('active user passes', () => {
      const result = checkUserStatus(users.studentCS);
      expect(result.passed).toBe(true);
    });

    test('suspended user is denied', () => {
      const result = checkUserStatus(users.suspendedStudent);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('USER_SUSPENDED');
    });

    test('inactive user is denied', () => {
      const result = checkUserStatus(users.inactiveTeacher);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('USER_INACTIVE');
    });

    test('null user is denied', () => {
      const result = checkUserStatus(null);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('USER_NOT_FOUND');
    });
  });

  // ─── Department Check ─────────────────────────────────────
  describe('checkDepartment()', () => {
    test('same department passes', () => {
      const result = checkDepartment(users.studentCS, documents.internalDoc);
      expect(result.passed).toBe(true);
    });

    test('different department is denied', () => {
      const result = checkDepartment(users.studentMath, documents.internalDoc);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('DEPARTMENT_MISMATCH');
    });

    test('admin bypasses department restriction', () => {
      const result = checkDepartment(users.adminUser, documents.mathInternalDoc);
      expect(result.passed).toBe(true);
    });

    test('public documents have no department restriction', () => {
      const result = checkDepartment(users.studentMath, documents.publicDoc);
      expect(result.passed).toBe(true);
    });
  });

  // ─── Grant Validation ─────────────────────────────────────
  describe('checkGrant()', () => {
    test('valid grant passes', () => {
      const result = checkGrant(grants.validGrant, 'user-student-cs-001', 'doc-confidential-001', now);
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('ACCESS_GRANTED_BY_GRANT');
    });

    test('revoked grant is denied', () => {
      const result = checkGrant(grants.revokedGrant, 'user-student-cs-001', 'doc-confidential-001', now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('GRANT_REVOKED');
    });

    test('expired grant is denied', () => {
      const result = checkGrant(grants.expiredGrant, 'user-student-cs-001', 'doc-confidential-001', now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('GRANT_EXPIRED');
    });

    test('null grant is denied', () => {
      const result = checkGrant(null, 'user-student-cs-001', 'doc-confidential-001', now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('NO_VALID_GRANT');
    });

    test('grant for wrong user is denied', () => {
      const result = checkGrant(grants.wrongUserGrant, 'user-student-cs-001', 'doc-confidential-001', now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('NO_VALID_GRANT');
    });

    test('grant for wrong document is denied', () => {
      const result = checkGrant(grants.validGrant, 'user-student-cs-001', 'doc-wrong-id', now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('NO_VALID_GRANT');
    });
  });

  // ─── Combined ABAC ────────────────────────────────────────
  describe('checkABAC()', () => {
    test('active user, same dept, valid grant → pass', () => {
      const result = checkABAC(users.studentCS, documents.confidentialDoc, grants.validGrant, now);
      expect(result.passed).toBe(true);
    });

    test('suspended user blocked before grant check', () => {
      const result = checkABAC(users.suspendedStudent, documents.confidentialDoc, grants.validGrant, now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('USER_SUSPENDED');
    });

    test('cross-department blocked before grant check', () => {
      const result = checkABAC(users.studentMath, documents.internalDoc, grants.validGrant, now);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('DEPARTMENT_MISMATCH');
    });
  });
});
