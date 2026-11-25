# CAMPUSVAULT – Database Architecture & Complete Model Analysis

> **Audit Date:** November 25, 2026  
> **Active Database Engine:** SQLite 3 (Managed via Prisma ORM at `prisma/dev.db`)  
> **Cloud Database Schema:** Supabase PostgreSQL 15+ (Configured at `supabase/schema.sql`)

---

## 1. Active Database Engine Identification

An exhaustive code and connection string audit confirms:
- **Active Engine:** **SQLite**
- **Datasource URL:** Dynamic datasource via `DATABASE_URL` (SQLite for local dev, PostgreSQL for cloud production)
- **Connection Client:** `new PrismaClient()` in `src/lib/db.ts`
- **Cloud Migration Schema:** Complete PostgreSQL schema with Row Level Security (RLS) provided in `supabase/schema.sql` for hybrid or cloud deployments.

---

## 2. Complete Entity-Relationship Model (Prisma)

The active schema defines **11 relational models**:

```
┌──────────────┐          ┌──────────────────────┐          ┌───────────────────┐
│  Department  │◀─────────┤         User         ├─────────▶│    AuditLog       │
└──────┬───────┘          └──────────┬───────────┘          └───────────────────┘
       │                             │
       │                             ├──────────────▶ AiChatSession ──▶ AiChatMessage
       ▼                             │
┌──────────────┐                     ├──────────────▶ SecureMessage ──▶ SecureMessageAttachment
│   Document   │◀────────────────────┤                     │
└──────┬───────┘                     ▼                     ▼
       │                      AccessGrant            Notification
       ▼
 AiAccessRequest
```

---

## 3. Model Specifications

### 3.1 Model: `User`
- **Table Name:** `User`
- **Purpose:** Primary identity entity representing students, faculty, department heads, and campus administrators.
- **Fields:**
  | Field | Type | Attributes | Description |
  |---|---|---|---|
  | `id` | String | `@id @default(uuid())` | Primary key UUID. |
  | `name` | String | Required | Full display name. |
  | `email` | String | `@unique` | Unique institutional email address. |
  | `passwordHash` | String | Required | Argon2id hash (or legacy bcrypt string). |
  | `role` | String | `@default("student")` | Role: `student`, `faculty`, `hod`, `admin`. |
  | `departmentId` | String? | Optional | Foreign key to `Department.id`. |
  | `status` | String | `@default("active")` | Account status: `active`, `suspended`, `inactive`. |
  | `websiteLanguage` | String | `@default("en")` | User interface preference (`en`, `hi`, `hinglish`). |
  | `aiLanguage` | String | `@default("auto")` | Preferred AI response language (`auto`, `en`, `hi`, `hinglish`). |
  | `createdAt` | DateTime | `@default(now())` | Registration timestamp. |
  | `updatedAt` | DateTime | `@updatedAt` | Last profile update timestamp. |
- **Indexes:** `@@index([email])`, `@@index([departmentId])`

### 3.2 Model: `Department`
- **Table Name:** `Department`
- **Purpose:** Academic or administrative campus division enforcing zero-trust department isolation.
- **Fields:**
  | Field | Type | Attributes | Description |
  |---|---|---|---|
  | `id` | String | `@id @default(uuid())` | Primary key UUID. |
  | `name` | String | `@unique` | Unique department name (e.g., Computer Science). |
  | `description` | String? | Optional | Department summary. |
  | `createdAt` | DateTime | `@default(now())` | Creation timestamp. |
  | `updatedAt` | DateTime | `@updatedAt` | Update timestamp. |

### 3.3 Model: `Document`
- **Table Name:** `Document`
- **Purpose:** Metadata records for encrypted campus documents stored at rest.
- **Fields:**
  | Field | Type | Attributes | Description |
  |---|---|---|---|
  | `id` | String | `@id @default(uuid())` | Primary key UUID. |
  | `title` | String | Required | Document title. |
  | `description` | String? | Optional | Document summary. |
  | `departmentId` | String | Required | Foreign key to `Department.id`. |
  | `classification` | String | `@default("internal")` | Security tier: `public`, `internal`, `confidential`, `restricted`. |
  | `discoverability` | String | `@default("DEPARTMENT_DISCOVERABLE")` | AI discovery scope (`DEPARTMENT_DISCOVERABLE`, `PRIVATE`, `RESTRICTED`). |
  | `fileName` | String | Required | Original uploaded filename. |
  | `fileSize` | Int | Required | File size in bytes. |
  | `mimeType` | String | Required | MIME type (e.g. `application/pdf`). |
  | `storageKey` | String | `@unique` | Internal ciphertext filename in `uploads/`. |
  | `uploadedById` | String | Required | Foreign key to `User.id` (uploader). |
  | `createdAt` | DateTime | `@default(now())` | Upload timestamp. |
  | `updatedAt` | DateTime | `@updatedAt` | Update timestamp. |
- **Indexes:** `@@index([departmentId])`, `@@index([uploadedById])`, `@@index([classification])`, `@@index([discoverability])`

### 3.4 Model: `AccessGrant`
- **Table Name:** `AccessGrant`
- **Purpose:** Explicit time-bounded authorization grants issued to specific users.
- **Fields:**
  | Field | Type | Attributes | Description |
  |---|---|---|---|
  | `id` | String | `@id @default(uuid())` | Primary key UUID. |
  | `userId` | String | Required | Beneficiary user foreign key. |
  | `documentId` | String | Required | Target document foreign key. |
  | `status` | String | `@default("active")` | Grant state: `active`, `revoked`, `expired`. |
  | `grantedById` | String | Required | User who provisioned the grant. |
  | `expiresAt` | DateTime? | Optional | Temporal expiration timestamp (ABAC). |
  | `revokedAt` | DateTime? | Optional | Timestamp when explicitly revoked. |
  | `reason` | String? | Optional | Justification for grant provisioning. |
  | `createdAt` | DateTime | `@default(now())` | Provisioning timestamp. |
  | `updatedAt` | DateTime | `@updatedAt` | Update timestamp. |
- **Indexes:** `@@index([userId])`, `@@index([documentId])`, `@@index([status])`

### 3.5 Model: `AuditLog`
- **Table Name:** `AuditLog`
- **Purpose:** Cryptographically clean security compliance audit trail.
- **Fields:**
  | Field | Type | Attributes | Description |
  |---|---|---|---|
  | `id` | String | `@id @default(uuid())` | Primary key UUID. |
  | `userId` | String | Required | Acting user foreign key. |
  | `documentId` | String? | Optional | Associated document foreign key. |
  | `action` | String | Required | Action type (`upload`, `download`, `grant_access`, `revoke_access`, etc.). |
  | `decision` | String? | Optional | Zero-Trust decision (`allowed`, `denied`, `pending`). |
  | `reason` | String? | Optional | Machine reason code (e.g. `GRANT_REVOKED`). |
  | `ipAddress` | String? | Optional | Client IP address. |
  | `userAgent` | String? | Optional | Client User-Agent string. |
  | `metadata` | String? | Optional | JSON string for extra audit metadata. |
  | `timestamp` | DateTime | `@default(now())` | Event timestamp. |
- **Indexes:** `@@index([userId])`, `@@index([documentId])`, `@@index([action])`, `@@index([timestamp])`

### 3.6 Models: `AiChatSession` & `AiChatMessage`
- **Purpose:** Multi-turn AI conversation persistence isolated by user identity.
- **Session Fields:** `id`, `userId`, `title`, `createdAt`, `updatedAt`.
- **Message Fields:** `id`, `sessionId`, `userId`, `messageRole` (`user`, `assistant`, `system`), `messageContent`, `createdAt`.

### 3.7 Models: `SecureMessage`, `SecureMessageAttachment` & `Notification`
- **Purpose:** In-vault zero-trust messaging, document dispatching, and recipient alerts.
- **SecureMessage:** `id`, `senderId`, `recipientId`, `messageType`, `subject`, `messageContent`, `status` (`PENDING_CONFIRMATION`, `SENT`, `DELIVERED`, `READ`), `createdAt`, `readAt`.
- **SecureMessageAttachment:** `id`, `messageId`, `documentId`, `createdAt`.
- **Notification:** `id`, `userId`, `type`, `title`, `message`, `relatedMessageId`, `isRead`, `createdAt`.

---

## 4. Supabase PostgreSQL Schema & RLS Policies

The cloud schema in `supabase/schema.sql` defines PostgreSQL equivalents with **Row Level Security (RLS)** enabled across all tables:
- `departments`: Authenticated users can SELECT; only Admin/HOD can INSERT/UPDATE/DELETE.
- `profiles`: Users can read own profile; Admin/HOD can manage all profiles.
- `documents`: Users can view public documents and own department documents; sensitive classifications require active grants.
- `access_grants`: Users view their own grants; Admin/HOD manage grants.
- `audit_logs`: Strictly restricted to Admin/HOD review.
