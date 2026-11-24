import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, generateStorageKey } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit";
import { encryptDocument } from "@/lib/crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// POST /api/documents/attach - Upload and encrypt a document to attach to a message
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || (file?.name ?? "Attachment");
    const classification = (formData.get("classification") as string) || "internal";

    if (!file) {
      return errorResponse("No file provided", 400);
    }

    // Validate file extension
    const ext = path.extname(file.name).toLowerCase();
    const ALLOWED_EXTS = [".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg"];
    if (!ALLOWED_EXTS.includes(ext)) {
      return errorResponse(
        `Unsupported file type '${ext || "unknown"}'. Allowed formats: PDF, DOC, DOCX, TXT, PNG, JPG.`,
        400
      );
    }

    // Validate file size (15MB limit)
    const MAX_SIZE_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      return errorResponse("File size exceeds the 15MB maximum limit.", 400);
    }
    if (file.size === 0) {
      return errorResponse("Cannot upload empty file.", 400);
    }

    // Determine department
    let departmentId = currentUser.departmentId;
    if (!departmentId) {
      const defaultDept = await prisma.department.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (!defaultDept) return errorResponse("No campus department configured", 500);
      departmentId = defaultDept.id;
    }

    const storageKey = generateStorageKey(file.name);
    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });

    // Read plaintext buffer
    const plaintextBuffer = Buffer.from(await file.arrayBuffer());

    // AES-256-GCM encryption with unique IV and SHA-256 integrity hash
    const { encryptedBuffer, sha256 } = await encryptDocument(plaintextBuffer);

    // Save encrypted file to storage
    const filePath = path.join(uploadDir, storageKey);
    await writeFile(filePath, encryptedBuffer);

    // Create Document record
    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        description: `Uploaded attachment by ${currentUser.name} (${currentUser.role.toUpperCase()})`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        storageKey,
        classification,
        discoverability: "RESTRICTED",
        departmentId,
        uploadedById: currentUser.id,
      },
      include: {
        department: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Create active AccessGrant for owner
    await prisma.accessGrant.create({
      data: {
        userId: currentUser.id,
        documentId: document.id,
        grantedById: currentUser.id,
        status: "active",
        reason: "Owner access for attached message document",
      },
    });

    // Audit Log
    await logAuditEvent({
      userId: currentUser.id,
      documentId: document.id,
      action: "document_attachment_upload",
      decision: "allowed",
      reason: `User attached document '${file.name}' with AES-256-GCM encryption`,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        sha256,
      },
    });

    return successResponse({
      document: {
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        classification: document.classification,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error("[DOCUMENT ATTACH UPLOAD]", error);
    return errorResponse("Failed to upload and attach document", 500);
  }
}
