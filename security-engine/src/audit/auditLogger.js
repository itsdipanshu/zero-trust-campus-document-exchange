/**
 * CampusVault – Audit Logger
 *
 * Records every authorization decision with structured metadata.
 * NEVER logs document contents, passwords, or sensitive file data.
 *
 * The logger is storage-agnostic: it emits structured entries that
 * Team 1 can persist to their database, a file, or any sink.
 */

const { DECISION } = require('../constants/decisions');

/**
 * In-memory audit log store.
 * Team 1 can replace this with their DB adapter by calling `setStore()`.
 */
let auditStore = [];

/**
 * Optional external persistence function.
 * Signature: async (entry) => void
 */
let externalPersist = null;

/**
 * Create a sanitised audit entry.
 * Strips out any fields that could contain sensitive data.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.documentId
 * @param {string} params.action       - e.g. "view", "download"
 * @param {string} params.decision     - "ALLOW" | "DENY"
 * @param {string} params.reason       - Structured reason code
 * @param {Object} [params.metadata]   - Extra context (IP, session ID)
 * @returns {import('../models/schemas').AuditEntry}
 */
function createAuditEntry({ userId, documentId, action, decision, reason, metadata = {} }) {
  // Sanitize metadata – remove anything sensitive
  const safeMetadata = { ...metadata };
  delete safeMetadata.password;
  delete safeMetadata.token;
  delete safeMetadata.fileContent;
  delete safeMetadata.documentContent;
  delete safeMetadata.secret;

  return {
    userId: String(userId),
    documentId: String(documentId),
    action: String(action),
    decision: String(decision),
    reason: String(reason),
    timestamp: new Date().toISOString(),
    metadata: safeMetadata,
  };
}

/**
 * Log an authorization decision.
 *
 * @param {Object} params – Same as createAuditEntry params
 * @returns {import('../models/schemas').AuditEntry} The logged entry
 */
async function logDecision(params) {
  const entry = createAuditEntry(params);
  auditStore.push(entry);

  // Persist externally if configured
  if (externalPersist) {
    try {
      await externalPersist(entry);
    } catch (err) {
      // Audit persistence failure must not break the request flow.
      // Log to stderr for ops visibility.
      console.error('[AuditLogger] External persist failed:', err.message);
    }
  }

  return entry;
}

/**
 * Query audit logs (in-memory).
 *
 * @param {Object} [filters]
 * @param {string} [filters.userId]
 * @param {string} [filters.documentId]
 * @param {string} [filters.decision]
 * @param {string} [filters.reason]
 * @returns {import('../models/schemas').AuditEntry[]}
 */
function queryLogs(filters = {}) {
  return auditStore.filter((entry) => {
    if (filters.userId && entry.userId !== filters.userId) return false;
    if (filters.documentId && entry.documentId !== filters.documentId) return false;
    if (filters.decision && entry.decision !== filters.decision) return false;
    if (filters.reason && entry.reason !== filters.reason) return false;
    return true;
  });
}

/**
 * Get ALL audit log entries.
 * @returns {import('../models/schemas').AuditEntry[]}
 */
function getAllLogs() {
  return [...auditStore];
}

/**
 * Clear in-memory audit logs (for testing only).
 */
function clearLogs() {
  auditStore = [];
}

/**
 * Set an external persistence function.
 * Team 1 calls this to route audit entries to their database.
 *
 * @param {Function} persistFn - async (entry) => void
 */
function setStore(persistFn) {
  externalPersist = persistFn;
}

module.exports = {
  logDecision,
  queryLogs,
  getAllLogs,
  clearLogs,
  setStore,
  createAuditEntry,
};

