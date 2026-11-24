/**
 * CampusVault – RBAC Engine
 * Role-Based Access Control checks.
 *
 * Determines whether a user's ROLE alone grants access to a document
 * classification, before any grant-level checks.
 */

const { ROLES, ROLE_HIERARCHY, ROLE_DEFAULT_PERMISSIONS } = require('../constants/roles');
const { CLASSIFICATION_LEVEL } = require('../constants/classifications');
const { DECISION, REASON } = require('../constants/decisions');

/**
 * Check if a role is valid.
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

/**
 * Get the hierarchy level of a role.
 * @param {string} role
 * @returns {number}
 */
function getRoleLevel(role) {
  return ROLE_HIERARCHY[role] || 0;
}

/**
 * Check if a role has default access to a classification.
 * @param {string} role            - User's role
 * @param {string} classification  - Document classification
 * @returns {boolean}
 */
function roleCanAccessClassification(role, classification) {
  const allowed = ROLE_DEFAULT_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.includes(classification);
}

/**
 * Run the RBAC check.
 *
 * @param {import('../models/schemas').User}     user
 * @param {import('../models/schemas').Document} document
 * @returns {{ passed: boolean, reason: string }}
 */
function checkRBAC(user, document) {
  if (!user || !user.role) {
    return { passed: false, reason: REASON.INVALID_REQUEST };
  }

  if (!isValidRole(user.role)) {
    return { passed: false, reason: REASON.INVALID_REQUEST };
  }

  // Admin bypasses classification restrictions via role
  if (user.role === ROLES.ADMIN) {
    return { passed: true, reason: REASON.ACCESS_GRANTED_BY_ROLE };
  }

  // Check if the role's default permissions cover this classification
  if (roleCanAccessClassification(user.role, document.classification)) {
    return { passed: true, reason: REASON.ACCESS_GRANTED_BY_ROLE };
  }

  // Role alone is not sufficient – a grant will be required
  return { passed: false, reason: REASON.CLASSIFICATION_NOT_ALLOWED };
}

module.exports = {
  isValidRole,
  getRoleLevel,
  roleCanAccessClassification,
  checkRBAC,
};

