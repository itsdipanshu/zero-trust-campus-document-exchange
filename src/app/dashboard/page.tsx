"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Users,
  Building2,
  KeyRound,
  Activity,
  Shield,
  Clock,
  AlertTriangle,
  FolderLock,
  Upload,
  ArrowRight,
  Lock,
} from "lucide-react";
import Link from "next/link";

interface RecentDoc {
  id: string;
  title: string;
  classification: string;
  department: string;
  uploadedBy: string;
  createdAt: string;
}

export default function DashboardPage() {
  const [role, setRole] = useState<string>("student");
  const [stats, setStats] = useState<any>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setRole(data.data.role || "student");
          setStats(data.data.stats);
          setRecentDocs(data.data.recentDocuments || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const classificationBadges: Record<string, string> = {
    public: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB]",
    internal: "bg-[#E9EBE5] text-[#202923] border border-[#D9DED8]",
    confidential: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA]",
    restricted: "bg-rose-50 text-rose-700 border border-rose-200",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#477B70]/20 border-t-[#477B70] rounded-full animate-spin" />
      </div>
    );
  }

  // ─── ADMIN DASHBOARD ───────────────────────────────────────────────
  if (role === "admin" || role === "hod") {
    const adminCards = [
      {
        title: "Total Users",
        value: stats?.totalUsers || 0,
        icon: Users,
        badge: "Registered",
      },
      {
        title: "Total Documents",
        value: stats?.totalDocuments || 0,
        icon: FileText,
        badge: "Encrypted",
      },
      {
        title: "Active Grants",
        value: stats?.activeGrants || 0,
        icon: KeyRound,
        badge: "Verified",
      },
      {
        title: "Expired / Revoked",
        value: stats?.revokedOrExpiredGrants || 0,
        icon: AlertTriangle,
        badge: "Enforced",
      },
      {
        title: "Security Events (24h)",
        value: stats?.recentActivityCount || 0,
        icon: Activity,
        badge: "Audited",
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#202923] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#477B70]" />
            Security Administration Overview
          </h1>
          <p className="text-xs text-[#68736B] mt-1">
            System governance, Zero-Trust compliance, and document permissions
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {adminCards.map((c) => (
            <div key={c.title} className="card-hover">
              <div className="flex items-center justify-between text-[#68736B] mb-2">
                <span className="text-xs font-medium">{c.title}</span>
                <c.icon className="w-4 h-4 text-[#477B70]" />
              </div>
              <p className="text-2xl font-bold text-[#202923] tracking-tight">{c.value}</p>
              <span className="inline-block mt-2 text-[10px] text-[#68736B] bg-[#E9EBE5] px-2 py-0.5 rounded font-mono border border-[#D9DED8]">
                {c.badge}
              </span>
            </div>
          ))}
        </div>

        {/* Breakdown & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-[#202923] mb-3.5 flex items-center gap-2 border-b border-[#D9DED8] pb-2.5">
              <FolderLock className="w-4 h-4 text-[#477B70]" />
              Document Classifications (AES-256-GCM)
            </h2>
            <div className="space-y-3">
              {Object.entries(stats?.documentsByClassification || {}).map(
                ([level, count]) => (
                  <div
                    key={level}
                    className="flex items-center justify-between py-2 border-b border-[#D9DED8]/60 last:border-0"
                  >
                    <span
                      className={`text-xs uppercase font-medium px-2 py-0.5 rounded ${
                        classificationBadges[level] || "bg-[#E9EBE5] text-[#202923]"
                      }`}
                    >
                      {level}
                    </span>
                    <span className="text-xs font-mono text-[#202923] font-medium">
                      {count as number} files
                    </span>
                  </div>
                )
              )}
              {Object.keys(stats?.documentsByClassification || {}).length === 0 && (
                <p className="text-xs text-[#68736B] py-4">No documents stored in vault yet.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3.5 border-b border-[#D9DED8] pb-2.5">
              <h2 className="text-sm font-semibold text-[#202923] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#477B70]" />
                Recent Campus Documents
              </h2>
              <Link
                href="/dashboard/documents"
                className="text-xs text-[#477B70] hover:text-[#325C53] font-medium flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  data-cursor="document"
                  className="flex items-center justify-between p-3 bg-white/60 hover:bg-white rounded-lg border border-[#D9DED8] text-xs transition-colors"
                >
                  <div className="min-w-0 mr-2">
                    <p className="font-medium text-[#202923] truncate">{doc.title}</p>
                    <p className="text-[11px] text-[#68736B] truncate">
                      {doc.uploadedBy} · {doc.department || "Campus"}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded flex-shrink-0 ${
                      classificationBadges[doc.classification] || "bg-[#E9EBE5] text-[#202923]"
                    }`}
                  >
                    {doc.classification}
                  </span>
                </div>
              ))}
              {recentDocs.length === 0 && (
                <p className="text-xs text-[#68736B] py-4">No recent documents available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── FACULTY DASHBOARD ─────────────────────────────────────────────
  if (role === "faculty") {
    const facultyCards = [
      {
        title: "My Uploaded Documents",
        value: stats?.myUploadedCount || 0,
        icon: Upload,
        desc: "Encrypted on storage",
      },
      {
        title: "Authorized Documents",
        value: stats?.myAuthorizedCount || 0,
        icon: FileText,
        desc: "Granted access",
      },
      {
        title: "Department Documents",
        value: stats?.departmentDocCount || 0,
        icon: Building2,
        desc: "Within department",
      },
      {
        title: "My Activity (24h)",
        value: stats?.recentActivityCount || 0,
        icon: Activity,
        desc: "Logged security actions",
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#202923] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#477B70]" />
            Faculty Academic Portal
          </h1>
          <p className="text-xs text-[#68736B] mt-1">
            Departmental documents, authorized academic materials, and vault records
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {facultyCards.map((c) => (
            <div key={c.title} className="card-hover">
              <div className="flex items-center justify-between text-[#68736B] mb-2">
                <span className="text-xs font-medium">{c.title}</span>
                <c.icon className="w-4 h-4 text-[#477B70]" />
              </div>
              <p className="text-2xl font-bold text-[#202923] tracking-tight">{c.value}</p>
              <p className="text-[11px] text-[#68736B] mt-1">{c.desc}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-[#D9DED8] pb-3 mb-3">
            <h2 className="text-sm font-semibold text-[#202923] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#477B70]" />
              Recent Academic Documents
            </h2>
            <Link
              href="/dashboard/documents"
              className="text-xs text-[#477B70] hover:text-[#325C53] font-medium flex items-center gap-1"
            >
              <span>Open Vault</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                data-cursor="document"
                className="flex items-center justify-between p-3 bg-white/60 hover:bg-white rounded-lg border border-[#D9DED8] text-xs transition-colors"
              >
                <div className="min-w-0 mr-2">
                  <p className="font-medium text-[#202923] truncate">{doc.title}</p>
                  <p className="text-[11px] text-[#68736B] truncate">
                    {doc.uploadedBy} · {doc.department || "Academic"}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded flex-shrink-0 ${
                    classificationBadges[doc.classification] || "bg-[#E9EBE5] text-[#202923]"
                  }`}
                >
                  {doc.classification}
                </span>
              </div>
            ))}
            {recentDocs.length === 0 && (
              <p className="text-xs text-[#68736B] py-4">No recent academic documents found.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── STUDENT DASHBOARD ─────────────────────────────────────────────
  const studentCards = [
    {
      title: "Authorized Documents",
      value: stats?.myAuthorizedCount || 0,
      icon: FileText,
      desc: "Ready for secure review",
    },
    {
      title: "Active Access Grants",
      value: stats?.activeGrants || 0,
      icon: KeyRound,
      desc: "Policy-verified access",
    },
    {
      title: "Expiring Access",
      value: stats?.expiringSoon || 0,
      icon: Clock,
      desc: "Within next 7 days",
    },
    {
      title: "Recent Security Activity",
      value: stats?.recentActivityCount || 0,
      icon: Activity,
      desc: "Audited vault events",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#202923] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#477B70]" />
          Student Document Center
        </h1>
        <p className="text-xs text-[#68736B] mt-1">
          Access your verified course materials, department materials, and authorized campus documents
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {studentCards.map((c) => (
          <div key={c.title} className="card-hover">
            <div className="flex items-center justify-between text-[#68736B] mb-2">
              <span className="text-xs font-medium">{c.title}</span>
              <c.icon className="w-4 h-4 text-[#477B70]" />
            </div>
            <p className="text-2xl font-bold text-[#202923] tracking-tight">{c.value}</p>
            <p className="text-[11px] text-[#68736B] mt-1">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-[#D9DED8] pb-3 mb-3">
          <h2 className="text-sm font-semibold text-[#202923] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#477B70]" />
            Recently Available Documents
          </h2>
          <Link
            href="/dashboard/documents"
            className="text-xs text-[#477B70] hover:text-[#325C53] font-medium flex items-center gap-1"
          >
            <span>View All Documents</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {recentDocs.map((doc) => (
            <div
              key={doc.id}
              data-cursor="document"
              className="flex items-center justify-between p-3 bg-white/60 hover:bg-white rounded-lg border border-[#D9DED8] text-xs transition-colors"
            >
              <div className="min-w-0 mr-2">
                <p className="font-medium text-[#202923] truncate">{doc.title}</p>
                <p className="text-[11px] text-[#68736B] truncate">
                  Dept: {doc.department || "General"} · Uploaded by: {doc.uploadedBy}
                </p>
              </div>
              <span
                className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded flex-shrink-0 ${
                  classificationBadges[doc.classification] || "bg-[#E9EBE5] text-[#202923]"
                }`}
              >
                {doc.classification}
              </span>
            </div>
          ))}
          {recentDocs.length === 0 && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-[#E9EBE5] flex items-center justify-center mx-auto mb-2 text-[#68736B]">
                <FileText className="w-5 h-5" />
              </div>
              <p className="text-xs text-[#202923] font-medium">No authorized documents yet.</p>
              <p className="text-[11px] text-[#68736B] mt-0.5">
                Inquire with Vault AI or contact your administrator to request an access grant.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
