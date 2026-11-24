/**
 * CampusVault – ABAC Engine
 * Attribute-Based Access Control checks.
 *
 * Evaluates fine-grained attributes: department match, user status,
 * document classification vs. user clearance, grant validity, and expiry.
 */

const { DECISION, REASON } = require('../constants/decisions');
const { ROLES } = require('../constants/roles');

/**
 * Check if the user's status is active.
 * @param {import('../models/schemas').User} user
 * @returns {{ passed: boolean, reason: string }}
 */
function checkUserStatus(user) {
  if (!user) {
    return { passed: false, reason: REASON.USER_NOT_FOUND };
  }
  if (user.status === 'suspended') {
    return { passed: false, reason: REASON.USER_SUSPENDED };
  }
  if (user.status === 'inactive') {
    return { passed: false, reason: REASON.USER_INACTIVE };
  }
  if (user.status !== 'active') {
    return { passed: false, reason: REASON.USER_SUSPENDED };
  }
  return { passed: true, reason: null };
}

/**
 * Check whether the user's department matches the document's department.
 * Admins are exempt from department restrictions.
 *
 * @param {import('../models/schemas').User}     user
 * @param {import('../models/schemas').Document} document
 * @returns {{ passed: boolean, reason: string }}
 */
function checkDepartment(user, document) {
  // Admins can access any department
  if (user.role === ROLES.ADMIN) {
    return { passed: true, reason: null };
  }

  // Public documents have no department restriction
  if (document.classification === 'public') {
    return { passed: true, reason: null };
  }

  if (user.department !== document.department) {
    return { passed: false, reason: REASON.DEPARTMENT_MISMATCH };
  }

  return { passed: true, reason: null };
}

/**
 * Validate a grant object: check existence, revocation, and expiry.
 *
 * @param {import('../models/schemas').Grant|null} grant
 * @param {string}  userId        - The requesting user's ID
 * @param {string}  documentId    - The requested document's ID
 * @param {Date}    currentTime   - Server-side current time (never trust client clocks)
 * @returns {{ passed: boolean, reason: string }}
 */
function checkGrant(grant, userId, documentId, currentTime) {
  if (!grant) {
    return { passed: false, reason: REASON.NO_VALID_GRANT };
  }

  // Ensure the grant matches the requesting user and document
  if (grant.userId !== userId || grant.documentId !== documentId) {
    return { passed: false, reason: REASON.NO_VALID_GRANT };
  }

  // Check revocation FIRST (immediate revocation takes priority)
  if (grant.revoked === true || grant.status === 'revoked') {
    return { passed: false, reason: REASON.GRANT_REVOKED };
  }

  // Check expiry (if expiresAt is set)
  if (grant.expiresAt) {
    const expiresAt = new Date(grant.expiresAt);
    const now = currentTime instanceof Date ? currentTime : new Date(currentTime);

    if (now >= expiresAt) {
      return { passed: false, reason: REASON.GRANT_EXPIRED };
    }
  }

  return { passed: true, reason: REASON.ACCESS_GRANTED_BY_GRANT };
}

/**
 * Run ALL ABAC checks in order of priority.
 *
 * Order matters:
 *   1. User status   – suspended users are blocked immediately
 *   2. Department     – cross-department access is denied
 *   3. Grant validity – revocation and expiry
 *
 * @param {import('../models/schemas').User}       user
 * @param {import('../models/schemas').Document}   document
 * @param {import('../models/schemas').Grant|null}  grant
 * @param {Date}  currentTime
 * @returns {{ passed: boolean, reason: string }}
 */
function checkABAC(user, document, grant, currentTime) {
  // 1. User status
  const statusResult = checkUserStatus(user);
  if (!statusResult.passed) return statusResult;

  // 2. Department match
  const deptResult = checkDepartment(user, document);
  if (!deptResult.passed) return deptResult;

  // 3. Grant validity (only checked when a grant is provided)
  if (grant) {
    const grantResult = checkGrant(grant, user.id, document.id, currentTime);
    return grantResult;
  }

  // No grant provided – caller must decide if one is needed
  return { passed: false, reason: REASON.NO_VALID_GRANT };
}

module.exports = {
  checkUserStatus,
  checkDepartment,
  checkGrant,
  checkABAC,
};

