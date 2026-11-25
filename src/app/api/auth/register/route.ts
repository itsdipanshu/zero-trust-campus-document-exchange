import { NextRequest } from "next/server";
import prisma, { classifyDatabaseError } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import { supabaseSignUp, syncUserProfileToSupabase } from "@/lib/supabase";

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
    let department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      // Gracefully resolve if submitted via fallback identifier
      const fallbackList = [
        { name: "Computer Science", description: "Department of Computer Science and Engineering" },
        { name: "Information Technology", description: "Department of Information Technology" },
        { name: "Electronics and Communication", description: "Department of Electronics and Communication Engineering" },
        { name: "Mechanical Engineering", description: "Department of Mechanical Engineering" },
        { name: "Civil Engineering", description: "Department of Civil Engineering" },
        { name: "Business Administration", description: "Department of Business Administration and Management" },
        { name: "Applied Sciences", description: "Department of Applied Sciences and Humanities" },
        { name: "Administration", description: "Campus Administration and System Governance" },
      ];
      const match = fallbackList.find(
        (d, idx) => `dept-fallback-0${idx + 1}` === departmentId || d.name.toLowerCase() === departmentId.toLowerCase()
      );
      if (match) {
        department = await prisma.department.upsert({
          where: { name: match.name },
          update: {},
          create: match,
        });
      }
    }

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

    // Dual-Auth Sync: Register user in Supabase Auth & Cloud Profiles
    try {
      await supabaseSignUp(cleanEmail, password, {
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
      });
      await syncUserProfileToSupabase({
        id: user.id,
        fullName: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        status: user.status,
      });
    } catch (sbErr) {
      console.warn("[SUPABASE AUTH REGISTRATION]", sbErr);
    }

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
  } catch (error: any) {
    console.error("[REGISTER]", error);
    const msg = error?.message || "";
    if (msg.includes("AUTH_CONFIG_ERROR") || msg.includes("JWT_SECRET")) {
      return errorResponse("Authentication configuration error: JWT_SECRET is not configured properly in hosting environment variables.", 500);
    }
    const dbDiag = classifyDatabaseError(error);
    if (dbDiag) {
      return errorResponse(dbDiag, 500);
    }
    return errorResponse(`Registration failed: ${msg || "Please try again."}`, 500);
  }
}
