import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, generateStorageKey } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import { encryptDocument } from "@/lib/crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// GET /api/documents - List documents with strict role-based visibility
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const classification = searchParams.get("classification") || "";
    const departmentId = searchParams.get("departmentId") || "";

    const andConditions: Record<string, unknown>[] = [];

    // ================================================================
    // ROLE-BASED VISIBILITY SCOPE (SERVER-SIDE ENFORCED)
    // - Admin / HOD: Views all campus documents
    // - Faculty: Views own uploaded documents, public, department internal, or granted docs
    // - Student: Views ONLY public documents or documents with active access grant
    // ================================================================
    if (currentUser.role === "student") {
      andConditions.push({
        OR: [
          { uploadedById: currentUser.id },
          { classification: "public" },
          {
            accessGrants: {
              some: {
                userId: currentUser.id,
                status: "active",
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        ],
      });
    } else if (currentUser.role === "faculty") {
      const facultyOr: Record<string, unknown>[] = [
        { uploadedById: currentUser.id },
        { classification: "public" },
        {
          accessGrants: {
            some: {
              userId: currentUser.id,
              status: "active",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        },
      ];

      if (currentUser.departmentId) {
        facultyOr.push({
          departmentId: currentUser.departmentId,
          classification: "internal",
        });
      }

      andConditions.push({ OR: facultyOr });
    }

    // Search filters
    if (search) {
      andConditions.push({
        OR: [
          { title: { contains: search } },
          { description: { contains: search } },
        ],
      });
    }

    if (classification) andConditions.push({ classification });
    if (departmentId) andConditions.push({ departmentId });

    const where: Record<string, unknown> =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          department: true,
          uploadedBy: { select: { id: true, name: true, email: true } },
          _count: { select: { accessGrants: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.document.count({ where }),
    ]);

    return successResponse({
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        department: doc.department,
        classification: doc.classification,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedBy: doc.uploadedBy,
        grantCount: doc._count.accessGrants,
        createdAt: doc.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[DOCUMENTS GET]", error);
    return errorResponse("Failed to fetch documents", 500);
  }
}

// POST /api/documents - Upload document (Admin & Faculty only; Students FORBIDDEN)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    // Strict Role Permission: Students can NEVER upload documents
    if (currentUser.role === "student") {
      return errorResponse("Forbidden: Student accounts are not permitted to upload documents", 403);
    }

    if (!["admin", "faculty", "hod"].includes(currentUser.role)) {
      return errorResponse("Forbidden: Insufficient privileges to upload documents", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const departmentId = formData.get("departmentId") as string;
    const classification = formData.get("classification") as string;
    const discoverabilityParam = formData.get("discoverability") as string;
    const discoverability = discoverabilityParam || 
      (["confidential", "restricted"].includes(classification) ? "RESTRICTED" : "DEPARTMENT_DISCOVERABLE");

    if (!file || !title || !departmentId) {
      return errorResponse("File, title, and department are required", 400);
    }

    // Validate department
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) return errorResponse("Department not found", 400);

    const storageKey = generateStorageKey(file.name);
    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });

    // Read plaintext buffer
    const plaintextBuffer = Buffer.from(await file.arrayBuffer());

    // AES-256-GCM encryption with unique IV
    const { encryptedBuffer, sha256 } = await encryptDocument(plaintextBuffer);

    // Write encrypted buffer to storage
    const filePath = path.join(uploadDir, storageKey);
    await writeFile(filePath, encryptedBuffer);

    // Create document record
    const document = await prisma.document.create({
      data: {
        title,
        description: description || null,
        departmentId,
        classification: classification || "internal",
        discoverability,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        storageKey,
        uploadedById: currentUser.id,
      },
      include: {
        department: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logAuditEvent({
      userId: currentUser.id,
      documentId: document.id,
      action: "upload",
      decision: "allowed",
      reason: `Uploaded encrypted document: ${title}`,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        classification,
        sha256,
        encryption: "AES-256-GCM",
      },
    });

    return successResponse(
      {
        document: {
          id: document.id,
          title: document.title,
          description: document.description,
          department: document.department,
          classification: document.classification,
          fileName: document.fileName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          uploadedBy: document.uploadedBy,
          createdAt: document.createdAt,
        },
      },
      201
    );
  } catch (error) {
    console.error("[DOCUMENTS POST]", error);
    return errorResponse("Failed to upload document", 500);
  }
}
