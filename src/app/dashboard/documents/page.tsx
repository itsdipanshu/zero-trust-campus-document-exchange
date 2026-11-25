"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  Plus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  File,
  ShieldAlert,
  Lock,
  KeyRound,
  Copy,
} from "lucide-react";
import AccessTimeSelector, {
  CustomTimeConfig,
  createInitialTimeConfig,
  resolveCustomTime,
} from "@/components/AccessTimeSelector";

interface Department {
  id: string;
  name: string;
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
}

interface Document {
  id: string;
  title: string;
  description: string | null;
  department: Department;
  classification: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: { id: string; name: string; email: string };
  grantCount: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function DocumentsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<
    (Document & { accessGrants?: unknown[] }) | null
  >(null);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
    departmentId: "",
    classification: "internal",
    file: null as File | null,
  });
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [page, setPage] = useState(1);

  // One-Time Access Code States
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseDoc, setReleaseDoc] = useState<Document | null>(null);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [releaseTimeConfig, setReleaseTimeConfig] = useState<CustomTimeConfig>(() =>
    createInitialTimeConfig(false, 1440)
  );
  const [releasing, setReleasing] = useState(false);
  const [issuedCode, setIssuedCode] = useState<{
    code: string;
    expiresAt?: string;
  } | null>(null);
  const [campusUsers, setCampusUsers] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);

  // Load current user profile for role enforcement
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCurrentUser(data.data.user);
          if (data.data.user.departmentId) {
            setUploadForm((prev) => ({
              ...prev,
              departmentId: data.data.user.departmentId,
            }));
          }
        }
      })
      .catch(() => {});
  }, []);

  const isStudent = currentUser?.role === "student";
  const canUpload =
    currentUser?.role === "admin" ||
    currentUser?.role === "faculty" ||
    currentUser?.role === "hod";

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "12",
        ...(search && { search }),
        ...(classFilter && { classification: classFilter }),
        ...(deptFilter && { departmentId: deptFilter }),
      });
      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json();
      if (data.success) {
        setDocuments(data.data.documents);
        setPagination(data.data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, classFilter, deptFilter]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDepartments(data.data.departments);
      })
      .catch(() => {});
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload) {
      setMessage({
        type: "error",
        text: "Students are not permitted to upload documents.",
      });
      return;
    }
    if (!uploadForm.file || !uploadForm.title || !uploadForm.departmentId)
      return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadForm.file);
      formData.append("title", uploadForm.title);
      formData.append("description", uploadForm.description);
      formData.append("departmentId", uploadForm.departmentId);
      formData.append("classification", uploadForm.classification);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: "Document encrypted with AES-256-GCM and stored securely.",
        });
        setShowUpload(false);
        setUploadForm({
          title: "",
          description: "",
          departmentId: currentUser?.departmentId || "",
          classification: "internal",
          file: null,
        });
        fetchDocuments();
      } else {
        setMessage({ type: "error", text: data.error || "Upload failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this document?"))
      return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: "Document removed successfully",
        });
        fetchDocuments();
      } else {
        setMessage({ type: "error", text: data.error || "Delete failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Delete failed" });
    }
  };

  const handleDownload = async (id: string, fileName: string) => {
    try {
      const res = await fetch(`/api/documents/${id}/download`);
      if (!res.ok) {
        const data = await res.json();
        setMessage({
          type: "error",
          text:
            data.error ||
            "Access Denied: Zero-Trust authorization failed.",
        });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: "error", text: "Secure download failed" });
    }
  };

  const handleOpenReleaseModal = async (doc: Document) => {
    setReleaseDoc(doc);
    setIssuedCode(null);
    setRecipientUserId("");
    setReleaseTimeConfig(createInitialTimeConfig(false, 1440));
    setShowReleaseModal(true);
    try {
      const res = await fetch("/api/users?limit=100");
      const data = await res.json();
      if (data.success && data.data?.users) {
        setCampusUsers(
          data.data.users.filter((u: any) => u.id !== currentUser?.id)
        );
      }
    } catch {}
  };

  const handleReleaseCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseDoc || !recipientUserId) return;

    const resolvedTime = resolveCustomTime(releaseTimeConfig);
    if (resolvedTime.error || !resolvedTime.expiresAt) {
      setMessage({
        type: "error",
        text: resolvedTime.error || "Please select a valid future expiration time.",
      });
      return;
    }

    setReleasing(true);
    try {
      const res = await fetch("/api/documents/release-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: releaseDoc.id,
          recipientUserId,
          expiresAt: resolvedTime.expiresAt,
          expiresAtHours: resolvedTime.expiresAtHours || 24,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.code) {
        setIssuedCode({
          code: data.data.code,
          expiresAt: data.data.expiresAt,
        });
        setMessage({
          type: "success",
          text: `One-Time Access Code successfully generated for recipient!`,
        });
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to issue access code",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error releasing code" });
    } finally {
      setReleasing(false);
    }
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/documents/redeem-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      const data = await res.json();
      if (data.success && data.data?.downloadUrl) {
        setMessage({
          type: "success",
          text: `One-time code redeemed successfully! Downloading '${data.data.document.title}'...`,
        });
        setShowRedeemModal(false);
        setRedeemCode("");
        const dlRes = await fetch(data.data.downloadUrl);
        if (dlRes.ok) {
          const blob = await dlRes.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.data.document.fileName;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to redeem code",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Network error redeeming access code",
      });
    } finally {
      setRedeeming(false);
    }
  };

  const viewDetail = async (id: string) => {
    setShowDetail(id);
    try {
      const res = await fetch(`/api/documents/${id}`);
      const data = await res.json();
      if (data.success) setDetailDoc(data.data.document);
    } catch {
      setMessage({
        type: "error",
        text: "Failed to load document details",
      });
    }
  };

  const classificationBadges: Record<string, string> = {
    public: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB]",
    internal: "bg-[#E9EBE5] text-[#202923] border border-[#D9DED8]",
    confidential: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA]",
    restricted: "bg-rose-50 text-rose-700 border border-rose-200",
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D9DED8]">
        <div>
          <h1 className="text-xl font-bold text-[#202923] tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#477B70]" />
            Document Vault
          </h1>
          <p className="text-[#68736B] text-xs mt-0.5">
            {isStudent
              ? "Browse and securely download documents authorized for your student identity"
              : "Enterprise document exchange with Zero-Trust authorization & AES-256-GCM encryption"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRedeemModal(true)}
            className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3.5 border-[#C18B52]/40 text-[#845627] hover:bg-[#F6ECE0]/50"
            title="Redeem a one-time access code issued to you"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#C18B52]" />
            Redeem Access Code
          </button>

          {/* ROLE PERMISSION: Strictly hidden for Student accounts */}
          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="btn-primary flex items-center gap-2 text-xs py-2 px-3.5"
            >
              <Plus className="w-4 h-4" />
              Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Security Feedback Notification */}
      {message.text && (
        <div
          className={`flex items-center gap-3 p-3 rounded-lg text-xs border ${
            message.type === "success"
              ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#325C53]"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-4 h-4 text-[#477B70] flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          )}
          <span className="flex-1 font-medium">{message.text}</span>
          <button onClick={() => setMessage({ type: "", text: "" })}>
            <X className="w-4 h-4 text-[#68736B] hover:text-[#202923]" />
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="card p-3.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
            <input
              type="text"
              placeholder="Search documents by title or file name..."
              className="input-field pl-9 text-xs py-2"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#68736B] pointer-events-none" />
              <select
                className="select-field pl-8 text-xs py-2 w-36"
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Security Levels</option>
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <select
              className="select-field text-xs py-2 w-44"
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Documents Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-[#477B70] animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-12 h-12 rounded-full bg-[#E9EBE5] flex items-center justify-center mx-auto mb-3 text-[#68736B]">
            <FileText className="w-6 h-6" />
          </div>
          <p className="text-[#202923] text-sm font-semibold">No documents found</p>
          <p className="text-[#68736B] text-xs mt-1 max-w-md mx-auto">
            {isStudent
              ? "You do not currently have authorized access to any campus documents. Contact your department administrator to request an access grant."
              : "No documents match the current filter criteria or have been uploaded."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {documents.map((doc) => {
            const canDeleteDoc =
              currentUser?.role === "admin" ||
              (currentUser?.role === "faculty" &&
                doc.uploadedBy.id === currentUser?.id);

            return (
              <div
                key={doc.id}
                data-cursor="document"
                className="card-hover flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <span
                      className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded tracking-wider ${
                        classificationBadges[doc.classification] ||
                        "bg-[#E9EBE5] text-[#202923]"
                      }`}
                    >
                      {doc.classification}
                    </span>
                    <span className="text-[11px] text-[#68736B] font-mono">
                      {formatSize(doc.fileSize)}
                    </span>
                  </div>

                  <h3
                    className="text-[#202923] text-sm font-semibold line-clamp-1 mb-1"
                    title={doc.title}
                  >
                    {doc.title}
                  </h3>
                  <p className="text-[#68736B] text-xs line-clamp-2 mb-3 min-h-[32px]">
                    {doc.description || "No description provided."}
                  </p>

                  <div className="space-y-1.5 py-2.5 px-3 bg-[#F4F3EE]/80 rounded-lg border border-[#D9DED8] text-[11px] text-[#68736B]">
                    <div className="flex justify-between">
                      <span>Department:</span>
                      <span className="text-[#202923] font-medium">
                        {doc.department.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Uploaded By:</span>
                      <span className="text-[#202923]">{doc.uploadedBy.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>File Name:</span>
                      <span className="text-[#202923] truncate max-w-[140px] font-mono">
                        {doc.fileName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-[#D9DED8] flex items-center gap-2">
                  <button
                    onClick={() => viewDetail(doc.id)}
                    className="flex-1 btn-secondary text-xs py-1.5 flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" /> Details
                  </button>
                  <button
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    className="flex-1 btn-primary text-xs py-1.5 flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>

                  {/* One-Time Access Code: available for document owner, faculty, or admin */}
                  {(canUpload || doc.uploadedBy.id === currentUser?.id) && (
                    <button
                      onClick={() => handleOpenReleaseModal(doc)}
                      className="btn-secondary text-xs py-1.5 px-2.5 border-[#C18B52]/40 text-[#845627] hover:bg-[#F6ECE0]/50"
                      title="Issue One-Time Access Code to Recipient"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* ROLE PERMISSION: Delete is only shown for Admin or document owner */}
                  {canDeleteDoc && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="btn-danger text-xs py-1.5 px-2.5"
                      title="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-[#68736B]">
            Showing page {page} of {pagination.totalPages} ({pagination.total}{" "}
            total documents)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-30"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={page === pagination.totalPages}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal - Frosted Glass */}
      {showUpload && canUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183A35]/40 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-lg w-full max-w-lg rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8] mb-4">
              <h2 className="text-base font-semibold text-[#202923] flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#477B70]" />
                Upload New Document
              </h2>
              <button
                onClick={() => setShowUpload(false)}
                className="text-[#68736B] hover:text-[#202923] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  className="input-field text-xs"
                  placeholder="e.g. End Semester Exam Guidelines 2026"
                  value={uploadForm.title}
                  onChange={(e) =>
                    setUploadForm({ ...uploadForm, title: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  className="input-field text-xs"
                  rows={2}
                  placeholder="Summary or classification notes..."
                  value={uploadForm.description}
                  onChange={(e) =>
                    setUploadForm({ ...uploadForm, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                    Department *
                  </label>
                  <select
                    className="select-field text-xs"
                    value={uploadForm.departmentId}
                    onChange={(e) =>
                      setUploadForm({
                        ...uploadForm,
                        departmentId: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">Select department...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                    Classification *
                  </label>
                  <select
                    className="select-field text-xs"
                    value={uploadForm.classification}
                    onChange={(e) =>
                      setUploadForm({
                        ...uploadForm,
                        classification: e.target.value,
                      })
                    }
                  >
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Document File *
                </label>
                <div className="border border-dashed border-[#D9DED8] rounded-xl p-5 text-center bg-[#F4F3EE]/60 hover:border-[#477B70] transition-colors">
                  <input
                    type="file"
                    className="hidden"
                    id="file-upload"
                    onChange={(e) =>
                      setUploadForm({
                        ...uploadForm,
                        file: e.target.files?.[0] || null,
                      })
                    }
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-6 h-6 text-[#68736B] mx-auto mb-1.5" />
                    {uploadForm.file ? (
                      <p className="text-xs text-[#477B70] font-medium font-mono">
                        {uploadForm.file.name}
                      </p>
                    ) : (
                      <p className="text-xs text-[#68736B]">
                        Click to select document (PDF, DOCX, TXT, etc.)
                      </p>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploading ? "Encrypting & Storing..." : "Upload Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal - Frosted Glass */}
      {showDetail && detailDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183A35]/40 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-lg w-full max-w-lg rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8] mb-4">
              <h2 className="text-base font-semibold text-[#202923]">
                Document Security Specification
              </h2>
              <button
                onClick={() => {
                  setShowDetail(null);
                  setDetailDoc(null);
                }}
                className="text-[#68736B] hover:text-[#202923] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">Title</span>
                <span className="text-[#202923] font-medium">
                  {detailDoc.title}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">Security Classification</span>
                <span
                  className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${
                    classificationBadges[detailDoc.classification] ||
                    "bg-[#E9EBE5] text-[#202923]"
                  }`}
                >
                  {detailDoc.classification}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">Department</span>
                <span className="text-[#202923]">
                  {detailDoc.department.name}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">Encrypted Storage File</span>
                <span className="text-[#202923] font-mono">
                  {detailDoc.fileName}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">File Size</span>
                <span className="text-[#202923] font-mono">
                  {formatSize(detailDoc.fileSize)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">Uploaded By</span>
                <span className="text-[#202923]">{detailDoc.uploadedBy.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#D9DED8]/60">
                <span className="text-[#68736B]">Timestamp</span>
                <span className="text-[#202923]">
                  {new Date(detailDoc.createdAt).toLocaleString()}
                </span>
              </div>
              {detailDoc.description && (
                <div className="pt-2">
                  <span className="text-[#68736B] block mb-1">Description</span>
                  <p className="text-[#202923] bg-[#F4F3EE] p-3 rounded-lg border border-[#D9DED8]">
                    {detailDoc.description}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                onClick={() => {
                  setShowDetail(null);
                  setDetailDoc(null);
                }}
                className="btn-secondary flex-1 text-xs py-2"
              >
                Close
              </button>
              <button
                onClick={() => handleDownload(detailDoc.id, detailDoc.fileName)}
                className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redeem Access Code Modal */}
      {showRedeemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183A35]/40 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-lg w-full max-w-md rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8] mb-4">
              <h2 className="text-base font-semibold text-[#202923] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#C18B52]" />
                Redeem One-Time Access Code
              </h2>
              <button
                onClick={() => {
                  setShowRedeemModal(false);
                  setRedeemCode("");
                }}
                className="text-[#68736B] hover:text-[#202923] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRedeemCode} className="space-y-4">
              <p className="text-xs text-[#68736B]">
                Enter the unique one-time access code issued to you by the document owner. Once verified and consumed, your document will be decrypted and downloaded immediately.
              </p>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Access Code *
                </label>
                <input
                  type="text"
                  className="input-field text-sm font-mono tracking-widest uppercase text-center"
                  placeholder="CVLT-XXXX-XXXX-XXXX"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRedeemModal(false);
                    setRedeemCode("");
                  }}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={redeeming || !redeemCode.trim()}
                  className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                >
                  {redeeming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Redeem & Download</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release One-Time Access Code Modal */}
      {showReleaseModal && releaseDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183A35]/40 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-lg w-full max-w-lg rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8] mb-4">
              <h2 className="text-base font-semibold text-[#202923] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#C18B52]" />
                Issue One-Time Access Code
              </h2>
              <button
                onClick={() => {
                  setShowReleaseModal(false);
                  setReleaseDoc(null);
                  setIssuedCode(null);
                }}
                className="text-[#68736B] hover:text-[#202923] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {issuedCode ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#EAF1EE] border border-[#A9C5BB] text-center space-y-2">
                  <span className="text-[11px] font-semibold text-[#325C53] uppercase tracking-wider block">
                    One-Time Access Code Generated
                  </span>
                  <div className="text-xl font-mono font-bold text-[#202923] tracking-widest bg-white py-2.5 px-4 rounded-lg border border-[#A9C5BB] select-all">
                    {issuedCode.code}
                  </div>
                  <p className="text-[11px] text-[#68736B]">
                    Valid until: {issuedCode.expiresAt ? new Date(issuedCode.expiresAt).toLocaleString() : "24 hours"}
                  </p>
                </div>

                <div className="text-xs text-[#68736B] space-y-1 bg-[#F4F3EE] p-3 rounded-lg border border-[#D9DED8]">
                  <p>• Usable strictly <strong>once</strong> by the assigned recipient.</p>
                  <p>• Only stored as a secure SHA-256 hash in the database.</p>
                  <p>• An in-app notification has been delivered to the recipient.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(issuedCode.code);
                    setMessage({ type: "success", text: "Access code copied to clipboard!" });
                  }}
                  className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleReleaseCode} className="space-y-4">
                <div className="p-2.5 rounded-lg bg-[#F4F3EE] border border-[#D9DED8] text-xs">
                  <span className="text-[#68736B]">Document: </span>
                  <strong className="text-[#202923]">{releaseDoc.title}</strong>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                    Select Recipient *
                  </label>
                  <select
                    className="input-field text-xs"
                    value={recipientUserId}
                    onChange={(e) => setRecipientUserId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose recipient user --</option>
                    {campusUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role.toUpperCase()}) – {u.email}
                      </option>
                    ))}
                  </select>
                </div>

                <AccessTimeSelector
                  value={releaseTimeConfig}
                  onChange={setReleaseTimeConfig}
                  allowPermanent={false}
                  label="Custom Code Expiry Window *"
                />

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReleaseModal(false);
                      setReleaseDoc(null);
                    }}
                    className="btn-secondary flex-1 text-xs py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={releasing || !recipientUserId}
                    className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    {releasing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    <span>Generate & Release Code</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
