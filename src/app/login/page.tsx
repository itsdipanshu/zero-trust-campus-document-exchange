"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, Mail, Lock, AlertCircle, Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(`Server configuration error (HTTP ${res.status}). Please verify that DATABASE_URL and JWT_SECRET are set in your Netlify/Vercel settings.`);
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || `Authentication failed (HTTP ${res.status}). Invalid credentials or database configuration.`);
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Network connection error. Please verify your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3EE] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Institutional Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-10 h-10 bg-[#183A35] border border-[#224741] rounded-xl flex items-center justify-center shadow-md">
              <Shield className="w-5 h-5 text-[#C18B52]" />
            </div>
            <div className="text-left">
              <span className="text-xl font-bold tracking-tight text-[#202923] block">
                CAMPUS<span className="text-[#C18B52]">VAULT</span>
              </span>
              <span className="text-xs text-[#68736B] block font-medium">
                Zero-Trust Document Exchange
              </span>
            </div>
          </Link>
        </div>

        {/* Login Card - Frosted Glass */}
        <div className="card shadow-[0_8px_30px_rgba(24,58,53,0.06)] p-7">
          <div className="border-b border-[#D9DED8] pb-4 mb-6">
            <h2 className="text-lg font-bold text-[#202923]">
              Institutional Sign In
            </h2>
            <p className="text-xs text-[#68736B] mt-1">
              Enter your verified credentials to access authorized campus documents
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg p-3 mb-5">
              <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-rose-700 font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                Campus Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                <input
                  type="email"
                  className="input-field pl-9 text-xs"
                  placeholder="user@campusvault.edu"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                <input
                  type="password"
                  className="input-field pl-9 text-xs"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-xs font-semibold mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#D9DED8] text-center text-xs text-[#68736B]">
            Need a student or faculty account?{" "}
            <Link
              href="/register"
              className="text-[#477B70] hover:text-[#325C53] font-semibold hover:underline"
            >
              Register here
            </Link>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-[11px] text-[#68736B] flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#477B70]" />
          <span>Zero-Trust Architecture • All Access Requests Authenticated & Audited</span>
        </div>
      </div>
    </div>
  );
}
