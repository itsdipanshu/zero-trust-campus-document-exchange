/**
 * CampusVault – Express Middleware for Zero-Trust Document Protection
 *
 * Drop-in middleware for Team 1's Express routes.
 * Intercepts every protected document request and runs the authorization engine.
 *
 * Usage in Team 1's backend:
 *
 *   const { protectDocument } = require('campusvault-security-engine');
 *
 *   // Option A – middleware on individual routes
 *   app.get('/api/documents/:id/download', protectDocument(lookupFns), (req, res) => {
 *     res.sendFile(req.authorizedDocument.filePath);
 *   });
 *
 *   // Option B – use authorizeDocumentAccess directly in a controller
 */

const { authorizeDocumentAccess } = require('../authorization/authorizeDocumentAccess');
const { DECISION } = require('../constants/decisions');

/**
 * Create the middleware.
 *
 * @param {Object} lookupFns – Callback functions Team 1 provides to fetch data from THEIR database.
 * @param {Function} lookupFns.getUser        - async (userId) => User | null
 * @param {Function} lookupFns.getDocument    - async (documentId) => Document | null
 * @param {Function} lookupFns.getGrant       - async (userId, documentId) => Grant | null
 * @param {Function} [lookupFns.getUserId]    - (req) => string   (default: req.user.id)
 * @param {Function} [lookupFns.getDocumentId]- (req) => string   (default: req.params.id)
 * @returns {Function} Express middleware
 */
function protectDocument(lookupFns) {
  const {
    getUser,
    getDocument,
    getGrant,
    getUserId = (req) => req.user && req.user.id,
    getDocumentId = (req) => req.params.id,
  } = lookupFns;

  return async (req, res, next) => {
    try {
      const currentTime = new Date(); // Server-side time — never trust client clocks

      // ─── Resolve IDs ────────────────────────────────
      const userId = getUserId(req);
      const documentId = getDocumentId(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          decision: DECISION.DENY,
          reason: 'USER_NOT_FOUND',
        });
      }

      // ─── Fetch CURRENT state from Team 1's database ──
      const [user, document, grant] = await Promise.all([
        getUser(userId),
        getDocument(documentId),
        getGrant(userId, documentId),
      ]);

      // ─── Run authorization engine ────────────────────
      const result = await authorizeDocumentAccess(user, document, grant, currentTime, {
        action: req.method === 'GET' ? 'view' : 'download',
        metadata: {
          ip: req.ip,
          sessionId: req.sessionID,
          userAgent: req.get('User-Agent'),
          path: req.originalUrl,
        },
      });

      if (result.decision === DECISION.DENY) {
        return res.status(403).json({
          error: 'Access denied',
          decision: result.decision,
          reason: result.reason,
        });
      }

      // Attach authorized objects so the route handler can use them
      req.authorizedUser = user;
      req.authorizedDocument = document;
      req.authorizationResult = result;

      next();
    } catch (err) {
      console.error('[SecurityMiddleware] Error:', err);
      return res.status(500).json({
        error: 'Internal security error',
        decision: DECISION.DENY,
        reason: 'INTERNAL_ERROR',
      });
    }
  };
}

module.exports = { protectDocument };

