import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/ai/sessions - List chat sessions for authenticated user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const sessions = await prisma.aiChatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
      take: 30,
    });

    return successResponse({
      sessions: sessions.map((s: any) => ({
        id: s.id,
        title: s.title,
        messageCount: s._count.messages,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[AI SESSIONS GET ERROR]", error);
    return errorResponse("Failed to fetch sessions", 500);
  }
}

// POST /api/ai/sessions - Create new chat session
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json().catch(() => ({}));
    const title = body.title || "Campus Document Inquiry";

    const session = await prisma.aiChatSession.create({
      data: {
        userId: user.id,
        title,
      },
    });

    return successResponse({ session });
  } catch (error) {
    console.error("[AI SESSIONS POST ERROR]", error);
    return errorResponse("Failed to create session", 500);
  }
}

// PATCH /api/ai/sessions - Rename chat session
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json();
    const { id, title } = body;

    if (!id || !title || !title.trim()) {
      return errorResponse("Session ID and title are required", 400);
    }

    // PRIVACY: Ensure session belongs to authenticated user
    const existing = await prisma.aiChatSession.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return errorResponse("Session not found or unauthorized", 404);
    }

    const updated = await prisma.aiChatSession.update({
      where: { id },
      data: { title: title.trim(), updatedAt: new Date() },
    });

    return successResponse({ session: updated });
  } catch (error) {
    console.error("[AI SESSIONS PATCH ERROR]", error);
    return errorResponse("Failed to rename session", 500);
  }
}

// DELETE /api/ai/sessions?id=... - Delete chat session or clear all
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      await prisma.aiChatSession.deleteMany({
        where: { id, userId: user.id },
      });
      return successResponse({ message: "Session deleted" });
    }

    // Clear all user's sessions
    await prisma.aiChatSession.deleteMany({
      where: { userId: user.id },
    });
    return successResponse({ message: "All sessions cleared" });
  } catch (error) {
    console.error("[AI SESSIONS DELETE ERROR]", error);
    return errorResponse("Failed to delete session", 500);
  }
}
