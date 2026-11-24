# CAMPUSVAULT – Complete Technology Stack Audit

> **Audit Date:** November 25, 2026  
> **Source Verification:** Evaluated against `package.json`, `package-lock.json`, and static import analysis across all project files.

---

## 1. Architectural Technology Overview

CampusVault is constructed as a modern, decoupled monolithic web application leveraging the **Next.js 14 App Router** paradigm, combining server-side rendering, client components, API route handlers, and a specialized standalone security micro-engine.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CAMPUSVAULT CLIENT UI                           │
│  Next.js 14 · React 18 · Tailwind CSS · Lucide Icons · Vault Sentinel  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON / FormData
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS BACKEND ENGINE                          │
│  API Route Handlers · JWT Authentication · Argon2id · Zero-Trust Hook  │
└─────────────┬─────────────────────┬─────────────────────┬──────────────┘
              │                     │                     │
              ▼                     ▼                     ▼
┌───────────────────────┐ ┌───────────────────┐ ┌────────────────────────┐
│    SECURITY ENGINE    │ │  GOOGLE GEMINI AI │ │  DOCUMENT STORAGE      │
│  Team 2 Standalone    │ │  gemini-2.5-flash │ │  AES-256-GCM Envelopes │
│  RBAC · ABAC · Audit  │ │  @google/generative-ai │  Private Disk Storage │
└─────────────┬─────────┘ └───────────────────┘ └────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         PERSISTENCE LAYER                              │
│  Prisma ORM 5.15.0 · SQLite Local Engine (Supabase Postgres Configured)│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Technology Inventory

### 2.1 Frontend Technologies

| Technology | Declared Version | Actual Runtime | Status | Purpose & Where Used |
|---|---|---|:---:|---|
| **Next.js** | `^14.2.0` | `14.2.35` | **Active** | Core React framework. Handles App Router (`src/app`), server-side metadata, routing, client hydration. |
| **React** | `^18.3.0` | `18.3.1` | **Active** | UI component rendering, hooks (`useState`, `useEffect`, `useCallback`, `useRef`). |
| **React DOM** | `^18.3.0` | `18.3.1` | **Active** | DOM reconciliation and rendering. |
| **Tailwind CSS** | `^3.4.4` | `3.4.4` | **Active** | Utility-first styling configured in `tailwind.config.ts` with custom Forest & Ivory theme tokens. |
| **PostCSS** | `^8.4.38` | `8.4.38` | **Active** | CSS transformations and autoprefixer pipeline (`postcss.config.mjs`). |
| **Autoprefixer** | `^10.4.19` | `10.4.19` | **Active** | Vendor prefixing for cross-browser CSS compatibility. |
| **Lucide React** | `^0.400.0` | `0.400.0` | **Active** | Icon library used across 13 pages (`Shield`, `Lock`, `FileText`, `Users`, `Bot`, `Sparkles`, etc.). |
| **DM Sans** | Google Fonts | Web Font | **Active** | Primary editorial typography loaded in `src/app/globals.css`. |
| **Vault Sentinel Cursor** | Custom TS/CSS | Custom | **Active** | Native-feeling cursor system with lerp physics, document shield SVG, and AI cyber trail. |
| **clsx** | `^2.1.1` | `2.1.1` | *Installed (Inactive)* | Utility for conditionally joining class names. Native template strings used instead. |

### 2.2 Backend & API Technologies

| Technology | Declared Version | Actual Runtime | Status | Purpose & Where Used |
|---|---|---|:---:|---|
| **Node.js** | `>=18` | `v24.19.0` | **Active** | Server runtime environment executing Next.js server processes and background tasks. |
| **Next.js Route Handlers** | `14.2.35` | `14.2.35` | **Active** | Backend HTTP API handlers implementing GET, POST, PATCH, DELETE across 24 endpoints. |
| **Next.js Middleware** | `14.2.35` | `14.2.35` | **Active** | Edge request interception in `src/middleware.ts` for session cookie validation. |
| **FormData API** | Native Web API | Native | **Active** | Standard web `request.formData()` used in `api/documents/route.ts` for multipart file uploads. |
| **multer** | `^1.4.5-lts.1` | `1.4.5-lts.1` | *Installed (Inactive)* | Multipart middleware. Not used because Next.js App Router natively supports web `FormData`. |

### 2.3 Authentication & Cryptography

| Technology | Declared Version | Actual Runtime | Status | Purpose & Where Used |
|---|---|---|:---:|---|
| **Argon2** (`argon2`) | `^0.45.2` | `0.45.2` | **Active** | State-of-the-art password hashing using Argon2id with 64MB memory cost and 3 iterations (`src/lib/auth.ts`). |
| **BcryptJS** (`bcryptjs`) | `^2.4.3` | `2.4.3` | **Active** | Legacy password verification and seed generation (`prisma/seed.ts`, `src/lib/auth.ts`). |
| **JSON Web Token** (`jsonwebtoken`) | `^9.0.2` | `9.0.2` | **Active** | HS256 stateless session token creation and verification (`src/lib/auth.ts`). |
| **Node Crypto** | Native `node:crypto` | Native | **Active** | AES-256-GCM cipher/decipher, IV generation (12 bytes), SHA-256 integrity hashing, constant-time compare (`src/lib/crypto.ts`). |
| **UUID** (`uuid`) | `^9.0.1` | `9.0.1` | *Installed (Inactive)* | Declared in package.json; native `crypto.randomUUID()` is used throughout `src/lib/crypto.ts`. |

### 2.4 Database & Storage Technologies

| Technology | Declared Version | Actual Runtime | Status | Purpose & Where Used |
|---|---|---|:---:|---|
| **Prisma ORM** | `^5.15.0` | `5.15.0` | **Active** | Type-safe database query builder and schema management (`prisma/schema.prisma`). |
| **@prisma/client** | `^5.15.0` | `5.15.0` | **Active** | Generated client singleton in `src/lib/db.ts` interfacing with SQLite. |
| **SQLite Engine** | SQLite 3 | Embedded | **Active** | Current primary active database storing users, departments, documents, grants, messages, sessions, logs (`prisma/dev.db`). |
| **Supabase Client** (`@supabase/supabase-js`) | `^2.119.2` | `2.119.2` | **Configured** | Supabase SDK configured in `src/lib/supabase.ts` for production PostgreSQL sync. |
| **Supabase PostgreSQL** | Postgres 15+ | SQL Script | **Configured** | Complete production schema with 6 RLS policies provided in `supabase/schema.sql`. |
| **Encrypted Disk Storage** | Node Filesystem | Local FS | **Active** | Zero-trust encrypted document vault located in `uploads/` (`CVLT_GCM` binary envelopes). |

### 2.5 Artificial Intelligence (AI) Technologies

| Technology | Declared Version | Actual Runtime | Status | Purpose & Where Used |
|---|---|---|:---:|---|
| **@google/generative-ai** | `^0.24.1` | `0.24.1` | **Active** | Google Gemini official SDK used in `src/lib/ai/gemini.ts` for model instantiation and streaming chat. |
| **Google Gemini 2.5 Flash** | Model API | Live Endpoint | **Active** | Primary AI model configured (`gemini-2.5-flash`), with system prompt guardrails and multilingual inference. |
| **@google/genai** | `^3.6.1` | `3.6.1` | *Installed (Inactive)* | Alternative new Google GenAI SDK; `@google/generative-ai` is the currently wired active client. |

### 2.6 Security & Testing Technologies

| Technology | Declared Version | Actual Runtime | Status | Purpose & Where Used |
|---|---|---|:---:|---|
| **Security Engine (Team 2)** | Custom Module | Internal | **Active** | Standalone zero-trust policy engine located in `security-engine/src/index.js` (RBAC, ABAC, Audit). |
| **Jest** | `^29.7.0` | `29.7.0` | **Active** | Test runner for security engine test suites in `security-engine/package.json`. |
| **ts-node** | `^10.9.2` | `10.9.2` | **Active** | Direct TypeScript execution engine for test suites, database seeding, and security audits. |
| **TypeScript** | `^5.5.0` | `5.5.0` | **Active** | Static typing and compilation across 69 TypeScript files. |
| **ESLint** | `^8.57.0` | `8.57.0` | **Active** | Code linting configured with `eslint-config-next`. |
