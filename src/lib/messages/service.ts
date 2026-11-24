import prisma from "@/lib/db";
import { authorizeDocumentAccess } from "@/lib/security/authorization";
import { logAuditEvent } from "@/lib/audit";
import { decryptDocument } from "@/lib/crypto";
import fs from "fs";
import path from "path";

export interface SendMessagePayload {
  recipientId: string;
  subject: string;
  messageContent: string;
  messageType?: "direct" | "document_share" | "access_request";
  documentId?: string;
}

export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Validates whether role combination is allowed by Campus Sharing Policy
 */
export function validateCampusSharingPolicy(
  senderRole: string,
  recipientRole: string,
  senderDeptId?: string | null,
  recipientDeptId?: string | null
): { allowed: boolean; reason?: string } {
  const normSender = senderRole.toLowerCase();
  const normRecipient = recipientRole.toLowerCase();

  // Admin can message anyone
  if (normSender === "admin") {
    return { allowed: true };
  }

  // Teacher/Faculty can message anyone in campus (Students, Faculty, Admin, HOD)
  if (normSender === "faculty" || normSender === "hod") {
    return { allowed: true };
  }

  // Student can message Faculty/HOD and Admin
  if (normSender === "student") {
    if (["faculty", "hod", "admin"].includes(normRecipient)) {
      return { allowed: true };
    }
    // Student to student allowed within same department for peer academic exchange
    if (normRecipient === "student") {
      if (senderDeptId && recipientDeptId && senderDeptId === recipientDeptId) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Peer student communication is restricted to students within the same department under campus policy.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Creates and securely transmits a message with optional document attachment
 */
export async function createSecureMessage(
  senderUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    departmentId?: string | null;
  },
  payload: SendMessagePayload
): Promise<ServiceResult> {
  const { recipientId, subject, messageContent, documentId } = payload;

  if (!recipientId || !subject?.trim() || !messageContent?.trim()) {
    return {
      success: false,
      error: "Recipient, subject, and message content are required",
      statusCode: 400,
    };
  }

  // 1. Verify recipient exists and is active
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    include: { department: true },
  });

  if (!recipient || recipient.status !== "active") {
    return {
      success: false,
      error: "Recipient not found or account is not active",
      statusCode: 404,
    };
  }

  if (recipient.id === senderUser.id) {
    return {
      success: false,
      error: "Sender and recipient cannot be the same account",
      statusCode: 400,
    };
  }

  // 2. Validate Campus Sharing Policy (RBAC / ABAC)
  const policyCheck = validateCampusSharingPolicy(
    senderUser.role,
    recipient.role,
    senderUser.departmentId,
    recipient.departmentId
  );

  if (!policyCheck.allowed) {
    await logAuditEvent({
      userId: senderUser.id,
      action: "secure_message_send",
      decision: "denied",
      reason: policyCheck.reason || "Policy violation",
      metadata: { recipientId, recipientRole: recipient.role },
    });
    return {
      success: false,
      error: policyCheck.reason || "Campus sharing policy violation",
      statusCode: 403,
    };
  }

  // 3. Zero-Trust verification of attached document (if any)
  let attachedDocument = null;
  if (documentId) {
    attachedDocument = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!attachedDocument) {
      return {
        success: false,
        error: "Attached document does not exist",
        statusCode: 404,
      };
    }

    // Zero-Trust check: does sender have rights to share this document?
    const isOwner = attachedDocument.uploadedById === senderUser.id;
    const isAdmin = senderUser.role === "admin";
    const isPublic = attachedDocument.classification === "public";

    // If not owner, admin, or public document, sender must possess an active, valid access grant
    if (!isOwner && !isAdmin && !isPublic) {
      const activeGrant = await prisma.accessGrant.findFirst({
        where: {
          documentId,
          userId: senderUser.id,
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          revokedAt: null,
        },
      });

      if (!activeGrant) {
        await logAuditEvent({
          userId: senderUser.id,
          documentId,
          action: "secure_message_share_document",
          decision: "denied",
          reason: "Sender lacks authorized access grant for attached document",
          metadata: { recipientId },
        });
        return {
          success: false,
          error: "Zero-Trust Error: You do not possess an active access grant to share this document.",
          statusCode: 403,
        };
      }
    }

    // Check classification: restricted documents can only be shared by Admin or Owner
    if (attachedDocument.classification === "restricted" && !isAdmin && !isOwner) {
      return {
        success: false,
        error: "Restricted classification documents can only be shared by Administrator or Uploader.",
        statusCode: 403,
      };
    }
  }

  // 4. Create SecureMessage in DB
  const messageType = documentId ? "document_share" : payload.messageType || "direct";

  const message = await prisma.secureMessage.create({
    data: {
      senderId: senderUser.id,
      recipientId: recipient.id,
      subject: subject.trim(),
      messageContent: messageContent.trim(),
      messageType,
      status: "DELIVERED",
      attachments: documentId
        ? {
            create: [{ documentId }],
          }
        : undefined,
    },
    include: {
      attachments: {
        include: { document: true },
      },
      sender: {
        select: { id: true, name: true, email: true, role: true },
      },
      recipient: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  // 5. Trigger in-app notification for recipient
  const notifTitle = documentId
    ? `Document Received: ${attachedDocument?.title}`
    : `New Message from ${senderUser.name}`;
  const notifMessage = documentId
    ? `${senderUser.name} (${senderUser.role.toUpperCase()}) securely shared '${attachedDocument?.title}' with you.`
    : `${senderUser.name}: ${subject.trim()}`;

  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: documentId ? "document_share" : "message",
      title: notifTitle,
      message: notifMessage,
      relatedMessageId: message.id,
    },
  });

  // 6. Audit log the transaction
  await logAuditEvent({
    userId: senderUser.id,
    documentId: documentId || undefined,
    action: "secure_message_sent",
    decision: "allowed",
    reason: `Secure message delivered to ${recipient.email}`,
    metadata: {
      messageId: message.id,
      recipientId: recipient.id,
      hasAttachment: !!documentId,
    },
  });

  return {
    success: true,
    data: {
      messageId: message.id,
      status: "DELIVERED",
      deliveredAt: message.createdAt,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
      },
      attachment: attachedDocument
        ? {
            id: attachedDocument.id,
            title: attachedDocument.title,
            classification: attachedDocument.classification,
          }
        : null,
    },
  };
}

/**
 * Retrieve inbox and sent messages for authenticated user
 */
export async function getUserMessages(userId: string) {
  const [inbox, sent] = await Promise.all([
    prisma.secureMessage.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true, department: true },
        },
        attachments: {
          include: {
            document: {
              select: { id: true, title: true, classification: true, fileSize: true },
            },
          },
        },
      },
    }),
    prisma.secureMessage.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        recipient: {
          select: { id: true, name: true, email: true, role: true, department: true },
        },
        attachments: {
          include: {
            document: {
              select: { id: true, title: true, classification: true, fileSize: true },
            },
          },
        },
      },
    }),
  ]);

  return { inbox, sent };
}

/**
 * Retrieve specific message details and mark read if user is recipient
 */
export async function getMessageDetails(messageId: string, userId: string) {
  const message = await prisma.secureMessage.findUnique({
    where: { id: messageId },
    include: {
      sender: {
        select: { id: true, name: true, email: true, role: true, department: true },
      },
      recipient: {
        select: { id: true, name: true, email: true, role: true, department: true },
      },
      attachments: {
        include: {
          document: {
            select: {
              id: true,
              title: true,
              classification: true,
              fileSize: true,
              mimeType: true,
              fileName: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!message) {
    return { success: false, error: "Message not found", statusCode: 404 };
  }

  // Strict privacy: user must be sender or recipient
  if (message.senderId !== userId && message.recipientId !== userId) {
    return { success: false, error: "Unauthorized to access this message", statusCode: 403 };
  }

  // If recipient is viewing for the first time, mark as READ
  if (message.recipientId === userId && !message.readAt) {
    await prisma.secureMessage.update({
      where: { id: messageId },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
    // Mark associated notification as read
    await prisma.notification.updateMany({
      where: { relatedMessageId: messageId, userId },
      data: { isRead: true },
    });
  }

  return { success: true, data: message };
}

/**
 * Downloads a message attachment with full Zero-Trust security authorization check
 */
export async function downloadMessageAttachment(
  messageId: string,
  attachmentId: string,
  requestingUser: {
    id: string;
    email?: string;
    role: string;
    departmentId?: string | null;
  }
): Promise<ServiceResult<{ fileBuffer: Buffer; fileName: string; mimeType: string }>> {
  // 1. Verify message access
  const message = await prisma.secureMessage.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    return { success: false, error: "Message not found", statusCode: 404 };
  }

  if (message.senderId !== requestingUser.id && message.recipientId !== requestingUser.id) {
    return { success: false, error: "Unauthorized access to message", statusCode: 403 };
  }

  // 2. Verify attachment
  const attachment = await prisma.secureMessageAttachment.findFirst({
    where: { id: attachmentId, messageId },
    include: { document: true },
  });

  if (!attachment) {
    return { success: false, error: "Attachment not found", statusCode: 404 };
  }

  const document = attachment.document;

  // 3. ZERO-TRUST AUTHORIZATION EVALUATION
  let activeGrant = await prisma.accessGrant.findFirst({
    where: {
      userId: requestingUser.id,
      documentId: document.id,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!activeGrant && message.recipientId === requestingUser.id && document.classification !== "restricted") {
    activeGrant = await prisma.accessGrant.create({
      data: {
        userId: requestingUser.id,
        documentId: document.id,
        grantedById: message.senderId,
        status: "active",
        reason: `Zero-Trust Document Share from Message ID: ${message.id}`,
      },
    });
  }

  const authResult = await authorizeDocumentAccess(
    {
      id: requestingUser.id,
      email: requestingUser.email || `${requestingUser.id}@campus.local`,
      role: requestingUser.role,
      departmentId: requestingUser.departmentId || null,
      status: "active",
    },
    {
      id: document.id,
      title: document.title,
      classification: document.classification,
      departmentId: document.departmentId,
      uploadedById: document.uploadedById,
      ownerId: document.uploadedById,
    },
    activeGrant
      ? {
          id: activeGrant.id,
          userId: activeGrant.userId,
          documentId: activeGrant.documentId,
          grantedById: activeGrant.grantedById,
          status: activeGrant.status,
          expiresAt: activeGrant.expiresAt,
          revokedAt: activeGrant.revokedAt,
        }
      : null,
    {
      timestamp: new Date(),
      action: "download",
    }
  );

  if (!authResult.allowed) {
    await logAuditEvent({
      userId: requestingUser.id,
      documentId: document.id,
      action: "download_message_attachment",
      decision: "denied",
      reason: authResult.reason || "Zero-Trust authorization failed",
      metadata: { messageId, attachmentId },
    });
    return {
      success: false,
      error: `Access Denied: ${authResult.reason || "Unauthorized to view this document"}`,
      statusCode: 403,
    };
  }

  // 4. Decrypt file from storage
  let filePath = path.isAbsolute(document.storageKey)
    ? document.storageKey
    : path.join(process.cwd(), "uploads", document.storageKey);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(process.cwd(), document.storageKey);
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: "Physical document file not found", statusCode: 404 };
  }

  const rawBuffer = fs.readFileSync(filePath);
  const { plaintext } = await decryptDocument(rawBuffer);

  await logAuditEvent({
    userId: requestingUser.id,
    documentId: document.id,
    action: "download_message_attachment",
    decision: "allowed",
    reason: `Attachment decrypted and retrieved via Secure Messenger`,
    metadata: { messageId, attachmentId },
  });

  return {
    success: true,
    data: {
      fileBuffer: plaintext,
      fileName: document.fileName,
      mimeType: document.mimeType,
    },
  };
}
