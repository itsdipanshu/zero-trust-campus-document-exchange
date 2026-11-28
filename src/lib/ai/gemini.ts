import { GoogleGenerativeAI, FunctionDeclaration, DynamicRetrievalMode } from "@google/generative-ai";
import { UserContext, getMyDocuments, getMyPendingAccessRequests, SafeDocumentMetadata } from "./context";
import { ChatResponse } from "./engine";
import prisma from "../db";
import { getUserMessages } from "../messages/service";

/**
 * Checks whether Google Gemini API key is configured and valid
 */
export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 10 && !key.includes("your-gemini-api-key") && !key.includes("000000"));
}

/**
 * Returns the configured Gemini model name
 */
export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

/**
 * Safe server-side tool declarations for Gemini Function Calling
 */
const tools: FunctionDeclaration[] = [
  {
    name: "findMyAccessibleDocuments",
    description: "Finds campus documents that the authenticated user is authorized to access under Zero-Trust RBAC/ABAC rules.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        filter: {
          type: "STRING" as any,
          description: "Optional search term or classification filter (public, internal, confidential)",
        },
      },
    },
  },
  {
    name: "checkPendingAccessRequests",
    description: "Checks pending document access requests submitted by the authenticated user.",
    parameters: {
      type: "OBJECT" as any,
      properties: {},
    },
  },
  {
    name: "checkDocumentAccessStatus",
    description: "Checks if the user has an active grant, expired grant, or needs to request access for a specific document.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        documentTitle: {
          type: "STRING" as any,
          description: "Title or keyword of the document to inspect",
        },
      },
      required: ["documentTitle"],
    },
  },
  {
    name: "showReceivedMessages",
    description: "Retrieves recent messages and shared documents delivered to the authenticated user's account.",
    parameters: {
      type: "OBJECT" as any,
      properties: {},
    },
  },
  {
    name: "prepareSecureDocumentDelivery",
    description: "Prepares a Zero-Trust verified document or message delivery confirmation card. ONLY call this when the user explicitly commands to SEND or TRANSMIT a file/message TO a recipient (e.g. 'Send this PDF to Teacher' or 'Deliver document to Dr. Sharma'). NEVER call this tool when the user is asking whether they received a document, asking about tickets, or asking questions.",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        recipientIdentifier: {
          type: "STRING" as any,
          description: "Target recipient role (teacher, faculty, admin, student) or person's name",
        },
        documentIdentifier: {
          type: "STRING" as any,
          description: "Optional document title or ID to attach",
        },
        messageNote: {
          type: "STRING" as any,
          description: "User's accompanying message or instructions",
        },
      },
      required: ["recipientIdentifier"],
    },
  },
  {
    name: "requestDocumentReAccess",
    description: "Requests re-access to a previously accessed campus document with a mandatory user reason. If user hasn't provided a reason, you must ask: 'Why do you need access to this document again? Please explain your reason.'",
    parameters: {
      type: "OBJECT" as any,
      properties: {
        documentTitle: {
          type: "STRING" as any,
          description: "Title of the document to request re-access for",
        },
        reason: {
          type: "STRING" as any,
          description: "Mandatory non-empty explanation of why user needs re-access again",
        },
      },
      required: ["documentTitle"],
    },
  },
  {
    name: "checkReAccessTickets",
    description: "Checks document access tickets and student re-access requests. If the user is an Admin or Faculty/Owner, this checks tickets submitted by students or department members. If the user is a Student, this checks the tickets they requested.",
    parameters: {
      type: "OBJECT" as any,
      properties: {},
    },
  },
];

/**
 * Executes a server-side tool with strict Zero-Trust boundary enforcement
 */
async function executeGeminiTool(
  name: string,
  args: Record<string, any>,
  user: UserContext,
  attachedDocId?: string
): Promise<{ toolResult: Record<string, any>; chatResponsePartial?: Partial<ChatResponse> }> {
  switch (name) {
    case "findMyAccessibleDocuments": {
      const docs = await getMyDocuments(user);
      const filter = args.filter?.toLowerCase();
      const filtered = filter
        ? docs.filter((d) => d.title.toLowerCase().includes(filter) || d.classification.toLowerCase() === filter)
        : docs;

      return {
        toolResult: {
          count: filtered.length,
          documents: filtered.map((d) => ({
            id: d.id,
            title: d.title,
            classification: d.classification,
            department: d.departmentName,
            fileSizeKb: Math.round(d.fileSize / 1024),
            accessStatus: d.accessStatus,
          })),
        },
      };
    }

    case "checkPendingAccessRequests": {
      const requests = await getMyPendingAccessRequests(user);
      return {
        toolResult: {
          count: requests.length,
          requests: requests.map((r) => ({
            documentTitle: r.documentTitle,
            status: r.status,
            requestedAt: r.requestedAt,
          })),
        },
      };
    }

    case "checkDocumentAccessStatus": {
      const titleQuery = (args.documentTitle || "").toLowerCase();
      const docs = await getMyDocuments(user);
      const matched = docs.find((d) => d.title.toLowerCase().includes(titleQuery));

      if (matched) {
        return {
          toolResult: {
            found: true,
            title: matched.title,
            accessStatus: matched.accessStatus,
            hasActiveAccess: matched.hasActiveAccess,
            classification: matched.classification,
          },
        };
      }

      // Check department discoverable docs
      const deptDoc = await prisma.document.findFirst({
        where: { title: { contains: titleQuery } },
        include: { department: true },
      });

      if (!deptDoc) {
        return { toolResult: { found: false, message: `No document matching '${args.documentTitle}' found.` } };
      }

      const activeGrant = await prisma.accessGrant.findFirst({
        where: { userId: user.id, documentId: deptDoc.id, status: "active" },
      });

      return {
        toolResult: {
          found: true,
          title: deptDoc.title,
          classification: deptDoc.classification,
          department: deptDoc.department.name,
          hasActiveAccess: !!activeGrant || deptDoc.classification === "public",
          accessStatus: activeGrant ? "ACTIVE_GRANT" : deptDoc.classification === "public" ? "PUBLIC_ACCESS" : "MISSING_GRANT",
        },
        chatResponsePartial: {
          suggestedAction: !activeGrant && deptDoc.classification !== "public"
            ? { type: "REQUEST_ACCESS", documentId: deptDoc.id, documentTitle: deptDoc.title }
            : undefined,
        },
      };
    }

    case "showReceivedMessages": {
      const messagesData = await getUserMessages(user.id);
      const inbox = messagesData.inbox || [];

      return {
        toolResult: {
          totalCount: inbox.length,
          messages: inbox.slice(0, 5).map((m: any) => ({
            id: m.id,
            from: m.sender.name,
            role: m.sender.role,
            subject: m.subject,
            receivedAt: m.createdAt,
            hasAttachment: m.attachments && m.attachments.length > 0,
            attachmentTitle: m.attachments?.[0]?.document?.title,
          })),
        },
        chatResponsePartial: {
          receivedMessages: inbox.map((m: any) => ({
            messageId: m.id,
            senderName: m.sender.name,
            senderRole: m.sender.role,
            senderDepartment: m.sender.department?.name,
            subject: m.subject,
            content: m.messageContent,
            receivedAt: m.createdAt.toISOString(),
            status: m.status,
            attachment: m.attachments?.[0]
              ? {
                  id: m.attachments[0].id,
                  documentId: m.attachments[0].document.id,
                  title: m.attachments[0].document.title,
                  classification: m.attachments[0].document.classification,
                  fileSize: m.attachments[0].document.fileSize,
                  fileName: m.attachments[0].document.fileName,
                }
              : undefined,
          })),
        },
      };
    }

    case "prepareSecureDocumentDelivery": {
      const recipientTerm = (args.recipientIdentifier || "").toLowerCase();
      let targetRole: string | null = null;
      if (recipientTerm.includes("teacher") || recipientTerm.includes("faculty")) targetRole = "faculty";
      else if (recipientTerm.includes("admin")) targetRole = "admin";
      else if (recipientTerm.includes("hod")) targetRole = "hod";
      else if (recipientTerm.includes("student")) targetRole = "student";

      const allUsers = await prisma.user.findMany({
        where: { id: { not: user.id }, status: "active" },
        include: { department: true },
      });

      const nameMatched = allUsers.filter((u) => {
        const firstName = u.name.split(" ")[0].toLowerCase();
        return firstName.length > 2 && recipientTerm.includes(firstName);
      });

      let candidateRecipients = nameMatched;
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
        return {
          toolResult: { success: false, error: `No active account matching '${args.recipientIdentifier}' found.` },
        };
      }

      const chosenRecipient = candidateRecipients[0];

      // Identify document
      let docToAttach = null;
      const docId = attachedDocId || args.documentIdentifier;
      if (docId) {
        docToAttach = await prisma.document.findFirst({
          where: {
            OR: [
              { id: docId },
              { title: { contains: docId } },
            ],
          },
        });
      }

      if (docToAttach) {
        // Zero-Trust verification
        const isOwner = docToAttach.uploadedById === user.id;
        const isAdmin = user.role === "admin";
        const isPublic = docToAttach.classification === "public";

        if (docToAttach.classification === "restricted" && user.role === "student" && !isOwner) {
          return {
            toolResult: {
              success: false,
              error: `Zero-Trust Policy Violation: '${docToAttach.title}' is RESTRICTED and cannot be shared by student accounts.`,
            },
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
            return {
              toolResult: {
                success: false,
                error: `Zero-Trust Error: You do not possess an active access grant to share '${docToAttach.title}'.`,
              },
            };
          }
        }
      }

      const messengerAction: ChatResponse["messengerAction"] = {
        type: "CONFIRM_MESSAGE",
        recipientId: chosenRecipient.id,
        recipientName: chosenRecipient.name,
        recipientRole: chosenRecipient.role,
        recipientDepartment: chosenRecipient.department?.name || "Campus",
        subject: docToAttach ? `Document Delivery: ${docToAttach.title}` : `Message from ${user.name}`,
        content: args.messageNote || `Message to ${chosenRecipient.name}`,
        documentId: docToAttach?.id,
        documentTitle: docToAttach?.title,
        documentClassification: docToAttach?.classification,
      };

      return {
        toolResult: {
          success: true,
          recipient: `${chosenRecipient.name} (${chosenRecipient.role.toUpperCase()} - ${chosenRecipient.department?.name || "Campus"})`,
          attachedDocument: docToAttach?.title || "None",
          classification: docToAttach?.classification || "N/A",
          status: "AWAITING_USER_CONFIRMATION",
        },
        chatResponsePartial: {
          messengerAction,
        },
      };
    }

    case "requestDocumentReAccess": {
      const docQuery = (args.documentTitle || "").toLowerCase();
      const reason = (args.reason || "").trim();

      const matchedDoc = await prisma.document.findFirst({
        where: { title: { contains: docQuery } },
        include: { uploadedBy: true, department: true },
      });

      if (!matchedDoc) {
        return {
          toolResult: {
            success: false,
            message: `Document matching '${args.documentTitle}' was not found.`,
          },
        };
      }

      if (!reason || reason.length === 0) {
        return {
          toolResult: {
            success: false,
            needReason: true,
            promptQuestion: "Why do you need access to this document again? Please explain your reason.",
            documentTitle: matchedDoc.title,
            documentId: matchedDoc.id,
          },
        };
      }

      const ownerName = matchedDoc.uploadedBy?.name || "Document Owner";
      const userDept = user.department?.name || matchedDoc.department?.name || "Campus";

      const ticketAction: ChatResponse["ticketAction"] = {
        type: "CONFIRM_TICKET",
        documentId: matchedDoc.id,
        documentTitle: matchedDoc.title,
        documentOwnerName: ownerName,
        requesterName: user.name,
        requesterRole: user.role,
        departmentName: userDept,
        reason,
      };

      return {
        toolResult: {
          success: true,
          status: "AWAITING_CONFIRMATION",
          documentTitle: matchedDoc.title,
          documentOwner: ownerName,
          requester: user.name,
          reason,
          message: "Access request prepared. Confirmation is required from user.",
        },
        chatResponsePartial: {
          ticketAction,
        },
      };
    }

    case "checkReAccessTickets": {
      const isAdmin = user.role === "admin";
      const isFaculty = user.role === "faculty" || user.role === "hod";

      const whereClause = isAdmin
        ? {}
        : isFaculty
        ? { OR: [{ documentOwnerId: user.id }, { requesterId: user.id }] }
        : { requesterId: user.id };

      const tickets = await prisma.documentAccessTicket.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        include: {
          document: true,
          documentOwner: true,
          requester: { select: { id: true, name: true, email: true, role: true } },
        },
        take: 10,
      });

      return {
        toolResult: {
          userRole: user.role,
          count: tickets.length,
          tickets: tickets.map((t) => ({
            ticketId: t.ticketId,
            document: t.document?.title || "Unknown Document",
            requesterName: t.requester?.name || "Student",
            requesterRole: t.requester?.role || "student",
            owner: t.documentOwner?.name || "Faculty",
            status: t.status,
            reason: t.reason,
            rejectionReason: t.rejectionReason,
            createdAt: t.createdAt,
          })),
        },
        chatResponsePartial: {
          ticketList: tickets.map((t) => ({
            ticketId: t.ticketId,
            documentTitle: t.document?.title || "Unknown Document",
            documentOwner: t.documentOwner?.name || "Faculty",
            status: t.status,
            reason: t.reason,
            rejectionReason: t.rejectionReason || undefined,
            createdAt: t.createdAt.toISOString(),
          })),
        },
      };
    }

    default:
      return { toolResult: { error: `Unknown tool: ${name}` } };
  }
}

/**
 * Executes chat inference with Google Gemini API
 */
export async function generateGeminiChatResponse(
  userPrompt: string,
  user: UserContext,
  recentHistory: Array<{ role: string; content: string }>,
  aiLanguagePreference?: string,
  attachedDocumentId?: string
): Promise<ChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }

  const modelName = getGeminiModelName();
  const genAI = new GoogleGenerativeAI(apiKey);

  const langPref = (aiLanguagePreference || (user as any).aiLanguage || "auto").toLowerCase();
  const languageInstruction =
    langPref === "hi"
      ? "CRITICAL MANDATORY INSTRUCTION: The user has selected HINDI. You MUST write your ENTIRE response in Hindi using the Devanagari script (e.g. 'विद्यार्थियों की तरफ से कोई नया टिकट नहीं आया है।'). Do NOT respond in English."
      : langPref === "hinglish"
      ? "CRITICAL MANDATORY INSTRUCTION: The user has selected HINGLISH. You MUST write your ENTIRE response in natural, conversational Hinglish (Hindi written in Roman/English alphabet, e.g. 'Students ki taraf se koi pending access ticket nahi aaya hai.'). Do NOT respond in pure English."
      : langPref === "en"
      ? "CRITICAL MANDATORY INSTRUCTION: Reply strictly in English."
      : "Detect the language of the user prompt and reply in the matching language (if user writes in Hindi or Hinglish, reply in Hindi/Hinglish; if English, reply in English).";

  const systemInstruction = `You are Vault AI, the Private Campus Document Assistant for the CAMPUSVAULT platform (NexHack 2.0).
Your core duty is to help campus members securely manage documents, review permissions, and exchange files under Zero-Trust security protocols.

AUTHENTICATED USER CONTEXT:
- Name: ${user.name}
- Email: ${user.email}
- Role: ${user.role.toUpperCase()}
- Department: ${user.department?.name || "Unassigned"}

SECURITY & PRIVACY RULES:
1. Never disclose encryption keys (AES-256-GCM), password hashes, physical storage keys/paths, or database connection strings.
2. Never reveal confidential document contents or uploader identities to unauthorized students.
3. FOLLOW-UPS & RE-CHECKS: When the user says 'check again', 're-check', 'cheak agen', or asks a follow-up about messages, tickets, or documents, check conversation history and RE-RUN the appropriate lookup tool (such as showReceivedMessages or checkReAccessTickets). NEVER output a generic greeting on follow-ups!
4. SENDING FILES: ONLY call 'prepareSecureDocumentDelivery' when the user explicitly commands to SEND or TRANSMIT a file TO someone (e.g. 'Send this PDF to Teacher'). NEVER call this tool when the user is asking whether someone sent them a message, asking about tickets, or asking questions like 'did any student send a ticket?'.
5. TICKETS & RE-ACCESS: For inquiries about access tickets, pending requests, or student requests (e.g. 'koi student bheja ticket', 'pending tickets'), ALWAYS call 'checkReAccessTickets'.
6. ACCESSIBLE DOCUMENTS: For questions about accessible documents, call 'findMyAccessibleDocuments'.
7. RECEIVED MESSAGES: For received messages or who sent documents, call 'showReceivedMessages'.
8. MANDATORY REASON RULE: If a user asks for re-access to a document (e.g. 'I need X again' or 'raise ticket'), you MUST ask: 'Why do you need access to this document again? Please explain your reason.' A non-empty reason is strictly required before any ticket can be created. Never submit or invent a reason yourself.

LANGUAGE GUIDELINE:
${languageInstruction}

Be concise, polite, professional, and clear.`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    tools: [{ functionDeclarations: tools }],
  });

  // Map history to Gemini contents format
  const contents: any[] = recentHistory.slice(-8).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  // Append current prompt with explicit attachment context if present
  let promptToSend = userPrompt;
  if (attachedDocumentId) {
    promptToSend = `${userPrompt}\n[User has attached Document ID: "${attachedDocumentId}". Call prepareSecureDocumentDelivery to prepare transfer confirmation.]`;
  }

  contents.push({
    role: "user",
    parts: [{ text: promptToSend }],
  });

  let response = await model.generateContent({ contents });
  let candidate = response.response.candidates?.[0];
  let functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

  let accumulatedPartial: Partial<ChatResponse> = {};

  const lowerPrompt = userPrompt.toLowerCase().trim();

  // Safeguard: Do NOT treat received questions or ticket inquiries as send commands
  const isQuestionAboutReceivedOrTickets =
    lowerPrompt.includes("kya") ||
    lowerPrompt.includes("kisne") ||
    lowerPrompt.includes("kisine") ||
    lowerPrompt.includes("nhi") ||
    lowerPrompt.includes("nahi") ||
    lowerPrompt.includes("ticket") ||
    lowerPrompt.includes("tiket") ||
    lowerPrompt.includes("check") ||
    lowerPrompt.includes("cheak") ||
    lowerPrompt.includes("show") ||
    lowerPrompt.includes("did anyone") ||
    lowerPrompt.includes("who sent");

  const isExplicitSendCommand =
    Boolean(attachedDocumentId) ||
    lowerPrompt.startsWith("send ") ||
    lowerPrompt.includes("send to ") ||
    lowerPrompt.includes("send document to") ||
    lowerPrompt.includes("send this to") ||
    lowerPrompt.includes("please send this") ||
    lowerPrompt.includes("ko bhej do") ||
    lowerPrompt.includes("ko bhejo") ||
    lowerPrompt.includes("ko transmit karo");

  if (!functionCalls || functionCalls.length === 0) {
    if ((lowerPrompt.includes("ticket") || lowerPrompt.includes("tiket")) && !isExplicitSendCommand) {
      const ticketExec = await executeGeminiTool("checkReAccessTickets", {}, user, attachedDocumentId);
      if (ticketExec.chatResponsePartial) {
        accumulatedPartial = { ...accumulatedPartial, ...ticketExec.chatResponsePartial };
      }
    } else if (isExplicitSendCommand && !isQuestionAboutReceivedOrTickets) {
      const fallbackToolExec = await executeGeminiTool(
        "prepareSecureDocumentDelivery",
        { recipientIdentifier: userPrompt, messageNote: userPrompt },
        user,
        attachedDocumentId
      );
      if (fallbackToolExec.chatResponsePartial?.messengerAction) {
        accumulatedPartial = { ...accumulatedPartial, ...fallbackToolExec.chatResponsePartial };
      }
    }
  }

  // If Gemini requested function call(s)
  if (functionCalls && functionCalls.length > 0) {
    const call = functionCalls[0].functionCall!;
    const toolExec = await executeGeminiTool(call.name, call.args as Record<string, any>, user, attachedDocumentId);

    if (toolExec.chatResponsePartial) {
      accumulatedPartial = { ...accumulatedPartial, ...toolExec.chatResponsePartial };
    }

    // Send function execution result back to Gemini to complete turn
    contents.push(candidate!.content);
    contents.push({
      role: "function",
      parts: [
        {
          functionResponse: {
            name: call.name,
            response: {
              ...toolExec.toolResult,
              _targetLanguageRequirement: `Explain this result in ${langPref === "hi" ? "Hindi (Devanagari script)" : langPref === "hinglish" ? "natural Hinglish (Roman alphabet)" : "English"}.`,
            },
          },
        },
      ],
    });

    const secondTurn = await model.generateContent({ contents });
    const replyText = secondTurn.response.text();

    return {
      message: replyText,
      ...accumulatedPartial,
      contextSummary: {
        userRole: user.role,
        departmentName: user.department?.name || "Campus",
        documentCount: 0,
      },
    };
  }

  // Pure text answer
  const replyText = response.response.text();

  return {
    message: replyText,
    ...accumulatedPartial,
    contextSummary: {
      userRole: user.role,
      departmentName: user.department?.name || "Campus",
      documentCount: 0,
    },
  };
}
