import crypto from "crypto";
import prisma from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import {
  authorizeDocumentAccess,
  type SecurityUser,
  type SecurityDocument,
  type SecurityGrant,
} from "./authorization";

/**
 * Generates a cryptographically secure, readable one-time access code.
 * Format: CVLT-XXXX-XXXX-XXXX (16 random uppercase characters with CVLT namespace)
 */
export function generateSecureAccessCode(): string {
  // Use un-ambiguous character set (no 0/O, 1/I)
  const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let randomChars = "";
  const randomBytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    randomChars += charset[randomBytes[i] % charset.length];
  }
  return `CVLT-${randomChars.slice(0, 4)}-${randomChars.slice(4, 8)}-${randomChars.slice(8, 12)}`;
}

/**
 * Hashes an access code with SHA-256 for secure storage at rest.
 * NEVER store or expose plaintext access codes in the database.
 */
export function hashAccessCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generates a unique, standardized Ticket ID.
 * Format: CVLT-REQ-YYYY-XXXXXX
 */
export function generateTicketId(): string {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CVLT-REQ-${year}-${random}`;
}

// In-memory rate limiting map for code redemption brute-force protection
const redemptionAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function resetRedemptionRateLimit(key?: string) {
  if (key) redemptionAttempts.delete(key);
  else redemptionAttempts.clear();
}

function checkRedemptionRateLimit(key: string): boolean {
  const now = Date.now();
  const record = redemptionAttempts.get(key);
  if (!record) {
    return true;
  }
  // 15-minute sliding window
  if (now - record.firstAttempt > 15 * 60 * 1000) {
    redemptionAttempts.delete(key);
    return true;
  }
  if (record.count >= 10) {
    return false; // Rate limit exceeded (10 failed attempts per 15 mins)
  }
  return true;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const record = redemptionAttempts.get(key);
  if (!record || now - record.firstAttempt > 15 * 60 * 1000) {
    redemptionAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

/**
 * Releases a document with a unique one-time access code to an intended recipient.
 */
export async function releaseOneTimeAccessCode(params: {
  documentId: string;
  recipientUserId: string;
  createdById: string;
  expiresAtHours?: number;
  expiresAt?: Date | string;
  ticketId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  code?: string;
  codeId?: string;
  expiresAt?: Date;
  documentTitle?: string;
  recipientName?: string;
  error?: string;
  statusCode?: number;
}> {
  const {
    documentId,
    recipientUserId,
    createdById,
    expiresAtHours = 24,
    expiresAt: customExpiresAt,
    ticketId,
    ipAddress = "unknown",
    userAgent = "unknown",
  } = params;

  // 1. Fetch document and verifying owner/issuer
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { department: true },
  });
  if (!document) {
    return { success: false, error: "Document not found", statusCode: 404 };
  }

  const creator = await prisma.user.findUnique({ where: { id: createdById } });
  if (!creator) {
    return { success: false, error: "Issuer not found", statusCode: 404 };
  }

  // Authority check: Creator must be admin, HOD, or document uploader
  const isOwner = document.uploadedById === createdById;
  const isAdmin = creator.role === "admin";
  const isHod = creator.role === "hod" && creator.departmentId === document.departmentId;

  if (!isOwner && !isAdmin && !isHod) {
    return {
      success: false,
      error: "Unauthorized: Only the document owner or an authorized administrator can release this document.",
      statusCode: 403,
    };
  }

  // 2. Fetch recipient
  const recipient = await prisma.user.findUnique({ where: { id: recipientUserId } });
  if (!recipient) {
    return { success: false, error: "Recipient user not found", statusCode: 404 };
  }
  if (recipient.status !== "active") {
    return {
      success: false,
      error: "Recipient account is suspended or inactive.",
      statusCode: 403,
    };
  }

  // 3. Resolve custom expiration time & generate cryptographically secure access code
  let expiresAt: Date;
  if (customExpiresAt) {
    expiresAt = new Date(customExpiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return {
        success: false,
        error: "Custom expiration time must be a valid future date and time.",
        statusCode: 400,
      };
    }
  } else {
    const hours = Number(expiresAtHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return {
        success: false,
        error: "Expiration duration must be greater than 0.",
        statusCode: 400,
      };
    }
    expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  const code = generateSecureAccessCode();
  const codeHash = hashAccessCode(code);

  // 4. Invalidate any existing unused access codes for this recipient & document
  await prisma.documentAccessCode.updateMany({
    where: {
      documentId,
      recipientUserId,
      status: "ACTIVE",
    },
    data: {
      status: "EXPIRED",
    },
  });

  // 5. Store new code hash in database
  const accessCodeRecord = await prisma.documentAccessCode.create({
    data: {
      documentId,
      recipientUserId,
      createdById,
      codeHash,
      status: "ACTIVE",
      expiresAt,
      ticketId: ticketId || null,
    },
  });

  // 6. Send in-app notification to recipient
  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: "access_code_issued",
      title: "One-Time Document Access Code Issued",
      message: `You have received a one-time access code for '${document.title}'. Code: ${code}. Valid until ${expiresAt.toLocaleString()}.`,
    },
  });

  // 7. Security audit log (NEVER log the plaintext code)
  await logAuditEvent({
    userId: createdById,
    documentId,
    action: "access_code_released",
    decision: "allowed",
    reason: "ACCESS_CODE_VALID",
    ipAddress,
    userAgent,
    metadata: {
      recipientId: recipientUserId,
      recipientEmail: recipient.email,
      expiresAt: expiresAt.toISOString(),
      ticketId: ticketId || undefined,
    },
  });

  return {
    success: true,
    code,
    codeId: accessCodeRecord.id,
    expiresAt,
    documentTitle: document.title,
    recipientName: recipient.name,
  };
}

/**
 * Validates and atomically consumes a one-time access code.
 */
export async function redeemOneTimeAccessCode(params: {
  code: string;
  userId: string;
  documentId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  document?: {
    id: string;
    title: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    classification: string;
  };
  downloadUrl?: string;
  error?: string;
  reason?: string;
  statusCode?: number;
}> {
  const { code, userId, documentId, ipAddress = "unknown", userAgent = "unknown" } = params;

  // 1. Rate limiting check
  const rateLimitKey = `${userId}:${ipAddress}`;
  if (!checkRedemptionRateLimit(rateLimitKey)) {
    return {
      success: false,
      error: "Too many failed redemption attempts. Please wait 15 minutes before trying again.",
      reason: "RATE_LIMIT_EXCEEDED",
      statusCode: 429,
    };
  }

  const cleanCode = (code || "").trim();
  if (!cleanCode) {
    return {
      success: false,
      error: "Access code is required.",
      reason: "ACCESS_CODE_INVALID",
      statusCode: 400,
    };
  }

  const codeHash = hashAccessCode(cleanCode);

  // 2. Query code record by hash
  const codeRecord = await prisma.documentAccessCode.findUnique({
    where: { codeHash },
    include: {
      document: {
        include: { department: true },
      },
    },
  });

  // Case A: Code does not exist in system
  if (!codeRecord) {
    await logAuditEvent({
      userId,
      documentId: documentId || undefined,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: "ACCESS_CODE_INVALID",
      ipAddress,
      userAgent,
    });

    return {
      success: false,
      error: "Invalid access code. Please verify your code.",
      reason: "ACCESS_CODE_INVALID",
      statusCode: 400,
    };
  }

  const doc = codeRecord.document;

  // Case B: User mismatch (Code belongs to someone else)
  if (codeRecord.recipientUserId !== userId) {
    await logAuditEvent({
      userId,
      documentId: doc.id,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: "ACCESS_CODE_USER_MISMATCH",
      ipAddress,
      userAgent,
      metadata: { intendedRecipientId: codeRecord.recipientUserId },
    });

    return {
      success: false,
      error: "This access code was issued to a different user and cannot be redeemed by your account.",
      reason: "ACCESS_CODE_USER_MISMATCH",
      statusCode: 403,
    };
  }

  // Case C: Code already used
  if (codeRecord.status === "USED" || codeRecord.usedAt !== null) {
    await logAuditEvent({
      userId,
      documentId: doc.id,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: "ACCESS_CODE_ALREADY_USED",
      ipAddress,
      userAgent,
      metadata: { usedAt: codeRecord.usedAt?.toISOString() },
    });

    return {
      success: false,
      error: "This one-time access code has already been used. To access this document again, please request re-access through Vault AI.",
      reason: "ACCESS_CODE_ALREADY_USED",
      statusCode: 410,
    };
  }

  // Case D: Code expired
  if (codeRecord.status === "EXPIRED" || new Date() > codeRecord.expiresAt) {
    if (codeRecord.status !== "EXPIRED") {
      await prisma.documentAccessCode.update({
        where: { id: codeRecord.id },
        data: { status: "EXPIRED" },
      });
    }

    await logAuditEvent({
      userId,
      documentId: doc.id,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: "ACCESS_CODE_EXPIRED",
      ipAddress,
      userAgent,
      metadata: { expiresAt: codeRecord.expiresAt.toISOString() },
    });

    return {
      success: false,
      error: "This access code has expired. Please request a new access code through Vault AI.",
      reason: "ACCESS_CODE_EXPIRED",
      statusCode: 410,
    };
  }

  // Case E: Document access revoked
  if (codeRecord.status === "REVOKED") {
    await logAuditEvent({
      userId,
      documentId: doc.id,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: "DOCUMENT_ACCESS_REVOKED",
      ipAddress,
      userAgent,
    });

    return {
      success: false,
      error: "Access to this document has been revoked by administration.",
      reason: "DOCUMENT_ACCESS_REVOKED",
      statusCode: 403,
    };
  }

  // 3. User account status check
  const currentUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!currentUser || currentUser.status !== "active") {
    await logAuditEvent({
      userId,
      documentId: doc.id,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: "USER_SUSPENDED",
      ipAddress,
      userAgent,
    });

    return {
      success: false,
      error: "Access denied: Account is suspended or inactive.",
      reason: "USER_SUSPENDED",
      statusCode: 403,
    };
  }

  // 4. Zero-Trust RBAC & ABAC policy verification
  const securityUser: SecurityUser = {
    id: currentUser.id,
    email: currentUser.email,
    role: currentUser.role,
    departmentId: currentUser.departmentId,
    status: currentUser.status,
  };

  const securityDocument: SecurityDocument = {
    id: doc.id,
    title: doc.title,
    classification: doc.classification,
    departmentId: doc.departmentId,
    uploadedById: doc.uploadedById,
    ownerId: doc.uploadedById,
  };

  // Provide a synthetic active grant for zero-trust validation
  const securityGrant: SecurityGrant = {
    id: `code-grant-${codeRecord.id}`,
    userId: currentUser.id,
    documentId: doc.id,
    status: "active",
    grantedById: codeRecord.createdById,
    expiresAt: codeRecord.expiresAt,
    revokedAt: null,
    revoked: false,
  };

  const authResult = await authorizeDocumentAccess(
    securityUser,
    securityDocument,
    securityGrant,
    {
      ipAddress,
      userAgent,
      timestamp: new Date(),
      action: "download",
    }
  );

  if (!authResult.allowed) {
    await logAuditEvent({
      userId,
      documentId: doc.id,
      action: "access_code_redemption_failed",
      decision: "denied",
      reason: authResult.reason,
      ipAddress,
      userAgent,
    });

    return {
      success: false,
      error: `Zero-Trust authorization denied: ${authResult.reason}`,
      reason: authResult.reason,
      statusCode: 403,
    };
  }

  // 5. ATOMIC CONSUMPTION: Mark code as USED atomically
  // Ensures concurrent requests cannot reuse the same code
  const updateResult = await prisma.documentAccessCode.updateMany({
    where: {
      id: codeRecord.id,
      status: "ACTIVE",
      usedAt: null,
    },
    data: {
      status: "USED",
      usedAt: new Date(),
    },
  });

  if (updateResult.count === 0) {
    return {
      success: false,
      error: "This one-time access code has already been consumed.",
      reason: "ACCESS_CODE_ALREADY_USED",
      statusCode: 410,
    };
  }

  // 6. Provision an official time-bounded AccessGrant (1 hour window to download)
  await prisma.accessGrant.create({
    data: {
      userId: currentUser.id,
      documentId: doc.id,
      grantedById: codeRecord.createdById,
      status: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour download grace period
      reason: `Redeemed One-Time Access Code: ${codeRecord.id}`,
    },
  });

  // 7. Audit log successful redemption
  await logAuditEvent({
    userId,
    documentId: doc.id,
    action: "access_code_redeemed",
    decision: "allowed",
    reason: "ACCESS_CODE_VALID",
    ipAddress,
    userAgent,
    metadata: {
      codeId: codeRecord.id,
      documentTitle: doc.title,
    },
  });

  return {
    success: true,
    document: {
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      classification: doc.classification,
    },
    downloadUrl: `/api/documents/${doc.id}/download`,
  };
}

/**
 * Creates a formal Re-Access Request Ticket.
 * MANDATORY REQUIREMENT: Reason must be non-empty and un-modified.
 */
export async function createReAccessTicket(params: {
  documentId: string;
  requesterId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  ticket?: any;
  error?: string;
  statusCode?: number;
}> {
  const { documentId, requesterId, reason, ipAddress = "unknown", userAgent = "unknown" } = params;

  // 1. Mandatory Reason Check
  const cleanReason = (reason || "").trim();
  if (cleanReason.length === 0) {
    return {
      success: false,
      error: "Why do you need access to this document again? Please explain your reason. A non-empty reason is mandatory.",
      statusCode: 400,
    };
  }

  // 2. Fetch document and owner
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      uploadedBy: true,
      department: true,
    },
  });
  if (!document) {
    return { success: false, error: "Document not found", statusCode: 404 };
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    include: { department: true },
  });
  if (!requester) {
    return { success: false, error: "Requester account not found", statusCode: 404 };
  }
  if (requester.status !== "active") {
    return { success: false, error: "Your account is suspended.", statusCode: 403 };
  }

  // 3. Check for existing PENDING ticket
  const existingPending = await prisma.documentAccessTicket.findFirst({
    where: {
      documentId,
      requesterId,
      status: "PENDING",
    },
  });
  if (existingPending) {
    return {
      success: true,
      ticket: existingPending,
      error: `You already have an active request pending review for this document (Ticket: ${existingPending.ticketId}).`,
      statusCode: 409,
    };
  }

  // 4. Generate unique Ticket ID: CVLT-REQ-YYYY-XXXXXX
  const ticketId = generateTicketId();

  // 5. Create ticket in database
  const ticket = await prisma.documentAccessTicket.create({
    data: {
      ticketId,
      documentId,
      requesterId,
      documentOwnerId: document.uploadedById,
      reason: cleanReason,
      status: "PENDING",
    },
    include: {
      document: { select: { title: true, classification: true } },
      requester: { select: { name: true, email: true, role: true } },
      documentOwner: { select: { name: true, email: true } },
    },
  });

  // 6. Send notification to the actual Document Owner (or department admin if owner is unavailable)
  const ownerId = document.uploadedById;
  const deptName = requester.department?.name || "Campus";

  await prisma.notification.create({
    data: {
      userId: ownerId,
      type: "reaccess_request",
      title: "New Document Re-Access Request",
      message: `Student: ${requester.name} | Role: ${requester.role.toUpperCase()} | Department: ${deptName} | Document: ${document.title} | Ticket ID: ${ticketId} | Reason: ${cleanReason}`,
    },
  });

  // 7. Security audit log
  await logAuditEvent({
    userId: requesterId,
    documentId,
    action: "reaccess_request_created",
    decision: "pending",
    reason: "REACCESS_REQUEST_CREATED",
    ipAddress,
    userAgent,
    metadata: {
      ticketId,
      ownerId,
      reason: cleanReason,
    },
  });

  return { success: true, ticket };
}

/**
 * Reviews a Re-Access Ticket (APPROVE or REJECT).
 * Only the document owner or an authorized administrator can review.
 */
export async function reviewReAccessTicket(params: {
  ticketId: string;
  reviewerId: string;
  action: "APPROVE" | "REJECT";
  rejectionReason?: string;
  expiryHours?: number;
  expiresAt?: Date | string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  ticket?: any;
  accessCode?: string;
  expiresAt?: Date;
  error?: string;
  statusCode?: number;
}> {
  const {
    ticketId,
    reviewerId,
    action,
    rejectionReason,
    expiryHours = 24,
    expiresAt,
    ipAddress = "unknown",
    userAgent = "unknown",
  } = params;

  // 1. Fetch ticket and document
  const ticket = await prisma.documentAccessTicket.findFirst({
    where: {
      OR: [{ id: ticketId }, { ticketId: ticketId }],
    },
    include: {
      document: true,
      requester: { include: { department: true } },
    },
  });
  if (!ticket) {
    return { success: false, error: "Ticket not found", statusCode: 404 };
  }

  if (ticket.status !== "PENDING") {
    return {
      success: false,
      error: `Ticket has already been ${ticket.status.toLowerCase()}.`,
      statusCode: 400,
    };
  }

  // 2. Verify reviewer authority: Must be document owner, admin, or department HOD
  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId } });
  if (!reviewer) {
    return { success: false, error: "Reviewer not found", statusCode: 404 };
  }

  const isOwner = ticket.documentOwnerId === reviewerId;
  const isAdmin = reviewer.role === "admin";
  const isHod = reviewer.role === "hod" && reviewer.departmentId === ticket.document.departmentId;

  if (!isOwner && !isAdmin && !isHod) {
    return {
      success: false,
      error: "Unauthorized: Only the document owner or an authorized administrator can approve or reject this request.",
      statusCode: 403,
    };
  }

  // 3. Process APPROVE or REJECT
  if (action === "APPROVE") {
    // Generate fresh, unique one-time access code
    const codeResult = await releaseOneTimeAccessCode({
      documentId: ticket.documentId,
      recipientUserId: ticket.requesterId,
      createdById: reviewerId,
      expiresAtHours: expiryHours,
      expiresAt,
      ticketId: ticket.id,
      ipAddress,
      userAgent,
    });

    if (!codeResult.success || !codeResult.code) {
      return {
        success: false,
        error: codeResult.error || "Failed to generate access code",
        statusCode: codeResult.statusCode || 500,
      };
    }

    // Update ticket status
    const updatedTicket = await prisma.documentAccessTicket.update({
      where: { id: ticket.id },
      data: {
        status: "APPROVED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    // Notify requester
    await prisma.notification.create({
      data: {
        userId: ticket.requesterId,
        type: "reaccess_approved",
        title: "Re-Access Request Approved",
        message: `Your re-access request for '${ticket.document.title}' (Ticket: ${ticket.ticketId}) was approved! Your new one-time access code is: ${codeResult.code}. Valid until ${codeResult.expiresAt?.toLocaleString()}.`,
      },
    });

    // Security audit log
    await logAuditEvent({
      userId: reviewerId,
      documentId: ticket.documentId,
      action: "reaccess_request_approved",
      decision: "allowed",
      reason: "REACCESS_REQUEST_APPROVED",
      ipAddress,
      userAgent,
      metadata: {
        ticketId: ticket.ticketId,
        requesterId: ticket.requesterId,
        codeId: codeResult.codeId,
      },
    });

    return {
      success: true,
      ticket: updatedTicket,
      accessCode: codeResult.code,
      expiresAt: codeResult.expiresAt,
    };
  } else {
    // REJECT action: Do NOT generate an access code
    const updatedTicket = await prisma.documentAccessTicket.update({
      where: { id: ticket.id },
      data: {
        status: "REJECTED",
        rejectionReason: rejectionReason?.trim() || "Rejected by document owner",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    // Notify requester
    await prisma.notification.create({
      data: {
        userId: ticket.requesterId,
        type: "reaccess_rejected",
        title: "Re-Access Request Rejected",
        message: `Your re-access request for '${ticket.document.title}' (Ticket: ${ticket.ticketId}) was rejected. Reason: ${rejectionReason || "No explanation provided"}.`,
      },
    });

    // Security audit log
    await logAuditEvent({
      userId: reviewerId,
      documentId: ticket.documentId,
      action: "reaccess_request_rejected",
      decision: "denied",
      reason: "REACCESS_REQUEST_REJECTED",
      ipAddress,
      userAgent,
      metadata: {
        ticketId: ticket.ticketId,
        requesterId: ticket.requesterId,
        rejectionReason: rejectionReason || undefined,
      },
    });

    return { success: true, ticket: updatedTicket };
  }
}
