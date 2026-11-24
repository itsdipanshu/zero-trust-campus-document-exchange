import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("Not authenticated", 401);
    }

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        departmentId: user.departmentId,
        status: user.status,
        websiteLanguage: (user as any).websiteLanguage || "en",
        aiLanguage: (user as any).aiLanguage || "auto",
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[ME]", error);
    return errorResponse("Failed to get user", 500);
  }
}
