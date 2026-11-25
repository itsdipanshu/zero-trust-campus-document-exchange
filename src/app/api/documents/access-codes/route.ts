import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/documents/access-codes - List access codes for user or document owner
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    const type = request.nextUrl.searchParams.get("type") || "received"; // received | created

    const where: any = {};
    if (type === "created" && user.role !== "student") {
      where.createdById = user.id;
    } else {
      where.recipientUserId = user.id;
    }

    const codes = await prisma.documentAccessCode.findMany({
      where,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            classification: true,
          },
        },
        recipient: {
          select: { id: true, name: true, email: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse({ codes });
  } catch (error) {
    console.error("[ACCESS CODES GET ERROR]", error);
    return errorResponse("Failed to fetch access codes", 500);
  }
}
