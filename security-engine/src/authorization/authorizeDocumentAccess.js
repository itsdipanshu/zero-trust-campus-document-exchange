/**
 * CampusVault – Zero-Trust Authorization Engine
 *
 * Core function: authorizeDocumentAccess(user, document, grant, currentTime)
 *
 * Implements the NEVER TRUST, ALWAYS VERIFY principle:
 *   Every protected document request is verified against the user's
 *   CURRENT permissions at request time — not just at login.
 *
 * Decision pipeline (order matters):
 *   1. Input validation
 *   2. User identity & status      (ABAC)
 *   3. Department restriction       (ABAC)
 *   4. Role-based classification    (RBAC)
 *   5. Grant validity & expiry      (ABAC)
 *   6. Audit logging
 */

const { checkRBAC } = require('../rbac/rbacEngine');
const { checkUserStatus, checkDepartment, checkGrant } = require('../abac/abacEngine');
const { logDecision } = require('../audit/auditLogger');
const { DECISION, REASON } = require('../constants/decisions');

/**
 * Authorize a document access request.
 *
 * @param {import('../models/schemas').User}       user        - Current user (fetched from DB at request time)
 * @param {import('../models/schemas').Document}   document    - Requested document
 * @param {import('../models/schemas').Grant|null}  grant      - Most recent grant for this user+document (or null)
 * @param {Date}                                    currentTime - Server-side current time
 * @param {Object}                                  [options]
 * @param {string}                                  [options.action='view'] - Requested action
 * @param {Object}                                  [options.metadata={}]   - Extra audit context
 * @returns {Promise<{ decision: string, reason: string, auditEntry: Object }>}
 */
async function authorizeDocumentAccess(user, document, grant = null, currentTime = new Date(), options = {}) {
  const action = options.action || 'view';
  const metadata = options.metadata || {};

  // ─── 1. Input Validation ───────────────────────────────────────
  if (!user) {
    return await _deny(null, document, action, REASON.USER_NOT_FOUND, metadata);
  }
  if (!document) {
    return await _deny(user, null, action, REASON.DOCUMENT_NOT_FOUND, metadata);
  }

  // ─── 2. User Status Check (ABAC) ──────────────────────────────
  const statusCheck = checkUserStatus(user);
  if (!statusCheck.passed) {
    return await _deny(user, document, action, statusCheck.reason, metadata);
  }

  // ─── 3. Department Restriction (ABAC) ─────────────────────────
  const deptCheck = checkDepartment(user, document);
  if (!deptCheck.passed) {
    return await _deny(user, document, action, deptCheck.reason, metadata);
  }

  // ─── 4. Role-Based Classification Check (RBAC) ────────────────
  const rbacCheck = checkRBAC(user, document);
  if (rbacCheck.passed) {
    // Role alone is sufficient — no grant needed
    return await _allow(user, document, action, rbacCheck.reason, metadata);
  }

  // Document owner check (active user accessing own document in same department)
  if (document.ownerId && user.id === document.ownerId) {
    return await _allow(user, document, action, REASON.ACCESS_GRANTED_BY_ROLE, metadata);
  }

  // ─── 5. Grant-Based Access (ABAC) ─────────────────────────────
  // Role was not sufficient; a valid grant is required.
  if (!grant) {
    return await _deny(user, document, action, REASON.NO_VALID_GRANT, metadata);
  }

  const grantCheck = checkGrant(grant, user.id, document.id, currentTime);
  if (!grantCheck.passed) {
    return await _deny(user, document, action, grantCheck.reason, metadata);
  }

  // ─── All checks passed ────────────────────────────────────────
  return await _allow(user, document, action, REASON.ACCESS_GRANTED_BY_GRANT, metadata);
}

// ═══════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════

async function _allow(user, document, action, reason, metadata) {
  const auditEntry = await logDecision({
    userId: user.id,
    documentId: document.id,
    action,
    decision: DECISION.ALLOW,
    reason,
    metadata,
  });
  return { decision: DECISION.ALLOW, reason, auditEntry };
}

async function _deny(user, document, action, reason, metadata) {
  const auditEntry = await logDecision({
    userId: user ? user.id : 'unknown',
    documentId: document ? document.id : 'unknown',
    action,
    decision: DECISION.DENY,
    reason,
    metadata,
  });
  return { decision: DECISION.DENY, reason, auditEntry };
}

module.exports = { authorizeDocumentAccess };

