import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CampusVault database...");

  // Create departments as required by policy
  const departmentsData = [
    { name: "Computer Science", description: "Department of Computer Science and Engineering" },
    { name: "Information Technology", description: "Department of Information Technology" },
    { name: "Electronics and Communication", description: "Department of Electronics and Communication Engineering" },
    { name: "Mechanical Engineering", description: "Department of Mechanical Engineering" },
    { name: "Civil Engineering", description: "Department of Civil Engineering" },
    { name: "Business Administration", description: "Department of Business Administration and Management" },
    { name: "Applied Sciences", description: "Department of Applied Sciences and Humanities" },
    { name: "Administration", description: "Campus Administration and System Governance" },
  ];

  const createdDepts: Record<string, any> = {};
  for (const dept of departmentsData) {
    const record = await prisma.department.upsert({
      where: { name: dept.name },
      update: { description: dept.description },
      create: dept,
    });
    createdDepts[dept.name] = record;
  }

  const csDept = createdDepts["Computer Science"];
  const adminDept = createdDepts["Administration"];

  console.log("✅ Departments created");

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@campusvault.edu" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@campusvault.edu",
      passwordHash: adminPassword,
      role: "admin",
      departmentId: adminDept.id,
      status: "active",
    },
  });

  // Create faculty user
  const facultyPassword = await bcrypt.hash("faculty123", 10);
  const faculty = await prisma.user.upsert({
    where: { email: "faculty@campusvault.edu" },
    update: {},
    create: {
      name: "Dr. Sharma",
      email: "faculty@campusvault.edu",
      passwordHash: facultyPassword,
      role: "faculty",
      departmentId: csDept.id,
      status: "active",
    },
  });

  // Create HOD user
  const hodPassword = await bcrypt.hash("hod123", 10);
  const hod = await prisma.user.upsert({
    where: { email: "hod@campusvault.edu" },
    update: {},
    create: {
      name: "Prof. Verma",
      email: "hod@campusvault.edu",
      passwordHash: hodPassword,
      role: "hod",
      departmentId: csDept.id,
      status: "active",
    },
  });

  // Create student user
  const studentPassword = await bcrypt.hash("student123", 10);
  const student = await prisma.user.upsert({
    where: { email: "student@campusvault.edu" },
    update: {},
    create: {
      name: "Rahul Kumar",
      email: "student@campusvault.edu",
      passwordHash: studentPassword,
      role: "student",
      departmentId: csDept.id,
      status: "active",
    },
  });

  console.log("✅ Users created");
  console.log("");
  console.log("📋 Default Credentials:");
  console.log("  Admin:   admin@campusvault.edu   / admin123");
  console.log("  Faculty: faculty@campusvault.edu / faculty123");
  console.log("  HOD:     hod@campusvault.edu     / hod123");
  console.log("  Student: student@campusvault.edu / student123");
  console.log("");
  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
