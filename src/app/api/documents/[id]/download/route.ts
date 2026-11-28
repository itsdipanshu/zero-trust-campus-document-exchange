import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import { decryptDocument } from "@/lib/crypto";
import {
  authorizeDocumentAccess,
  type SecurityUser,
  type SecurityDocument,
  type SecurityGrant,
} from "@/lib/security/authorization";
import { retrieveEncryptedDocument } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/documents/[id]/download - Download document (protected by Zero-Trust + AES-256-GCM)
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
      include: { department: true },
    });

    if (!document) return errorResponse("Document not found", 404);

    // ================================================================
    // STEP 0: ONE-TIME ACCESS CODE CONSUMPTION (IF PROVIDED)
    // ================================================================
    const providedCode =
      request.nextUrl.searchParams.get("code") ||
      request.nextUrl.searchParams.get("accessCode");
    if (providedCode) {
      const { redeemOneTimeAccessCode } = await import("@/lib/security/accessCodes");
      const redeemResult = await redeemOneTimeAccessCode({
        code: providedCode,
        userId: currentUser.id,
        documentId: id,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      });
      if (!redeemResult.success) {
        return errorResponse(redeemResult.error || "Access code validation failed", redeemResult.statusCode || 403);
      }
    }

    // ================================================================
    // STEP 1: ZERO-TRUST AUTHORIZATION PIPELINE
    // "Never Trust, Always Verify" – Every request evaluated at request time.
    // Fetch the most recent grant for this user & document.
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
        action: "download",
      }
    );

    // ================================================================
    // STEP 2: IF DENIED – EXIT IMMEDIATELY WITH HTTP 403
    // CRITICAL: NEVER read or decrypt documents if authorization is DENIED.
    // ================================================================
    if (!authResult.allowed) {
      await logAuditEvent({
        userId: currentUser.id,
        documentId: id,
        action: "download",
        decision: "denied",
        reason: authResult.reason,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        metadata: { policy: authResult.policy, decision: authResult.decision },
      });

      return errorResponse(`Access denied: ${authResult.reason}`, 403);
    }

    // ================================================================
    // STEP 3: READ ENCRYPTED STORAGE (ONLY AFTER AUTHORIZATION SUCCEEDS)
    // ================================================================
    let rawFileBuffer: Buffer;
    try {
      rawFileBuffer = await retrieveEncryptedDocument(document.storageKey);
    } catch {
      return errorResponse("File not found in storage", 404);
    }

    // ================================================================
    // STEP 4: AES-256-GCM DECRYPTION & SHA-256 INTEGRITY VERIFICATION
    // Verifies 16-byte authentication tag + SHA-256 digest before serving.
    // ================================================================
    let decryptedPayload: { plaintext: Buffer; sha256: string; isEncrypted: boolean };
    try {
      decryptedPayload = await decryptDocument(rawFileBuffer);
    } catch (cryptoErr: unknown) {
      const errorMsg =
        cryptoErr instanceof Error ? cryptoErr.message : "Cryptographic verification failed";

      await logAuditEvent({
        userId: currentUser.id,
        documentId: id,
        action: "download_crypto_failure",
        decision: "denied",
        reason: errorMsg,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      });

      return errorResponse(`Security Error: ${errorMsg}`, 500);
    }

    // ================================================================
    // STEP 5: AUDIT LOG ALLOWED ACCESS & RETURN DECRYPTED PLAINTEXT
    // ================================================================
    await logAuditEvent({
      userId: currentUser.id,
      documentId: id,
      action: "download",
      decision: "allowed",
      reason: authResult.reason,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
      metadata: {
        policy: authResult.policy,
        encryptedAtRest: decryptedPayload.isEncrypted,
        sha256Verified: true,
      },
    });

    return new NextResponse(new Uint8Array(decryptedPayload.plaintext), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.fileName}"`,
        "Content-Length": decryptedPayload.plaintext.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[DOWNLOAD]", error);
    return errorResponse("Download failed", 500);
  }
}
