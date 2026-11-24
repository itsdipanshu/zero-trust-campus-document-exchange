# CAMPUSVAULT – Deployment & Environment Operations Guide

> **Audit Date:** November 25, 2026  
> **Target Environments:** Local Development (SQLite) & Cloud Production (Supabase PostgreSQL / Vercel / Docker)

---

## 1. Environment Variables Configuration

CampusVault requires four core server-side environment variables defined in `.env` (and documented with placeholders in `.env.example`):

| Variable Name | Required | Example Format | Purpose |
|---|:---:|---|---|
| `DATABASE_URL` | **Yes** | `file:./dev.db` | Datasource connection string for Prisma ORM. |
| `JWT_SECRET` | **Yes** | 64+ character random string | Secret key used to sign and verify HMAC-SHA256 session tokens. |
| `DOCUMENT_ENCRYPTION_KEY` | **Yes** | 64-character hexadecimal string | 256-bit AES-GCM master key used for document envelope encryption at rest. |
| `GEMINI_API_KEY` | **Yes** | `AIzaSy...` | Google Cloud Gemini API key for Vault AI Assistant intelligence. |
| `NEXT_PUBLIC_SUPABASE_URL` | *Optional* | `https://xyz.supabase.co` | Supabase Cloud API URL for production deployment. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Optional* | `eyJhbG...` | Supabase public anonymous client key. |
| `SUPABASE_SERVICE_ROLE_KEY` | *Optional* | `eyJhbG...` | Supabase server-side service role key for administrative tasks. |

> **IMPORTANT:** In production mode (`NODE_ENV=production`), the application strictly blocks default fallback development secrets and halts with a descriptive error if any required secret is missing or insecure.

---

## 2. Local Development Setup

### 2.1 Prerequisites
- **Node.js:** v18.0.0 or higher (v20+ recommended; verified on v24.19.0).
- **npm:** v9.0.0 or higher.
- **Git:** Standard git client.

### 2.2 Quick Start Commands
```bash
# 1. Clone repository
git clone https://github.com/itsdipanshu/zero-trust-campus-document-exchange.git
cd zero-trust-campus-document-exchange

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your actual DOCUMENT_ENCRYPTION_KEY and GEMINI_API_KEY

# 4. Initialize database and seed default accounts
npm run setup

# 5. Start development server
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 3. Production Deployment Architecture

CampusVault is designed for zero-downtime deployment on containerized environments (Docker / AWS ECS / Google Cloud Run) or serverless platforms (Vercel / Netlify):

```
                       [ Cloudflare / Reverse Proxy ]
                                     │
                      SSL Termination / DDoS Shield
                                     │
                                     ▼
                      [ Next.js Production Server ]
                             (npm run start)
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
                 ▼                                       ▼
       [ Supabase PostgreSQL ]                 [ Private S3 / EFS Volume ]
     Row Level Security (RLS)                   AES-256-GCM Envelopes
     Tables, Grants, Audit Logs                 (/uploads)
```

### 3.1 Production Build & Start Commands
```bash
# Build optimized Next.js production bundle (all 32 routes)
npm run build

# Start live production server
npm start
```

---

## 4. Backup & Disaster Recovery Considerations

1. **Cryptographic Key Safety:**  
   The `DOCUMENT_ENCRYPTION_KEY` is required to decrypt all stored files. **Never rotate or change this key without running an offline decryption and re-encryption migration script**, as documents encrypted with the old key cannot be recovered if the key is lost.
2. **Database Backups:**  
   - For SQLite: Daily snapshot copy of `prisma/dev.db` when the server is idle or using SQLite `.backup` utility.
   - For Supabase: Automated continuous point-in-time recovery (PITR) enabled via Supabase dashboard.
3. **Encrypted Storage Backup:**  
   The `uploads/` directory contains ciphertext envelopes. Backups of this folder can safely be stored in secondary offsite storage because files are already encrypted at rest with AES-256-GCM.
