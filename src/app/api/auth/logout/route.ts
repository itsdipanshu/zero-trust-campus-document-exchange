import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (user) {
      await logAuditEvent({
        userId: user.id,
        action: "logout",
        decision: "allowed",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      });
    }

    const response = successResponse({ message: "Logged out" });
    response.cookies.set("campusvault_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[LOGOUT]", error);
    return errorResponse("Logout failed", 500);
  }
}
