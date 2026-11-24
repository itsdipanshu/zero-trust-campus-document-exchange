import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { processAiMessage } from "@/lib/ai/engine";
import prisma from "@/lib/db";

// POST /api/ai/chat - Process user message in strictly authenticated user context
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required to interact with AI Assistant", 401);
    }

    const body = await request.json();
    const { prompt, sessionId, aiLanguage, attachedDocumentId } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return errorResponse("Message prompt is required", 400);
    }

    const response = await processAiMessage(
      prompt,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        department: user.department,
        status: user.status,
      },
      sessionId,
      aiLanguage || (user as any).aiLanguage,
      attachedDocumentId
    );

    return successResponse(response);
  } catch (error) {
    console.error("[AI CHAT API ERROR]", error);
    return errorResponse("Failed to process message with AI Assistant", 500);
  }
}

// GET /api/ai/chat?sessionId=... - Retrieve conversation history for verified user
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return errorResponse("Session ID is required", 400);
    }

    // PRIVACY: Ensure session strictly belongs to authenticated user
    const session = await prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return errorResponse("Chat session not found or unauthorized", 404);
    }

    return successResponse({
      sessionId: session.id,
      title: session.title,
      messages: session.messages.map((m: any) => ({
        id: m.id,
        role: m.messageRole,
        content: m.messageContent,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("[AI CHAT GET ERROR]", error);
    return errorResponse("Failed to fetch conversation history", 500);
  }
}
