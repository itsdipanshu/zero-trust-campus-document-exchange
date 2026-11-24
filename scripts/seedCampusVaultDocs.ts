import { PrismaClient } from "@prisma/client";
import { encryptDocument } from "../src/lib/crypto";
import { generateStorageKey } from "../src/lib/utils";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding essential campus documents and access grants...");

  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
  });
  if (!admin) {
    console.error("No admin user found!");
    return;
  }

  const depts = await prisma.department.findMany();
  const csDept = depts.find((d) => d.name === "Computer Science") || depts[0];
  const adminDept = depts.find((d) => d.name === "Administration") || depts[0];

  const uploadDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  const sampleDocuments = [
    {
      title: "Campus Academic Calendar & Schedule 2024-25",
      description: "Official campus academic schedule, exam timetables, semester breaks, and key deadlines.",
      fileName: "Campus_Academic_Calendar_2024-25.pdf",
      classification: "public",
      discoverability: "CAMPUS_DISCOVERABLE",
      departmentId: adminDept.id,
      content: "CAMPUSVAULT OFFICIAL CALENDAR\nSemester 1: Aug - Dec\nSemester 2: Jan - May\nExam Sessions: Nov 20 - Dec 15",
    },
    {
      title: "Zero-Trust Campus Security & Document Guide",
      description: "Comprehensive guide to Zero-Trust verification, AES-256-GCM encryption, and confidential document policies.",
      fileName: "Zero_Trust_Document_Security_Guide.pdf",
      classification: "public",
      discoverability: "CAMPUS_DISCOVERABLE",
      departmentId: adminDept.id,
      content: "ZERO-TRUST CAMPUS DOCUMENT EXCHANGE GUIDE\nRule 1: Never trust, always verify.\nRule 2: End-to-end encryption with AES-256-GCM.",
    },
    {
      title: "Student Code of Conduct & Honor Policy",
      description: "Guidelines on academic integrity, ethical communication, laboratory protocols, and campus standards.",
      fileName: "Student_Code_Of_Conduct.pdf",
      classification: "public",
      discoverability: "CAMPUS_DISCOVERABLE",
      departmentId: adminDept.id,
      content: "CAMPUS CODE OF ETHICS & CONDUCT\nAll students and faculty must uphold academic integrity, respect, and confidentiality.",
    },
    {
      title: "Computer Science Lab Manual & Project Guidelines",
      description: "Laboratory guidelines, project submission requirements, and technical references for CS students.",
      fileName: "CS_Lab_Manual_Project_Guidelines.pdf",
      classification: "public",
      discoverability: "DEPARTMENT_DISCOVERABLE",
      departmentId: csDept.id,
      content: "COMPUTER SCIENCE LAB MANUAL\nLab 1: Cryptography & Hashing\nLab 2: Network Access Control & Role Permissions",
    },
    {
      title: "Administration Circular: Security Clearance Protocol",
      description: "Administrative document regarding campus document classification and secure message handling.",
      fileName: "Admin_Security_Clearance_Circular.pdf",
      classification: "internal",
      discoverability: "DEPARTMENT_DISCOVERABLE",
      departmentId: adminDept.id,
      content: "CAMPUS ADMINISTRATION CIRCULAR\nAll sensitive transmissions must be verified by the Zero-Trust Engine.",
    },
  ];

  const createdDocs = [];
  for (const docDef of sampleDocuments) {
    let existing = await prisma.document.findFirst({
      where: { title: docDef.title },
    });

    if (!existing) {
      const storageKey = generateStorageKey(docDef.fileName);
      const plaintextBuffer = Buffer.from(docDef.content, "utf-8");
      const { encryptedBuffer, sha256 } = await encryptDocument(plaintextBuffer);

      await fs.writeFile(path.join(uploadDir, storageKey), encryptedBuffer);

      existing = await prisma.document.create({
        data: {
          title: docDef.title,
          description: docDef.description,
          fileName: docDef.fileName,
          fileSize: plaintextBuffer.length,
          mimeType: "application/pdf",
          storageKey,
          classification: docDef.classification,
          discoverability: docDef.discoverability,
          departmentId: docDef.departmentId,
          uploadedById: admin.id,
        },
      });
      console.log(`Created document: ${existing.title} (${existing.classification})`);
    } else {
      console.log(`Document already exists: ${existing.title}`);
    }
    createdDocs.push(existing);
  }

  // Grant access to Dipanshu and students
  const studentUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "dipanshu" } },
        { email: { contains: "Dipanshu" } },
        { name: { contains: "Dipanshu" } },
        { role: "student" },
      ],
    },
  });

  const adminDoc = createdDocs.find((d) => d.classification === "internal") || createdDocs[0];

  for (const user of studentUsers) {
    const existingGrant = await prisma.accessGrant.findFirst({
      where: {
        userId: user.id,
        documentId: adminDoc.id,
        status: "active",
      },
    });

    if (!existingGrant) {
      await prisma.accessGrant.create({
        data: {
          userId: user.id,
          documentId: adminDoc.id,
          grantedById: admin.id,
          status: "active",
          reason: "Campus Administration Authorized Access",
        },
      });
      console.log(`Granted access for '${adminDoc.title}' to ${user.name} (${user.email})`);
    }
  }

  console.log("✅ Seeding completed successfully!");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
