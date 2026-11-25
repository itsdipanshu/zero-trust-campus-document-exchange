import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { createReAccessTicket } from "@/lib/security/accessCodes";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/documents/tickets - List re-access tickets
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const scope = request.nextUrl.searchParams.get("scope"); // "mine" | "received" | "all"
    const status = request.nextUrl.searchParams.get("status");

    const where: any = {};
    if (status) {
      where.status = status;
    }

    // Role-scoped visibility
    if (user.role === "student" || scope === "mine") {
      where.requesterId = user.id;
    } else if (scope === "received" || (user.role === "faculty" && scope !== "all")) {
      where.documentOwnerId = user.id;
    } else if (user.role === "admin" || user.role === "hod") {
      // Admin and HOD can view all or filter by department
      if (user.role === "hod") {
        where.document = { departmentId: user.departmentId };
      }
    }

    const tickets = await prisma.documentAccessTicket.findMany({
      where,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            classification: true,
            department: { select: { id: true, name: true } },
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: { select: { name: true } },
          },
        },
        documentOwner: {
          select: { id: true, name: true, email: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse({ tickets });
  } catch (error) {
    console.error("[TICKETS GET ERROR]", error);
    return errorResponse("Failed to fetch tickets", 500);
  }
}

// POST /api/documents/tickets - Create re-access request ticket with mandatory explanation
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json();
    const { documentId, reason } = body;

    if (!documentId) {
      return errorResponse("documentId is required", 400);
    }

    // MANDATORY REASON VALIDATION
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return errorResponse(
        "Why do you need access to this document again? Please explain your reason. A non-empty reason is mandatory.",
        400
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const result = await createReAccessTicket({
      documentId,
      requesterId: user.id,
      reason: reason.trim(),
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return errorResponse(result.error || "Failed to create ticket", result.statusCode || 400);
    }

    return successResponse(result, 201);
  } catch (error) {
    console.error("[TICKETS POST ERROR]", error);
    return errorResponse("Failed to create re-access ticket", 500);
  }
}
