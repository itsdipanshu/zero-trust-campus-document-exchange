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
    description: "Prepares a Zero-Trust verified document or message delivery confirmation card. Verifies recipient and sender rights.",
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
      ? "Always reply strictly in Hindi (Devanagari script)."
      : langPref === "hinglish"
      ? "Always reply naturally in Hinglish (Hindi written in Roman English alphabet), friendly and conversational."
      : langPref === "en"
      ? "Always reply strictly in English."
      : "Detect the language of the user prompt and reply in the matching language (English, Hindi, or Hinglish).";

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
3. For sending documents, messages, or files to teachers, admins, or peers, ALWAYS call the 'prepareSecureDocumentDelivery' tool. NEVER claim you directly transferred a file without user confirmation.
4. For questions about accessible documents, call 'findMyAccessibleDocuments'.
5. For checking pending requests, call 'checkPendingAccessRequests'.
6. For status of specific documents, call 'checkDocumentAccessStatus'.
7. For received messages or who sent documents, call 'showReceivedMessages'.

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

  // If Gemini did not call tool but user explicitly requested to send a document or attached a file
  const isSendIntent =
    userPrompt.toLowerCase().includes("send") ||
    userPrompt.toLowerCase().includes("bhej") ||
    userPrompt.toLowerCase().includes("deliver");

  if ((!functionCalls || functionCalls.length === 0) && (attachedDocumentId || isSendIntent)) {
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
            response: toolExec.toolResult,
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
