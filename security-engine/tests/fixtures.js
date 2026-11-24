/**
 * CampusVault – Synthetic Test Fixtures
 * Shared users, documents, and grants for all test suites.
 *
 * ALL data is synthetic – no real user information.
 */

const { ROLES } = require('../src/constants/roles');
const { CLASSIFICATION } = require('../src/constants/classifications');

// ═══════════════════════════════════════════════════════════════
// Synthetic Users
// ═══════════════════════════════════════════════════════════════

const users = {
  adminUser: {
    id: 'user-admin-001',
    role: ROLES.ADMIN,
    department: 'administration',
    status: 'active',
    email: 'admin@campus.test',
  },
  teacherCS: {
    id: 'user-teacher-cs-001',
    role: ROLES.TEACHER,
    department: 'computer_science',
    status: 'active',
    email: 'teacher.cs@campus.test',
  },
  teacherMath: {
    id: 'user-teacher-math-001',
    role: ROLES.TEACHER,
    department: 'mathematics',
    status: 'active',
    email: 'teacher.math@campus.test',
  },
  studentCS: {
    id: 'user-student-cs-001',
    role: ROLES.STUDENT,
    department: 'computer_science',
    status: 'active',
    email: 'student.cs@campus.test',
  },
  studentMath: {
    id: 'user-student-math-001',
    role: ROLES.STUDENT,
    department: 'mathematics',
    status: 'active',
    email: 'student.math@campus.test',
  },
  suspendedStudent: {
    id: 'user-student-suspended-001',
    role: ROLES.STUDENT,
    department: 'computer_science',
    status: 'suspended',
    email: 'suspended@campus.test',
  },
  inactiveTeacher: {
    id: 'user-teacher-inactive-001',
    role: ROLES.TEACHER,
    department: 'computer_science',
    status: 'inactive',
    email: 'inactive.teacher@campus.test',
  },
  deptManagerCS: {
    id: 'user-deptmgr-cs-001',
    role: ROLES.DEPARTMENT_MANAGER,
    department: 'computer_science',
    status: 'active',
    email: 'deptmgr.cs@campus.test',
  },
};

// ═══════════════════════════════════════════════════════════════
// Synthetic Documents
// ═══════════════════════════════════════════════════════════════

const documents = {
  publicDoc: {
    id: 'doc-public-001',
    department: 'computer_science',
    classification: CLASSIFICATION.PUBLIC,
    ownerId: 'user-teacher-cs-001',
    title: 'Course Syllabus',
  },
  internalDoc: {
    id: 'doc-internal-001',
    department: 'computer_science',
    classification: CLASSIFICATION.INTERNAL,
    ownerId: 'user-teacher-cs-001',
    title: 'Internal Notes',
  },
  confidentialDoc: {
    id: 'doc-confidential-001',
    department: 'computer_science',
    classification: CLASSIFICATION.CONFIDENTIAL,
    ownerId: 'user-deptmgr-cs-001',
    title: 'Exam Paper Draft',
  },
  restrictedDoc: {
    id: 'doc-restricted-001',
    department: 'computer_science',
    classification: CLASSIFICATION.RESTRICTED,
    ownerId: 'user-admin-001',
    title: 'Student Records',
  },
  mathInternalDoc: {
    id: 'doc-internal-math-001',
    department: 'mathematics',
    classification: CLASSIFICATION.INTERNAL,
    ownerId: 'user-teacher-math-001',
    title: 'Math Internal Report',
  },
};

// ═══════════════════════════════════════════════════════════════
// Synthetic Grants
// ═══════════════════════════════════════════════════════════════

const now = new Date();
const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

const grants = {
  validGrant: {
    id: 'grant-001',
    userId: 'user-student-cs-001',
    documentId: 'doc-confidential-001',
    grantedBy: 'user-admin-001',
    grantedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    expiresAt: oneHourFromNow.toISOString(),
    revoked: false,
    revokedAt: null,
    revokedBy: null,
    status: 'active',
  },
  expiredGrant: {
    id: 'grant-002',
    userId: 'user-student-cs-001',
    documentId: 'doc-confidential-001',
    grantedBy: 'user-admin-001',
    grantedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    expiresAt: oneHourAgo.toISOString(),
    revoked: false,
    revokedAt: null,
    revokedBy: null,
    status: 'expired',
  },
  revokedGrant: {
    id: 'grant-003',
    userId: 'user-student-cs-001',
    documentId: 'doc-confidential-001',
    grantedBy: 'user-admin-001',
    grantedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    expiresAt: oneHourFromNow.toISOString(),
    revoked: true,
    revokedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    revokedBy: 'user-admin-001',
    status: 'revoked',
  },
  wrongUserGrant: {
    id: 'grant-004',
    userId: 'user-student-math-001',
    documentId: 'doc-confidential-001',
    grantedBy: 'user-admin-001',
    grantedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    expiresAt: oneHourFromNow.toISOString(),
    revoked: false,
    revokedAt: null,
    revokedBy: null,
    status: 'active',
  },
  restrictedDocGrant: {
    id: 'grant-005',
    userId: 'user-student-cs-001',
    documentId: 'doc-restricted-001',
    grantedBy: 'user-admin-001',
    grantedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    expiresAt: oneHourFromNow.toISOString(),
    revoked: false,
    revokedAt: null,
    revokedBy: null,
    status: 'active',
  },
};

module.exports = { users, documents, grants, now, oneHourFromNow, oneHourAgo };
