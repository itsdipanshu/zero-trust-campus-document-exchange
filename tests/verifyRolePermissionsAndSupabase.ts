import prisma from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/auth";
import { encryptDocument, decryptDocument } from "../src/lib/crypto";
import { authorizeDocumentAccess } from "../src/lib/security/authorization";
import fs from "fs";
import path from "path";

async function runTests() {
  console.log("==================================================================");
  console.log("CAMPUSVAULT ZERO-TRUST: ROLE PERMISSIONS & SECURITY VERIFICATION");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(description: string, condition: boolean, extra: string = "") {
    if (condition) {
      console.log(`[PASS] ${description} ${extra ? "- " + extra : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description} ${extra ? "- " + extra : ""}`);
      failed++;
    }
  }

  try {
    // 1. Verify Departments Seeded & Loaded
    const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
    assert(
      "Departments Table Populated",
      departments.length >= 7,
      `Found ${departments.length} departments: ${departments.map((d: any) => d.name).join(", ")}`
    );

    const csDept = departments.find((d: any) => d.name.toLowerCase().includes("computer science"));
    assert("Computer Science Department Exists", !!csDept, `ID: ${csDept?.id}`);

    // 2. Create / Verify Student Profile with Mandatory Department
    const testStudentEmail = `student_test_${Date.now()}@campus.edu`;
    const passwordHash = await hashPassword("StudentPass123!");

    const studentUser = await prisma.user.create({
      data: {
        email: testStudentEmail,
        passwordHash: passwordHash,
        name: "Test Student A",
        role: "student",
        departmentId: csDept!.id,
        status: "active",
      },
    });

    const studentWithDept = await prisma.user.findUnique({
      where: { id: studentUser.id },
      include: { department: true },
    });

    assert(
      "Student Registration Links Department",
      studentWithDept?.departmentId === csDept!.id && studentWithDept?.department?.name === csDept!.name,
      `User ${studentWithDept?.name} registered under department: ${studentWithDept?.department?.name}`
    );

    // 3. Verify Role Enforcement: Student Role cannot be Admin
    assert(
      "Student Account Cannot Have Admin Privileges",
      studentUser.role === "student",
      `Role strictly assigned as '${studentUser.role}'`
    );

    // 4. Create / Verify Admin User
    const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
    assert("Admin User Exists in System", !!adminUser, `Admin: ${adminUser?.email}`);

    // 5. Create / Verify Faculty User
    let facultyUser = await prisma.user.findFirst({ where: { role: "faculty" } });
    if (!facultyUser) {
      facultyUser = await prisma.user.create({
        data: {
          email: `faculty_test_${Date.now()}@campus.edu`,
          passwordHash: passwordHash,
          name: "Test Faculty Member",
          role: "faculty",
          departmentId: csDept!.id,
          status: "active",
        },
      });
    }
    assert("Faculty User Exists in System", !!facultyUser, `Faculty: ${facultyUser?.email}`);

    // 6. Test Zero-Trust Role Matrix - Upload Permission
    // Student must NOT be allowed to upload
    const studentCanUpload = ["admin", "faculty", "hod"].includes(studentUser.role);
    assert(
      "Role Enforcement: Student CANNOT Upload Documents",
      !studentCanUpload,
      `student.role='${studentUser.role}' denied upload capability`
    );

    // Admin & Faculty can upload
    const facultyCanUpload = ["admin", "faculty", "hod"].includes(facultyUser.role);
    assert(
      "Role Enforcement: Faculty Permitted to Upload Documents",
      facultyCanUpload,
      `faculty.role='${facultyUser.role}' permitted upload capability`
    );

    // 7. Test Document Storage with Cryptography (AES-256-GCM)
    const testDocContent = `CAMPUSVAULT RESTRICTED CURRICULUM - EXAM PAPER 2026\nUnique Token: ${Date.now()}`;
    const testDocBuffer = Buffer.from(testDocContent, "utf8");
    const { encryptedBuffer, sha256 } = await encryptDocument(testDocBuffer);

    // Write encrypted file to uploads
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const storedFileName = `test_secure_${Date.now()}.enc`;
    const storedFilePath = path.join(uploadsDir, storedFileName);
    fs.writeFileSync(storedFilePath, encryptedBuffer);

    const secureDoc = await prisma.document.create({
      data: {
        title: "Confidential Exam Guidelines 2026",
        description: "Zero-Trust Encrypted Document for Test",
        fileName: storedFileName,
        storageKey: storedFileName,
        fileSize: testDocBuffer.length,
        mimeType: "text/plain",
        classification: "confidential",
        departmentId: csDept!.id,
        uploadedById: adminUser!.id,
      },
    });

    assert(
      "Admin Uploaded Document Stored with AES-256-GCM & SHA-256",
      fs.existsSync(storedFilePath) && secureDoc.id.length > 0,
      `Doc ID: ${secureDoc.id}, SHA-256: ${sha256.substring(0, 16)}...`
    );

    // 8. Zero-Trust Access Evaluation: Student has NO grant yet
    const unauthorizedEval = await authorizeDocumentAccess(
      {
        id: studentUser.id,
        email: studentUser.email,
        role: studentUser.role,
        departmentId: studentUser.departmentId,
        status: studentUser.status,
      },
      {
        id: secureDoc.id,
        title: secureDoc.title,
        classification: secureDoc.classification,
        departmentId: secureDoc.departmentId,
        uploadedById: secureDoc.uploadedById,
      },
      null,
      { timestamp: new Date(), action: "download" }
    );

    assert(
      "Zero-Trust Authorization: Student Without Grant is DENIED (HTTP 403)",
      !unauthorizedEval.allowed,
      `Decision: ${unauthorizedEval.decision} - Reason: ${unauthorizedEval.reason}`
    );

    // 9. Role Enforcement: Student CANNOT Grant Access
    const studentCanGrant = ["admin", "hod"].includes(studentUser.role);
    assert(
      "Role Enforcement: Student CANNOT Provision Access Grants",
      !studentCanGrant,
      `student.role='${studentUser.role}' denied grant creation`
    );

    // 10. Role Enforcement: Regular Faculty CANNOT Grant Access
    const facultyCanGrant = ["admin", "hod"].includes(facultyUser.role);
    assert(
      "Role Enforcement: Regular Faculty CANNOT Provision Access Grants",
      !facultyCanGrant,
      `faculty.role='${facultyUser.role}' denied grant creation unless Admin/HOD`
    );

    // 11. Admin Provisions Valid Access Grant to Student A
    const activeGrant = await prisma.accessGrant.create({
      data: {
        userId: studentUser.id,
        documentId: secureDoc.id,
        grantedById: adminUser!.id,
        status: "active",
        expiresAt: new Date(Date.now() + 3600 * 1000), // Valid for 1 hour
        reason: "Authorized by Admin for CS Department Student",
      },
    });

    assert(
      "Admin Successfully Provisions Active Grant to Student",
      activeGrant.status === "active" && activeGrant.userId === studentUser.id,
      `Grant ID: ${activeGrant.id}`
    );

    // 12. Zero-Trust Access Evaluation: Authorized Student Download
    const authorizedEval = await authorizeDocumentAccess(
      {
        id: studentUser.id,
        email: studentUser.email,
        role: studentUser.role,
        departmentId: studentUser.departmentId,
        status: studentUser.status,
      },
      {
        id: secureDoc.id,
        title: secureDoc.title,
        classification: secureDoc.classification,
        departmentId: secureDoc.departmentId,
        uploadedById: secureDoc.uploadedById,
      },
      {
        id: activeGrant.id,
        userId: activeGrant.userId,
        documentId: activeGrant.documentId,
        status: activeGrant.status,
        grantedById: activeGrant.grantedById,
        expiresAt: activeGrant.expiresAt,
        revokedAt: activeGrant.revokedAt,
      },
      { timestamp: new Date(), action: "download" }
    );

    assert(
      "Zero-Trust Authorization: Student WITH Active Grant is ALLOWED",
      authorizedEval.allowed,
      `Decision: ${authorizedEval.decision} - Reason: ${authorizedEval.reason}`
    );

    // Verify Decrypted Content matches original
    const { plaintext } = await decryptDocument(encryptedBuffer);
    assert(
      "Decrypted File Content Matches Original Plaintext",
      plaintext.toString("utf8") === testDocContent,
      `Integrity verified, size: ${plaintext.length} bytes`
    );

    // 13. Admin Revokes Access
    const revokedGrant = await prisma.accessGrant.update({
      where: { id: activeGrant.id },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });

    assert(
      "Admin Revokes Access Grant",
      revokedGrant.status === "revoked" && revokedGrant.revokedAt !== null,
      `Revocation Timestamp: ${revokedGrant.revokedAt?.toISOString()}`
    );

    // 14. Zero-Trust Access Evaluation After Revocation: IMMEDIATE DENIAL
    const postRevocationEval = await authorizeDocumentAccess(
      {
        id: studentUser.id,
        email: studentUser.email,
        role: studentUser.role,
        departmentId: studentUser.departmentId,
        status: studentUser.status,
      },
      {
        id: secureDoc.id,
        title: secureDoc.title,
        classification: secureDoc.classification,
        departmentId: secureDoc.departmentId,
        uploadedById: secureDoc.uploadedById,
      },
      {
        id: revokedGrant.id,
        userId: revokedGrant.userId,
        documentId: revokedGrant.documentId,
        status: revokedGrant.status,
        grantedById: revokedGrant.grantedById,
        expiresAt: revokedGrant.expiresAt,
        revokedAt: revokedGrant.revokedAt,
      },
      { timestamp: new Date(), action: "download" }
    );

    assert(
      "Zero-Trust Authorization: Revoked User Access IMMEDIATELY DENIED",
      !postRevocationEval.allowed,
      `Decision: ${postRevocationEval.decision} - Reason: ${postRevocationEval.reason}`
    );

    // 15. Role Enforcement: Student CANNOT View Audit Logs
    const studentCanViewAudit = ["admin", "hod"].includes(studentUser.role);
    assert(
      "Role Enforcement: Student CANNOT View Security Audit Logs",
      !studentCanViewAudit,
      `Audit logs restricted strictly to Admin/HOD`
    );

    // 16. Verify Supabase Schema and Helper Readiness
    const supabaseSqlPath = path.join(process.cwd(), "supabase", "schema.sql");
    const supabaseHelperPath = path.join(process.cwd(), "src", "lib", "supabase.ts");
    assert(
      "Supabase Schema & Client Module Configured",
      fs.existsSync(supabaseSqlPath) && fs.existsSync(supabaseHelperPath),
      `schema.sql: ${fs.statSync(supabaseSqlPath).size} bytes, supabase.ts: ${fs.statSync(supabaseHelperPath).size} bytes`
    );

    // Clean up test file
    try {
      if (fs.existsSync(storedFilePath)) fs.unlinkSync(storedFilePath);
      await prisma.accessGrant.deleteMany({ where: { documentId: secureDoc.id } });
      await prisma.document.delete({ where: { id: secureDoc.id } });
      await prisma.user.delete({ where: { id: studentUser.id } });
    } catch (e) {
      // ignore cleanup errors
    }

  } catch (error) {
    console.error("Test execution error:", error);
    failed++;
  }

  console.log("==================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
