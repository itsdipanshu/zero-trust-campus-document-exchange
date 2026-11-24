"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  Search,
  Filter,
  Loader2,
  Download,
  Upload,
  LogIn,
  LogOut,
  KeyRound,
  Ban,
  Eye,
  Shield,
  UserPlus,
  Edit,
  ShieldAlert,
} from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  decision: string | null;
  reason: string | null;
  ipAddress: string | null;
  metadata: string | null;
  timestamp: string;
  user: { id: string; name: string; email: string; role: string };
  document: { id: string; title: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [forbidden, setForbidden] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "30",
        ...(actionFilter && { action: actionFilter }),
        ...(decisionFilter && { decision: decisionFilter }),
      });
      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs);
        setPagination(data.data.pagination);
      }
    } catch {
      console.error("Failed to fetch audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, decisionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const actionIcons: Record<string, React.ReactNode> = {
    upload: <Upload className="w-4 h-4 text-[#477B70]" />,
    download: <Download className="w-4 h-4 text-[#325C53]" />,
    view: <Eye className="w-4 h-4 text-[#477B70]" />,
    login: <LogIn className="w-4 h-4 text-[#325C53]" />,
    logout: <LogOut className="w-4 h-4 text-[#68736B]" />,
    register: <UserPlus className="w-4 h-4 text-purple-600" />,
    grant_access: <KeyRound className="w-4 h-4 text-[#C18B52]" />,
    revoke_access: <Ban className="w-4 h-4 text-rose-600" />,
    update_user: <Edit className="w-4 h-4 text-[#845627]" />,
  };

  const decisionBadges: Record<string, string> = {
    allowed: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB] px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold",
    denied: "bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold",
    pending: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA] px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold",
  };

  if (forbidden) {
    return (
      <div className="card text-center py-20 max-w-lg mx-auto mt-10">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#202923]">Administrative Access Required</h2>
        <p className="text-[#68736B] text-xs mt-1.5 leading-relaxed">
          Security audit trails contain confidential campus access logs and are restricted strictly to University Administrators and Department Heads under Zero-Trust compliance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="pb-2 border-b border-[#D9DED8]">
        <h1 className="text-xl font-bold text-[#202923] tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#477B70]" />
          Security Audit Logs
        </h1>
        <p className="text-[#68736B] text-xs mt-0.5">
          Immutable Zero-Trust audit trail documenting all authentication, authorization, and data exchange events
        </p>
      </div>

      <div className="card p-3.5 flex flex-col sm:flex-row gap-3">
        <select
          className="select-field text-xs py-2 w-44"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Security Events</option>
          <option value="login">User Login</option>
          <option value="logout">User Logout</option>
          <option value="register">Registration</option>
          <option value="upload">Document Upload</option>
          <option value="download">Document Download</option>
          <option value="grant_access">Grant Access</option>
          <option value="revoke_access">Revoke Access</option>
          <option value="update_user">User Management</option>
        </select>
        <select
          className="select-field text-xs py-2 w-36"
          value={decisionFilter}
          onChange={(e) => {
            setDecisionFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Decisions</option>
          <option value="allowed">Allowed (PASS)</option>
          <option value="denied">Denied (BLOCKED)</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-[#477B70] animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card text-center py-16">
          <ClipboardList className="w-10 h-10 text-[#68736B] mx-auto mb-3" />
          <p className="text-[#202923] text-sm font-semibold">No audit logs found</p>
          <p className="text-[#68736B] text-xs mt-1">No events match the specified filter parameters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="card-hover p-3.5 flex items-start gap-3.5"
            >
              <div className="w-8 h-8 bg-[#E9EBE5] rounded-lg border border-[#D9DED8] flex items-center justify-center flex-shrink-0 mt-0.5">
                {actionIcons[log.action] || <Shield className="w-4 h-4 text-[#68736B]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-[#202923] font-semibold">{log.user.name}</span>
                  <span className="text-[#68736B] text-[11px] font-mono">({log.user.email})</span>
                  <span className="text-[#D9DED8]">•</span>
                  <span className="text-[#477B70] font-mono font-semibold">
                    {log.action.toUpperCase()}
                  </span>
                  {log.decision && (
                    <span className={decisionBadges[log.decision] || "text-[#68736B]"}>
                      {log.decision.toUpperCase()}
                    </span>
                  )}
                </div>
                {log.document && (
                  <p className="text-[#202923] text-xs mt-1 font-mono">
                    Document: <span className="font-semibold">{log.document.title}</span>
                  </p>
                )}
                {log.reason && (
                  <p className="text-[#68736B] text-[11px] mt-0.5 italic">
                    Reason: {log.reason}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0 text-[11px] text-[#68736B]">
                <p>{new Date(log.timestamp).toLocaleString()}</p>
                {log.ipAddress && log.ipAddress !== "unknown" && (
                  <p className="font-mono text-[#68736B]/70 mt-0.5">{log.ipAddress}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-[#68736B]">
            Page {page} of {pagination.totalPages} ({pagination.total} total logs)
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
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
