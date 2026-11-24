/**
 * CampusVault Security Engine – Public API
 * ═══════════════════════════════════════════
 *
 * Team 1 imports this module:
 *
 *   const security = require('./security-engine');
 *   // or
 *   const { authorizeDocumentAccess, protectDocument, auditLogger } = require('./security-engine');
 */

const { authorizeDocumentAccess } = require('./authorization/authorizeDocumentAccess');
const { protectDocument } = require('./middleware/securityMiddleware');
const auditLogger = require('./audit/auditLogger');
const rbacEngine = require('./rbac/rbacEngine');
const abacEngine = require('./abac/abacEngine');
const constants = require('./constants');
const timeUtils = require('./utils/timeUtils');

module.exports = {
  // ─── Core Authorization ───────────────────────────────
  authorizeDocumentAccess,

  // ─── Express Middleware ───────────────────────────────
  protectDocument,

  // ─── Audit Logging ────────────────────────────────────
  auditLogger,

  // ─── Sub-Engines (for advanced usage) ─────────────────
  rbacEngine,
  abacEngine,

  // ─── Constants & Enums ────────────────────────────────
  ...constants,

  // ─── Utilities ────────────────────────────────────────
  timeUtils,
};

