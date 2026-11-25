"use client";

import { useEffect } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CampusVault Root Error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center antialiased">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-6 shadow-lg shadow-rose-500/10">
          <AlertOctagon className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">System Interruption (500)</h1>
        <p className="text-slate-400 max-w-md mb-8">
          An unexpected security or runtime exception was intercepted by CampusVault. Your session context remains protected.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-sm transition-all"
        >
          <RotateCcw className="w-4 h-4" /> Try Again
        </button>
      </body>
    </html>
  );
}
