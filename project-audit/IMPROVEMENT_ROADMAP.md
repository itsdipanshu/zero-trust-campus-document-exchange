# CAMPUSVAULT – Prioritized Technical Improvement Roadmap

> **Audit Date:** November 25, 2026  
> **Auditors:** Senior Software Architect & Cybersecurity Auditor  
> **Objective:** Structured, prioritized engineering recommendations to elevate CampusVault from production-ready to enterprise-scale.

---

## 1. Prioritized Roadmap Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: IMMEDIATE / HIGH-PRIORITY (Hardening & Hygiene)               │
│ - Dependency clean-up (remove unused multer, uuid, clsx)               │
│ - Redis-backed Leaky-Bucket Rate Limiting                              │
│ - Multi-Factor Authentication (MFA / TOTP)                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: ARCHITECTURAL EVOLUTION (Scale & Cloud Sync)                  │
│ - Supabase PostgreSQL Cloud Migration                                  │
│ - Private S3 / Cloud Storage with Envelope Key Management Service      │
│ - ClamAV Antivirus Scanner on Document Upload Pipeline                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: ADVANCED INTELLIGENCE & INSTITUTIONAL FEDERATION              │
│ - Multi-Agent Gemini Tool Calling (Auto-Request Grant Workflows)       │
│ - SAML 2.0 / Shibboleth Single Sign-On for Campus LDAP / Active Direct │
│ - Cryptographic Watermarking on Decrypted Document Downloads           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: High-Priority Hardening (Next 30 Days)

### 1.1 Dependency Hygiene
- **Observation:** `package.json` declares `multer`, `uuid`, `clsx`, and `@google/genai`, which are not actively imported in code (native `request.formData()`, `crypto.randomUUID()`, and `@google/generative-ai` are used instead).
- **Recommendation:** Remove unused packages to shrink `node_modules` footprint and eliminate unnecessary supply-chain audit vectors.

### 1.2 Edge Rate Limiting Middleware
- **Observation:** Next.js route handlers currently rely on session verification; rapid brute-force attempts on `POST /api/auth/login` or `POST /api/ai/chat` could strain resources.
- **Recommendation:** Implement IP and user-based sliding-window rate limiting (e.g., using Upstash Redis or memory store) allowing max 5 login attempts per minute and 30 AI chat messages per minute.

### 1.3 Multi-Factor Authentication (MFA / TOTP)
- **Observation:** Admin and HOD roles hold privileged document access across departments.
- **Recommendation:** Add RFC 6238 TOTP (Google Authenticator / Authy) enforcement for Admin and HOD login flows.

---

## 3. Phase 2: Architectural Scaling (60–90 Days)

### 2.1 Supabase PostgreSQL Cloud Sync
- **Observation:** The application is currently running on SQLite (`prisma/dev.db`), which is exceptional for single-server and local development, but does not support concurrent horizontal clustering.
- **Recommendation:** Transition the Prisma datasource provider to PostgreSQL using the prepared `supabase/schema.sql`, unlocking automatic backups, connection pooling (PgBouncer), and multi-region read replicas.

### 2.2 S3-Compatible Object Storage with Envelope Encryption
- **Observation:** Ciphertext envelopes are stored in local disk directory `uploads/`. In containerized ephemeral deployments (Kubernetes / ECS), local disk does not persist across container restarts.
- **Recommendation:** Integrate an S3-compatible backend (AWS S3, Cloudflare R2, or Supabase Storage Private Buckets) while retaining client-side envelope encryption (`CVLT_GCM`) so cloud storage providers never see plaintext files.

### 2.3 Automated Antivirus & Malware Scanning
- **Observation:** Files uploaded by faculty are encrypted immediately upon receipt. If a malicious macro-enabled document is uploaded, it remains encrypted and undetectable at rest.
- **Recommendation:** Stream uploaded files through a ClamAV or VirusTotal API pipeline prior to encryption.

---

## 4. Phase 3: Advanced Intelligence & Governance (90–180 Days)

### 3.1 Dynamic Visual Watermarking
- **Recommendation:** When an authorized user downloads a `confidential` or `restricted` PDF, dynamically embed an invisible or semi-transparent background watermark containing the downloader's email, IP address, and timestamp to deter unauthorized physical redistribution or photography.

### 3.2 Campus Single Sign-On (SSO / SAML 2.0 / OAuth2)
- **Recommendation:** Provide plug-and-play integrations with university identity providers (Microsoft Azure AD, Google Workspace for Education, Shibboleth).

### 3.3 Enhanced Gemini Tool Calling
- **Recommendation:** Expand Gemini function calling so students can say *"Request access for the CS401 exam syllabus from Prof. Sharma"* and the AI automatically submits a formal database record in `AiAccessRequest` and sends an in-app alert to the professor.
