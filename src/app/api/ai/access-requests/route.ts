import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/ai/access-requests
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const isAdmin = user.role === "admin" || user.role === "hod";
    const status = request.nextUrl.searchParams.get("status");

    const where: any = {};
    if (!isAdmin) {
      where.userId = user.id;
    }
    if (status) {
      where.status = status;
    }

    const requests = await prisma.aiAccessRequest.findMany({
      where,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            classification: true,
            department: { select: { id: true, name: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: { select: { name: true } },
          },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    return successResponse({ requests });
  } catch (error) {
    console.error("[ACCESS REQUESTS GET ERROR]", error);
    return errorResponse("Failed to fetch access requests", 500);
  }
}

// POST /api/ai/access-requests - User creates access request for a document
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return errorResponse("Document ID is required", 400);
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return errorResponse("Document not found", 404);
    }

    // Check if pending request already exists
    const existing = await prisma.aiAccessRequest.findFirst({
      where: {
        userId: user.id,
        documentId,
        status: "PENDING",
      },
    });

    if (existing) {
      return errorResponse("An access request is already pending for this document", 409);
    }

    const newRequest = await prisma.aiAccessRequest.create({
      data: {
        userId: user.id,
        documentId,
        status: "PENDING",
      },
      include: { document: { select: { title: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        documentId,
        action: "access_request_created",
        decision: "pending",
        reason: `User requested access for ${document.title}`,
      },
    });

    return successResponse({ request: newRequest });
  } catch (error) {
    console.error("[ACCESS REQUEST POST ERROR]", error);
    return errorResponse("Failed to create access request", 500);
  }
}

// PATCH /api/ai/access-requests - Admin reviews (APPROVE / REJECT)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    // Strictly restricted to Admin/HOD
    if (user.role !== "admin" && user.role !== "hod") {
      return errorResponse("Forbidden: Only administrators can approve access requests", 403);
    }

    const body = await request.json();
    const { requestId, status, reviewReason, expiresAt } = body;

    if (!requestId || !["APPROVED", "REJECTED"].includes(status)) {
      return errorResponse("Valid requestId and status ('APPROVED' | 'REJECTED') are required", 400);
    }

    const accessReq = await prisma.aiAccessRequest.findUnique({
      where: { id: requestId },
      include: { document: true, user: true },
    });

    if (!accessReq) {
      return errorResponse("Access request not found", 404);
    }

    let parsedExpiresAt: Date | null = null;
    if (status === "APPROVED" && expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (isNaN(parsedExpiresAt.getTime()) || parsedExpiresAt.getTime() <= Date.now()) {
        return errorResponse("Expiration date and time must be a valid future timestamp", 400);
      }
    }

    // Update request record
    const updated = await prisma.aiAccessRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewReason: reviewReason || (status === "APPROVED" ? "Approved by Admin" : "Rejected by Admin"),
      },
    });

    // If APPROVED: Provision the official AccessGrant in the database
    let createdGrant = null;
    if (status === "APPROVED") {
      createdGrant = await prisma.accessGrant.create({
        data: {
          userId: accessReq.userId,
          documentId: accessReq.documentId,
          grantedById: user.id,
          status: "active",
          expiresAt: parsedExpiresAt,
          reason: `Approved from AI Access Request: ${reviewReason || "Admin approval"}`,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          documentId: accessReq.documentId,
          action: "grant_access",
          decision: "allowed",
          reason: `Admin approved AI Access Request for user ${accessReq.user.email}`,
        },
      });
    } else {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          documentId: accessReq.documentId,
          action: "access_request_rejected",
          decision: "denied",
          reason: reviewReason || "Admin rejected AI Access Request",
        },
      });
    }

    return successResponse({
      request: updated,
      grant: createdGrant,
    });
  } catch (error) {
    console.error("[ACCESS REQUEST REVIEW ERROR]", error);
    return errorResponse("Failed to review access request", 500);
  }
}
