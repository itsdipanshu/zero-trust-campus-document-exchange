import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { createSecureMessage, getUserMessages } from "@/lib/messages/service";

export const dynamic = "force-dynamic";

// GET /api/messages - Retrieve user's private inbox and sent messages
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const messages = await getUserMessages(user.id);
    return successResponse(messages);
  } catch (error) {
    console.error("[MESSAGES GET ERROR]", error);
    return errorResponse("Failed to fetch messages", 500);
  }
}

// POST /api/messages - Send secure account-to-account message
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json();
    const result = await createSecureMessage(user, body);

    if (!result.success) {
      return errorResponse(result.error || "Failed to send message", result.statusCode || 400);
    }

    return successResponse(result.data, 201);
  } catch (error) {
    console.error("[MESSAGES POST ERROR]", error);
    return errorResponse("Failed to transmit secure message", 500);
  }
}
