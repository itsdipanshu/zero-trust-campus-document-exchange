# CAMPUSVAULT – Complete API Endpoint Documentation

> **Audit Date:** November 25, 2026  
> **Total Endpoints:** 24 Routes  
> **Base Protocol:** HTTP/1.1 & HTTP/2 over TLS  
> **Session Mechanism:** Secure HTTP-only Cookie (`auth-token`)

---

## 1. Authentication & Identity APIs

### 1.1 `POST /api/auth/register`
- **Purpose:** Register new student, faculty, or staff account.
- **Auth Required:** No.
- **Request Body (JSON):**
  ```json
  { "name": "Jane Doe", "email": "jane@campusvault.edu", "password": "...", "departmentId": "uuid" }
  ```
- **Validation:** Enforces valid email, minimum 6-character password, existing department. Roles default strictly to `student`.
- **Response:** `201 Created` with user profile (password hash omitted).

### 1.2 `POST /api/auth/login`
- **Purpose:** Authenticate user and issue JWT session cookie.
- **Auth Required:** No.
- **Request Body (JSON):** `{ "email": "...", "password": "..." }`
- **Security Logic:** Verifies password against Argon2id hash (or legacy bcrypt). Emits audit log entry.
- **Response:** `200 OK` + `Set-Cookie: auth-token=...; HttpOnly; SameSite=Lax`.

### 1.3 `POST /api/auth/logout`
- **Purpose:** Invalidate session and clear auth cookie.
- **Auth Required:** Yes.
- **Response:** `200 OK` + `Set-Cookie: auth-token=; Max-Age=0`.

### 1.4 `GET /api/auth/me`
- **Purpose:** Retrieve currently authenticated user profile and permissions.
- **Auth Required:** Yes.
- **Response:** `200 OK` with `{ user: { id, name, email, role, departmentId, ... } }`.

---

## 2. Document Vault & Storage APIs

### 2.1 `GET /api/documents`
- **Purpose:** List documents filtered by user role and department permissions.
- **Auth Required:** Yes.
- **Query Params:** `?page=1&limit=10&search=...&classification=...&departmentId=...`
- **Security Scope:** Students only see authorized or discoverable materials; Admins see all campus documents.

### 2.2 `POST /api/documents`
- **Purpose:** Upload and encrypt new campus document.
- **Auth Required:** Yes (Faculty, HOD, Admin only).
- **Request Format:** `multipart/form-data` with `file`, `title`, `description`, `departmentId`, `classification`.
- **Security Logic:** Encrypts file buffer with master AES-256-GCM key and writes binary `CVLT_GCM` envelope to disk.
- **Response:** `201 Created` with document metadata.

### 2.3 `GET /api/documents/[id]`
- **Purpose:** Retrieve metadata for a specific document.
- **Auth Required:** Yes.
- **Response:** `200 OK` with document details and access grant count.

### 2.4 `DELETE /api/documents/[id]`
- **Purpose:** Remove document record and delete encrypted envelope from disk.
- **Auth Required:** Yes (Admin, or Faculty owner).
- **Response:** `200 OK`.

### 2.5 `GET /api/documents/[id]/download`
- **Purpose:** Securely decrypt and stream document file.
- **Auth Required:** Yes.
- **Security Pipeline:** Calls `authorizeDocumentAccess()`. Checks user status, RBAC role, department isolation, grant status, and expiration.
- **Decryption:** Reads `CVLT_GCM` binary envelope from disk, verifies 128-bit MAC tag, streams plaintext buffer.
- **Response:** Binary stream with `Content-Type` and `Content-Disposition: attachment; filename="..."`.

### 2.6 `POST /api/documents/attach`
- **Purpose:** AI chat document attachment endpoint.
- **Auth Required:** Yes.
- **Request Format:** `multipart/form-data` with `file`, `title`, `departmentId`, `classification`.
- **Response:** `201 Created` with document attachment metadata.

---

## 3. Access Grant & Revocation APIs

### 3.1 `GET /api/access-grants`
- **Purpose:** Query access grants.
- **Auth Required:** Yes.
- **Security Scope:** Students view own grants; Faculty/Admin view department/system grants.

### 3.2 `POST /api/access-grants`
- **Purpose:** Provision new temporal access grant.
- **Auth Required:** Yes (Admin, HOD only).
- **Request Body (JSON):**
  ```json
  { "userId": "uuid", "documentId": "uuid", "expiresAt": "2026-12-31T23:59:59Z", "reason": "Exam preparation" }
  ```
- **Response:** `201 Created`.

### 3.3 `PATCH /api/access-grants/[id]`
- **Purpose:** Immediately revoke or update access grant.
- **Auth Required:** Yes (Admin, HOD only).
- **Request Body (JSON):** `{ "status": "revoked", "reason": "Revoked by HOD" }`
- **Response:** `200 OK`.

---

## 4. Vault AI Assistant APIs

### 4.1 `POST /api/ai/chat`
- **Purpose:** Submit multi-turn message to Vault AI Assistant.
- **Auth Required:** Yes.
- **Request Body (JSON):**
  ```json
  { "message": "Can you check my access?", "sessionId": "uuid", "language": "auto", "attachmentId": "uuid" }
  ```
- **Security Logic:** Synthesizes user permissions, accessible documents, and pending grants into Gemini system instructions. Preserves tenant boundaries.
- **Response:** `200 OK` with AI response text and tool action cards (e.g., Transfer Confirmation).

### 4.2 `GET /api/ai/sessions` & `POST /api/ai/sessions`
- **Purpose:** List user's past conversation sessions or create a new session.
- **Auth Required:** Yes (Tenant-isolated).

### 4.3 `DELETE /api/ai/sessions` & `PATCH /api/ai/sessions`
- **Purpose:** Rename or clear AI conversation history.
- **Auth Required:** Yes.

### 4.4 `GET /api/ai/gemini-status`
- **Purpose:** Report Gemini API availability, active model name, and engine latency.
- **Auth Required:** Yes.

### 4.5 `GET/POST/PATCH /api/ai/access-requests`
- **Purpose:** Student AI workflow to request document access from HOD/Admin.

---

## 5. Secure Messaging & Notifications APIs

### 5.1 `GET /api/messages` & `POST /api/messages`
- **Purpose:** Query user inbox or transmit a Zero-Trust message with optional document attachment.
- **Auth Required:** Yes.

### 5.2 `GET /api/messages/[id]`
- **Purpose:** Retrieve specific message details and verify recipient authorization.

### 5.3 `GET /api/messages/[id]/attachment/[attachmentId]/download`
- **Purpose:** Download document attached to a secure message after recipient access verification.

### 5.4 `GET /api/notifications` & `PATCH /api/notifications`
- **Purpose:** List real-time in-app alerts and mark notifications as read.

---

## 6. Campus Management APIs

### 6.1 `GET /api/departments` & `POST /api/departments`
- **Purpose:** Query campus departments or create new department (Admin).

### 6.2 `GET/PATCH/DELETE /api/departments/[id]`
- **Purpose:** Manage specific department.

### 6.3 `GET /api/users` & `GET/PATCH /api/users/[id]`
- **Purpose:** User management, role elevation, and account suspension (`active` / `suspended`).

### 6.4 `GET /api/audit-logs`
- **Purpose:** Query security compliance audit records with filters for `action`, `decision`, and dates.

### 6.5 `GET /api/dashboard/stats`
- **Purpose:** Aggregated metrics tailored to current user's role.
