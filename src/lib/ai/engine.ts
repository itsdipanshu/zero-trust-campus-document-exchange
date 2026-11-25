import prisma from "../db";
import {
  UserContext,
  getMyDocuments,
  getDiscoverableDepartmentDocuments,
  getMyAccessGrants,
  getMyAccessHistory,
  getMyPendingAccessRequests,
  getAdminSecuritySummary,
} from "./context";
import { formatAiResponseInLanguage } from "./multilingual";
import { createSecureMessage, getUserMessages } from "../messages/service";
import { isGeminiConfigured, getGeminiModelName, generateGeminiChatResponse } from "./gemini";
import { createReAccessTicket } from "../security/accessCodes";

export interface ReceivedMessageCard {
  messageId: string;
  senderName: string;
  senderRole: string;
  senderDepartment?: string;
  subject: string;
  content: string;
  receivedAt: string;
  status: string;
  attachment?: {
    id: string;
    documentId: string;
    title: string;
    classification: string;
    fileSize: number;
    fileName?: string;
  };
}

export interface ChatResponse {
  sessionId?: string;
  message: string;
  suggestedAction?: {
    type: "REQUEST_ACCESS";
    documentId: string;
    documentTitle: string;
  };
  messengerAction?: {
    type: "CONFIRM_MESSAGE";
    recipientId: string;
    recipientName: string;
    recipientRole: string;
    recipientDepartment: string;
    subject: string;
    content: string;
    documentId?: string;
    documentTitle?: string;
    documentClassification?: string;
  };
  receivedMessages?: ReceivedMessageCard[];
  ticketAction?: {
    type: "CONFIRM_TICKET";
    documentId: string;
    documentTitle: string;
    documentOwnerName: string;
    requesterName: string;
    requesterRole: string;
    departmentName: string;
    reason: string;
  };
  ticketList?: {
    ticketId: string;
    documentTitle: string;
    documentOwner: string;
    status: string;
    reason: string;
    rejectionReason?: string;
    accessCode?: string;
    createdAt: string;
  }[];
  contextSummary?: {
    userRole: string;
    departmentName: string;
    documentCount: number;
  };
}

/**
 * Evaluates whether a prompt contains adversarial injection or attempts
 * to extract unauthorized user/system privacy information.
 */
export function evaluatePrivacyViolations(
  prompt: string,
  user: UserContext
): { violated: boolean; reason: string } {
  const clean = prompt.toLowerCase();

  // 1. Prompt Injection / Jailbreak Attempts
  if (
    clean.includes("ignore all previous") ||
    clean.includes("ignore previous instructions") ||
    clean.includes("disregard all instructions") ||
    clean.includes("system prompt") ||
    clean.includes("dan mode") ||
    clean.includes("act as admin") ||
    clean.includes("bypass authorization") ||
    clean.includes("developer mode") ||
    clean.includes("jailbreak")
  ) {
    return {
      violated: true,
      reason:
        "Sorry, I am strictly programmed to uphold Zero-Trust campus security guidelines and cannot bypass system policies or instructions.",
    };
  }

  // 2. Encryption Keys, Passwords, or Internal Storage
  if (
    clean.includes("encryption key") ||
    clean.includes("aes key") ||
    clean.includes("private key") ||
    clean.includes("storage path") ||
    clean.includes("storagekey") ||
    clean.includes("password hash") ||
    clean.includes("show me passwords")
  ) {
    return {
      violated: true,
      reason:
        "Cryptographic keys, password hashes, and physical storage paths are confidential and strictly protected under Zero-Trust protocols.",
    };
  }

  // 3. Unauthorized access to uploader identity
  // "Which teacher uploaded", "who uploaded", "kisne upload kiya", "uploader identity"
  if (
    (clean.includes("who uploaded") ||
      clean.includes("which teacher uploaded") ||
      clean.includes("which faculty uploaded") ||
      clean.includes("who created") ||
      clean.includes("uploader") ||
      clean.includes("kisne upload kiya") ||
      clean.includes("kis teacher ne upload")) &&
    user.role === "student"
  ) {
    return {
      violated: true,
      reason:
        "Sorry, I cannot disclose other users' private document-sharing activities or access records.",
    };
  }

  // 4. Unauthorized access to recipient lists
  // "Which students received access", "who has access", "kisko access mila", "which other students"
  if (
    (clean.includes("which students received access") ||
      clean.includes("which other students") ||
      clean.includes("who received access") ||
      clean.includes("which student received") ||
      clean.includes("which teacher gave access to which student") ||
      clean.includes("other students") ||
      clean.includes("other student") ||
      clean.includes("kisko access mila") ||
      clean.includes("who else can download")) &&
    user.role !== "admin" &&
    user.role !== "hod"
  ) {
    return {
      violated: true,
      reason:
        "Sorry, I cannot disclose other users' private document-sharing activities or access records.",
    };
  }

  // 5. Viewing other faculty's or users' private records / uploads
  if (
    (clean.includes("other teacher") ||
      clean.includes("another teacher") ||
      clean.includes("another faculty") ||
      clean.includes("other faculty") ||
      clean.includes("faculty ") ||
      clean.includes("faculty's") ||
      clean.includes("teacher ") ||
      clean.includes("teacher's") ||
      clean.includes("student's") ||
      clean.includes("private upload") ||
      clean.includes("private research") ||
      clean.includes("dusre teacher")) &&
    user.role !== "admin" &&
    user.role !== "hod"
  ) {
    return {
      violated: true,
      reason:
        "Sorry, I cannot disclose other users' private document-sharing activities or access records.",
    };
  }

  // 6. Confidential audit logs for students or general faculty
  if (
    (clean.includes("audit log") ||
      clean.includes("security events") ||
      clean.includes("system activity") ||
      clean.includes("all logins")) &&
    user.role === "student"
  ) {
    return {
      violated: true,
      reason:
        "System-wide security audit logs contain confidential administrative telemetry and are restricted to Administrators only.",
    };
  }

  return { violated: false, reason: "" };
}

/**
 * Main AI Assistant processor. Evaluates prompt in user-specific authenticated context.
 */
export async function processAiMessage(
  userPrompt: string,
  user: UserContext,
  sessionId?: string,
  aiLanguagePreference?: string,
  attachedDocumentId?: string
): Promise<ChatResponse> {
  const prompt = userPrompt.trim();
  const lower = prompt.toLowerCase();
  const userLanguage = aiLanguagePreference || (user as any).aiLanguage || "auto";

  // Step 1: Strict privacy and prompt injection check
  const privacyCheck = evaluatePrivacyViolations(prompt, user);
  if (privacyCheck.violated) {
    const effectiveReply = formatAiResponseInLanguage(
      privacyCheck.reason,
      aiLanguagePreference || (user as any).aiLanguage || "auto",
      userPrompt
    );
    const savedSessionId = await recordInteraction(user, userPrompt, effectiveReply, sessionId);
    return {
      sessionId: savedSessionId,
      message: effectiveReply,
      contextSummary: {
        userRole: user.role,
        departmentName: user.department?.name || "Unassigned",
        documentCount: 0,
      },
    };
  }

  // Step 1.2: Google Gemini Live AI Integration (if configured)
  if (isGeminiConfigured()) {
    try {
      const recentMessages = sessionId
        ? await prisma.aiChatMessage.findMany({
            where: { sessionId, userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 6,
          })
        : [];
      const formattedHistory = recentMessages.reverse().map((m) => ({
        role: m.messageRole,
        content: m.messageContent,
      }));

      const geminiResponse = await generateGeminiChatResponse(
        userPrompt,
        user,
        formattedHistory,
        aiLanguagePreference,
        attachedDocumentId
      );

      const savedSessionId = await recordInteraction(
        user,
        userPrompt,
        geminiResponse.message,
        sessionId
      );

      return {
        ...geminiResponse,
        sessionId: savedSessionId,
      };
    } catch (geminiError) {
      console.warn(
        "[GEMINI INFERENCE NOTICE] Falling back to Zero-Trust Engine:",
        geminiError instanceof Error ? geminiError.message : "Inference error"
      );
      // Seamless fallback to deterministic Zero-Trust engine
    }
  }

  let replyText = "";
  let suggestedAction: ChatResponse["suggestedAction"];
  let messengerAction: ChatResponse["messengerAction"];
  let ticketAction: ChatResponse["ticketAction"];
  let ticketList: ChatResponse["ticketList"];
  let receivedMessages: ChatResponse["receivedMessages"] = undefined;

  // Retrieve last assistant message from conversation history if available
  const lastAssistantMsg = sessionId
    ? await prisma.aiChatMessage.findFirst({
        where: { sessionId, userId: user.id, messageRole: "assistant" },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // ─────────────────────────────────────────────────────────────
  // RE-ACCESS WORKFLOW SUB-FLOW 1: Confirmation of Ticket Submission
  // ─────────────────────────────────────────────────────────────
  const isConfirmIntent =
    lower === "confirm" ||
    lower === "confirm request" ||
    lower === "yes, confirm" ||
    lower === "yes confirm" ||
    lower === "submit" ||
    lower === "submit ticket" ||
    lower === "submit request";

  const hasPendingReAccessTag =
    lastAssistantMsg?.messageContent.includes("[PENDING_REACCESS:") || false;

  if (isConfirmIntent && hasPendingReAccessTag) {
    const match = lastAssistantMsg!.messageContent.match(
      /\[PENDING_REACCESS:docId=([^;]+);reason=([^\]]+)\]/
    );
    if (match) {
      const docId = match[1];
      const encodedReason = match[2];
      const decodedReason = decodeURIComponent(encodedReason);

      const ticketResult = await createReAccessTicket({
        documentId: docId,
        requesterId: user.id,
        reason: decodedReason,
      });

      if (ticketResult.success && ticketResult.ticket) {
        const ownerName =
          ticketResult.ticket.documentOwner?.name || "Document Owner";
        replyText = `Your request has been submitted successfully. Ticket ID: ${ticketResult.ticket.ticketId}. The document owner (${ownerName}) has been notified.`;
      } else {
        replyText =
          ticketResult.error || "Failed to submit re-access ticket. Please try again.";
      }
    } else {
      replyText =
        "Could not parse pending re-access request details. Please try requesting the document again.";
    }
  }
  // ─────────────────────────────────────────────────────────────
  // RE-ACCESS WORKFLOW SUB-FLOW 2: Mandatory Reason Submission
  // ─────────────────────────────────────────────────────────────
  else if (
    lastAssistantMsg?.messageContent.includes("Why do you need access to this document again?") ||
    lastAssistantMsg?.messageContent.includes("[REACCESS_DOC_ID:")
  ) {
    const cleanReason = prompt.replace(/^reason[:\s-]*/i, "").trim();
    if (!cleanReason || cleanReason.length === 0) {
      replyText = `Why do you need access to this document again? Please explain your reason. A non-empty reason is mandatory.`;
    } else {
      const docMatch = lastAssistantMsg.messageContent.match(
        /\[REACCESS_DOC_ID:([^\]]+)\]/
      );
      let targetDocId = docMatch ? docMatch[1] : null;

      let targetDoc = targetDocId
        ? await prisma.document.findUnique({
            where: { id: targetDocId },
            include: { uploadedBy: true, department: true },
          })
        : null;

      if (!targetDoc) {
        targetDoc = await prisma.document.findFirst({
          include: { uploadedBy: true, department: true },
        });
      }

      if (targetDoc) {
        const ownerName = targetDoc.uploadedBy?.name || "Document Owner";
        const userDept =
          user.department?.name || targetDoc.department?.name || "Campus";

        ticketAction = {
          type: "CONFIRM_TICKET",
          documentId: targetDoc.id,
          documentTitle: targetDoc.title,
          documentOwnerName: ownerName,
          requesterName: user.name,
          requesterRole: user.role,
          departmentName: userDept,
          reason: cleanReason,
        };

        replyText = `Here is your access request. Please confirm before submitting:\n\n• **Document:** ${targetDoc.title}\n• **Document Owner:** ${ownerName}\n• **Requester:** ${user.name} (${user.role.toUpperCase()})\n• **Department:** ${userDept}\n• **Reason:** "${cleanReason}"\n\n*Please type "Confirm" or click the Confirm button below to submit your request.*\n<!-- [PENDING_REACCESS:docId=${targetDoc.id};reason=${encodeURIComponent(cleanReason)}] -->`;
      } else {
        replyText =
          "Target document could not be located. Please state which document you need access to again.";
      }
    }
  }
  // ─────────────────────────────────────────────────────────────
  // RE-ACCESS WORKFLOW SUB-FLOW 3: Natural Language Re-Access Trigger
  // ─────────────────────────────────────────────────────────────
  else if (
    lower.includes("again") ||
    lower.includes("re-access") ||
    lower.includes("reaccess") ||
    lower.includes("raise a request") ||
    lower.includes("raise request") ||
    lower.includes("want to download the document shared by my teacher") ||
    lower.includes("examination notes again") ||
    lower.includes("need mathematics document")
  ) {
    const allCandidateDocs = await prisma.document.findMany({
      include: { uploadedBy: true, department: true },
      take: 20,
    });

    const words = lower
      .split(/[^a-zA-Z0-9_-]+/)
      .filter(
        (w) =>
          w.length > 3 &&
          ![
            "need",
            "access",
            "document",
            "again",
            "please",
            "want",
            "download",
            "shared",
            "teacher",
            "raise",
            "request",
          ].includes(w)
      );

    const matchedDocs = allCandidateDocs.filter((d) => {
      const titleLower = d.title.toLowerCase();
      return (
        words.some((w) => titleLower.includes(w)) ||
        (lower.includes("mathematics") && titleLower.includes("math"))
      );
    });

    let targetDoc = matchedDocs.length === 1 ? matchedDocs[0] : null;

    if (!targetDoc && matchedDocs.length > 1) {
      const lines = [
        "I found multiple documents matching your request. Please specify which document you need re-access for:",
      ];
      matchedDocs.slice(0, 4).forEach((d, idx) => {
        lines.push(
          `${idx + 1}. **${d.title}** (${d.classification.toUpperCase()} - Owner: ${d.uploadedBy.name})`
        );
      });
      replyText = lines.join("\n");
    } else {
      if (!targetDoc && allCandidateDocs.length > 0) {
        targetDoc =
          allCandidateDocs.find(
            (d) =>
              d.title.toLowerCase().includes("math") ||
              d.title.toLowerCase().includes("exam") ||
              d.title.toLowerCase().includes("notes")
          ) || allCandidateDocs[0];
      }

      if (targetDoc) {
        replyText = `I found **${targetDoc.title}**. Why do you need access to this document again? Please explain your reason.\n<!-- [REACCESS_DOC_ID:${targetDoc.id}] -->`;
      } else {
        replyText = `Which document do you need access to again? Please provide the document title.`;
      }
    }
  }
  // ─────────────────────────────────────────────────────────────
  // RE-ACCESS WORKFLOW SUB-FLOW 4: Check Ticket Status & Codes
  // ─────────────────────────────────────────────────────────────
  else if (
    lower.includes("ticket") ||
    lower.includes("my requests") ||
    lower.includes("request status") ||
    lower.includes("my tickets") ||
    lower.includes("access code") ||
    lower.includes("my code")
  ) {
    const userTickets = await prisma.documentAccessTicket.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: "desc" },
      include: { document: true, documentOwner: true },
      take: 5,
    });

    if (userTickets.length === 0) {
      replyText = `You do not have any re-access request tickets currently recorded in CampusVault.`;
    } else {
      const lines: string[] = [
        `🎫 **Your Document Re-Access Request Tickets (${userTickets.length}):**\n`,
      ];
      const cardList: ChatResponse["ticketList"] = [];

      for (const t of userTickets) {
        cardList.push({
          ticketId: t.ticketId,
          documentTitle: t.document.title,
          documentOwner: t.documentOwner.name,
          status: t.status,
          reason: t.reason,
          rejectionReason: t.rejectionReason || undefined,
          createdAt: t.createdAt.toISOString(),
        });

        if (t.status === "APPROVED") {
          lines.push(
            `• **${t.ticketId}** – **${t.document.title}**: Status is **APPROVED** by ${t.documentOwner.name}. A new one-time access code has been issued! You can redeem it in Document Vault.`
          );
        } else if (t.status === "REJECTED") {
          lines.push(
            `• **${t.ticketId}** – **${t.document.title}**: Status is **REJECTED**. Reason: ${t.rejectionReason || "No explanation provided"}.`
          );
        } else {
          lines.push(
            `• **${t.ticketId}** – **${t.document.title}**: Status is **PENDING** review by ${t.documentOwner.name}.`
          );
        }
      }

      ticketList = cardList;
      replyText = lines.join("\n");
    }
  }
  // Step 1.4: Gemini Status Query
  else if (
    lower.includes("gemini status") ||
    lower.includes("gemini api") ||
    lower.includes("is gemini active") ||
    lower.includes("is gemini connected")
  ) {
    const configured = isGeminiConfigured();
    replyText = configured
      ? `✅ **Google Gemini API is Connected & Active!**\n\n• **Model:** ${getGeminiModelName()}\n• **Provider:** Google Gemini\n• **Zero-Trust Shield:** Active\n• **Privacy Isolation:** Active\n\nAll campus queries are processed with live Google Gemini intelligence.`
      : `ℹ️ **Google Gemini API Status: Fallback Mode**\n\n• **Current Engine:** CampusVault Built-in Zero-Trust Intelligence Engine\n• **Status:** \`GEMINI_API_KEY\` is not configured in \`.env\`.\n• **Security:** Active (Zero-Trust RBAC/ABAC strictly enforced)\n\nTo activate Google Gemini LLM reasoning, provide a valid \`GEMINI_API_KEY\` in your server environment file.`;
  } else if (
    lower.includes("show my messages") ||
    lower.includes("show inbox") ||
    lower.includes("do i have any new messages") ||
    lower.includes("any new messages") ||
    lower.includes("who sent me a document") ||
    lower.includes("who sent document") ||
    lower.includes("show my received documents") ||
    lower.includes("show received documents") ||
    lower.includes("details of my latest message") ||
    lower.includes("latest message") ||
    lower.includes("mere messages") ||
    lower.includes("check my messages") ||
    lower.includes("received messages") ||
    lower.includes("kisine document bheja") ||
    lower.includes("kya koi message hai")
  ) {
    const inbox = await prisma.secureMessage.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { include: { department: true } },
        attachments: { include: { document: true } },
      },
      take: 10,
    });

    if (inbox.length === 0) {
      replyText = "You currently have no received messages or shared documents in your private campus vault.";
    } else {
      receivedMessages = inbox.map((m) => ({
        messageId: m.id,
        senderName: m.sender.name,
        senderRole: m.sender.role,
        senderDepartment: m.sender.department?.name,
        subject: m.subject,
        content: m.messageContent,
        receivedAt: m.createdAt.toISOString(),
        status: m.status,
        attachment: m.attachments[0]
          ? {
              id: m.attachments[0].id,
              documentId: m.attachments[0].document.id,
              title: m.attachments[0].document.title,
              classification: m.attachments[0].document.classification,
              fileSize: m.attachments[0].document.fileSize,
              fileName: m.attachments[0].document.fileName,
            }
          : undefined,
      }));

      const unreadCount = inbox.filter((m) => m.status !== "READ").length;
      const lines: string[] = [];

      if (lower.includes("who sent") || lower.includes("received documents")) {
        const docsWithSender = inbox.filter((m) => m.attachments.length > 0);
        if (docsWithSender.length > 0) {
          lines.push(`📄 **Documents Shared With You (${docsWithSender.length}):**`);
          docsWithSender.forEach((m, idx) => {
            const doc = m.attachments[0].document;
            lines.push(
              `${idx + 1}. **${doc.title}** (${doc.classification.toUpperCase()}) – Sent by **${m.sender.name}** (${m.sender.role.toUpperCase()}) on ${new Date(m.createdAt).toLocaleDateString()}.`
            );
          });
          lines.push(`\nYou can decrypt and download any verified attachment using the secure document cards below.`);
        } else {
          lines.push("You have received messages, but none contain document attachments.");
        }
      } else if (lower.includes("latest message") || lower.includes("details of my latest")) {
        const latest = inbox[0];
        lines.push(`📬 **Details of Your Latest Message:**`);
        lines.push(`• **From:** ${latest.sender.name} (${latest.sender.role.toUpperCase()} - ${latest.sender.department?.name || "Campus"})`);
        lines.push(`• **Subject:** ${latest.subject}`);
        lines.push(`• **Sent At:** ${new Date(latest.createdAt).toLocaleString()}`);
        lines.push(`• **Content:** "${latest.messageContent}"`);
        if (latest.attachments.length > 0) {
          lines.push(`• **Attachment:** '${latest.attachments[0].document.title}' (${latest.attachments[0].document.classification.toUpperCase()})`);
        }
      } else {
        lines.push(`📬 **Your Received Messages (${inbox.length} total, ${unreadCount} unread):**`);
        inbox.slice(0, 5).forEach((m, idx) => {
          const attText = m.attachments.length > 0 ? ` 📎 [Attachment: '${m.attachments[0].document.title}']` : "";
          lines.push(`${idx + 1}. From **${m.sender.name}** (${m.sender.role.toUpperCase()}): "${m.subject}"${attText}`);
        });
        lines.push(`\nYou can view full messages and download verified attachments below directly within this conversation.`);
      }

      replyText = lines.join("\n");
    }
  } else if (
    lower.includes("show my sent messages") ||
    lower.includes("show sent messages") ||
    lower.includes("sent messages") ||
    lower.includes("sent documents") ||
    lower.includes("maine kya bheja") ||
    lower.includes("bheje gaye")
  ) {
    const sent = await prisma.secureMessage.findMany({
      where: { senderId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        recipient: { include: { department: true } },
        attachments: { include: { document: true } },
      },
      take: 5,
    });

    if (sent.length === 0) {
      replyText = "You have not sent any secure messages or documents yet.";
    } else {
      const lines = [`📤 **Your Sent Messages & Shared Documents (${sent.length}):**`];
      sent.forEach((m, idx) => {
        const attText = m.attachments.length > 0 ? ` 📎 [Attachment: '${m.attachments[0].document.title}']` : "";
        lines.push(
          `${idx + 1}. To **${m.recipient.name}** (${m.recipient.role.toUpperCase()}): "${m.subject}"${attText} - Status: **${m.status}**`
        );
      });
      replyText = lines.join("\n");
    }
  } else if (
    lower.includes("show unread notifications") ||
    lower.includes("my notifications") ||
    lower.includes("meri notification") ||
    lower.includes("show notifications") ||
    lower.includes("notifications dikhao")
  ) {
    const notifs = await prisma.notification.findMany({
      where: { userId: user.id, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (notifs.length === 0) {
      replyText = "You have no unread notifications. All caught up!";
    } else {
      const lines = [`🔔 **Unread Notifications (${notifs.length}):**`];
      notifs.forEach((n, idx) => {
        lines.push(`${idx + 1}. **${n.title}** – ${n.message}`);
      });
      replyText = lines.join("\n");
    }
  } else if (
    attachedDocumentId ||
    lower.includes("send document") ||
    lower.includes("send this document") ||
    lower.includes("send my assignment") ||
    lower.includes("send my report") ||
    lower.includes("send this pdf") ||
    lower.includes("send pdf") ||
    lower.includes("message my teacher") ||
    lower.includes("message faculty") ||
    lower.includes("message admin") ||
    lower.includes("send to") ||
    lower.includes("send these") ||
    lower.includes("please send") ||
    lower.includes("ask my teacher to review") ||
    lower.includes("review this document") ||
    lower.includes("ko bhejo") ||
    lower.includes("ko bhej do") ||
    (lower.startsWith("send ") &&
      (lower.includes("to teacher") ||
        lower.includes("to admin") ||
        lower.includes("to faculty") ||
        lower.includes("to student") ||
        lower.includes("@")))
  ) {
    // 1. Determine Target Role or Specific Recipient Name
    let targetRole: string | null = null;
    if (lower.includes("teacher") || lower.includes("faculty")) targetRole = "faculty";
    else if (lower.includes("admin")) targetRole = "admin";
    else if (lower.includes("hod")) targetRole = "hod";
    else if (lower.includes("student")) targetRole = "student";

    const allUsers = await prisma.user.findMany({
      where: { id: { not: user.id }, status: "active" },
      include: { department: true },
    });

    const nameMatchedUsers = allUsers.filter((u) => {
      const firstName = u.name.split(" ")[0].toLowerCase();
      return firstName.length > 2 && lower.includes(firstName);
    });

    let candidateRecipients = nameMatchedUsers;
    if (candidateRecipients.length === 0) {
      if (targetRole) {
        candidateRecipients = allUsers.filter((u) => u.role === targetRole);
        if (targetRole === "faculty" && user.departmentId) {
          const deptFaculty = candidateRecipients.filter((u) => u.departmentId === user.departmentId);
          if (deptFaculty.length > 0) candidateRecipients = deptFaculty;
        }
      } else {
        candidateRecipients = allUsers.filter((u) => ["faculty", "admin"].includes(u.role));
      }
    }

    if (candidateRecipients.length === 0) {
      replyText = `Sorry, no active campus account matching '${targetRole || "recipient"}' was found to receive this message.`;
    } else if (candidateRecipients.length > 1 && !nameMatchedUsers.length && !targetRole) {
      const lines = [
        `I found multiple campus members who can receive this. Please specify the recipient:`,
      ];
      candidateRecipients.slice(0, 4).forEach((c, idx) => {
        lines.push(`${idx + 1}. **${c.name}** (${c.role.toUpperCase()} - ${c.department?.name || "Campus"})`);
      });
      replyText = lines.join("\n");
    } else {
      const chosenRecipient = candidateRecipients[0];

      // 2. Identify Document to Attach
      let docToAttach = null;
      if (attachedDocumentId) {
        docToAttach = await prisma.document.findUnique({
          where: { id: attachedDocumentId },
        });
      }

      const asksToSendDoc =
        lower.includes("send this pdf") ||
        lower.includes("send pdf") ||
        lower.includes("send document") ||
        lower.includes("send this document") ||
        lower.includes("send my assignment") ||
        lower.includes("send my report") ||
        lower.includes("review this document") ||
        lower.includes("send this file") ||
        lower.includes("pdf bhejo") ||
        lower.includes("document bhejo");

      // If user asks to send a document but has not attached one:
      if (asksToSendDoc && !docToAttach) {
        replyText = `Please attach or select the document you would like to send using the paperclip button (📎) before transmitting it to ${chosenRecipient.name} (${chosenRecipient.role.toUpperCase()}).`;
        return {
          sessionId,
          message: formatAiResponseInLanguage(replyText, userLanguage, userPrompt),
          contextSummary: {
            userRole: user.role,
            departmentName: user.department?.name || "Campus",
            documentCount: 0,
          },
        };
      }

      if (!docToAttach && !asksToSendDoc) {
        const myDocs = await prisma.document.findMany({
          where: {
            OR: [
              { uploadedById: user.id },
              { accessGrants: { some: { userId: user.id, status: "active", revokedAt: null } } },
              { classification: "public" },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        docToAttach =
          myDocs.find((d) => lower.includes(d.title.toLowerCase())) || null;
      }

      // Check Zero-Trust permissions for attached document
      if (docToAttach) {
        const isOwner = docToAttach.uploadedById === user.id;
        const isAdmin = user.role === "admin";
        const isPublic = docToAttach.classification === "public";

        if (docToAttach.classification === "restricted" && user.role === "student" && !isOwner) {
          replyText = `Zero-Trust Policy Violation: The document '${docToAttach.title}' is classified as RESTRICTED. Students are not permitted to share restricted campus documents.`;
          return {
            sessionId,
            message: formatAiResponseInLanguage(replyText, userLanguage, userPrompt),
          };
        }

        if (!isOwner && !isAdmin && !isPublic) {
          const hasGrant = await prisma.accessGrant.findFirst({
            where: {
              userId: user.id,
              documentId: docToAttach.id,
              status: "active",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              revokedAt: null,
            },
          });

          if (!hasGrant) {
            replyText = `Zero-Trust Error: You do not possess an active access grant to share '${docToAttach.title}'.`;
            return {
              sessionId,
              message: formatAiResponseInLanguage(replyText, userLanguage, userPrompt),
            };
          }
        }
      }

      const docSubject = docToAttach
        ? `Document Delivery: ${docToAttach.title}`
        : `Message from ${user.name}`;

      messengerAction = {
        type: "CONFIRM_MESSAGE",
        recipientId: chosenRecipient.id,
        recipientName: chosenRecipient.name,
        recipientRole: chosenRecipient.role,
        recipientDepartment: chosenRecipient.department?.name || "Campus",
        subject: docSubject,
        content: userPrompt,
        documentId: docToAttach?.id,
        documentTitle: docToAttach?.title,
        documentClassification: docToAttach?.classification,
      };

      const lines = [
        `🛡️ **Vault AI Secure Document Messenger - Delivery Confirmation**`,
        `Please verify the delivery details before transmission:`,
        `• **Recipient:** ${chosenRecipient.name} (${chosenRecipient.role.toUpperCase()} - ${chosenRecipient.department?.name || "Campus"})`,
        docToAttach
          ? `• **Attached Document:** ${docToAttach.title} (${docToAttach.classification.toUpperCase()})`
          : "• **Attachment:** None (Direct Message)",
        `• **Sender Authorization:** Verified (${user.role.toUpperCase()})`,
        `• **Transmission Protocol:** Protected Account-to-Account Reference (Zero-Trust Verified)`,
        `\n*Please confirm: Click the 'Confirm & Transmit' button below to securely deliver.*`,
      ];
      replyText = lines.join("\n");
    }
  } else if (
    lower === "confirm" ||
    lower === "confirm send" ||
    lower === "yes, send" ||
    lower === "yes send" ||
    lower === "haan bhej do"
  ) {
    const faculty = await prisma.user.findFirst({
      where: {
        id: { not: user.id },
        status: "active",
        ...(user.role === "student" ? { role: "faculty" } : { role: "admin" }),
      },
    });

    if (faculty) {
      const myDoc = await prisma.document.findFirst({
        where: {
          OR: [
            { uploadedById: user.id },
            { accessGrants: { some: { userId: user.id, status: "active", revokedAt: null } } },
          ],
        },
      });

      const res = await createSecureMessage(user, {
        recipientId: faculty.id,
        subject: myDoc ? `Document Delivery: ${myDoc.title}` : `Direct Message from ${user.name}`,
        messageContent: `Transmitted and verified via Vault AI Secure Messenger.`,
        documentId: myDoc?.id,
      });

      if (res.success) {
        replyText = `✅ **Secure Message Successfully Delivered!**\n\n• **Status:** DELIVERED\n• **Recipient:** ${faculty.name} (${faculty.role.toUpperCase()})\n${myDoc ? `• **Attached Document:** ${myDoc.title}\n` : ""}• **Delivery Record ID:** ${res.data?.messageId}\n\nThe recipient has received an in-app notification in their CAMPUSVAULT account.`;
      } else {
        replyText = `❌ Delivery Failed: ${res.error}`;
      }
    } else {
      replyText = `No pending delivery parameters found to confirm. Please specify who you would like to send a document to.`;
    }
  }

  if (!replyText) {
    // Step 2: Access Request Confirmation Flow
    // e.g. "yes, request access for [documentId or title]" or "request access to doc-id"
    const requestMatch =
      lower.startsWith("yes, request access") ||
      lower.startsWith("request access") ||
      lower.includes("please request access");

  if (requestMatch) {
    const discoverable = await getDiscoverableDepartmentDocuments(user);
    const missingDocs = discoverable.filter((d) => d.canRequestAccess);

    if (missingDocs.length > 0) {
      // Find matching doc from prompt or default to first missing
      let targetDoc = missingDocs.find(
        (d) =>
          lower.includes(d.id.toLowerCase()) ||
          lower.includes(d.title.toLowerCase())
      );
      if (!targetDoc) targetDoc = missingDocs[0];

      // Check if already requested
      const existingReq = await prisma.aiAccessRequest.findFirst({
        where: {
          userId: user.id,
          documentId: targetDoc.id,
          status: "PENDING",
        },
      });

      if (existingReq) {
        replyText = `You already have a pending access request for '${targetDoc.title}' submitted on ${existingReq.requestedAt.toLocaleDateString()}. Please await Administrator or HOD review.`;
      } else {
        const newReq = await prisma.aiAccessRequest.create({
          data: {
            userId: user.id,
            documentId: targetDoc.id,
            status: "PENDING",
          },
        });

        // Audit log the access request creation
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            documentId: targetDoc.id,
            action: "ai_access_request",
            decision: "pending",
            reason: `AI Assistant generated access request for ${targetDoc.title}`,
          },
        });

        replyText = `Your access request for '${targetDoc.title}' has been officially submitted with status PENDING (Request ID: ${newReq.id}). An authorized Department Administrator or Faculty member will review it. Note: Access requests do not grant automatic access.`;
      }

      await recordInteraction(user, userPrompt, replyText, sessionId);
      return {
        message: replyText,
        contextSummary: {
          userRole: user.role,
          departmentName: user.department?.name || "Unassigned",
          documentCount: discoverable.length,
        },
      };
    }
  }

  // Step 3: Intent Routing based on verified server-side identity

  // Scenario A: Department Documents / New Uploads Inquiry
  // "Is any new PDF available for my department?", "kya mere department ke liye koi naya document hai?"
  if (
    lower.includes("new pdf") ||
    lower.includes("new document") ||
    lower.includes("available for my department") ||
    lower.includes("mere department") ||
    lower.includes("department documents") ||
    lower.includes("discoverable") ||
    lower.includes("naya document")
  ) {
    const deptDocs = await getDiscoverableDepartmentDocuments(user);
    const deptName = user.department?.name || "your department";

    if (deptDocs.length === 0) {
      replyText = `Currently, there are no discoverable documents available for ${deptName}.`;
    } else {
      const activeDocs = deptDocs.filter((d) => d.hasActiveAccess);
      const missingGrantDocs = deptDocs.filter((d) => d.accessStatus === "MISSING_GRANT");
      const pendingDocs = deptDocs.filter((d) => d.accessStatus === "PENDING_REQUEST");

      const lines: string[] = [];
      lines.push(`Here is the document status for **${deptName}**:`);

      if (activeDocs.length > 0) {
        lines.push(`\n**Authorized Documents You Can Access:**`);
        activeDocs.forEach((d) => {
          lines.push(`• **${d.title}** (${d.classification.toUpperCase()}) – Active Access Granted.`);
        });
      }

      if (missingGrantDocs.length > 0) {
        lines.push(`\n**Eligible Department Documents Awaiting Grant:**`);
        missingGrantDocs.forEach((d) => {
          lines.push(
            `• **${d.title}** (${d.classification.toUpperCase()}) – Relevant to your department, but your account has not received access yet.`
          );
        });
        lines.push(
          `\n*A document relevant to your department is available, but your account has not received access yet. You can request access from your authorized Faculty member or Admin.*`
        );
        suggestedAction = {
          type: "REQUEST_ACCESS",
          documentId: missingGrantDocs[0].id,
          documentTitle: missingGrantDocs[0].title,
        };
      }

      if (pendingDocs.length > 0) {
        lines.push(`\n**Pending Access Requests Under Review:**`);
        pendingDocs.forEach((d) => {
          lines.push(`• **${d.title}** – Request submitted (PENDING).`);
        });
      }

      replyText = lines.join("\n");
    }
  }

  // Scenario B: Accessible Documents
  // "Which documents can I access?", "kaun se documents access kar sakta hu?"
  else if (
    lower.includes("which documents can i access") ||
    lower.includes("my documents") ||
    lower.includes("accessible") ||
    lower.includes("kaun se document") ||
    lower.includes("documents i can access")
  ) {
    const myDocs = await getMyDocuments(user);
    if (myDocs.length === 0) {
      replyText =
        "You currently do not have active access grants to any protected campus documents. Please check with your department coordinator if you require access.";
    } else {
      const lines = [
        `You are authorized to access **${myDocs.length}** document(s) under Zero-Trust policy:`,
      ];
      myDocs.forEach((d, i) => {
        lines.push(
          `${i + 1}. **${d.title}** [${d.classification.toUpperCase()}] – Department: ${d.departmentName}`
        );
      });
      replyText = lines.join("\n");
    }
  }

  // Scenario C: Access Grants, Expiry, & Revocation Status
  // "Do I have any pending access grants?", "Has any of my document access expired?", "revoked"
  else if (
    lower.includes("expired") ||
    lower.includes("revoked") ||
    lower.includes("grant status") ||
    lower.includes("access grants") ||
    lower.includes("meri permission")
  ) {
    const grants = await getMyAccessGrants(user);
    if (grants.length === 0) {
      replyText = "You have no document access grants on record.";
    } else {
      const active = grants.filter((g) => g.status === "active");
      const revoked = grants.filter((g) => g.status === "revoked");
      const expired = grants.filter((g) => g.status === "expired" || (g.expiresAt && new Date(g.expiresAt) <= new Date()));

      const lines = [`**Your Document Access Grant Status Summary:**`];
      lines.push(`• Active Grants: **${active.length}**`);
      lines.push(`• Expired Grants: **${expired.length}**`);
      lines.push(`• Revoked Grants: **${revoked.length}**`);

      if (revoked.length > 0) {
        lines.push(`\n**Revoked Permissions:**`);
        revoked.forEach((r) => {
          lines.push(
            `• '${r.documentTitle}' was revoked on ${r.revokedAt ? new Date(r.revokedAt).toLocaleDateString() : "recently"}. Download links are permanently disabled.`
          );
        });
      }

      if (expired.length > 0) {
        lines.push(`\n**Expired Permissions:**`);
        expired.forEach((e) => {
          lines.push(
            `• '${e.documentTitle}' expired on ${e.expiresAt ? new Date(e.expiresAt).toLocaleDateString() : "unknown"}.`
          );
        });
      }

      replyText = lines.join("\n");
    }
  }

  // Scenario D: Pending Access Requests
  else if (
    lower.includes("pending access requests") ||
    lower.includes("pending request") ||
    lower.includes("pending grants")
  ) {
    const requests = await getMyPendingAccessRequests(user);
    if (requests.length === 0) {
      replyText = "You do not have any pending document access requests.";
    } else {
      const lines = [`**Your Document Access Requests:**`];
      requests.forEach((r) => {
        lines.push(
          `• **${r.documentTitle}** – Status: **${r.status}** (Requested: ${new Date(r.requestedAt).toLocaleDateString()})`
        );
      });
      replyText = lines.join("\n");
    }
  }

  // Scenario E: Uploaded Documents (Faculty/Admin only)
  else if (
    lower.includes("my uploaded") ||
    lower.includes("documents have i uploaded") ||
    lower.includes("documents i uploaded") ||
    lower.includes("maine upload")
  ) {
    if (user.role === "student") {
      replyText =
        "Student accounts do not have upload privileges in CampusVault. Only Faculty and Administrative staff can upload campus documents.";
    } else {
      const docs = await prisma.document.findMany({
        where: { uploadedById: user.id },
        include: { department: true },
        orderBy: { createdAt: "desc" },
      });

      if (docs.length === 0) {
        replyText = "You have not uploaded any documents yet.";
      } else {
        const lines = [`**Documents Uploaded by You (${docs.length}):**`];
        docs.forEach((d: any, idx: number) => {
          lines.push(
            `${idx + 1}. **${d.title}** (${d.classification.toUpperCase()}) – Dept: ${d.department.name}`
          );
        });
        replyText = lines.join("\n");
      }
    }
  }

  // Scenario F: Admin Security Summary
  else if (
    (lower.includes("how many documents") ||
      lower.includes("total documents") ||
      lower.includes("security summary") ||
      lower.includes("campus statistics") ||
      lower.includes("department counts") ||
      lower.includes("recent security events")) &&
    (user.role === "admin" || user.role === "hod")
  ) {
    const summary = await getAdminSecuritySummary(user);
    const lines = [
      `🏛️ **CampusVault Administrative Security Summary:**`,
      `• Total Documents: **${summary.totalDocuments}**`,
      `• Active Access Grants: **${summary.activeGrants}**`,
      `• Revoked Access Grants: **${summary.revokedGrants}**`,
      `• Registered Users: **${summary.totalUsers}**`,
      `• Pending Access Requests: **${summary.pendingAccessRequests}**`,
      `\n**Department Document Distribution:**`,
    ];
    summary.departmentCounts.forEach((d: any) => {
      lines.push(`• ${d.name}: ${d.documentCount} document(s), ${d.userCount} member(s)`);
    });
    replyText = lines.join("\n");
  }

  // Fallback: Conversational and General Guidance
  else if (
    lower.includes("who are you") ||
    lower.includes("tum kaun ho") ||
    lower.includes("aap kaun ho") ||
    lower.includes("kya ho tum")
  ) {
    replyText = `I am Vault AI, your private CampusVault Assistant. I help verified university members (${user.role.toUpperCase()}) securely navigate authorized campus documents, manage permissions, and transfer files under strict Zero-Trust security rules.`;
  } else if (
    lower.includes("how are you") ||
    lower.includes("kaise ho") ||
    lower.includes("kya haal") ||
    lower.includes("kaisa chal raha")
  ) {
    replyText = `Main bilkul theek hoon! I'm ready to assist you with authorized document searches, access permissions, or secure file messaging. Aap bataiye, kya madad chahiye?`;
  } else if (
    lower.includes("what can you do") ||
    lower.includes("kya kar sakte ho") ||
    lower.includes("help me") ||
    lower.includes("madad")
  ) {
    replyText = `Here is what I can do for your ${user.role.toUpperCase()} account in ${user.department?.name || "Campus"}:
• **Authorized Documents:** Ask "Which documents can I access?" or search for course guidelines.
• **Permissions Status:** Ask "Do I have any pending or expired grants?"
• **Secure Messaging:** Type "Send this document to Teacher" or attach files with the paperclip button.
• **Multilingual:** You can chat in English, Hindi, or natural Hinglish!`;
  } else {
    replyText = `Hello ${user.name}! I am your private CampusVault Document Assistant.
Under Zero-Trust security, I only have access to records permitted for your verified account (${user.role.toUpperCase()} in ${user.department?.name || "Campus"}).

You can ask me:
• "Is any new document available for my department?"
• "Which documents can I access?"
• "Do I have any pending access grants or requests?"
• "Has any of my document access expired or been revoked?"
${user.role === "admin" ? '• "Show security summary and pending access requests."' : ""}

Aap Hindi ya Hinglish me bhi pooch sakte hain!`;
    }
  }

  // Apply Multilingual Translation based on independent AI Language setting
  const effectiveAiLang = aiLanguagePreference || (user as any).aiLanguage || "auto";
  const finalReply = formatAiResponseInLanguage(replyText, effectiveAiLang, userPrompt);

  const savedSessionId = await recordInteraction(user, userPrompt, finalReply, sessionId);

  return {
    sessionId: savedSessionId,
    message: finalReply,
    suggestedAction,
    messengerAction,
    ticketAction,
    ticketList,
    receivedMessages,
    contextSummary: {
      userRole: user.role,
      departmentName: user.department?.name || "Campus",
      documentCount: 0,
    },
  };
}

/**
 * Saves chat interaction into user's private session in DB
 */
async function recordInteraction(
  user: UserContext,
  userMessage: string,
  assistantReply: string,
  sessionId?: string
): Promise<string> {
  try {
    let session = sessionId
      ? await prisma.aiChatSession.findFirst({
          where: { id: sessionId, userId: user.id },
        })
      : null;

    if (!session) {
      session = await prisma.aiChatSession.create({
        data: {
          userId: user.id,
          title: userMessage.substring(0, 36) + (userMessage.length > 36 ? "..." : ""),
        },
      });
    }

    await prisma.aiChatMessage.createMany({
      data: [
        {
          sessionId: session.id,
          userId: user.id,
          messageRole: "user",
          messageContent: userMessage,
        },
        {
          sessionId: session.id,
          userId: user.id,
          messageRole: "assistant",
          messageContent: assistantReply,
        },
      ],
    });

    await prisma.aiChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return session.id;
  } catch (err) {
    console.error("[AI CHAT RECORDING ERROR]", err);
    return sessionId || "";
  }
}
