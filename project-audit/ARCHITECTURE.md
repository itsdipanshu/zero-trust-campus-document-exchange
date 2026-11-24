# CAMPUSVAULT – System Architecture & Request Flow Documentation

> **Audit Date:** November 25, 2026  
> **Architecture Pattern:** Decoupled Monolith (Next.js 14 App Router + Standalone Security Engine)

---

## 1. High-Level Architectural Flow

CampusVault separates presentation, business logic, security authorization, AI synthesis, and cryptographic operations into dedicated, modular subsystems:

```
[ Browser Client ]
        │
        │ 1. HTTPS Request + Cookie ('auth-token')
        ▼
[ Next.js Middleware (src/middleware.ts) ]
        │
        │ 2. Extracts JWT & validates expiration
        ▼
[ Next.js Route Handlers (src/app/api/*) ]
        │
        ├──▶ 3A. Standard CRUD ──▶ [ Prisma ORM (src/lib/db.ts) ] ──▶ [ SQLite DB (dev.db) ]
        │
        ├──▶ 3B. Document Access Request ──────────────────────────┐
        │                                                          │
        │                                                          ▼
        │                              [ Zero-Trust Bridge (src/lib/security/authorization.ts) ]
        │                                                          │
        │                                                          ▼
        │                              [ Security Engine (security-engine/src/index.js) ]
        │                                ├── Check 1: User status (active?)
        │                                ├── Check 2: RBAC Matrix (role permits classification?)
        │                                ├── Check 3: Department Isolation (same dept or public?)
        │                                ├── Check 4: ABAC Grant (valid, not expired, not revoked?)
        │                                └── Check 5: Emit Security Decision (ALLOW / DENY)
        │                                                          │
        │ 4. If ALLOW                                              │
        │                                                          ▼
        │ 5. Read Encrypted Envelope ──▶ [ uploads/*.enc ] ──▶ [ AES-256-GCM Decrypt (src/lib/crypto.ts) ]
        │                                                          │
        │ 6. Log Event ────────────────────────────────────────────┼──▶ [ AuditLog Table ]
        │                                                          │
        ▼ 7. Stream Plaintext File to Client                       ▼
[ Authenticated Student / Faculty / Admin Browser ]
```

---

## 2. Frontend Architecture

### 2.1 Initialization & App Shell
- **Root Layout (`src/app/layout.tsx`):**
  - Defines document metadata (title: *"CampusVault | Zero-Trust Campus Document Exchange"*).
  - Injects Google Font `DM Sans`.
  - Wraps children in `<Providers>` (`src/components/providers.tsx`).
- **Providers Component (`src/components/providers.tsx`):**
  - Mounts `<LanguageProvider>` for multilingual UI string localization (`src/lib/i18n/context.tsx`).
  - Mounts `<VaultSentinelCursor>` for hardware-accelerated pointer physics.
- **Routing Engine:**
  - Employs Next.js 14 App Router file-system-based routing.
  - Public routes: `/` (Landing), `/login` (Login), `/register` (Registration).
  - Protected portal: `/dashboard/*` wrapped by `src/app/dashboard/layout.tsx`.

### 2.2 Dashboard Layout & Navigation (`src/app/dashboard/layout.tsx`)
- Fetches authenticated user state via `/api/auth/me`.
- Renders the primary navigation sidebar styled in Deep Forest `#183A35`:
  - **Dashboard:** `/dashboard` (Role-tailored stats overview)
  - **AI Assistant:** `/dashboard/ai-assistant` (Conversational intelligence & messenger)
  - **My Documents:** `/dashboard/documents` (Encrypted document vault)
  - **Access Grants:** `/dashboard/access-grants` (Provisioning & temporal grants)
  - **Users:** `/dashboard/users` (Admin/HOD governance)
  - **Departments:** `/dashboard/departments` (Campus departmental structure)
  - **Audit Logs:** `/dashboard/audit-logs` (Security compliance trail)
  - **Settings:** `/dashboard/settings` (Profile, security keys, password update)

---

## 3. Backend Architecture

### 3.1 Authentication & Session Subsystem (`src/lib/auth.ts`)
- **Password Security:**
  - New passwords hashed using **Argon2id** (`argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 })`).
  - Backward compatibility: supports verification of legacy bcrypt hashes (`$2a$`, `$2b$`) for pre-existing seed users.
- **Session Tokens:**
  - Stateless JSON Web Tokens (JWT) signed with HMAC-SHA256 (`JWT_SECRET`).
  - Payload claims: `{ userId, email, role, departmentId }`.
  - Set as `HttpOnly`, `SameSite=Lax`, `Path=/`, expiring in 24 hours.

### 3.2 Zero-Trust Cryptographic Engine (`src/lib/crypto.ts`)
- **Key Derivation:** Master key derived from `DOCUMENT_ENCRYPTION_KEY` (64-character hexadecimal string = exactly 32 raw bytes for AES-256).
- **Binary Envelope (`CVLT_GCM`):**
  - Bytes 0–7: Magic Header ASCII `"CVLT_GCM"`.
  - Bytes 8–19: Initialization Vector (12 bytes / 96 bits generated cryptographically per file).
  - Bytes 20–35: Authentication Tag (16 bytes / 128 bits output by AES-GCM cipher).
  - Bytes 36–N: Ciphertext payload.
- **Integrity Guarantee:** Any byte altered in ciphertext immediately triggers an authentication tag error and aborts with zero plaintext disclosure.

---

## 4. End-to-End Request Flows

### 4.1 Document Upload Flow
1. User selects file on frontend (PDF, DOCX, TXT, PNG, JPG).
2. Frontend sends `multipart/form-data` to `POST /api/documents`.
3. Backend checks authenticated user role (`student` denied upload).
4. Backend generates unique storage key: `${timestamp}-${randomHex}.enc`.
5. Plaintext file buffer passed to `encryptDocumentEnvelope(buffer, masterKey)`.
6. Encrypted binary buffer written directly to `uploads/${storageKey}`.
7. Document metadata saved to database via Prisma:
   - `classification`: `public` | `internal` | `confidential` | `restricted`
   - `storageKey`: internal filename (never exposed to client)
8. Security Audit record created: `action: "upload"`, `decision: "allowed"`.

### 4.2 Zero-Trust Document Download Flow
1. Client requests `GET /api/documents/[id]/download`.
2. Handler extracts user from `auth-token` cookie.
3. Fetch document and any active grant from Prisma database.
4. Pass parameters to `authorizeDocumentAccess(user, document, grant, context)`.
5. Engine performs 5-stage policy verification:
   - If User is suspended/inactive ➔ `DENY (USER_SUSPENDED)`.
   - If User is student and doc is confidential with no grant ➔ `DENY (NO_VALID_GRANT)`.
   - If Grant is revoked ➔ `DENY (GRANT_REVOKED)`.
   - If Grant is expired (`now > expiresAt`) ➔ `DENY (GRANT_EXPIRED)`.
   - If Department mismatch without public flag or admin override ➔ `DENY (DEPARTMENT_MISMATCH)`.
6. If `DENY`: Emit audit log `decision: "denied"`, return `HTTP 403 Forbidden`.
7. If `ALLOW`:
   - Read encrypted file from `uploads/${document.storageKey}`.
   - Decrypt payload using `decryptDocumentEnvelope()`.
   - Emit audit log `decision: "allowed"`.
   - Stream decrypted buffer with `Content-Type` and `Content-Disposition`.
