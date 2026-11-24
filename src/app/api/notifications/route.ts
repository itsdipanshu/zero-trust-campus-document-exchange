import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/notifications - List user's notifications + unread count
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return successResponse({ notifications, unreadCount });
  } catch (error) {
    console.error("[NOTIFICATIONS GET ERROR]", error);
    return errorResponse("Failed to fetch notifications", 500);
  }
}

// PATCH /api/notifications - Mark single or all notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json().catch(() => ({}));
    const { id, markAll } = body;

    if (markAll) {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return successResponse({ message: "All notifications marked as read" });
    }

    if (id) {
      await prisma.notification.updateMany({
        where: { id, userId: user.id },
        data: { isRead: true },
      });
      return successResponse({ message: "Notification marked as read" });
    }

    return errorResponse("Missing notification id or markAll parameter", 400);
  } catch (error) {
    console.error("[NOTIFICATIONS PATCH ERROR]", error);
    return errorResponse("Failed to update notification status", 500);
  }
}
