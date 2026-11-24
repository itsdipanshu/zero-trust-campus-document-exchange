import prisma from "../db";

export interface UserContext {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  status: string;
}

export interface SafeDocumentMetadata {
  id: string;
  title: string;
  description: string | null;
  departmentName: string;
  classification: string;
  discoverability: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  accessStatus: "ACTIVE_GRANT" | "MISSING_GRANT" | "PENDING_REQUEST" | "EXPIRED_GRANT" | "REVOKED_GRANT" | "PUBLIC_ACCESS";
  hasActiveAccess: boolean;
  canRequestAccess: boolean;
  uploadedBy?: string; // ONLY populated for Admin or document owner! NEVER for students!
}

export interface SafeGrantMetadata {
  id: string;
  documentId: string;
  documentTitle: string;
  documentClassification: string;
  departmentName: string;
  status: string;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  createdAt: string;
}

export interface SafeAccessRequestMetadata {
  id: string;
  documentId: string;
  documentTitle: string;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
}

/**
 * 1. getMyDocuments: Retrieves documents the user is strictly authorized to access.
 * - Admin: sees all documents.
 * - Faculty: sees own uploads + department internal + public + active grants.
 * - Student: sees ONLY public documents + active unexpired grants.
 */
export async function getMyDocuments(user: UserContext): Promise<SafeDocumentMetadata[]> {
  const now = new Date();

  if (user.role === "admin" || user.role === "hod") {
    const docs = await prisma.document.findMany({
      include: { department: true, uploadedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return docs.map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      departmentName: d.department.name,
      classification: d.classification,
      discoverability: d.discoverability,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      createdAt: d.createdAt.toISOString(),
      accessStatus: "ACTIVE_GRANT",
      hasActiveAccess: true,
      canRequestAccess: false,
      uploadedBy: `${d.uploadedBy.name} (${d.uploadedBy.email})`,
    }));
  }

  if (user.role === "faculty") {
    const userGrants = await prisma.accessGrant.findMany({
      where: {
        userId: user.id,
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { documentId: true },
    });
    const grantedDocIds = userGrants.map((g: any) => g.documentId);

    const docs = await prisma.document.findMany({
      where: {
        OR: [
          { uploadedById: user.id },
          { classification: "public" },
          { id: { in: grantedDocIds } },
          ...(user.departmentId
            ? [{ departmentId: user.departmentId, classification: "internal" }]
            : []),
        ],
      },
      include: { department: true, uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((d: any) => {
      const isOwner = d.uploadedBy.id === user.id;
      return {
        id: d.id,
        title: d.title,
        description: d.description,
        departmentName: d.department.name,
        classification: d.classification,
        discoverability: d.discoverability,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        createdAt: d.createdAt.toISOString(),
        accessStatus: "ACTIVE_GRANT",
        hasActiveAccess: true,
        canRequestAccess: false,
        // Only disclose uploader if it's the faculty member themselves
        uploadedBy: isOwner ? "You (Owner)" : undefined,
      };
    });
  }

  // Student role: Strictly scoped
  const activeGrants = await prisma.accessGrant.findMany({
    where: {
      userId: user.id,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { documentId: true },
  });
  const grantedDocIds = activeGrants.map((g: any) => g.documentId);

  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { classification: "public" },
        { id: { in: grantedDocIds } },
      ],
    },
    include: { department: true },
    orderBy: { createdAt: "desc" },
  });

  return docs.map((d: any) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    departmentName: d.department.name,
    classification: d.classification,
    discoverability: d.discoverability,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    createdAt: d.createdAt.toISOString(),
    accessStatus: d.classification === "public" ? "PUBLIC_ACCESS" : "ACTIVE_GRANT",
    hasActiveAccess: true,
    canRequestAccess: false,
    uploadedBy: undefined, // NEVER expose uploader to students!
  }));
}

/**
 * 2. getDiscoverableDepartmentDocuments:
 * Identifies documents relevant to the user's department and flags missing grants.
 * - Respects discoverability: DEPARTMENT_DISCOVERABLE (eligible), PRIVATE (no), RESTRICTED (no unless admin).
 * - Distinguishes between: GRANTED, MISSING_GRANT, PENDING_REQUEST, EXPIRED, REVOKED.
 * - NEVER reveals uploader identity or recipient list to students.
 */
export async function getDiscoverableDepartmentDocuments(user: UserContext): Promise<SafeDocumentMetadata[]> {
  if (!user.departmentId && user.role !== "admin") {
    return [];
  }

  const now = new Date();

  // Find department documents
  const whereClause: any = {};
  if (user.role !== "admin" && user.role !== "hod") {
    whereClause.departmentId = user.departmentId;
    whereClause.discoverability = { in: ["DEPARTMENT_DISCOVERABLE"] };
  } else if (user.departmentId) {
    whereClause.departmentId = user.departmentId;
  }

  const deptDocs = await prisma.document.findMany({
    where: whereClause,
    include: {
      department: true,
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch all grants and requests for this user
  const userGrants = await prisma.accessGrant.findMany({
    where: { userId: user.id },
  });
  const userRequests = await prisma.aiAccessRequest.findMany({
    where: { userId: user.id },
  });

  const grantsMap = new Map<string, any>();
  userGrants.forEach((g: any) => grantsMap.set(g.documentId, g));

  const requestsMap = new Map<string, any>();
  userRequests.forEach((r: any) => requestsMap.set(r.documentId, r));

  return deptDocs.map((doc: any) => {
    const grant = grantsMap.get(doc.id);
    const req = requestsMap.get(doc.id);

    let accessStatus: SafeDocumentMetadata["accessStatus"] = "MISSING_GRANT";
    let hasActiveAccess = false;
    let canRequestAccess = true;

    if (user.role === "admin" || user.role === "hod") {
      accessStatus = "ACTIVE_GRANT";
      hasActiveAccess = true;
      canRequestAccess = false;
    } else if (doc.classification === "public") {
      accessStatus = "PUBLIC_ACCESS";
      hasActiveAccess = true;
      canRequestAccess = false;
    } else if (grant) {
      if (grant.status === "revoked") {
        accessStatus = "REVOKED_GRANT";
        hasActiveAccess = false;
        canRequestAccess = true;
      } else if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
        accessStatus = "EXPIRED_GRANT";
        hasActiveAccess = false;
        canRequestAccess = true;
      } else if (grant.status === "active") {
        accessStatus = "ACTIVE_GRANT";
        hasActiveAccess = true;
        canRequestAccess = false;
      }
    } else if (req && req.status === "PENDING") {
      accessStatus = "PENDING_REQUEST";
      hasActiveAccess = false;
      canRequestAccess = false;
    }

    const isOwner = doc.uploadedById === user.id;
    const canSeeUploader = user.role === "admin" || user.role === "hod" || isOwner;

    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      departmentName: doc.department.name,
      classification: doc.classification,
      discoverability: doc.discoverability,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt.toISOString(),
      accessStatus,
      hasActiveAccess,
      canRequestAccess,
      uploadedBy: canSeeUploader ? (isOwner ? "You (Owner)" : doc.uploadedBy.name) : undefined,
    };
  });
}

/**
 * 3. getMyAccessGrants: Retrieves user's own grants.
 */
export async function getMyAccessGrants(user: UserContext): Promise<SafeGrantMetadata[]> {
  const grants = await prisma.accessGrant.findMany({
    where: { userId: user.id },
    include: {
      document: {
        include: { department: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return grants.map((g: any) => ({
    id: g.id,
    documentId: g.document.id,
    documentTitle: g.document.title,
    documentClassification: g.document.classification,
    departmentName: g.document.department.name,
    status: g.status,
    expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
    revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
    reason: g.reason,
    createdAt: g.createdAt.toISOString(),
  }));
}

/**
 * 4. getMyAccessHistory: User's own access activity.
 */
export async function getMyAccessHistory(user: UserContext): Promise<any[]> {
  const logs = await prisma.auditLog.findMany({
    where: { userId: user.id },
    include: { document: { select: { title: true } } },
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  return logs.map((l: any) => ({
    action: l.action,
    decision: l.decision,
    documentTitle: l.document?.title || "System Operation",
    timestamp: l.timestamp.toISOString(),
    reason: l.reason,
  }));
}

/**
 * 5. getMyPendingAccessRequests: User's pending access requests.
 */
export async function getMyPendingAccessRequests(user: UserContext): Promise<SafeAccessRequestMetadata[]> {
  const requests = await prisma.aiAccessRequest.findMany({
    where: { userId: user.id },
    include: { document: true },
    orderBy: { requestedAt: "desc" },
  });

  return requests.map((r: any) => ({
    id: r.id,
    documentId: r.document.id,
    documentTitle: r.document.title,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewReason: r.reviewReason,
  }));
}

/**
 * 6. getAdminSecuritySummary: Strictly for Admin/HOD roles.
 */
export async function getAdminSecuritySummary(user: UserContext): Promise<any> {
  if (user.role !== "admin" && user.role !== "hod") {
    throw new Error("UNAUTHORIZED_ADMIN_SUMMARY_ACCESS");
  }

  const [totalDocs, totalGrants, activeGrants, revokedGrants, totalUsers, pendingRequests, recentEvents] =
    await Promise.all([
      prisma.document.count(),
      prisma.accessGrant.count(),
      prisma.accessGrant.count({ where: { status: "active" } }),
      prisma.accessGrant.count({ where: { status: "revoked" } }),
      prisma.user.count(),
      prisma.aiAccessRequest.count({ where: { status: "PENDING" } }),
      prisma.auditLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 10,
        include: { user: { select: { name: true, email: true, role: true } }, document: { select: { title: true } } },
      }),
    ]);

  const departments = await prisma.department.findMany({
    include: {
      _count: { select: { documents: true, users: true } },
    },
  });

  return {
    totalDocuments: totalDocs,
    totalGrants,
    activeGrants,
    revokedGrants,
    totalUsers,
    pendingAccessRequests: pendingRequests,
    departmentCounts: departments.map((d: any) => ({
      name: d.name,
      documentCount: d._count.documents,
      userCount: d._count.users,
    })),
    recentAuditLogs: recentEvents.map((e: any) => ({
      action: e.action,
      decision: e.decision,
      userName: e.user.name,
      userEmail: e.user.email,
      documentTitle: e.document?.title || null,
      timestamp: e.timestamp.toISOString(),
    })),
  };
}
