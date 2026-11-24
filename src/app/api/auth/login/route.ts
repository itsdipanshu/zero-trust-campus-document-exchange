import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword, generateToken } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import { onSecurityEvent } from "@/lib/security/authorization";

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
      await onSecurityEvent({
        type: "login_failed",
        userId: user.id,
        details: { reason: "Invalid password" },
        timestamp: new Date(),
      });
      return errorResponse("Invalid credentials", 401);
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
  } catch (error) {
    console.error("[LOGIN]", error);
    return errorResponse("Login failed", 500);
  }
}
