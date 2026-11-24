import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/departments - List all departments (accessible publicly for signup and for dashboard)
export async function GET() {
  try {
    const departments = await prisma.department.findMany({
      include: {
        _count: { select: { users: true, documents: true } },
      },
      orderBy: { name: "asc" },
    });

    return successResponse({ departments });
  } catch (error) {
    console.error("[DEPARTMENTS GET]", error);
    return errorResponse("Failed to fetch departments", 500);
  }
}

// POST /api/departments - Create department (Admin only)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);
    if (currentUser.role !== "admin") {
      return errorResponse("Forbidden: Only administrators can create departments", 403);
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) return errorResponse("Department name is required", 400);

    const existing = await prisma.department.findUnique({ where: { name } });
    if (existing) return errorResponse("Department already exists", 409);

    const department = await prisma.department.create({
      data: { name, description: description || null },
    });

    return successResponse({ department }, 201);
  } catch (error) {
    console.error("[DEPARTMENTS POST]", error);
    return errorResponse("Failed to create department", 500);
  }
}
