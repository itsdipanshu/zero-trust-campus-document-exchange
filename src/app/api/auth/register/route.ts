import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, role, departmentId } = body;

    // Strict validation
    if (!name || !email || !password) {
      return errorResponse("Full Name, Email, and Password are required", 400);
    }

    if (!departmentId) {
      return errorResponse("Department selection is mandatory", 400);
    }

    if (password.length < 6) {
      return errorResponse("Password must be at least 6 characters long", 400);
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if email already registered
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return errorResponse("Email is already registered. Please sign in.", 409);
    }

    // Validate that the selected department actually exists in the database
    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return errorResponse("Invalid department selected. Please choose a valid campus department.", 400);
    }

    // Role Security: Public registration can NEVER self-assign 'admin' or 'hod' privileges
    let verifiedRole = "student";
    if (role === "faculty") {
      verifiedRole = "faculty";
    }

    // Hash with Argon2id
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: verifiedRole,
        departmentId: department.id,
        status: "active",
      },
      include: { department: true },
    });

    // Generate JWT token with confirmed departmentId
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    });

    await logAuditEvent({
      userId: user.id,
      action: "register",
      decision: "allowed",
      reason: `New ${user.role} registration for department: ${department.name}`,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
      metadata: { department: department.name, role: user.role },
    });

    const response = successResponse(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          departmentId: user.departmentId,
          status: user.status,
        },
        token,
      },
      201
    );

    response.cookies.set("campusvault_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400, // 24 hours
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[REGISTER]", error);
    return errorResponse("Registration failed. Please try again.", 500);
  }
}
