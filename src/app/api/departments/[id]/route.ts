import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/departments/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const { id } = await params;
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, documents: true } },
      },
    });

    if (!department) return errorResponse("Department not found", 404);

    return successResponse({ department });
  } catch (error) {
    console.error("[DEPARTMENT GET]", error);
    return errorResponse("Failed to fetch department", 500);
  }
}

// PATCH /api/departments/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);
    if (currentUser.role !== "admin") return errorResponse("Forbidden", 403);

    const { id } = await params;
    const body = await request.json();

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
      },
    });

    return successResponse({ department });
  } catch (error) {
    console.error("[DEPARTMENT PATCH]", error);
    return errorResponse("Failed to update department", 500);
  }
}

// DELETE /api/departments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);
    if (currentUser.role !== "admin") return errorResponse("Forbidden", 403);

    const { id } = await params;

    // Check if department has users or documents
    const counts = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true, documents: true } } },
    });

    if (!counts) return errorResponse("Department not found", 404);
    if (counts._count.users > 0 || counts._count.documents > 0) {
      return errorResponse(
        "Cannot delete department with existing users or documents",
        400
      );
    }

    await prisma.department.delete({ where: { id } });
    return successResponse({ message: "Department deleted" });
  } catch (error) {
    console.error("[DEPARTMENT DELETE]", error);
    return errorResponse("Failed to delete department", 500);
  }
}
