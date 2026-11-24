/**
 * CampusVault – Unit Tests for RBAC Engine
 * Developer: Abdul (Security Testing)
 */

const { checkRBAC, isValidRole, roleCanAccessClassification } = require('../../src/rbac/rbacEngine');
const { users, documents } = require('../../tests/fixtures');

describe('RBAC Engine', () => {
  describe('isValidRole()', () => {
    test('accepts valid roles', () => {
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('teacher')).toBe(true);
      expect(isValidRole('student')).toBe(true);
      expect(isValidRole('department_manager')).toBe(true);
    });

    test('rejects invalid roles', () => {
      expect(isValidRole('superadmin')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole(undefined)).toBe(false);
    });
  });

  describe('roleCanAccessClassification()', () => {
    test('admin can access all classifications', () => {
      expect(roleCanAccessClassification('admin', 'public')).toBe(true);
      expect(roleCanAccessClassification('admin', 'internal')).toBe(true);
      expect(roleCanAccessClassification('admin', 'confidential')).toBe(true);
      expect(roleCanAccessClassification('admin', 'restricted')).toBe(true);
    });

    test('student can only access public', () => {
      expect(roleCanAccessClassification('student', 'public')).toBe(true);
      expect(roleCanAccessClassification('student', 'internal')).toBe(false);
      expect(roleCanAccessClassification('student', 'confidential')).toBe(false);
      expect(roleCanAccessClassification('student', 'restricted')).toBe(false);
    });

    test('teacher can access public and internal', () => {
      expect(roleCanAccessClassification('teacher', 'public')).toBe(true);
      expect(roleCanAccessClassification('teacher', 'internal')).toBe(true);
      expect(roleCanAccessClassification('teacher', 'confidential')).toBe(false);
    });

    test('department_manager can access up to confidential', () => {
      expect(roleCanAccessClassification('department_manager', 'public')).toBe(true);
      expect(roleCanAccessClassification('department_manager', 'confidential')).toBe(true);
      expect(roleCanAccessClassification('department_manager', 'restricted')).toBe(false);
    });
  });

  describe('checkRBAC()', () => {
    test('admin passes RBAC for restricted document', () => {
      const result = checkRBAC(users.adminUser, documents.restrictedDoc);
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('ACCESS_GRANTED_BY_ROLE');
    });

    test('student passes RBAC for public document', () => {
      const result = checkRBAC(users.studentCS, documents.publicDoc);
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('ACCESS_GRANTED_BY_ROLE');
    });

    test('student fails RBAC for confidential document', () => {
      const result = checkRBAC(users.studentCS, documents.confidentialDoc);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('CLASSIFICATION_NOT_ALLOWED');
    });

    test('teacher fails RBAC for confidential document', () => {
      const result = checkRBAC(users.teacherCS, documents.confidentialDoc);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('CLASSIFICATION_NOT_ALLOWED');
    });

    test('null user fails RBAC', () => {
      const result = checkRBAC(null, documents.publicDoc);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('INVALID_REQUEST');
    });
  });
});
