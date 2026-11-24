# CAMPUSVAULT – Programming Language & Source Code Metrics Analysis

> **Audit Date:** November 25, 2026  
> **Tool Used:** Custom AST & Token-Aware Static Source Inspector (`scratch/count_loc.py`)  
> **Counting Methodology:**  
> - **Source Lines of Code (SLOC / Code):** Non-empty lines containing executable statements, declarations, or markup.
> - **Comment Lines:** Standalone or multi-line block comments (`//`, `/* ... */`, `#`, `--`, `<!-- ... -->`).
> - **Blank Lines:** Empty lines or lines containing only whitespace characters.
> - **Exclusions:** `node_modules/`, `.next/`, `uploads/`, `.git/`, build artifacts (`*.tsbuildinfo`, `next-env.d.ts`), and package lockfiles (`package-lock.json`).

---

## 1. Programming Languages Breakdown (Executable Code)

The following table reflects the actual programming and markup languages implementing CampusVault:

| Language | File Count | Code Lines (SLOC) | Comment Lines | Blank Lines | Total Lines | Code Percentage |
|---|---:|---:|---:|---:|---:|---:|
| **TypeScript** (`.ts`, `.tsx`) | 69 | 15,216 | 834 | 1,432 | 17,482 | **90.73 %** |
| **JavaScript** (`.js`, `.mjs`) | 20 | 1,137 | 463 | 228 | 1,828 | **6.78 %** |
| **SQL** (`.sql`) | 1 | 278 | 59 | 59 | 396 | **1.66 %** |
| **CSS** (`.css`) | 1 | 140 | 8 | 32 | 180 | **0.83 %** |
| **Subtotal (Pure Programming & Styles)** | **91** | **16,771** | **1,364** | **1,751** | **19,886** | **100.00 %** |

---

## 2. Complete Repository Code & Configuration Inventory

When including data definition schemas, configuration files, and documentation, the complete breakdown is as follows:

| Category / Language | Extension | Files | Code Lines | Comments | Blanks | Total Lines | Total Size |
|---|---|---:|---:|---:|---:|---:|---:|
| **TypeScript** | `.ts`, `.tsx` | 69 | 15,216 | 834 | 1,432 | 17,482 | 644,509 B |
| **JavaScript** | `.js`, `.mjs` | 20 | 1,137 | 463 | 228 | 1,828 | 67,123 B |
| **Markdown** | `.md` | 4 | 588 | 0 | 170 | 758 | 27,208 B |
| **SQL** | `.sql` | 1 | 278 | 59 | 59 | 396 | 18,139 B |
| **Prisma Schema** | `.prisma` | 1 | 190 | 0 | 34 | 224 | 7,566 B |
| **CSS** | `.css` | 1 | 140 | 8 | 32 | 180 | 5,536 B |
| **JSON** (Configs) | `.json` | 3 | 106 | 0 | 1 | 107 | 3,462 B |
| **GRAND TOTAL** | — | **99** | **17,655** | **1,364** | **1,956** | **20,975** | **773,543 B (~755 KB)** |

---

## 3. Detailed Distribution by Architectural Layer

### 3.1 Frontend (`src/app/`, `src/components/`, `src/lib/i18n/`)
- **Files:** 22 TypeScript / TSX files
- **Total Code Lines:** ~5,620 SLOC
- **Key Modules:**
  - `src/app/dashboard/ai-assistant/page.tsx`: ~1,050 lines (Vault AI conversational interface & attachment picker)
  - `src/app/dashboard/documents/page.tsx`: ~750 lines (Document vault management)
  - `src/components/VaultSentinelCursor.tsx`: ~370 lines (Hardware-accelerated custom cursor)
  - `src/app/dashboard/page.tsx`: ~406 lines (Role-adaptive dashboard)
  - `src/lib/i18n/translations.ts`: ~330 lines (Multilingual translation dictionaries)

### 3.2 Backend API Handlers (`src/app/api/`)
- **Files:** 24 TypeScript files
- **Total Code Lines:** ~3,180 SLOC
- **Key Modules:**
  - `src/app/api/ai/chat/route.ts`: ~260 lines (Gemini 2.5 streaming, context synthesis, fallback engine)
  - `src/app/api/documents/route.ts`: ~190 lines (Multipart upload & envelope encryption)
  - `src/app/api/documents/[id]/download/route.ts`: ~170 lines (Zero-Trust authorization & streaming decryption)
  - `src/app/api/messages/route.ts`: ~180 lines (Direct messaging & Zero-Trust transfer dispatch)

### 3.3 Core Shared Libraries (`src/lib/`)
- **Files:** 11 TypeScript files
- **Total Code Lines:** ~2,140 SLOC
- **Key Modules:**
  - `src/lib/crypto.ts`: ~220 lines (AES-256-GCM binary envelope encryption & decryption)
  - `src/lib/auth.ts`: ~180 lines (Argon2id hashing, legacy bcrypt verification, JWT session tokens)
  - `src/lib/ai/gemini.ts`: ~210 lines (Google Gemini SDK integration, error handling, prompt guardrails)
  - `src/lib/security/authorization.ts`: ~140 lines (Zero-trust bridge to security engine)

### 3.4 Security Engine Micro-Service (`security-engine/`)
- **Files:** 20 JavaScript files (ESM / CommonJS)
- **Total Code Lines:** ~1,137 SLOC (plus 463 lines of detailed security documentation comments)
- **Key Modules:**
  - `security-engine/src/authorization/authorizeDocumentAccess.js`: Core Zero-Trust evaluation pipeline
  - `security-engine/src/rbac/rbacEngine.js`: Role matrix validation
  - `security-engine/src/abac/abacEngine.js`: Attribute and temporal grant verification
  - `security-engine/src/audit/auditLogger.js`: Security audit record formatting

### 3.5 Automated Test Suites (`tests/`, `security-engine/tests/`)
- **Files:** 14 test files (TypeScript & JavaScript)
- **Total Code Lines:** ~4,260 SLOC
- **Key Suites:**
  - `tests/verifyCompleteCampusVaultAudit.ts`: 22-point end-to-end integration suite
  - `tests/verifyAiAssistantPrivacy.ts`: 16-point prompt-injection and tenant privacy suite
  - `tests/verifyCryptoSecurity.ts`: 10-point cryptographic envelope and key verification suite
  - `tests/verifyGeminiIntegration.ts`: 10-point Gemini AI integration suite
  - `security-engine/tests/attack-simulation/`: Immediate revocation attack simulation
