"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  User,
  Lock,
  Mail,
  Building2,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Shield,
  Globe,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { SupportedLanguage } from "@/lib/i18n/translations";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  department: { id: string; name: string } | null;
  departmentId: string | null;
  status: string;
  websiteLanguage?: string;
  aiLanguage?: string;
  createdAt: string;
}

export default function SettingsPage() {
  const {
    t,
    language,
    setLanguage,
    aiLanguage,
    setAiLanguage,
    supportedLanguages,
    supportedAiLanguages,
    dir,
  } = useTranslation();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ name: "" });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [langSaving, setLangSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUser(data.data.user);
          setProfileForm({ name: data.data.user.name });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileForm.name }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: t("common.success") + ": Profile updated" });
        setUser({ ...user, name: profileForm.name });
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: t("common.error") });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordForm.newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Password changed successfully" });
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update password" });
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (langCode: SupportedLanguage) => {
    setLanguage(langCode);
    setLangSaving(true);
    try {
      await fetch("/api/users/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteLanguage: langCode }),
      });
      setMessage({ type: "success", text: t("settings.langSaved") });
    } catch {
      // silent
    } finally {
      setLangSaving(false);
    }
  };

  const handleAiLanguageChange = async (aiLangCode: string) => {
    setAiLanguage(aiLangCode);
    try {
      await fetch("/api/users/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiLanguage: aiLangCode }),
      });
      setMessage({ type: "success", text: "AI Assistant language updated" });
    } catch {
      // silent
    }
  };

  const roleColors: Record<string, string> = {
    admin: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA]",
    hod: "bg-purple-50 text-purple-700 border border-purple-200",
    faculty: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB]",
    student: "bg-[#EAF1EE] text-[#477B70] border border-[#A9C5BB]",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[#477B70] animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="pb-2 border-b border-[#D9DED8]">
        <h1 className="text-xl font-bold text-[#202923] tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#477B70]" />
          {t("settings.title")}
        </h1>
        <p className="text-[#68736B] text-xs mt-0.5">
          {t("settings.subtitle")}
        </p>
      </div>

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

      {/* Language Preferences Card */}
      <div className="card space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-[#202923] flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#477B70]" />
              {t("settings.langTitle")}
            </h2>
            {langSaving && <Loader2 className="w-3.5 h-3.5 text-[#477B70] animate-spin" />}
          </div>
          <p className="text-xs text-[#68736B] mb-3">{t("settings.langDesc")}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {supportedLanguages.map((langMeta) => {
              const isSelected = language === langMeta.code;
              return (
                <button
                  key={langMeta.code}
                  type="button"
                  onClick={() => handleLanguageChange(langMeta.code)}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#202923] font-semibold shadow-sm"
                      : "bg-white/70 border-[#D9DED8] text-[#202923] hover:border-[#477B70] hover:bg-white"
                  }`}
                >
                  <span className="text-xs font-bold text-[#477B70]">{langMeta.nativeName}</span>
                  <span className="text-xs text-[#68736B] mt-0.5">{langMeta.name}</span>
                </button>
              );
            })}
          </div>
          {dir === "rtl" && (
            <p className="text-xs text-[#845627] mt-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              {t("settings.rtlNotice")}
            </p>
          )}
        </div>

        {/* Independent AI Language */}
        <div className="pt-4 border-t border-[#D9DED8]">
          <label className="block text-sm font-semibold text-[#202923] mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#477B70]" />
            {t("settings.aiLangTitle")}
          </label>
          <p className="text-xs text-[#68736B] mb-3">{t("settings.aiLangDesc")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {supportedAiLanguages.map((aiMeta) => {
              const isSelected = aiLanguage === aiMeta.code;
              return (
                <button
                  key={aiMeta.code}
                  type="button"
                  onClick={() => handleAiLanguageChange(aiMeta.code)}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#202923] font-semibold shadow-sm"
                      : "bg-white/70 border-[#D9DED8] text-[#202923] hover:border-[#477B70] hover:bg-white"
                  }`}
                >
                  <span className="text-xs font-bold text-[#477B70]">{aiMeta.nativeName}</span>
                  <span className="text-xs text-[#68736B] mt-0.5">{aiMeta.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Google Gemini AI Integration Status */}
        <div className="pt-4 border-t border-[#D9DED8] mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-[#D9DED8]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#EAF1EE] border border-[#A9C5BB] flex items-center justify-center text-[#477B70] flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#202923] flex items-center gap-2">
                  Google Gemini API Integration
                  <span className="bg-[#E9EBE5] text-[#202923] border border-[#D9DED8] text-[9px] uppercase px-1.5 py-0.2 rounded font-medium">
                    gemini-2.5-flash
                  </span>
                </h4>
                <p className="text-[11px] text-[#68736B] mt-0.5">
                  Secure server-side LLM reasoning with Zero-Trust boundary isolation & function calling.
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#EAF1EE] border border-[#A9C5BB] text-[11px] font-medium text-[#325C53]">
                <Shield className="w-3 h-3 text-[#477B70]" />
                Zero-Trust Shield Active
              </span>
            </div>
          </div>
          <p className="text-[10px] text-[#68736B] mt-2">
            🔒 Security Protocol: Keys are stored exclusively in server environment (<code className="text-[#202923] font-mono">GEMINI_API_KEY</code>) and never transmitted to the browser.
          </p>
        </div>
      </div>

      {/* Profile Overview */}
      <div className="card">
        <h2 className="text-base font-semibold text-[#202923] mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-[#477B70]" />
          {t("settings.profileTab")}
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-[#183A35] text-white flex items-center justify-center font-bold text-xl border border-[#224741]">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-bold text-[#202923]">{user.name}</h3>
            <p className="text-[#68736B] text-xs">{user.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${roleColors[user.role] || "bg-[#E9EBE5] text-[#202923]"}`}>
                {user.role}
              </span>
              <span className="bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB] text-[10px] uppercase px-2 py-0.5 rounded font-medium">
                {user.status}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-[#F4F3EE]/80 border border-[#D9DED8] rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[#68736B] mb-1 font-medium">
              <Building2 className="w-3.5 h-3.5 text-[#477B70]" />
              Department
            </div>
            <p className="text-[#202923] font-semibold">{user.department?.name || "Not assigned"}</p>
          </div>
          <div className="bg-[#F4F3EE]/80 border border-[#D9DED8] rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[#68736B] mb-1 font-medium">
              <Shield className="w-3.5 h-3.5 text-[#477B70]" />
              Member Since
            </div>
            <p className="text-[#202923] font-semibold">
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Edit Profile */}
      <div className="card">
        <h2 className="text-base font-semibold text-[#202923] mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-[#477B70]" />
          Edit Profile Information
        </h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              className="input-field text-xs"
              value={profileForm.name}
              onChange={(e) => setProfileForm({ name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
              Campus Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
              <input
                type="email"
                className="input-field text-xs pl-9 opacity-60 cursor-not-allowed bg-[#E9EBE5]"
                value={user.email}
                disabled
              />
            </div>
            <p className="text-[11px] text-[#68736B] mt-1">Verified campus identity cannot be modified</p>
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-xs py-2 px-4 flex items-center gap-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("common.save")}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="card">
        <h2 className="text-base font-semibold text-[#202923] mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#477B70]" />
          {t("settings.securityTab")}
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <input
              type="password"
              className="input-field text-xs"
              placeholder="Min 6 characters"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, newPassword: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              className="input-field text-xs"
              placeholder="Repeat new password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
              required
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-xs py-2 px-4 flex items-center gap-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
