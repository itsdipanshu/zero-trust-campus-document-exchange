"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, ArrowRight, Lock, FileText, Users, KeyRound, Building2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          router.push("/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F4F3EE] flex flex-col text-[#202923]">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-[#D9DED8] bg-white/70 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#183A35] border border-[#224741] flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-[#C18B52]" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-[#202923]">
              CAMPUS<span className="text-[#C18B52]">VAULT</span>
            </span>
            <span className="text-[10px] text-[#68736B] block tracking-wider uppercase">
              Zero-Trust Exchange
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/login")}
            className="text-xs font-semibold text-[#202923] hover:text-[#477B70] px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push("/register")}
            className="btn-primary text-xs py-1.5 px-3.5"
          >
            Create Account
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          {/* Logo Crest */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-[#183A35] rounded-2xl flex items-center justify-center border border-[#224741] shadow-[0_8px_30px_rgba(24,58,53,0.12)]">
                <Shield className="w-10 h-10 text-[#C18B52]" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#477B70] rounded-full border-2 border-[#F4F3EE]" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight text-[#202923]">
            Campus<span className="text-[#C18B52]">Vault</span>
          </h1>

          <p className="text-lg md:text-xl text-[#68736B] max-w-xl mx-auto mb-2 font-medium">
            Zero-Trust Campus Document Exchange & Private AI Assistant
          </p>
          <p className="text-xs text-[#68736B]/80 mb-8 font-mono">
            AES-256-GCM Envelope Encryption • Strict RBAC & ABAC • Audited Governance
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3.5 justify-center mb-16 max-w-sm mx-auto">
            <button
              onClick={() => router.push("/login")}
              className="btn-primary text-sm px-6 py-2.5 flex items-center justify-center gap-2 group shadow-md"
            >
              Sign In to Vault
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => router.push("/register")}
              className="btn-secondary text-sm px-6 py-2.5"
            >
              Register Campus ID
            </button>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
            <div className="card-hover p-5">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EE] border border-[#A9C5BB] flex items-center justify-center mb-3.5 text-[#325C53]">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-[#202923] font-bold text-sm mb-1.5">Zero-Trust Security</h3>
              <p className="text-[#68736B] text-xs leading-relaxed">
                Every access request is continuously verified. No implicit trust granted based on network location.
              </p>
            </div>

            <div className="card-hover p-5">
              <div className="w-10 h-10 rounded-lg bg-[#F6ECE0] border border-[#ECD5BA] flex items-center justify-center mb-3.5 text-[#845627]">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-[#202923] font-bold text-sm mb-1.5">Encrypted Vault Storage</h3>
              <p className="text-[#68736B] text-xs leading-relaxed">
                All uploaded documents are encrypted with AES-256-GCM authenticated cipher with dual SHA-256 verification.
              </p>
            </div>

            <div className="card-hover p-5">
              <div className="w-10 h-10 rounded-lg bg-[#E9EBE5] border border-[#D9DED8] flex items-center justify-center mb-3.5 text-[#202923]">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-[#202923] font-bold text-sm mb-1.5">Private Vault AI</h3>
              <p className="text-[#68736B] text-xs leading-relaxed">
                Account-aware AI assistant answers inquiries and securely transmits verified documents to faculty and peers.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-[#68736B] text-xs border-t border-[#D9DED8] bg-white/40">
        CampusVault © 2026 — Zero-Trust Document Exchange | NexHack 2.0
      </footer>
    </div>
  );
}
