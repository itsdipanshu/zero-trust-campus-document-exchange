# CampusVault – Integration Guide for Team 1

> This document explains how Team Technovertex integrates the
> Zero-Trust Security Engine into their existing backend.

---

## 1. Installation

Copy the `security-engine/` folder into your project, or reference it directly:

```javascript
const security = require('./security-engine/src');
// or destructure:
const {
  authorizeDocumentAccess,
  protectDocument,
  auditLogger,
  DECISION,
  REASON,
  ROLES,
  CLASSIFICATION,
} = require('./security-engine/src');
```

No additional npm dependencies are required at runtime — only `jest` for testing.

---

## 2. Data Shapes Required

The security engine expects objects with these shapes. Your database models
must provide these fields when calling the engine.

### User Object

```javascript
{
  id: 'user-123',              // Unique user ID (string)
  role: 'student',             // 'admin' | 'department_manager' | 'teacher' | 'student'
  department: 'computer_science', // Department name
  status: 'active',            // 'active' | 'suspended' | 'inactive'
}
```

### Document Object

```javascript
{
  id: 'doc-456',               // Unique document ID
  department: 'computer_science', // Owning department
  classification: 'confidential', // 'public' | 'internal' | 'confidential' | 'restricted'
  ownerId: 'user-789',         // Document owner's user ID
}
```

### Grant Object

```javascript
{
  id: 'grant-001',             // Unique grant ID
  userId: 'user-123',          // Grantee user ID
  documentId: 'doc-456',       // Granted document ID
  grantedBy: 'user-admin-001', // Who created this grant
  grantedAt: '2026-11-24T10:00:00Z',
  expiresAt: '2026-11-25T10:00:00Z',
  revoked: false,              // boolean
  revokedAt: null,             // ISO string or null
  revokedBy: null,             // User ID or null
  status: 'active',            // 'active' | 'revoked' | 'expired'
}
```

---

## 3. Using the Core Authorization Function

```javascript
const { authorizeDocumentAccess } = require('./security-engine/src');

// In your route handler:
app.get('/api/documents/:id/download', async (req, res) => {
  // 1. Fetch CURRENT state from YOUR database
  const user = await User.findById(req.user.id);
  const document = await Document.findById(req.params.id);
  const grant = await Grant.findOne({
    userId: req.user.id,
    documentId: req.params.id,
  }).sort({ grantedAt: -1 }); // most recent grant

  // 2. Run the security engine (server-side time!)
  const result = await authorizeDocumentAccess(
    user,
    document,
    grant,
    new Date(),   // ALWAYS use server time
    {
      action: 'download',
      metadata: { ip: req.ip, sessionId: req.sessionID },
    }
  );

  // 3. Enforce the decision
  if (result.decision === 'DENY') {
    return res.status(403).json({
      error: 'Access denied',
      reason: result.reason,
    });
  }

  // 4. Serve the file
  res.sendFile(document.filePath);
});
```

---

## 4. Using the Express Middleware (Recommended)

For less boilerplate, use our drop-in middleware:

```javascript
const { protectDocument } = require('./security-engine/src');

// Provide your database lookup functions:
const securityMiddleware = protectDocument({
  getUser: (userId) => User.findById(userId),
  getDocument: (docId) => Document.findById(docId),
  getGrant: (userId, docId) =>
    Grant.findOne({ userId, documentId: docId, revoked: false })
      .sort({ grantedAt: -1 }),
});

// Apply to protected routes:
app.get('/api/documents/:id/view', securityMiddleware, (req, res) => {
  // req.authorizedDocument is available here
  res.json({ content: req.authorizedDocument });
});

app.get('/api/documents/:id/download', securityMiddleware, (req, res) => {
  res.download(req.authorizedDocument.filePath);
});
```

---

## 5. Response Format

### On ALLOW

The middleware calls `next()` and attaches:
- `req.authorizedUser` – the verified user object
- `req.authorizedDocument` – the verified document object
- `req.authorizationResult` – `{ decision, reason, auditEntry }`

### On DENY → HTTP 403

```json
{
  "error": "Access denied",
  "decision": "DENY",
  "reason": "GRANT_REVOKED"
}
```

### Possible Reason Codes

| Code                        | Meaning                                      |
| --------------------------- | -------------------------------------------- |
| `ACCESS_GRANTED`            | Access allowed (generic)                     |
| `ACCESS_GRANTED_BY_ROLE`    | Role alone provides sufficient access        |
| `ACCESS_GRANTED_BY_GRANT`   | Access allowed through a valid grant         |
| `USER_NOT_FOUND`            | User does not exist                          |
| `USER_SUSPENDED`            | User account is suspended                    |
| `USER_INACTIVE`             | User account is inactive                     |
| `DOCUMENT_NOT_FOUND`        | Document does not exist                      |
| `DEPARTMENT_MISMATCH`       | User's department ≠ document's department    |
| `CLASSIFICATION_NOT_ALLOWED`| User's role cannot access this classification|
| `GRANT_REVOKED`             | Grant was explicitly revoked by admin        |
| `GRANT_EXPIRED`             | Grant has passed its expiry time             |
| `NO_VALID_GRANT`            | No matching active grant found               |
| `INVALID_REQUEST`           | Malformed request (missing role, etc.)       |

---

## 6. Implementing Immediate Revocation

When an admin revokes access via your UI:

```javascript
// In your revoke-access API handler:
app.post('/api/grants/:grantId/revoke', adminOnly, async (req, res) => {
  await Grant.findByIdAndUpdate(req.params.grantId, {
    revoked: true,
    revokedAt: new Date(),
    revokedBy: req.user.id,
    status: 'revoked',
  });

  res.json({ message: 'Access revoked' });
  // No need to invalidate sessions —
  // the security engine re-checks on EVERY request!
});
```

The security engine verifies grant status on **every single request**.
Previously granted access stops working **immediately** because:
- Old document links → re-checked → DENIED (GRANT_REVOKED)
- Existing sessions → re-checked → DENIED (GRANT_REVOKED)
- Direct API calls → re-checked → DENIED (GRANT_REVOKED)

---

## 7. Audit Logging

Audit entries are automatically created for every authorization decision.

```javascript
const { auditLogger } = require('./security-engine/src');

// Route audit entries to your database:
auditLogger.setStore(async (entry) => {
  await AuditLog.create(entry);
});

// Query logs:
const denials = auditLogger.queryLogs({ userId: 'user-123', decision: 'DENY' });
```

### Audit Entry Format

```javascript
{
  userId: 'user-123',
  documentId: 'doc-456',
  action: 'download',
  decision: 'DENY',
  reason: 'GRANT_REVOKED',
  timestamp: '2026-11-24T10:30:00.000Z',
  metadata: { ip: '10.0.0.50', sessionId: 'sess-abc' }
}
```

> ⚠️ **Security**: The logger automatically strips passwords, tokens, file content,
> and other sensitive data from metadata. Document contents are NEVER logged.

---

## 8. Role Hierarchy

| Role               | Hierarchy Level | Default Access                              |
| ------------------ | --------------- | ------------------------------------------- |
| Admin              | 100             | public, internal, confidential, restricted  |
| Department Manager | 75              | public, internal, confidential              |
| Teacher            | 50              | public, internal                            |
| Student            | 25              | public only                                 |

For classifications beyond the role's default, a **grant** is required.

---

## 9. Suggested Database Schema

You can use any database. Here is a suggested Mongoose schema for grants:

```javascript
const grantSchema = new mongoose.Schema({
  userId:     { type: String, required: true, index: true },
  documentId: { type: String, required: true, index: true },
  grantedBy:  { type: String, required: true },
  grantedAt:  { type: Date, default: Date.now },
  expiresAt:  { type: Date, required: true },
  revoked:    { type: Boolean, default: false },
  revokedAt:  { type: Date, default: null },
  revokedBy:  { type: String, default: null },
  status:     { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },
});

grantSchema.index({ userId: 1, documentId: 1 });
```

---

## 10. Important Notes

1. **Server-side time**: Always pass `new Date()` from your server. Never trust client-supplied timestamps.
2. **No separate database**: This engine uses YOUR database through the lookup functions you provide.
3. **No frontend**: This is a backend-only security module.
4. **Cannot remotely erase downloads**: Once a user has downloaded a file, we cannot delete their local copy. We can only block future access.

