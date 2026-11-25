import { PrismaClient } from "@prisma/client";
import { processAiMessage } from "../src/lib/ai/engine";

const prisma = new PrismaClient();

async function runChatFlowTest() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  CAMPUSVAULT – VAULT AI CONVERSATIONAL RE-ACCESS CHAT FLOW TEST       ");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  const faculty = await prisma.user.findFirst({ where: { role: "faculty" } });
  const student =
    (await prisma.user.findFirst({ where: { email: "dipanshu@gmail.com" } })) ||
    (await prisma.user.findFirst({ where: { role: "student" } }));

  if (!faculty || !student) throw new Error("Missing test users");

  // Ensure test document exists
  let doc = await prisma.document.findFirst({
    where: { title: { contains: "Mathematics" }, uploadedById: faculty.id },
  });
  if (!doc) {
    const dept = (await prisma.department.findFirst())!;
    doc = await prisma.document.create({
      data: {
        title: "Mathematics_Exam_Paper.pdf",
        fileName: "mathematics_exam_paper.pdf",
        fileSize: 10240,
        mimeType: "application/pdf",
        classification: "confidential",
        storageKey: `math_${Date.now()}.enc`,
        uploadedById: faculty.id,
        departmentId: dept.id,
      },
    });
  }

  // Create a clean chat session for student
  const session = await prisma.aiChatSession.create({
    data: {
      userId: student.id,
      title: "Re-Access Verification Chat",
    },
  });

  const studentContext = {
    id: student.id,
    name: student.name,
    email: student.email,
    role: student.role,
    departmentId: student.departmentId,
    department: student.departmentId ? await prisma.department.findUnique({ where: { id: student.departmentId } }) : null,
    status: student.status,
  };

  // Turn 1: User says "I need the Mathematics document again."
  console.log("Turn 1: User -> 'I need the Mathematics document again.'");
  const turn1 = await processAiMessage("I need the Mathematics document again.", studentContext as any, session.id);
  console.log("Turn 1: Vault AI ->", turn1.message.split("<!--")[0].trim());

  const turn1Passed =
    turn1.message.includes("Why do you need access to this document again?") &&
    turn1.message.includes("Mathematics");
  console.log(`[${turn1Passed ? "PASS" : "FAIL"}] Turn 1 asked mandatory reason question\n`);

  // Turn 2: User gives empty reason
  console.log("Turn 2: User -> '   ' (whitespace only)");
  const turn2 = await processAiMessage("   ", studentContext as any, session.id);
  console.log("Turn 2: Vault AI ->", turn2.message.split("<!--")[0].trim());
  const turn2Passed = turn2.message.includes("A non-empty reason is mandatory");
  console.log(`[${turn2Passed ? "PASS" : "FAIL"}] Turn 2 enforced mandatory non-empty reason\n`);

  // Turn 3: User provides valid reason
  console.log("Turn 3: User -> 'I need it for my examination revision.'");
  const turn3 = await processAiMessage("I need it for my examination revision.", studentContext as any, session.id);
  console.log("Turn 3: Vault AI ->", turn3.message.split("<!--")[0].trim());
  const turn3Passed =
    turn3.message.includes("Here is your access request") &&
    Boolean(turn3.ticketAction) &&
    turn3.ticketAction?.reason === "I need it for my examination revision.";
  console.log(`[${turn3Passed ? "PASS" : "FAIL"}] Turn 3 presented ticket confirmation with exact reason\n`);

  // Turn 4: User says "Confirm"
  console.log("Turn 4: User -> 'Confirm'");
  const turn4 = await processAiMessage("Confirm", studentContext as any, session.id);
  console.log("Turn 4: Vault AI ->", turn4.message.trim());
  const turn4Passed =
    turn4.message.includes("Your request has been submitted successfully") &&
    turn4.message.includes("CVLT-REQ-") &&
    turn4.message.includes("notified");
  console.log(`[${turn4Passed ? "PASS" : "FAIL"}] Turn 4 confirmed ticket creation and notified document owner\n`);

  if (!turn1Passed || !turn2Passed || !turn3Passed || !turn4Passed) {
    process.exit(1);
  }
}

runChatFlowTest()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
