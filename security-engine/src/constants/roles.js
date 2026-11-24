/**
 * CampusVault – Role Definitions
 * Defines all supported roles and their hierarchy levels.
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  DEPARTMENT_MANAGER: 'department_manager',
  TEACHER: 'teacher',
  STUDENT: 'student',
  HOD: 'hod',
  FACULTY: 'faculty',
});

/**
 * Hierarchy level (higher = more privilege).
 * Used for role-based permission checks.
 */
const ROLE_HIERARCHY = Object.freeze({
  [ROLES.ADMIN]: 100,
  [ROLES.DEPARTMENT_MANAGER]: 75,
  [ROLES.HOD]: 75,
  [ROLES.TEACHER]: 50,
  [ROLES.FACULTY]: 50,
  [ROLES.STUDENT]: 25,
});

/**
 * Default permissions per role.
 * Maps each role to the document classifications it may access WITHOUT a grant.
 */
const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: ['public', 'internal', 'confidential', 'restricted'],
  [ROLES.DEPARTMENT_MANAGER]: ['public', 'internal', 'confidential'],
  [ROLES.HOD]: ['public', 'internal', 'confidential'],
  [ROLES.TEACHER]: ['public', 'internal'],
  [ROLES.FACULTY]: ['public', 'internal'],
  [ROLES.STUDENT]: ['public'],
});

module.exports = { ROLES, ROLE_HIERARCHY, ROLE_DEFAULT_PERMISSIONS };

