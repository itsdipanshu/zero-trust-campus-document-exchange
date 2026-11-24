import prisma from "./db";

/**
 * Log an audit event to the database.
 * Called by API routes for every significant action.
 */
export async function logAuditEvent(params: {
  userId: string;
  documentId?: string;
  action: string;
  decision?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        documentId: params.documentId || null,
        action: params.action,
        decision: params.decision || null,
        reason: params.reason || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Failed to log audit event:", error);
  }
}
