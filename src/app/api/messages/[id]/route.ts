import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { getMessageDetails } from "@/lib/messages/service";

export const dynamic = "force-dynamic";

// GET /api/messages/[id] - View specific message details
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
    const result = await getMessageDetails(id, user.id);

    if (!result.success) {
      return errorResponse(result.error || "Message not found", result.statusCode || 404);
    }

    return successResponse(result.data);
  } catch (error) {
    console.error("[MESSAGE DETAIL GET ERROR]", error);
    return errorResponse("Failed to fetch message details", 500);
  }
}
