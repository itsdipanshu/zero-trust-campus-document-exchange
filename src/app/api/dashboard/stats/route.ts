import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";

// GET /api/dashboard/stats - Real database metrics tailored by role
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const now = new Date();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // ================================================================
    // ADMIN DASHBOARD METRICS
    // ================================================================
    if (currentUser.role === "admin" || currentUser.role === "hod") {
      const [
        totalUsers,
        totalDocuments,
        totalDepartments,
        activeGrants,
        revokedOrExpiredGrants,
        recentSecurityEvents,
        documentsByClassification,
        recentDocuments,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.document.count(),
        prisma.department.count(),
        prisma.accessGrant.count({
          where: {
            status: "active",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        prisma.accessGrant.count({
          where: {
            OR: [{ status: "revoked" }, { status: "expired" }, { expiresAt: { lte: now } }],
          },
        }),
        prisma.auditLog.count({
          where: { timestamp: { gte: oneDayAgo } },
        }),
        prisma.document.groupBy({
          by: ["classification"],
          _count: { id: true },
        }),
        prisma.document.findMany({
          take: 6,
          orderBy: { createdAt: "desc" },
          include: {
            department: true,
            uploadedBy: { select: { name: true } },
          },
        }),
      ]);

      const classificationStats = documentsByClassification.reduce(
        (acc, item) => {
          acc[item.classification] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      );

      return successResponse({
        role: currentUser.role,
        stats: {
          totalUsers,
          totalDocuments,
          totalDepartments,
          activeGrants,
          revokedOrExpiredGrants,
          recentActivityCount: recentSecurityEvents,
          documentsByClassification: classificationStats,
        },
        recentDocuments: recentDocuments.map((doc) => ({
          id: doc.id,
          title: doc.title,
          classification: doc.classification,
          department: doc.department?.name,
          uploadedBy: doc.uploadedBy?.name,
          createdAt: doc.createdAt,
        })),
      });
    }

    // ================================================================
    // FACULTY DASHBOARD METRICS
    // ================================================================
    if (currentUser.role === "faculty") {
      const [
        myUploadedCount,
        myAuthorizedCount,
        departmentDocCount,
        recentFacultyActivity,
        myRecentUploads,
      ] = await Promise.all([
        prisma.document.count({ where: { uploadedById: currentUser.id } }),
        prisma.accessGrant.count({
          where: {
            userId: currentUser.id,
            status: "active",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        currentUser.departmentId
          ? prisma.document.count({ where: { departmentId: currentUser.departmentId } })
          : 0,
        prisma.auditLog.count({
          where: {
            userId: currentUser.id,
            timestamp: { gte: oneDayAgo },
          },
        }),
        prisma.document.findMany({
          where: {
            OR: [
              { uploadedById: currentUser.id },
              ...(currentUser.departmentId ? [{ departmentId: currentUser.departmentId }] : []),
            ],
          },
          take: 6,
          orderBy: { createdAt: "desc" },
          include: {
            department: true,
            uploadedBy: { select: { name: true } },
          },
        }),
      ]);

      return successResponse({
        role: "faculty",
        stats: {
          myUploadedCount,
          myAuthorizedCount,
          departmentDocCount,
          recentActivityCount: recentFacultyActivity,
        },
        recentDocuments: myRecentUploads.map((doc) => ({
          id: doc.id,
          title: doc.title,
          classification: doc.classification,
          department: doc.department?.name,
          uploadedBy: doc.uploadedBy?.name,
          createdAt: doc.createdAt,
        })),
      });
    }

    // ================================================================
    // STUDENT DASHBOARD METRICS
    // ================================================================
    const [
      activeGrantsCount,
      expiringSoonCount,
      publicDocumentsCount,
      studentActivityCount,
      accessibleDocs,
    ] = await Promise.all([
      prisma.accessGrant.count({
        where: {
          userId: currentUser.id,
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      prisma.accessGrant.count({
        where: {
          userId: currentUser.id,
          status: "active",
          expiresAt: { gt: now, lte: sevenDaysFromNow },
        },
      }),
      prisma.document.count({ where: { classification: "public" } }),
      prisma.auditLog.count({
        where: {
          userId: currentUser.id,
          timestamp: { gte: oneDayAgo },
        },
      }),
      prisma.document.findMany({
        where: {
          OR: [
            { classification: "public" },
            {
              accessGrants: {
                some: {
                  userId: currentUser.id,
                  status: "active",
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          ],
        },
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          department: true,
          uploadedBy: { select: { name: true } },
        },
      }),
    ]);

    return successResponse({
      role: "student",
      stats: {
        myAuthorizedCount: activeGrantsCount + publicDocumentsCount,
        activeGrants: activeGrantsCount,
        expiringSoon: expiringSoonCount,
        recentActivityCount: studentActivityCount,
      },
      recentDocuments: accessibleDocs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        classification: doc.classification,
        department: doc.department?.name,
        uploadedBy: doc.uploadedBy?.name,
        createdAt: doc.createdAt,
      })),
    });
  } catch (error) {
    console.error("[DASHBOARD STATS]", error);
    return errorResponse("Failed to fetch dashboard stats", 500);
  }
}
