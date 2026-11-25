"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 shadow-lg shadow-amber-500/10">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-white mb-2">404 - Page Not Found</h1>
      <p className="text-slate-400 max-w-md mb-8">
        The campus resource or document exchange endpoint you requested does not exist or may have been restricted under Zero-Trust policy.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-md shadow-emerald-950"
      >
        <ArrowLeft className="w-4 h-4" /> Return to CampusVault
      </Link>
    </div>
  );
}
