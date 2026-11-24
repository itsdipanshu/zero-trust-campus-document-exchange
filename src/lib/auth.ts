import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import argon2 from "argon2";
import { cookies } from "next/headers";
import prisma from "./db";

const TOKEN_EXPIRY = "24h";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[AUTH_CONFIG_ERROR] JWT_SECRET environment variable is missing in production environment. A secure, random secret key is required."
      );
    }
    return "campusvault-default-secret";
  }
  if (process.env.NODE_ENV === "production" && (secret === "campusvault-default-secret" || secret.length < 32)) {
    throw new Error(
      "[AUTH_CONFIG_ERROR] Default or weak JWT_SECRET cannot be used in production environment. Configure a strong secret (min 32 chars)."
    );
  }
  return secret;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  departmentId: string | null;
}

/**
 * Hashes passwords using Argon2id (RFC 9106 recommended).
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifies passwords supporting both modern Argon2id and legacy Bcrypt hashes.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2")) {
      return await argon2.verify(hash, password);
    }
    // Fallback for existing seed / legacy bcrypt hashes
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("campusvault_token")?.value;

    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { department: true },
    });

    if (!user || user.status !== "active") return null;

    return user;
  } catch {
    return null;
  }
}

export function requireAuth(allowedRoles?: string[]) {
  return async () => {
    const user = await getCurrentUser();
    if (!user) {
      return { error: "Unauthorized", status: 401 };
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return { error: "Forbidden", status: 403 };
    }
    return { user };
  };
}
