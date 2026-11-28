import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import {
  authorizeDocumentAccess,
  type SecurityUser,
  type SecurityDocument,
  type SecurityGrant,
} from "@/lib/security/authorization";
import { deleteEncryptedDocument } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/documents/[id] - Get document details (protected)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const { id } = await params;
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        department: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
        accessGrants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            grantedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!document) return errorResponse("Document not found", 404);

    // ================================================================
    // ZERO-TRUST AUTHORIZATION CHECK (TEAM 2 INTEGRATED)
    // ================================================================
    const grant = await prisma.accessGrant.findFirst({
      where: {
        userId: currentUser.id,
        documentId: id,
      },
      orderBy: { createdAt: "desc" },
    });

    const securityUser: SecurityUser = {
      id: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      departmentId: currentUser.departmentId,
      status: currentUser.status,
    };

    const securityDocument: SecurityDocument = {
      id: document.id,
      title: document.title,
      classification: document.classification,
      departmentId: document.departmentId,
      uploadedById: document.uploadedById,
      ownerId: document.uploadedById,
    };

    const securityGrant: SecurityGrant | null = grant
      ? {
          id: grant.id,
          userId: grant.userId,
          documentId: grant.documentId,
          status: grant.status,
          grantedById: grant.grantedById,
          expiresAt: grant.expiresAt,
          revokedAt: grant.revokedAt,
          revoked: grant.status === "revoked" || !!grant.revokedAt,
        }
      : null;

    const authResult = await authorizeDocumentAccess(
      securityUser,
      securityDocument,
      securityGrant,
      {
        ipAddress: request.headers.get("x-forwarded-for") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        timestamp: new Date(),
        action: "view",
      }
    );

    if (!authResult.allowed) {
      await logAuditEvent({
        userId: currentUser.id,
        documentId: id,
        action: "view",
        decision: "denied",
        reason: authResult.reason,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        metadata: { policy: authResult.policy },
      });

      return errorResponse(`Access denied: ${authResult.reason}`, 403);
    }

    // Filter accessGrants: students only see their own
    const visibleGrants =
      currentUser.role === "student"
        ? document.accessGrants.filter((g) => g.userId === currentUser.id)
        : document.accessGrants;

    return successResponse({
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        department: document.department,
        classification: document.classification,
        fileName: document.fileName,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        uploadedBy: document.uploadedBy,
        accessGrants: visibleGrants,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error("[DOCUMENT GET]", error);
    return errorResponse("Failed to fetch document", 500);
  }
}

// DELETE /api/documents/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const { id } = await params;
    const document = await prisma.document.findUnique({ where: { id } });

    if (!document) return errorResponse("Document not found", 404);

    // Only uploader or admin can delete
    if (document.uploadedById !== currentUser.id && currentUser.role !== "admin") {
      return errorResponse("Forbidden", 403);
    }

    // Delete associated grants, audit logs, and document record
    await prisma.$transaction([
      prisma.accessGrant.deleteMany({ where: { documentId: id } }),
      prisma.auditLog.deleteMany({ where: { documentId: id } }),
      prisma.document.delete({ where: { id } }),
    ]);

    // Clean up physical file in Supabase Storage and local cache
    deleteEncryptedDocument(document.storageKey).catch(() => {});

    return successResponse({ message: "Document deleted" });
  } catch (error) {
    console.error("[DOCUMENT DELETE]", error);
    return errorResponse("Failed to delete document", 500);
  }
}
