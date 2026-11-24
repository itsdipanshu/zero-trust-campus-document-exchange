"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function MessagesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/ai-assistant?inquiry=messages");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Loader2 className="w-6 h-6 text-[#477B70] animate-spin" />
      <p className="text-xs text-[#68736B]">Opening Vault AI Document & Messaging Assistant...</p>
    </div>
  );
}
