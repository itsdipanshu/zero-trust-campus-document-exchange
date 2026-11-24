import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const { id } = await params;

    // Users can view their own profile; admin/hod can view anyone
    if (currentUser.id !== id && !["admin", "hod"].includes(currentUser.role)) {
      return errorResponse("Forbidden", 403);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { department: true },
    });

    if (!user) return errorResponse("User not found", 404);

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[USER GET]", error);
    return errorResponse("Failed to fetch user", 500);
  }
}

// PATCH /api/users/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const { id } = await params;
    const body = await request.json();

    // Users can update own profile; admins can update anyone
    const isSelf = currentUser.id === id;
    if (!isSelf && currentUser.role !== "admin") {
      return errorResponse("Forbidden", 403);
    }

    const updateData: Record<string, unknown> = {};

    if (body.name) updateData.name = body.name;
    if (body.password) updateData.passwordHash = await hashPassword(body.password);
    if (body.websiteLanguage) updateData.websiteLanguage = body.websiteLanguage;
    if (body.aiLanguage) updateData.aiLanguage = body.aiLanguage;

    // Only admin can change role, status, department
    if (currentUser.role === "admin") {
      if (body.role) updateData.role = body.role;
      if (body.status) updateData.status = body.status;
      if (body.departmentId !== undefined) updateData.departmentId = body.departmentId;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { department: true },
    });

    await logAuditEvent({
      userId: currentUser.id,
      action: "update_user",
      decision: "allowed",
      reason: `Updated user ${user.email}`,
      metadata: { targetUserId: id, fields: Object.keys(updateData) },
    });

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("[USER PATCH]", error);
    return errorResponse("Failed to update user", 500);
  }
}
