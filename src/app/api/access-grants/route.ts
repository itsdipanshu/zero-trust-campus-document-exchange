import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";

// GET /api/access-grants - List grants with role-based visibility
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "";
    const documentId = searchParams.get("documentId") || "";
    const userId = searchParams.get("userId") || "";

    const andConditions: Record<string, unknown>[] = [];

    // ================================================================
    // ROLE-BASED VISIBILITY FOR ACCESS GRANTS
    // - Students can ONLY see their own grants
    // - Faculty can see their own grants or grants on docs they uploaded
    // - Admin / HOD can view all grants
    // ================================================================
    if (currentUser.role === "student") {
      andConditions.push({ userId: currentUser.id });
    } else if (currentUser.role === "faculty") {
      andConditions.push({
        OR: [
          { userId: currentUser.id },
          { document: { uploadedById: currentUser.id } },
        ],
      });
    } else {
      if (userId) andConditions.push({ userId });
    }

    if (status) andConditions.push({ status });
    if (documentId) andConditions.push({ documentId });

    const where: Record<string, unknown> =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [grants, total] = await Promise.all([
      prisma.accessGrant.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          document: {
            select: {
              id: true,
              title: true,
              classification: true,
              department: true,
            },
          },
          grantedBy: { select: { id: true, name: true, email: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.accessGrant.count({ where }),
    ]);

    return successResponse({
      grants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[GRANTS GET]", error);
    return errorResponse("Failed to fetch grants", 500);
  }
}

// POST /api/access-grants - Create a grant (Admin / HOD only; Students and unauthorized Faculty FORBIDDEN)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    // Strict Role Permission: Only Admin and HOD can grant document access
    if (currentUser.role !== "admin" && currentUser.role !== "hod") {
      return errorResponse("Forbidden: Only administrators can grant document access", 403);
    }

    const body = await request.json();
    const { userId, documentId, expiresAt, reason } = body;

    if (!userId || !documentId) {
      return errorResponse("userId and documentId are required", 400);
    }

    // Validate user exists
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return errorResponse("User not found", 404);

    // Validate document exists
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return errorResponse("Document not found", 404);

    // Check for existing active grant
    const existingGrant = await prisma.accessGrant.findFirst({
      where: { userId, documentId, status: "active" },
    });
    if (existingGrant) {
      return errorResponse("User already has an active grant for this document", 409);
    }

    const grant = await prisma.accessGrant.create({
      data: {
        userId,
        documentId,
        status: "active",
        grantedById: currentUser.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        reason: reason || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        document: { select: { id: true, title: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logAuditEvent({
      userId: currentUser.id,
      documentId,
      action: "grant_access",
      decision: "allowed",
      reason: `Granted access to ${targetUser.email}`,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
      metadata: { grantId: grant.id, targetUserId: userId, expiresAt },
    });

    return successResponse({ grant }, 201);
  } catch (error) {
    console.error("[GRANTS POST]", error);
    return errorResponse("Failed to create grant", 500);
  }
}
