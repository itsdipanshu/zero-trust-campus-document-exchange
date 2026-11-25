"use client";

import { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  Plus,
  Search,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Ban,
  Clock,
  Shield,
  FileText,
  UserCheck,
  UserX,
} from "lucide-react";

interface AccessTicket {
  id: string;
  ticketId: string;
  status: string;
  reason: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  requester: {
    id: string;
    name: string;
    email: string;
    role: string;
    department?: { name: string };
  };
  documentOwner: {
    id: string;
    name: string;
    email: string;
  };
  document: {
    id: string;
    title: string;
    classification: string;
    department?: { name: string };
  };
}

interface Grant {
  id: string;
  status: string;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string };
  document: {
    id: string;
    title: string;
    classification: string;
    department: { name: string };
  };
  grantedBy: { id: string; name: string; email: string };
}

interface AccessRequest {
  id: string;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    department?: { name: string };
  };
  document: {
    id: string;
    title: string;
    classification: string;
    department: { name: string };
  };
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface Document {
  id: string;
  title: string;
  classification: string;
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AccessGrantsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeTab, setActiveTab] = useState<"grants" | "requests" | "tickets">("grants");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [tickets, setTickets] = useState<AccessTicket[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [createForm, setCreateForm] = useState({
    userId: "",
    documentId: "",
    expiresAt: "",
    reason: "",
  });
  const [message, setMessage] = useState({ type: "", text: "" });

  // Load current user for role-based action controls
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setCurrentUser(data.data.user);
      })
      .catch(() => {});
  }, []);

  const isStudent = currentUser?.role === "student";
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "hod";

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/access-grants?${params}`);
      const data = await res.json();
      if (data.success) {
        setGrants(data.data.grants);
        setPagination(data.data.pagination);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to load access grants" });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  const fetchAccessRequests = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/ai/access-requests");
      const data = await res.json();
      if (data.success) {
        setAccessRequests(data.data.requests || []);
      }
    } catch {
      // silent
    }
  }, [isAdmin]);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/documents/tickets");
      const data = await res.json();
      if (data.success && data.data?.tickets) {
        setTickets(data.data.tickets);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchGrants();
    fetchTickets();
  }, [fetchGrants, fetchTickets]);

  useEffect(() => {
    if (isAdmin) {
      fetchAccessRequests();
    }
  }, [isAdmin, fetchAccessRequests]);

  const handleReviewTicket = async (
    ticketId: string,
    action: "APPROVE" | "REJECT",
    rejectionReason?: string
  ) => {
    try {
      const res = await fetch(`/api/documents/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          rejectionReason,
          expiryHours: 24,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text:
            action === "APPROVE"
              ? `Re-Access Ticket APPROVED! New one-time access code generated: ${data.data?.accessCode || ""}`
              : "Re-Access Ticket REJECTED.",
        });
        fetchTickets();
      } else {
        setMessage({ type: "error", text: data.error || "Review failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to review ticket" });
    }
  };

  const openCreate = async () => {
    setShowCreate(true);
    try {
      const [uRes, dRes] = await Promise.all([
        fetch("/api/users?limit=100"),
        fetch("/api/documents?limit=100"),
      ]);
      const [uData, dData] = await Promise.all([uRes.json(), dRes.json()]);
      if (uData.success) setUsers(uData.data.users);
      if (dData.success) setDocuments(dData.data.documents);
    } catch {
      setMessage({ type: "error", text: "Failed to load users/documents" });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.userId || !createForm.documentId) return;

    try {
      const res = await fetch("/api/access-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: createForm.userId,
          documentId: createForm.documentId,
          expiresAt: createForm.expiresAt || null,
          reason: createForm.reason || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: "Document access grant successfully provisioned in Zero-Trust registry.",
        });
        setShowCreate(false);
        setCreateForm({ userId: "", documentId: "", expiresAt: "", reason: "" });
        fetchGrants();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to grant access." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to create access grant." });
    }
  };

  const handleRevoke = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Revoke this access grant immediately under Zero-Trust policy?")) return;
    try {
      const res = await fetch(`/api/access-grants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked" }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: "Access revoked immediately. Zero-Trust verification will now reject requests.",
        });
        fetchGrants();
      } else {
        setMessage({ type: "error", text: data.error || "Revocation failed." });
      }
    } catch {
      setMessage({ type: "error", text: "Revoke failed." });
    }
  };

  // Admin approves AI Access Request
  const handleReviewRequest = async (requestId: string, status: "APPROVED" | "REJECTED") => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/ai/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          status,
          reviewReason: status === "APPROVED" ? "Approved by Admin" : "Rejected by Admin",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text:
            status === "APPROVED"
              ? "Access request APPROVED. Official active grant provisioned in database."
              : "Access request REJECTED.",
        });
        fetchAccessRequests();
        fetchGrants();
      } else {
        setMessage({ type: "error", text: data.error || "Review failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to review request" });
    }
  };

  const statusBadges: Record<string, string> = {
    active: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    revoked: "bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    expired: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    PENDING: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    APPROVED: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    REJECTED: "bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-2 py-0.5 rounded font-medium uppercase",
  };

  const classBadges: Record<string, string> = {
    public: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    internal: "bg-[#E9EBE5] text-[#202923] border border-[#D9DED8] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    confidential: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] text-[10px] px-2 py-0.5 rounded font-medium uppercase",
    restricted: "bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-2 py-0.5 rounded font-medium uppercase",
  };

  const pendingRequestsCount = accessRequests.filter((r) => r.status === "PENDING").length;
  const pendingTicketsCount = tickets.filter((t) => t.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D9DED8]">
        <div>
          <h1 className="text-xl font-bold text-[#202923] tracking-tight flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#477B70]" />
            {isStudent ? "My Access Grants" : "Access Grants & Permissions Management"}
          </h1>
          <p className="text-[#68736B] text-xs mt-0.5">
            {isStudent
              ? "View the status and validity of document permissions granted to your student profile"
              : "Provision, review AI access requests, and revoke Zero-Trust document access permissions"}
          </p>
        </div>

        {/* ROLE PERMISSION: Strictly hidden for Student and regular Faculty accounts */}
        {isAdmin && (
          <button
            onClick={openCreate}
            className="btn-primary flex items-center gap-2 text-xs py-2 px-3.5"
          >
            <Plus className="w-4 h-4" />
            Grant Access
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#D9DED8] gap-2">
        <button
          onClick={() => setActiveTab("grants")}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "grants"
              ? "border-[#477B70] text-[#202923]"
              : "border-transparent text-[#68736B] hover:text-[#202923]"
          }`}
        >
          {isStudent ? "My Grants" : "Active & Historical Grants"}
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab("requests")}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "requests"
                ? "border-[#477B70] text-[#202923]"
                : "border-transparent text-[#68736B] hover:text-[#202923]"
            }`}
          >
            <span>Pending AI Access Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold">
                {pendingRequestsCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab("tickets")}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "tickets"
              ? "border-[#477B70] text-[#202923]"
              : "border-transparent text-[#68736B] hover:text-[#202923]"
          }`}
        >
          <span>Re-Access Tickets</span>
          {pendingTicketsCount > 0 && (
            <span className="bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB] text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold">
              {pendingTicketsCount}
            </span>
          )}
        </button>
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

      {/* TAB 1: GRANTS TABLE */}
      {activeTab === "grants" && (
        <>
          {/* Filter Bar */}
          <div className="card p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#68736B] font-medium">Filter by Status:</span>
              <select
                className="select-field text-xs py-1.5 w-36"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Grants</option>
                <option value="active">Active Only</option>
                <option value="revoked">Revoked Only</option>
                <option value="expired">Expired Only</option>
              </select>
            </div>
            <p className="text-xs text-[#68736B]">
              Total: <span className="text-[#202923] font-mono font-semibold">{pagination?.total ?? 0}</span> grants
            </p>
          </div>

          {/* Grants Table */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 text-[#477B70] animate-spin" />
            </div>
          ) : grants.length === 0 ? (
            <div className="card text-center py-16">
              <div className="w-12 h-12 rounded-full bg-[#E9EBE5] flex items-center justify-center mx-auto mb-3 text-[#68736B]">
                <KeyRound className="w-6 h-6" />
              </div>
              <p className="text-[#202923] text-sm font-semibold">No access grants found</p>
              <p className="text-[#68736B] text-xs mt-1 max-w-md mx-auto">
                {isStudent
                  ? "You do not have any access grants recorded. When faculty or administrators authorize confidential documents for you, they will appear here."
                  : "No access grants match the specified filter."}
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0 border border-[#D9DED8]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="table-header">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Document</th>
                      <th className="py-3 px-4">Classification</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Granted By</th>
                      <th className="py-3 px-4">Expires</th>
                      {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D9DED8]/60 bg-white/70">
                    {grants.map((grant) => (
                      <tr key={grant.id} className="hover:bg-[#EAF1EE]/30 transition-colors">
                        <td className="table-cell">
                          <p className="text-[#202923] font-semibold">{grant.user.name}</p>
                          <p className="text-[#68736B] text-[11px] font-mono">{grant.user.email}</p>
                        </td>
                        <td className="table-cell">
                          <p className="text-[#202923] font-medium">{grant.document.title}</p>
                          <p className="text-[#68736B] text-[11px]">
                            {grant.document.department.name}
                          </p>
                        </td>
                        <td className="table-cell">
                          <span className={classBadges[grant.document.classification] || "bg-[#E9EBE5] text-[#202923]"}>
                            {grant.document.classification}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={statusBadges[grant.status] || "bg-[#E9EBE5] text-[#202923]"}>
                            {grant.status}
                          </span>
                        </td>
                        <td className="table-cell text-[#68736B]">{grant.grantedBy.name}</td>
                        <td className="table-cell text-[#68736B] font-mono text-[11px]">
                          {grant.expiresAt
                            ? new Date(grant.expiresAt).toLocaleDateString()
                            : "Permanent"}
                        </td>

                        {/* ROLE PERMISSION: Actions strictly hidden for students */}
                        {isAdmin && (
                          <td className="table-cell text-right">
                            {grant.status === "active" ? (
                              <button
                                onClick={() => handleRevoke(grant.id)}
                                className="btn-danger text-xs py-1 px-2.5 inline-flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" /> Revoke
                              </button>
                            ) : (
                              <span className="text-[#68736B] text-[11px] italic">Revoked</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: AI ACCESS REQUESTS (Admin Only) */}
      {activeTab === "requests" && isAdmin && (
        <div className="space-y-4">
          <div className="card overflow-hidden p-0 border border-[#D9DED8]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="table-header">
                  <tr>
                    <th className="py-3 px-4">Requester</th>
                    <th className="py-3 px-4">Target Document</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Requested At</th>
                    <th className="py-3 px-4 text-right">Review Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9DED8]/60 bg-white/70">
                  {accessRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#68736B]">
                        No AI access requests found
                      </td>
                    </tr>
                  ) : (
                    accessRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-[#EAF1EE]/30 transition-colors">
                        <td className="table-cell">
                          <p className="text-[#202923] font-semibold">{req.user.name}</p>
                          <p className="text-[#68736B] text-[11px] font-mono">{req.user.email}</p>
                        </td>
                        <td className="table-cell">
                          <p className="text-[#202923] font-medium">{req.document.title}</p>
                          <span className={classBadges[req.document.classification] || "bg-[#E9EBE5] text-[#202923]"}>
                            {req.document.classification}
                          </span>
                        </td>
                        <td className="table-cell text-[#68736B]">
                          {req.document.department.name}
                        </td>
                        <td className="table-cell">
                          <span className={statusBadges[req.status] || "bg-[#E9EBE5] text-[#202923]"}>
                            {req.status}
                          </span>
                        </td>
                        <td className="table-cell text-[#68736B] text-[11px] font-mono">
                          {new Date(req.requestedAt).toLocaleString()}
                        </td>
                        <td className="table-cell text-right">
                          {req.status === "PENDING" ? (
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => handleReviewRequest(req.id, "APPROVED")}
                                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => handleReviewRequest(req.id, "REJECTED")}
                                className="btn-danger text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                <UserX className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[#68736B] text-[11px] italic">
                              Reviewed ({req.status})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Re-Access Tickets Tab Content */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="p-3.5 border-b border-[#D9DED8] bg-[#F4F3EE]/50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[#202923] uppercase tracking-wider">
                  Document Re-Access Request Tickets
                </h3>
                <p className="text-[11px] text-[#68736B] mt-0.5">
                  One-time access tickets raised through Vault AI requiring original document owner review
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="table-header">
                  <tr>
                    <th className="py-3 px-4">Ticket ID</th>
                    <th className="py-3 px-4">Requester</th>
                    <th className="py-3 px-4">Target Document</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">Mandatory Reason</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9DED8]/60 bg-white/70">
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#68736B]">
                        No re-access tickets found
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => {
                      const canReview =
                        isAdmin ||
                        t.documentOwner.id === currentUser?.id ||
                        currentUser?.role === "hod";

                      return (
                        <tr key={t.id} className="hover:bg-[#EAF1EE]/30 transition-colors">
                          <td className="table-cell font-mono text-[11px] font-semibold text-[#202923]">
                            {t.ticketId}
                          </td>
                          <td className="table-cell">
                            <p className="text-[#202923] font-semibold">{t.requester.name}</p>
                            <p className="text-[#68736B] text-[10px] font-mono">
                              {t.requester.role.toUpperCase()} • {t.requester.department?.name || "Campus"}
                            </p>
                          </td>
                          <td className="table-cell">
                            <p className="text-[#202923] font-medium">{t.document.title}</p>
                            <span className={classBadges[t.document.classification] || "bg-[#E9EBE5] text-[#202923]"}>
                              {t.document.classification}
                            </span>
                          </td>
                          <td className="table-cell text-[#68736B]">
                            {t.documentOwner.name}
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="italic text-[#202923] line-clamp-2 bg-[#F4F3EE] p-1.5 rounded border border-[#D9DED8]/60">
                              &quot;{t.reason}&quot;
                            </p>
                          </td>
                          <td className="table-cell">
                            <span className={statusBadges[t.status] || "bg-[#E9EBE5] text-[#202923]"}>
                              {t.status}
                            </span>
                          </td>
                          <td className="table-cell text-right">
                            {t.status === "PENDING" && canReview ? (
                              <div className="inline-flex gap-2">
                                <button
                                  onClick={() => handleReviewTicket(t.id, "APPROVE")}
                                  className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                                >
                                  <UserCheck className="w-3.5 h-3.5" /> Approve
                                </button>
                                <button
                                  onClick={() => {
                                    const reason = prompt("Optional rejection explanation:") || undefined;
                                    handleReviewTicket(t.id, "REJECT", reason);
                                  }}
                                  className="btn-danger text-xs py-1 px-2.5 flex items-center gap-1"
                                >
                                  <UserX className="w-3.5 h-3.5" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[#68736B] text-[11px] italic">
                                {t.status === "PENDING" ? "Awaiting Owner" : `Reviewed (${t.status})`}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Grant Modal - Admin Only - Frosted Glass */}
      {showCreate && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183A35]/40 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-lg w-full max-w-lg rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8] mb-4">
              <h2 className="text-base font-semibold text-[#202923] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#477B70]" />
                Provision Document Access Grant
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-[#68736B] hover:text-[#202923]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Target User *
                </label>
                <select
                  className="select-field text-xs"
                  value={createForm.userId}
                  onChange={(e) => setCreateForm({ ...createForm, userId: e.target.value })}
                  required
                >
                  <option value="">Select recipient...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Protected Document *
                </label>
                <select
                  className="select-field text-xs"
                  value={createForm.documentId}
                  onChange={(e) => setCreateForm({ ...createForm, documentId: e.target.value })}
                  required
                >
                  <option value="">Select document...</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} [{d.classification}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Expiration Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  className="input-field text-xs"
                  value={createForm.expiresAt}
                  onChange={(e) => setCreateForm({ ...createForm, expiresAt: e.target.value })}
                />
                <p className="text-[11px] text-[#68736B] mt-0.5">Leave blank for permanent access.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">
                  Authorization Justification
                </label>
                <textarea
                  className="input-field text-xs"
                  rows={2}
                  placeholder="e.g. Research project team member access approval"
                  value={createForm.reason}
                  onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Provision Grant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
