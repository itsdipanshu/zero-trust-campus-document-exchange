import { NextRequest } from "next/server";
import prisma, { classifyDatabaseError } from "@/lib/db";
import { verifyPassword, generateToken } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import { onSecurityEvent } from "@/lib/security/authorization";
import { supabaseSignIn } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse("Email and password are required", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { department: true },
    });

    if (!user) {
      await onSecurityEvent({
        type: "login_failed",
        details: { email, reason: "User not found" },
        timestamp: new Date(),
      });
      return errorResponse("Invalid credentials", 401);
    }

    if (user.status !== "active") {
      await onSecurityEvent({
        type: "login_blocked",
        userId: user.id,
        details: { reason: `Account ${user.status}` },
        timestamp: new Date(),
      });
      return errorResponse("Account is not active", 403);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // Check if user was registered directly via Supabase Auth
      const sbResult = await supabaseSignIn(email, password);
      if (!sbResult.user) {
        await onSecurityEvent({
          type: "login_failed",
          userId: user.id,
          details: { reason: "Invalid password" },
          timestamp: new Date(),
        });
        return errorResponse("Invalid credentials", 401);
      }
    } else {
      // Keep Supabase Auth session in sync
      supabaseSignIn(email, password).catch(() => {});
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    });

    await logAuditEvent({
      userId: user.id,
      action: "login",
      decision: "allowed",
      reason: "Successful login",
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
    });

    const response = successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        status: user.status,
      },
      token,
    });

    response.cookies.set("campusvault_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("[LOGIN]", error);
    const msg = error?.message || "";
    if (msg.includes("AUTH_CONFIG_ERROR") || msg.includes("JWT_SECRET")) {
      return errorResponse("Authentication configuration error: JWT_SECRET is not configured properly in hosting environment variables.", 500);
    }
    const dbDiag = classifyDatabaseError(error);
    if (dbDiag) {
      return errorResponse(dbDiag, 500);
    }
    return errorResponse(`Login failed: ${msg || "Internal server error"}`, 500);
  }
}
