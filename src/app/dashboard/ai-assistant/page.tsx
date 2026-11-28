"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  Shield,
  Bot,
  User,
  Plus,
  Trash2,
  KeyRound,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Edit2,
  Search,
  MessageSquare,
  Lock,
  Globe,
  Paperclip,
  Download,
  Upload,
  X,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: { id: string; name: string } | null;
}

interface CampusDocument {
  id: string;
  title: string;
  classification: string;
  fileSize: number;
  fileName?: string;
  department?: { id: string; name: string } | null;
}

interface ReceivedMessageCard {
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

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
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
  receivedMessages?: ReceivedMessageCard[];
}

interface ChatSession {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
}

export default function AiAssistantPage() {
  const { t, aiLanguage, setAiLanguage } = useTranslation();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: string;
    text: string;
  } | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");

  // In-Chat Attachment Selection State
  const [availableDocs, setAvailableDocs] = useState<CampusDocument[]>([]);
  const [selectedAttachment, setSelectedAttachment] =
    useState<CampusDocument | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"upload" | "select">("upload");
  const [docSearch, setDocSearch] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<
    string | null
  >(null);
  const [geminiStatus, setGeminiStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);

  // Delivery confirmation loading
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);

  // Rename session modal state
  const [renameModalSession, setRenameModalSession] =
    useState<ChatSession | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState("");

  // Delete single session confirmation modal
  const [deleteModalSessionId, setDeleteModalSessionId] = useState<
    string | null
  >(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasTriggeredUrlInquiry = useRef<boolean>(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load user profile
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCurrentUser(data.data.user);
        }
      })
      .catch(console.error);

    fetch("/api/ai/gemini-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setGeminiStatus(data.data);
        }
      })
      .catch(() => {});
  }, []);

  // 1. Fetch documents available to attach
  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents?limit=50");
      const data = await res.json();
      if (data.success && data.data?.documents) {
        setAvailableDocs(data.data.documents);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  // Handle direct file upload from device
  const handleFileUpload = async (file: File) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/png",
      "image/jpeg",
    ];
    const isAllowedExt =
      /\.(pdf|doc|docx|txt|png|jpe?g)$/i.test(file.name);

    if (!allowedTypes.includes(file.type) && !isAllowedExt) {
      setNotification({
        type: "error",
        text: "Unsupported file type. Please upload PDF, DOC, DOCX, TXT, PNG, or JPG.",
      });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setNotification({
        type: "error",
        text: "File size exceeds 15MB campus policy limit.",
      });
      return;
    }

    if (file.size === 0) {
      setNotification({
        type: "error",
        text: "Cannot attach an empty file.",
      });
      return;
    }

    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      const res = await fetch("/api/documents/attach", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.data?.document) {
        const uploadedDoc = data.data.document;
        setSelectedAttachment(uploadedDoc);
        setAvailableDocs((prev) => [uploadedDoc, ...prev]);
        setShowDocPicker(false);
        setNotification({
          type: "success",
          text: `Document '${file.name}' encrypted and attached!`,
        });
      } else {
        setNotification({
          type: "error",
          text: data.error || "Failed to upload document",
        });
      }
    } catch {
      setNotification({
        type: "error",
        text: "Network error uploading document",
      });
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 2. Fetch user's conversation sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/sessions");
      const data = await res.json();
      if (data.success) {
        setSessions(data.data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to fetch sessions", err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // 3. Load specific session conversation
  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch(`/api/ai/chat?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(
          data.data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          }))
        );
      }
    } catch {
      setNotification({
        type: "error",
        text: "Failed to load conversation history",
      });
    }
  };

  // Start new conversation
  const handleNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setSelectedAttachment(null);
  };

  // Rename Session
  const handleRenameSession = async () => {
    if (!renameModalSession || !newSessionTitle.trim()) return;
    try {
      const res = await fetch("/api/ai/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: renameModalSession.id,
          title: newSessionTitle.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === renameModalSession.id
              ? { ...s, title: newSessionTitle.trim() }
              : s
          )
        );
        setRenameModalSession(null);
        setNewSessionTitle("");
        setNotification({ type: "success", text: "Conversation renamed" });
      } else {
        setNotification({
          type: "error",
          text: data.error || "Failed to rename",
        });
      }
    } catch {
      setNotification({
        type: "error",
        text: "Network error renaming conversation",
      });
    }
  };

  // Delete Single Session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai/sessions?id=${sessionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
        setDeleteModalSessionId(null);
        setNotification({ type: "success", text: "Conversation deleted" });
      } else {
        setNotification({
          type: "error",
          text: data.error || "Failed to delete",
        });
      }
    } catch {
      setNotification({
        type: "error",
        text: "Network error deleting conversation",
      });
    }
  };

  // Clear all conversations
  const handleClearAllSessions = async () => {
    if (
      !confirm(
        t(
          "ai.deleteConfirm",
          "Are you sure you want to clear your AI conversation history?"
        )
      )
    )
      return;
    try {
      await fetch("/api/ai/sessions", { method: "DELETE" });
      setSessions([]);
      setMessages([]);
      setCurrentSessionId(null);
      setNotification({
        type: "success",
        text: "Chat history cleared successfully",
      });
    } catch {
      setNotification({
        type: "error",
        text: "Failed to clear conversations",
      });
    }
  };

  // 4. Send Message (with optional attachment and conversation continuity)
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const text = textToSend || inputPrompt;
      if (!text.trim() || loading) return;

      const attachedDocInfo = selectedAttachment
        ? `\n📎 [Attached: ${selectedAttachment.title} (${selectedAttachment.classification.toUpperCase()})]`
        : "";

      const userMessage: Message = {
        id: "temp-" + Date.now(),
        role: "user",
        content: text + attachedDocInfo,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputPrompt("");
      const docIdToSend = selectedAttachment?.id;
      setSelectedAttachment(null);
      setShowDocPicker(false);
      setLoading(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            sessionId: currentSessionId || undefined,
            aiLanguage,
            attachedDocumentId: docIdToSend,
          }),
        });

        const data = await res.json();
        if (data.success) {
          if (data.data.sessionId && !currentSessionId) {
            setCurrentSessionId(data.data.sessionId);
          }

          const assistantMessage: Message = {
            id: "bot-" + Date.now(),
            role: "assistant",
            content: data.data.message,
            suggestedAction: data.data.suggestedAction,
            messengerAction: data.data.messengerAction,
            ticketAction: data.data.ticketAction,
            ticketList: data.data.ticketList,
            receivedMessages: data.data.receivedMessages,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          fetchSessions();
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: "err-" + Date.now(),
              role: "assistant",
              content:
                "Sorry, I encountered an error processing your query. Please try again.",
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: "err-" + Date.now(),
            role: "assistant",
            content:
              "Network error: Unable to reach the Zero-Trust AI Assistant server.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [
      inputPrompt,
      loading,
      selectedAttachment,
      currentSessionId,
      aiLanguage,
      fetchSessions,
    ]
  );

  // Auto-trigger inquiry if navigated via notification click
  useEffect(() => {
    if (typeof window !== "undefined" && !hasTriggeredUrlInquiry.current) {
      const urlParams = new URLSearchParams(window.location.search);
      const inquiry = urlParams.get("inquiry");
      if (inquiry === "latest-message" || inquiry === "messages") {
        hasTriggeredUrlInquiry.current = true;
        handleSendMessage(
          "Show the details of my latest received message and documents"
        );
      }
    }
  }, [handleSendMessage]);

  // 5. Confirm and Execute Secure Delivery from Messenger Card
  const handleConfirmMessengerDelivery = async (
    action: NonNullable<Message["messengerAction"]>
  ) => {
    setConfirmingDelivery(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: action.recipientId,
          subject: action.subject,
          messageContent: action.content,
          documentId: action.documentId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: "delivery-conf-" + Date.now(),
            role: "assistant",
            content: `✅ **Your document was successfully sent to ${action.recipientName}.**\n\n• **Recipient:** ${action.recipientName} (${action.recipientRole.toUpperCase()} - ${action.recipientDepartment})\n• **Document:** ${action.documentTitle || "Encrypted Transmission"}\n• **Status:** DELIVERED\n• **Zero-Trust Transfer ID:** \`${data.data.messageId}\`\n\nThe recipient has received an in-app notification in their CAMPUSVAULT account.`,
            createdAt: new Date().toISOString(),
          },
        ]);
        setSelectedAttachment(null);
        setNotification({
          type: "success",
          text: `Your document was successfully sent to ${action.recipientName}.`,
        });
      } else {
        setNotification({
          type: "error",
          text: data.error || "Failed to deliver document",
        });
      }
    } catch {
      setNotification({
        type: "error",
        text: "Network error delivering document",
      });
    } finally {
      setConfirmingDelivery(false);
    }
  };

  // 6. Download and Decrypt Attachment from Received Message Card
  const handleDownloadAttachment = async (
    messageId: string,
    attachmentId: string,
    fileName: string
  ) => {
    setDownloadingAttachment(attachmentId);
    try {
      const res = await fetch(
        `/api/messages/${messageId}/attachment/${attachmentId}/download`
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(
          `Zero-Trust Access Denied: ${
            errorData.error || "Unauthorized to download file"
          }`
        );
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert("Error occurred downloading attachment.");
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] animate-fade-in max-w-7xl mx-auto">
      {/* Top Bar Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D9DED8] mb-3">
        <div>
          <h1 className="text-xl font-bold text-[#202923] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#477B70]" />
            {t("ai.title")}
          </h1>
          <p className="text-xs text-[#68736B] mt-0.5">
            Zero-Trust campus document exchange, AI intelligence & secure
            account-to-account messaging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-[#D9DED8] text-xs text-[#202923] shadow-sm hover:border-[#477B70] transition-colors">
            <Globe className="w-3.5 h-3.5 text-[#477B70]" />
            <select
              value={aiLanguage}
              onChange={(e) => setAiLanguage(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-[#202923] focus:outline-none cursor-pointer pr-1"
              title="Select AI Conversation Language"
            >
              <option value="auto">🌐 AI: AUTO</option>
              <option value="hinglish">🇮🇳 Hinglish</option>
              <option value="hi">🇮🇳 हिन्दी (Hindi)</option>
              <option value="en">🇬🇧 English</option>
              <option value="es">🇪🇸 Español</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="de">🇩🇪 Deutsch</option>
              <option value="zh">🇨🇳 中文</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F6ECE0] border border-[#ECD5BA] text-xs text-[#845627]">
            <Sparkles className="w-3.5 h-3.5 text-[#C18B52]" />
            <span className="text-[11px] font-medium">
              {geminiStatus?.configured ? "Gemini 2.5 Active" : "Zero-Trust AI"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EAF1EE] border border-[#A9C5BB] text-xs text-[#325C53]">
            <Shield className="w-3.5 h-3.5 text-[#477B70]" />
            <span className="text-[11px] font-medium">Zero-Trust Active</span>
          </div>
        </div>
      </div>

      {notification && (
        <div
          className={`p-2.5 rounded-lg mb-3 flex items-center justify-between gap-2 text-xs border ${
            notification.type === "success"
              ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#325C53]"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-[#477B70]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-[#68736B] hover:text-[#202923]"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Layout: Sidebar & Chat Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left: Chat Sessions History Sidebar */}
        <div className="hidden lg:flex lg:col-span-3 flex-col card p-3 overflow-hidden">
          <button
            onClick={handleNewSession}
            className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2 mb-3 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t("ai.newChat")}</span>
          </button>

          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#68736B]" />
            <input
              type="text"
              placeholder={t("common.search")}
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              className="input-field pl-8 py-1.5 text-xs bg-white border-[#D9DED8]"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#68736B] mb-1 px-1">
            <span>{t("ai.recentChats")}</span>
            {sessions.length > 0 && (
              <button
                onClick={handleClearAllSessions}
                className="text-[10px] text-[#68736B] hover:text-rose-600 transition-colors"
              >
                {t("ai.clearHistory")}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredSessions.length === 0 ? (
              <p className="text-xs text-[#68736B] text-center py-6">
                {t("ai.noChats")}
              </p>
            ) : (
              filteredSessions.map((session) => {
                const isActive = currentSessionId === session.id;
                return (
                  <div
                    key={session.id}
                    className={`group flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-all border ${
                      isActive
                        ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#202923] font-semibold"
                        : "bg-white/60 border-[#D9DED8] text-[#202923] hover:bg-white hover:border-[#A9C5BB]"
                    }`}
                  >
                    <div
                      className="flex items-center gap-2 flex-1 min-w-0"
                      onClick={() => loadSession(session.id)}
                    >
                      <MessageSquare
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          isActive ? "text-[#477B70]" : "text-[#68736B]"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs">{session.title}</p>
                        <span className="text-[10px] text-[#68736B]">
                          {new Date(
                            session.updatedAt || session.createdAt
                          ).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameModalSession(session);
                          setNewSessionTitle(session.title);
                        }}
                        className="p-1 text-[#68736B] hover:text-[#202923]"
                        title={t("common.rename")}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModalSessionId(session.id);
                        }}
                        className="p-1 text-[#68736B] hover:text-rose-600"
                        title={t("common.delete")}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Chat & Messaging Area */}
        <div className="lg:col-span-9 flex flex-col card p-0 overflow-hidden">
          {/* Scrollable Conversation History */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4 max-w-lg mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-[#EAF1EE] border border-[#A9C5BB] flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-[#477B70]" />
                </div>
                <h3 className="text-base font-bold text-[#202923] mb-1">
                  Vault AI Document & Messaging Assistant
                </h3>
                <p className="text-xs text-[#68736B] leading-relaxed mb-6">
                  Chat naturally with Vault AI to inquire about documents,
                  attach authorized files, send secure messages to
                  teachers/students/admin, or review your received messages.
                </p>

                {/* Quick Action Suggestions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                  {[
                    "Send this PDF to my Computer Science teacher",
                    "Do I have any new messages or documents?",
                    "Which documents am I authorized to access?",
                    "Show the details of my latest message",
                  ].map((sugg, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(sugg)}
                      className="p-3 rounded-lg bg-white/70 border border-[#D9DED8] hover:border-[#477B70] hover:bg-white text-xs text-[#202923] transition-all flex items-center justify-between"
                    >
                      <span className="truncate">{sugg}</span>
                      <ArrowRight className="w-3 h-3 text-[#477B70] flex-shrink-0 ml-1" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-3 ${
                      isUser ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                        isUser
                          ? "bg-[#477B70] text-white"
                          : "bg-[#EAF1EE] border border-[#A9C5BB] text-[#325C53]"
                      }`}
                    >
                      {isUser ? (
                        currentUser?.name?.charAt(0).toUpperCase() || "U"
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-2.5 ${
                        isUser
                          ? "bg-[#477B70] text-white rounded-tr-none shadow-sm"
                          : "bg-white border border-[#D9DED8] text-[#202923] rounded-tl-none shadow-[0_2px_8px_rgba(24,58,53,0.03)]"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>

                      {/* Timestamp */}
                      {m.createdAt && (
                        <div
                          className={`text-[10px] flex items-center gap-1 ${
                            isUser
                              ? "text-white/80 justify-end"
                              : "text-[#68736B]"
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      )}

                      {/* Suggested Action: Access Request */}
                      {m.suggestedAction &&
                        m.suggestedAction.type === "REQUEST_ACCESS" && (
                          <div className="pt-2 border-t border-[#D9DED8]">
                            <button
                              onClick={() =>
                                handleSendMessage(
                                  `Yes, request access for ${m.suggestedAction?.documentTitle}`
                                )
                              }
                              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 w-fit"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>
                                Request Access for &apos;
                                {m.suggestedAction.documentTitle}&apos;
                              </span>
                            </button>
                          </div>
                        )}

                      {/* In-Chat Received Document & Message Cards */}
                      {m.receivedMessages && m.receivedMessages.length > 0 && (
                        <div className="pt-2 border-t border-[#D9DED8] space-y-2.5">
                          <p className="text-[11px] font-semibold text-[#477B70] flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Verified In-Chat Documents & Messages:
                          </p>
                          {m.receivedMessages.map((msg) => (
                            <div
                              key={msg.messageId}
                              className="p-3 rounded-lg bg-[#F4F3EE] border border-[#D9DED8] space-y-2 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="font-semibold text-[#202923] block">
                                    {msg.subject}
                                  </span>
                                  <span className="text-[10px] text-[#68736B]">
                                    From:{" "}
                                    <strong className="text-[#202923]">
                                      {msg.senderName}
                                    </strong>{" "}
                                    ({msg.senderRole.toUpperCase()}) •{" "}
                                    {new Date(
                                      msg.receivedAt
                                    ).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                </div>
                                <span className="bg-[#E9EBE5] text-[#202923] border border-[#D9DED8] px-2 py-0.5 rounded text-[9px] uppercase font-medium">
                                  {msg.status}
                                </span>
                              </div>

                              <p className="text-[11px] text-[#202923] italic bg-white p-2.5 rounded-lg border border-[#D9DED8]/60">
                                &quot;{msg.content}&quot;
                              </p>

                              {msg.attachment && (
                                <div className="flex items-center justify-between pt-1 border-t border-[#D9DED8]">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-[#477B70]" />
                                    <div>
                                      <span className="text-[11px] font-semibold text-[#202923] block">
                                        {msg.attachment.title}
                                      </span>
                                      <span className="bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] px-1.5 py-0.2 rounded text-[9px] uppercase">
                                        {msg.attachment.classification.toUpperCase()}
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() =>
                                      handleDownloadAttachment(
                                        msg.messageId,
                                        msg.attachment!.id,
                                        msg.attachment!.fileName ||
                                          `${msg.attachment!.title}.pdf`
                                      )
                                    }
                                    disabled={
                                      downloadingAttachment ===
                                      msg.attachment.id
                                    }
                                    className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                                  >
                                    {downloadingAttachment ===
                                    msg.attachment.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    <span>Download & Decrypt</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* In-Chat Delivery Confirmation Card */}
                      {m.messengerAction &&
                        m.messengerAction.type === "CONFIRM_MESSAGE" && (
                          <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#ECD5BA] space-y-2.5 mt-2 shadow-sm">
                            <div className="flex items-center justify-between text-[#845627] font-semibold">
                              <span className="flex items-center gap-1.5 text-xs">
                                <Paperclip className="w-3.5 h-3.5 text-[#C18B52]" />
                                Secure Delivery Confirmation
                              </span>
                              <span className="text-[10px] bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] px-2 py-0.5 rounded font-medium">
                                Zero-Trust Transfer
                              </span>
                            </div>
                            <div className="text-[11px] text-[#202923] space-y-1 bg-white p-2.5 rounded-lg border border-[#ECD5BA]/60">
                              <p>
                                • Recipient:{" "}
                                <strong className="text-[#202923]">
                                  {m.messengerAction.recipientName}
                                </strong>{" "}
                                (
                                {m.messengerAction.recipientRole.toUpperCase()} -{" "}
                                {m.messengerAction.recipientDepartment})
                              </p>
                              {m.messengerAction.documentTitle && (
                                <p>
                                  • Attachment:{" "}
                                  <strong className="text-[#202923]">
                                    {m.messengerAction.documentTitle}
                                  </strong>{" "}
                                  (
                                  {m.messengerAction.documentClassification?.toUpperCase()}
                                  )
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                handleConfirmMessengerDelivery(
                                  m.messengerAction!
                                )
                              }
                              disabled={confirmingDelivery}
                              className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                            >
                              {confirmingDelivery ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              <span>
                                Confirm & Transmit to{" "}
                                {m.messengerAction.recipientName}
                              </span>
                            </button>
                          </div>
                        )}

                      {/* In-Chat Re-Access Ticket Confirmation Card */}
                      {m.ticketAction &&
                        m.ticketAction.type === "CONFIRM_TICKET" && (
                          <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#ECD5BA] space-y-2.5 mt-2 shadow-sm animate-fade-in">
                            <div className="flex items-center justify-between text-[#845627] font-semibold">
                              <span className="flex items-center gap-1.5 text-xs">
                                <KeyRound className="w-3.5 h-3.5 text-[#C18B52]" />
                                Re-Access Ticket Confirmation
                              </span>
                              <span className="text-[10px] bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] px-2 py-0.5 rounded font-medium">
                                Zero-Trust Ticket
                              </span>
                            </div>
                            <div className="text-[11px] text-[#202923] space-y-1.5 bg-white p-2.5 rounded-lg border border-[#ECD5BA]/60">
                              <p>
                                • Document:{" "}
                                <strong className="text-[#202923]">
                                  {m.ticketAction.documentTitle}
                                </strong>
                              </p>
                              <p>
                                • Document Owner:{" "}
                                <strong className="text-[#202923]">
                                  {m.ticketAction.documentOwnerName}
                                </strong>
                              </p>
                              <p>
                                • Requester:{" "}
                                <strong className="text-[#202923]">
                                  {m.ticketAction.requesterName}
                                </strong>{" "}
                                ({m.ticketAction.requesterRole.toUpperCase()} - {m.ticketAction.departmentName})
                              </p>
                              <div className="pt-1 border-t border-[#ECD5BA]/40">
                                <span className="text-[10px] text-[#845627] font-semibold uppercase block">Mandatory Reason:</span>
                                <p className="italic text-[#202923] mt-0.5">
                                  &quot;{m.ticketAction.reason}&quot;
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleSendMessage("Confirm")}
                              disabled={loading}
                              className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Confirm & Submit Re-Access Request</span>
                            </button>
                          </div>
                        )}

                      {/* In-Chat Re-Access Ticket Status List */}
                      {m.ticketList && m.ticketList.length > 0 && (
                        <div className="p-3 rounded-xl bg-[#F4F3EE] border border-[#D9DED8] space-y-2 mt-2">
                          <p className="text-[11px] font-semibold text-[#477B70] flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5" />
                            Your Re-Access Request Tickets:
                          </p>
                          {m.ticketList.map((t) => (
                            <div
                              key={t.ticketId}
                              className="p-2.5 rounded-lg bg-white border border-[#D9DED8] text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[#202923]">
                                  {t.ticketId} – {t.documentTitle}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                                    t.status === "APPROVED"
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                      : t.status === "REJECTED"
                                      ? "bg-rose-100 text-rose-800 border border-rose-300"
                                      : "bg-amber-100 text-amber-800 border border-amber-300"
                                  }`}
                                >
                                  {t.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-[#68736B]">
                                Owner: {t.documentOwner} • Reason: &quot;{t.reason}&quot;
                              </p>
                              {t.rejectionReason && (
                                <p className="text-[10px] text-rose-700 italic">
                                  Rejection: {t.rejectionReason}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#EAF1EE] border border-[#A9C5BB] flex items-center justify-center text-[#325C53]">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-[#D9DED8] rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 text-[#477B70] animate-spin" />
                  <span className="text-xs text-[#68736B]">
                    Evaluating Zero-Trust security rules...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input & Attachment Area */}
          <div className="p-3 border-t border-[#D9DED8] bg-[#F4F3EE]/80 space-y-2">
            {/* Attached Document Pill (if selected) */}
            {selectedAttachment && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#A9C5BB] text-xs shadow-sm animate-fade-in">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#EAF1EE] border border-[#A9C5BB] flex items-center justify-center flex-shrink-0 text-[#325C53]">
                    <Paperclip className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[#202923] font-semibold text-xs">
                        {selectedAttachment.title}
                      </span>
                      <span className="bg-[#E9EBE5] text-[#202923] text-[9px] uppercase px-1.5 py-0.5 rounded border border-[#D9DED8]">
                        {selectedAttachment.classification}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#68736B]">
                      {selectedAttachment.fileName || selectedAttachment.title}{" "}
                      • {(selectedAttachment.fileSize / 1024).toFixed(1)} KB •
                      Ready to send with message
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAttachment(null)}
                  className="flex items-center gap-1 px-2 py-1 text-[#68736B] hover:text-rose-600 hover:bg-rose-50 rounded transition-colors text-xs ml-2"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Remove</span>
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => {
                  refreshDocuments();
                  setShowDocPicker(true);
                }}
                className={`p-2.5 rounded-lg border transition-all ${
                  selectedAttachment
                    ? "bg-[#477B70] text-white border-[#325C53] shadow-sm"
                    : "bg-white border-[#D9DED8] text-[#68736B] hover:text-[#202923] hover:border-[#477B70]"
                }`}
                title="Attach Document (Upload or select from vault)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Text Input */}
              <input
                type="text"
                placeholder={
                  selectedAttachment
                    ? "Type instructions, e.g. 'Send this PDF to my Computer Science teacher' or press Send..."
                    : t("ai.inputPlaceholder")
                }
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={loading}
                className="input-field text-xs py-2.5 flex-1 bg-white border-[#D9DED8]"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={
                  loading || (!inputPrompt.trim() && !selectedAttachment)
                }
                className="btn-primary py-2.5 px-4 text-xs flex items-center gap-1.5"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{t("common.send")}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Document Picker Modal - Frosted Glass */}
      {showDocPicker && (
        <div className="fixed inset-0 bg-[#183A35]/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white/95 backdrop-blur-lg max-w-lg w-full space-y-4 border border-[#D9DED8] rounded-2xl shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8]">
              <h3 className="text-sm font-bold text-[#202923] flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#477B70]" />
                Attach Document to AI Message
              </h3>
              <button
                onClick={() => setShowDocPicker(false)}
                className="text-[#68736B] hover:text-[#202923] transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hidden device file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            {/* Menu Tabs: Option A vs Option B */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4F3EE] rounded-lg border border-[#D9DED8]">
              <button
                type="button"
                onClick={() => setPickerTab("upload")}
                className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-all ${
                  pickerTab === "upload"
                    ? "bg-[#477B70] text-white shadow-sm"
                    : "text-[#68736B] hover:text-[#202923] hover:bg-white"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Option A: Upload New
              </button>
              <button
                type="button"
                onClick={() => setPickerTab("select")}
                className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-all ${
                  pickerTab === "select"
                    ? "bg-[#477B70] text-white shadow-sm"
                    : "text-[#68736B] hover:text-[#202923] hover:bg-white"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Option B: Select Existing
              </button>
            </div>

            {/* Tab 1: OPTION A – Upload New Document */}
            {pickerTab === "upload" ? (
              <div className="space-y-3">
                <p className="text-xs text-[#68736B]">
                  Select a document from your device. It will be encrypted with{" "}
                  <strong className="text-[#202923]">AES-256-GCM</strong> and
                  stored securely in your private campus vault:
                </p>

                <div
                  onClick={() =>
                    !uploadingAttachment && fileInputRef.current?.click()
                  }
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    uploadingAttachment
                      ? "border-[#477B70] bg-[#EAF1EE]/50"
                      : "border-[#D9DED8] hover:border-[#477B70] bg-[#FAF9F6] hover:bg-white"
                  }`}
                >
                  {uploadingAttachment ? (
                    <div className="flex flex-col items-center justify-center py-4 space-y-2">
                      <Loader2 className="w-8 h-8 text-[#477B70] animate-spin" />
                      <p className="text-xs font-semibold text-[#202923]">
                        Encrypting & Uploading to Private Vault...
                      </p>
                      <p className="text-[10px] text-[#68736B]">
                        Zero-Trust AES-256-GCM envelope in progress
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-[#EAF1EE] border border-[#A9C5BB] flex items-center justify-center text-[#325C53]">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-[#202923]">
                        Click to browse or choose file from device
                      </p>
                      <p className="text-[11px] text-[#68736B]">
                        Allowed: PDF, DOC, DOCX, TXT, PNG, JPG (Max 15MB)
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#68736B] pt-1">
                  <span>🔒 End-to-End Cryptography</span>
                  <span>🛡️ Private Vault Storage</span>
                </div>
              </div>
            ) : (
              /* Tab 2: OPTION B – Select Existing Document */
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#68736B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Search authorized vault documents..."
                    className="input-field text-xs pl-8 py-2 w-full bg-white border-[#D9DED8]"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {availableDocs.filter((d) =>
                    d.title.toLowerCase().includes(docSearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="text-center py-6 space-y-2">
                      <FileText className="w-8 h-8 text-[#68736B] mx-auto" />
                      <p className="text-xs text-[#68736B]">
                        {docSearch
                          ? `No documents matching "${docSearch}"`
                          : "No accessible documents found in your vault."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setPickerTab("upload")}
                        className="text-xs text-[#477B70] hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <Upload className="w-3 h-3" />
                        Upload a file from your device instead
                      </button>
                    </div>
                  ) : (
                    availableDocs
                      .filter((d) =>
                        d.title.toLowerCase().includes(docSearch.toLowerCase())
                      )
                      .map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => {
                            setSelectedAttachment(doc);
                            setShowDocPicker(false);
                            setNotification({
                              type: "success",
                              text: `Selected '${doc.title}'. Type your message to send!`,
                            });
                          }}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-white/70 border border-[#D9DED8] hover:border-[#477B70] hover:bg-white cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-[#477B70] flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#202923] truncate">
                                {doc.title}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="bg-[#E9EBE5] text-[#202923] border border-[#D9DED8] text-[9px] uppercase px-1.5 py-0.2 rounded font-medium">
                                  {doc.classification}
                                </span>
                                {doc.department?.name && (
                                  <span className="text-[10px] text-[#68736B]">
                                    • {doc.department.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-[#68736B] flex-shrink-0 ml-2">
                            {(doc.fileSize / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rename Conversation Modal */}
      {renameModalSession && (
        <div className="fixed inset-0 bg-[#183A35]/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-sm w-full space-y-3 rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-5">
            <h3 className="text-sm font-bold text-[#202923] flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#477B70]" />
              {t("ai.renameChat")}
            </h3>
            <input
              type="text"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              className="input-field text-xs"
              placeholder="Enter new conversation title..."
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameModalSession(null)}
                className="btn-secondary text-xs"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleRenameSession}
                className="btn-primary text-xs"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Conversation Modal */}
      {deleteModalSessionId && (
        <div className="fixed inset-0 bg-[#183A35]/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-sm w-full space-y-3 rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-5">
            <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {t("ai.deleteChat")}
            </h3>
            <p className="text-xs text-[#68736B]">{t("ai.deleteConfirm")}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalSessionId(null)}
                className="btn-secondary text-xs"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSession(deleteModalSessionId)}
                className="btn-danger text-xs"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
