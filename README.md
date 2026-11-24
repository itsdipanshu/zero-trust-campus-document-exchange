# 🛡️ CampusVault — Zero-Trust Campus Document Exchange

> **NexHack 2.0** | Team: Technovertex

CampusVault is a secure campus document management platform built with zero-trust principles. Documents are privately stored and served through authenticated backend APIs — no public URLs are ever exposed.

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | SQLite (via Prisma ORM) |
| Auth | JWT + bcrypt |
| Icons | Lucide React |
| Runtime | Node.js |

---

## 📁 Project Structure

```
campusvault/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed data (default users & departments)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/          # Login, Register, Logout, Me
│   │   │   ├── users/         # User CRUD
│   │   │   ├── departments/   # Department CRUD
│   │   │   ├── documents/     # Document CRUD + Download
│   │   │   ├── access-grants/ # Access Grant management
│   │   │   ├── audit-logs/    # Audit log queries
│   │   │   └── dashboard/     # Dashboard stats
│   │   ├── dashboard/
│   │   │   ├── layout.tsx     # Dashboard sidebar layout
│   │   │   ├── page.tsx       # Main dashboard
│   │   │   ├── documents/     # Document vault
│   │   │   ├── users/         # User management
│   │   │   ├── departments/   # Department management
│   │   │   ├── access-grants/ # Access grant UI
│   │   │   ├── audit-logs/    # Audit log viewer
│   │   │   └── settings/      # Profile & account settings
│   │   ├── login/             # Login page
│   │   ├── register/          # Registration page
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page
│   │   └── globals.css        # Global styles
│   ├── lib/
│   │   ├── auth.ts            # JWT, password hashing, session
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── audit.ts           # Audit logging utility
│   │   ├── utils.ts           # Helpers (responses, formatting)
│   │   └── security/
│   │       └── authorization.ts  # ⚡ TEAM 2 INTEGRATION POINT
│   └── middleware.ts          # Route protection middleware
├── uploads/                   # Private document storage (never public)
├── .env                       # Environment variables
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🔧 Setup & Installation

### Prerequisites

- **Node.js** 18+ installed ([download](https://nodejs.org))
- **npm** (comes with Node.js)

### Step 1: Install Dependencies

```bash
cd campusvault
npm install
```

### Step 2: Setup Database

```bash
# Generate Prisma client + push schema + seed data
npm run setup
```

Or run individually:

```bash
npx prisma generate
npx prisma db push
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

### Step 3: Run the Application

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 🔑 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@campusvault.edu | admin123 |
| **Faculty** | faculty@campusvault.edu | faculty123 |
| **HOD** | hod@campusvault.edu | hod123 |
| **Student** | student@campusvault.edu | student123 |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users (admin/hod) |
| GET | `/api/users/:id` | Get user details |
| PATCH | `/api/users/:id` | Update user |

### Departments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/departments` | List departments |
| POST | `/api/departments` | Create department (admin) |
| PATCH | `/api/departments/:id` | Update department (admin) |
| DELETE | `/api/departments/:id` | Delete department (admin) |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Upload document |
| GET | `/api/documents/:id` | Get document details |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/documents/:id/download` | Download document (protected) |

### Access Grants
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/access-grants` | List grants |
| POST | `/api/access-grants` | Create grant |
| PATCH | `/api/access-grants/:id` | Update/revoke grant |

### Audit Logs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit-logs` | List audit logs (admin/hod) |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Get dashboard statistics |

---

## 🔗 Team 2 Integration Point

The security engine integration is located at:

**`src/lib/security/authorization.ts`**

### Main function:

```typescript
authorizeDocumentAccess(user, document, grant, context) → Promise<AuthorizationResult>
```

### Parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `SecurityUser` | User requesting access (id, email, role, departmentId, status) |
| `document` | `SecurityDocument` | Document being accessed (id, title, classification, departmentId) |
| `grant` | `SecurityGrant \| null` | Access grant record if exists |
| `context` | `SecurityContext` | IP address, user agent, timestamp, action type |

### Return:

```typescript
{ allowed: boolean, reason: string, policy?: string }
```

### Additional hooks:

- `validateUserSession(user, context)` — Session validation hook
- `onSecurityEvent(event)` — Security event processing hook

### Integration location in backend:

The download API (`src/app/api/documents/[id]/download/route.ts`) calls `authorizeDocumentAccess()` before serving any file. **Team 2 should replace the placeholder logic** in `authorization.ts` with their RBAC/ABAC/Zero-Trust engine.

---

## 🗄️ Database Models

- **User** — id, name, email, passwordHash, role, departmentId, status
- **Department** — id, name, description
- **Document** — id, title, description, departmentId, classification, storageKey, uploadedById
- **AccessGrant** — id, userId, documentId, status, grantedById, expiresAt, revokedAt
- **AuditLog** — id, userId, documentId, action, decision, reason, timestamp

### View database:

```bash
npx prisma studio
```

---

## 🎨 Frontend Pages

1. **Landing Page** — `/` — Welcome page with feature highlights
2. **Login** — `/login` — User authentication
3. **Register** — `/register` — New user registration
4. **Dashboard** — `/dashboard` — Stats overview with charts
5. **Document Vault** — `/dashboard/documents` — Upload, view, download, delete
6. **Users** — `/dashboard/users` — User management (admin/hod)
7. **Departments** — `/dashboard/departments` — Department CRUD (admin)
8. **Access Grants** — `/dashboard/access-grants` — Grant/revoke access
9. **Audit Logs** — `/dashboard/audit-logs` — Activity trail (admin/hod)
10. **Settings** — `/dashboard/settings` — Profile & password

---

## ⚠️ Important Notes

- Documents are stored in `uploads/` and **never served via public URLs**
- All downloads go through the backend API with authorization checks
- The security engine (`authorization.ts`) is a **placeholder** — Team 2 provides the real implementation
- Audit logs record every significant action with timestamps and IP addresses
- JWT tokens expire after 24 hours

---

## 👥 Team

- **Team Technovertex**

Built for **NexHack 2.0** 🚀
