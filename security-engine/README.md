# CampusVault – Zero-Trust Security Engine

## Team 2: Security System Development

| Member   | Role                       |
| -------- | -------------------------- |
| Dipanshu | Security Logic Developer   |
| Abdul    | Security Testing Developer |

---

## Quick Start

```bash
cd security-engine
npm install
npm test
```

---

## Architecture Overview

```
security-engine/
├── src/
│   ├── index.js                          # Public API – import this
│   ├── constants/
│   │   ├── roles.js                      # RBAC role definitions
│   │   ├── classifications.js            # Document classification levels
│   │   ├── decisions.js                  # Decision & reason codes
│   │   └── index.js
│   ├── models/
│   │   └── schemas.js                    # Data shape docs (JSDoc typedefs)
│   ├── rbac/
│   │   └── rbacEngine.js                 # Role-Based Access Control
│   ├── abac/
│   │   └── abacEngine.js                 # Attribute-Based Access Control
│   ├── authorization/
│   │   └── authorizeDocumentAccess.js    # Core authorization engine
│   ├── audit/
│   │   └── auditLogger.js               # Audit logging system
│   ├── middleware/
│   │   └── securityMiddleware.js         # Express middleware for Team 1
│   └── utils/
│       └── timeUtils.js                  # Server-side time utilities
├── tests/
│   ├── fixtures.js                       # Synthetic test data
│   ├── unit/
│   │   ├── rbac.test.js                  # RBAC unit tests
│   │   ├── abac.test.js                  # ABAC unit tests
│   │   └── auditLogger.test.js           # Audit logger tests
│   ├── integration/
│   │   └── authorization.test.js         # 10 required test cases
│   └── attack-simulation/
│       └── attackSimulation.test.js       # 6-step attack scenario
└── docs/
    └── INTEGRATION_GUIDE.md              # How Team 1 integrates
```

---

## Core Function

```javascript
const { authorizeDocumentAccess } = require('./security-engine/src');

const result = await authorizeDocumentAccess(user, document, grant, currentTime);
// Returns: { decision: 'ALLOW' | 'DENY', reason: '...', auditEntry: { ... } }
```

## Zero-Trust Principle

**NEVER TRUST, ALWAYS VERIFY.**

Every single protected document request runs through the full authorization pipeline at request time:

1. Input validation
2. User status check (suspended/inactive → immediate deny)
3. Department restriction check
4. Role-based classification check (RBAC)
5. Grant validity, revocation & expiry check (ABAC)
6. Automatic audit logging

