/**
 * CampusVault – Data Shape Definitions
 *
 * These are NOT database models — Team 1 owns the database.
 * These describe the SHAPE of objects our engine expects to receive
 * so Team 1 knows exactly what to pass in.
 *
 * Compatible with both MongoDB (Mongoose) and SQL (Sequelize / Knex).
 */

/**
 * User object expected by the security engine.
 *
 * @typedef {Object} User
 * @property {string}  id          - Unique user identifier
 * @property {string}  role        - One of ROLES (admin | department_manager | teacher | student)
 * @property {string}  department  - Department the user belongs to (e.g. "computer_science")
 * @property {string}  status      - "active" | "suspended" | "inactive"
 * @property {string}  [email]     - Optional, for audit context
 */

/**
 * Document object expected by the security engine.
 *
 * @typedef {Object} Document
 * @property {string}  id              - Unique document identifier
 * @property {string}  department      - Owning department
 * @property {string}  classification  - One of CLASSIFICATION (public | internal | confidential | restricted)
 * @property {string}  ownerId         - User ID of the document owner
 * @property {string}  [title]         - Optional, for audit context (never logged in full)
 */

/**
 * Access grant object expected by the security engine.
 *
 * @typedef {Object} Grant
 * @property {string}         id          - Unique grant identifier
 * @property {string}         userId      - Grantee user ID
 * @property {string}         documentId  - Document being granted
 * @property {string}         grantedBy   - Admin / manager who issued the grant
 * @property {Date|string}    grantedAt   - When the grant was created
 * @property {Date|string}    expiresAt   - When the grant expires
 * @property {boolean}        revoked     - Whether the grant has been revoked
 * @property {Date|string|null} revokedAt - When it was revoked (null if not revoked)
 * @property {string}         [revokedBy] - Who revoked it
 * @property {string}         status      - "active" | "revoked" | "expired"
 */

/**
 * Audit log entry produced by the security engine.
 *
 * @typedef {Object} AuditEntry
 * @property {string}  userId      - Who made the request
 * @property {string}  documentId  - Which document was requested
 * @property {string}  action      - e.g. "view", "download"
 * @property {string}  decision    - "ALLOW" | "DENY"
 * @property {string}  reason      - One of REASON codes
 * @property {string}  timestamp   - ISO-8601 string
 * @property {Object}  [metadata]  - Extra context (IP, session ID – never passwords or file content)
 */

module.exports = {
  // No runtime exports needed; this file is documentation + JSDoc types.
  // Team 1 can use these typedefs for validation.
};

