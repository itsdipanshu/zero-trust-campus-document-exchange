"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  KeyRound,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Bell,
  CheckCircle,
  ExternalLink,
  Lock,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: { id: string; name: string } | null;
  departmentId?: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  relatedMessageId?: string | null;
  createdAt: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data.notifications || []);
        setUnreadCount(data.data.unreadCount || 0);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchUser();
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchUser, fetchNotifications]);

  const handleMarkAllNotificationsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F3EE] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 bg-white/80 p-8 rounded-2xl border border-[#D9DED8] shadow-[0_4px_24px_rgba(24,58,53,0.06)]">
          <div className="w-8 h-8 border-2 border-[#477B70]/20 border-t-[#477B70] rounded-full animate-spin" />
          <p className="text-xs text-[#68736B] font-medium tracking-wide">
            Verifying Zero-Trust Session...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Role-based navigation specification
  const navigation = [
    {
      name: t("nav.dashboard", "Dashboard"),
      href: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "hod", "faculty", "student"],
    },
    {
      name: t("nav.aiAssistant", "AI Assistant"),
      href: "/dashboard/ai-assistant",
      icon: Sparkles,
      roles: ["admin", "hod", "faculty", "student"],
    },
    {
      name:
        user.role === "student"
          ? t("nav.myDocuments", "My Documents")
          : t("nav.documentVault", "Document Vault"),
      href: "/dashboard/documents",
      icon: FileText,
      roles: ["admin", "hod", "faculty", "student"],
    },
    {
      name:
        user.role === "student"
          ? t("nav.accessGrants", "My Access Grants")
          : t("nav.accessGrants", "Access Grants"),
      href: "/dashboard/access-grants",
      icon: KeyRound,
      roles: ["admin", "hod", "faculty", "student"],
    },
    {
      name: t("nav.users", "User Directory"),
      href: "/dashboard/users",
      icon: Users,
      roles: ["admin", "hod"],
    },
    {
      name: t("nav.departments", "Departments"),
      href: "/dashboard/departments",
      icon: Building2,
      roles: ["admin"],
    },
    {
      name: t("nav.auditLogs", "Security Audit Logs"),
      href: "/dashboard/audit-logs",
      icon: ClipboardList,
      roles: ["admin", "hod"],
    },
    {
      name: t("nav.settings", "Settings"),
      href: "/dashboard/settings",
      icon: Settings,
      roles: ["admin", "hod", "faculty", "student"],
    },
  ];

  const filteredNav = navigation.filter((item) => item.roles.includes(user.role));

  const roleBadgeStyle: Record<string, string> = {
    admin: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA]",
    hod: "bg-purple-50 text-purple-700 border border-purple-200",
    faculty: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB]",
    student: "bg-[#EAF1EE] text-[#477B70] border border-[#A9C5BB]",
  };

  const departmentDisplay =
    user.department?.name ||
    (user.role === "admin" ? "Campus Administration" : "Unassigned Department");

  return (
    <div className="min-h-screen bg-[#F4F3EE] flex text-[#202923]">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#183A35]/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation - Dark Forest Green (#183A35) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#183A35] text-[#F4F3EE] border-r border-[#102724]
          transform transition-transform duration-200 ease-out lg:translate-x-0 flex flex-col
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Institution Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#224741]">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#234E48] border border-[#35635C] flex items-center justify-center shadow-inner">
              <Shield className="w-4 h-4 text-[#C18B52]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tracking-tight text-white block leading-tight">
                  CAMPUS<span className="text-[#C18B52]">VAULT</span>
                </span>
              </div>
              <span className="text-[10px] text-[#75978A] block font-medium tracking-wider uppercase">
                Zero-Trust Exchange
              </span>
            </div>
          </Link>
          <button
            className="lg:hidden text-[#75978A] hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150
                  ${
                    isActive
                      ? "bg-[#234E48] text-white font-semibold shadow-sm border border-[#35635C]/60"
                      : "text-[#A9C5BB] hover:text-white hover:bg-[#224741]/50"
                  }`}
              >
                <item.icon
                  className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    isActive ? "text-[#C18B52]" : "text-[#75978A]"
                  }`}
                />
                <span className="truncate">{item.name}</span>
                {isActive && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto text-[#C18B52]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Authenticated User Profile Summary */}
        <div className="p-3.5 border-t border-[#224741] bg-[#102724]/40">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-full bg-[#234E48] border border-[#35635C] flex items-center justify-center text-xs font-semibold text-[#F4F3EE]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-[11px] text-[#75978A] truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span
              className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded tracking-wider ${
                roleBadgeStyle[user.role] || "bg-[#234E48] text-[#A9C5BB]"
              }`}
            >
              {user.role}
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-[11px] text-[#A9C5BB] hover:text-[#C18B52] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t("nav.logout", "Sign Out")}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Institutional Header - Frosted Glass */}
        <header className="sticky top-0 z-30 bg-[#F4F3EE]/85 backdrop-blur-md border-b border-[#D9DED8] px-4 lg:px-6 py-3 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-[#68736B] hover:text-[#202923] p-1 rounded-md"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#477B70]" />
              <span className="text-xs font-medium text-[#202923]">
                {departmentDisplay}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications Popover */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-lg text-[#68736B] hover:text-[#202923] hover:bg-[#E9EBE5] transition-colors border border-transparent hover:border-[#D9DED8]"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#C18B52] text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-md border border-[#D9DED8] rounded-xl shadow-[0_8px_30px_rgba(24,58,53,0.12)] z-50 p-3 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-[#D9DED8]/70">
                    <span className="text-xs font-bold text-[#202923] flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#477B70]" />
                      {t("notif.title", "Notifications")}
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllNotificationsRead}
                        className="text-[10px] text-[#477B70] hover:text-[#325C53] font-medium hover:underline"
                      >
                        {t("notif.markAllRead", "Mark all read")}
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-[#68736B] text-center py-4">
                        {t("notif.empty", "No notifications")}
                      </p>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-lg text-xs border transition-colors ${
                            n.isRead
                              ? "bg-[#F4F3EE]/60 border-[#D9DED8]/60 text-[#68736B]"
                              : "bg-[#EAF1EE] border-[#A9C5BB] text-[#202923]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <strong className="text-[#202923] text-[11px] block font-semibold">
                              {n.title}
                            </strong>
                            <span className="text-[9px] text-[#68736B]">
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#68736B] mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          {n.relatedMessageId && (
                            <Link
                              href="/dashboard/ai-assistant?inquiry=latest-message"
                              onClick={() => setNotificationsOpen(false)}
                              className="text-[10px] text-[#477B70] hover:underline mt-1.5 inline-flex items-center gap-1 font-medium"
                            >
                              <span>Open in Vault AI</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cryptography Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EAF1EE] border border-[#A9C5BB]">
              <div className="w-1.5 h-1.5 bg-[#477B70] rounded-full" />
              <span className="text-[11px] font-medium text-[#325C53]">
                AES-256-GCM Active
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
