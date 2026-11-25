import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { releaseOneTimeAccessCode } from "@/lib/security/accessCodes";

export const dynamic = "force-dynamic";

// POST /api/documents/release-code - Issue a one-time document access code
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    // Role check: Only faculty, hod, or admin can release document codes
    if (user.role === "student") {
      return errorResponse("Forbidden: Students cannot release document access codes", 403);
    }

    const body = await request.json();
    const { documentId, recipientUserId, expiresAtHours, expiresAt } = body;

    if (!documentId || !recipientUserId) {
      return errorResponse("documentId and recipientUserId are required", 400);
    }

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const result = await releaseOneTimeAccessCode({
      documentId,
      recipientUserId,
      createdById: user.id,
      expiresAtHours: expiresAtHours ? Number(expiresAtHours) : 24,
      expiresAt: expiresAt || undefined,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return errorResponse(result.error || "Failed to release access code", result.statusCode || 400);
    }

    return successResponse(result, 201);
  } catch (error) {
    console.error("[RELEASE CODE API ERROR]", error);
    return errorResponse("Failed to generate one-time access code", 500);
  }
}
