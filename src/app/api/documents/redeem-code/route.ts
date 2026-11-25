import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { redeemOneTimeAccessCode } from "@/lib/security/accessCodes";

export const dynamic = "force-dynamic";

// POST /api/documents/redeem-code - Redeem a one-time document access code
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required to redeem access code", 401);
    }

    const body = await request.json();
    const { code, documentId } = body;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return errorResponse("Access code is required", 400);
    }

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const result = await redeemOneTimeAccessCode({
      code: code.trim(),
      userId: user.id,
      documentId,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return errorResponse(result.error || "Failed to redeem code", result.statusCode || 400);
    }

    return successResponse(result);
  } catch (error) {
    console.error("[REDEEM CODE API ERROR]", error);
    return errorResponse("Failed to redeem access code", 500);
  }
}
