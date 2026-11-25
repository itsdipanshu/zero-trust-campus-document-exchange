import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/access-grants/[id] - Revoke access grant (Admin / HOD only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    // Strict Role Permission: Only Admin and HOD can revoke access
    if (currentUser.role !== "admin" && currentUser.role !== "hod") {
      return errorResponse("Forbidden: Only administrators can revoke document access", 403);
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const grant = await prisma.accessGrant.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        document: { select: { title: true } },
      },
    });

    if (!grant) return errorResponse("Grant not found", 404);

    const updateData: Record<string, unknown> = {};

    if (status === "revoked") {
      updateData.status = "revoked";
      updateData.revokedAt = new Date();
    } else if (status) {
      updateData.status = status;
    }

    if (body.expiresAt !== undefined) {
      if (body.expiresAt) {
        const parsed = new Date(body.expiresAt);
        if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
          return errorResponse("Expiration date and time must be a valid future timestamp", 400);
        }
        updateData.expiresAt = parsed;
      } else {
        updateData.expiresAt = null;
      }
    }

    const updated = await prisma.accessGrant.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true } },
        document: { select: { id: true, title: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (status === "revoked") {
      await logAuditEvent({
        userId: currentUser.id,
        documentId: grant.documentId,
        action: "revoke_access",
        decision: "allowed",
        reason: `Revoked ${grant.user.email}'s access to ${grant.document.title}`,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        metadata: { grantId: id },
      });
    } else if (body.expiresAt !== undefined) {
      await logAuditEvent({
        userId: currentUser.id,
        documentId: grant.documentId,
        action: "update_access_expiry",
        decision: "allowed",
        reason: `Updated access expiration for ${grant.user.email} on ${grant.document.title} to ${
          updated.expiresAt ? updated.expiresAt.toISOString() : "Permanent"
        }`,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        metadata: {
          grantId: id,
          expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
        },
      });
    }

    return successResponse({ grant: updated });
  } catch (error) {
    console.error("[GRANT PATCH]", error);
    return errorResponse("Failed to update grant", 500);
  }
}
