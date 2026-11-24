/**
 * ============================================================
 * CAMPUSVAULT - Team 2 Security Integration Interface
 * ============================================================
 *
 * Fully integrated with Team 2's Zero-Trust Security Engine:
 * - RBAC (Role-Based Access Control)
 * - ABAC (Attribute-Based Access Control)
 * - Expiry & Revocation Checks
 * - Tamper-Evident Audit Logging
 * ============================================================
 */

// Require Team 2's security engine modules directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { authorizeDocumentAccess: engineAuthorize } = require(
  "../../../security-engine/src/authorization/authorizeDocumentAccess"
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const auditLogger = require(
  "../../../security-engine/src/audit/auditLogger"
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DECISION, REASON } = require(
  "../../../security-engine/src/constants/decisions"
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ROLES } = require(
  "../../../security-engine/src/constants/roles"
);

// ---- Types for the security integration ----

export interface SecurityUser {
  id: string;
  email: string;
  role: string; // "student" | "faculty" | "admin" | "hod" | "teacher" | "department_manager"
  departmentId: string | null;
  status: string; // "active" | "suspended" | "inactive"
  department?: { id: string; name: string } | string | null;
}

export interface SecurityDocument {
  id: string;
  title: string;
  classification: string; // "public" | "internal" | "confidential" | "restricted"
  departmentId: string;
  uploadedById: string;
  department?: { id: string; name: string } | string | null;
  ownerId?: string;
}

export interface SecurityGrant {
  id: string;
  userId: string;
  documentId: string;
  status: string; // "active" | "revoked" | "expired"
  grantedById: string;
  expiresAt: Date | string | null;
  revokedAt?: Date | string | null;
  revoked?: boolean;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  policy?: string;
  decision: "ALLOW" | "DENY";
  auditEntry?: Record<string, unknown>;
}

export interface SecurityContext {
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  action: string; // "download" | "view" | "upload" | "delete"
  metadata?: Record<string, unknown>;
}

// Map Team 1 roles to Team 2 RBAC roles if needed (both are supported natively)
function normalizeRole(role: string): string {
  const r = (role || "").toLowerCase();
  if (r === "hod") return "department_manager";
  if (r === "faculty") return "teacher";
  return r;
}

/**
 * authorizeDocumentAccess
 *
 * Evaluates access request against Team 2's Zero-Trust Security Engine:
 * 1. Input validation
 * 2. User status verification (ABAC)
 * 3. Department boundary checks (ABAC)
 * 4. Owner / Role classification check (RBAC)
 * 5. Grant validity, revocation, and expiry check (ABAC)
 * 6. Audit logging
 */
export async function authorizeDocumentAccess(
  user: SecurityUser,
  document: SecurityDocument,
  grant: SecurityGrant | null,
  context: SecurityContext
): Promise<AuthorizationResult> {
  const currentTime = context.timestamp || new Date();
  const normalizedRole = user ? normalizeRole(user.role) : "";

  // Normalize department identifier so matching works reliably across ID or Name
  const userDept = user
    ? (user.departmentId || (typeof user.department === "object" ? user.department?.id : user.department) || "")
    : "";

  const docDept = document
    ? (document.departmentId || (typeof document.department === "object" ? document.department?.id : document.department) || "")
    : "";

  // Adapt user object for security engine
  const engineUser = user
    ? {
        id: user.id,
        email: user.email,
        role: normalizedRole,
        department: userDept,
        status: user.status,
      }
    : null;

  // Adapt document object for security engine
  const engineDocument = document
    ? {
        id: document.id,
        title: document.title,
        classification: document.classification,
        department: docDept,
        ownerId: document.uploadedById || document.ownerId || "",
      }
    : null;

  // Adapt grant object for security engine
  const engineGrant = grant
    ? {
        id: grant.id,
        userId: grant.userId,
        documentId: grant.documentId,
        grantedBy: grant.grantedById,
        status: grant.status,
        expiresAt: grant.expiresAt,
        revoked: grant.status === "revoked" || !!grant.revokedAt,
        revokedAt: grant.revokedAt || null,
      }
    : null;

  // Execute Team 2's core authorization pipeline
  const result = await engineAuthorize(
    engineUser,
    engineDocument,
    engineGrant,
    currentTime,
    {
      action: context.action || "view",
      metadata: {
        ip: context.ipAddress,
        userAgent: context.userAgent,
        ...context.metadata,
      },
    }
  );

  return {
    allowed: result.decision === DECISION.ALLOW,
    reason: result.reason,
    policy: result.reason,
    decision: result.decision,
    auditEntry: result.auditEntry,
  };
}

/**
 * validateUserSession
 *
 * Verifies that the user account is still active and valid.
 * Zero-trust: Never trust stale session tokens if user is suspended in DB.
 */
export async function validateUserSession(
  user: SecurityUser,
  context: SecurityContext
): Promise<{ valid: boolean; reason: string }> {
  if (!user) {
    return { valid: false, reason: REASON.USER_NOT_FOUND };
  }
  if (user.status === "suspended") {
    return { valid: false, reason: REASON.USER_SUSPENDED };
  }
  if (user.status !== "active") {
    return { valid: false, reason: REASON.USER_INACTIVE };
  }
  return { valid: true, reason: "Session valid" };
}

/**
 * onSecurityEvent
 * Hook to record security events in the audit log.
 */
export async function onSecurityEvent(event: {
  type: string;
  userId?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}): Promise<void> {
  await auditLogger.logDecision({
    userId: event.userId || "anonymous",
    documentId: (event.details.documentId as string) || "system",
    action: event.type,
    decision: event.type.includes("failed") || event.type.includes("blocked")
      ? DECISION.DENY
      : DECISION.ALLOW,
    reason: (event.details.reason as string) || event.type,
    metadata: event.details,
  });
}
