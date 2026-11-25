import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { reviewReAccessTicket } from "@/lib/security/accessCodes";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/documents/tickets/[id] - Get ticket details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const { id } = await params;
    const ticket = await prisma.documentAccessTicket.findFirst({
      where: {
        OR: [{ id }, { ticketId: id }],
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            classification: true,
            department: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
          },
        },
        documentOwner: {
          select: { id: true, name: true, email: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
        accessCodes: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            usedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket) {
      return errorResponse("Ticket not found", 404);
    }

    // Tenant check: Requester, owner, or admin/hod
    const isRequester = ticket.requesterId === user.id;
    const isOwner = ticket.documentOwnerId === user.id;
    const isAdmin = user.role === "admin" || (user.role === "hod" && user.departmentId === ticket.document.department.id);

    if (!isRequester && !isOwner && !isAdmin) {
      return errorResponse("Forbidden: You do not have permission to view this ticket", 403);
    }

    return successResponse({ ticket });
  } catch (error) {
    console.error("[TICKET DETAILS GET ERROR]", error);
    return errorResponse("Failed to fetch ticket details", 500);
  }
}

// PATCH /api/documents/tickets/[id] - Owner or Admin reviews ticket (APPROVE / REJECT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const { id } = await params;
    const body = await request.json();
    const { action, rejectionReason, expiryHours } = body;

    if (!action || !["APPROVE", "REJECT"].includes(action)) {
      return errorResponse("Action must be either 'APPROVE' or 'REJECT'", 400);
    }

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const result = await reviewReAccessTicket({
      ticketId: id,
      reviewerId: user.id,
      action,
      rejectionReason,
      expiryHours: expiryHours ? Number(expiryHours) : 24,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return errorResponse(result.error || "Failed to process review", result.statusCode || 400);
    }

    return successResponse(result);
  } catch (error) {
    console.error("[TICKET REVIEW ERROR]", error);
    return errorResponse("Failed to review ticket", 500);
  }
}
