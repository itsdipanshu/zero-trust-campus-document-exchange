import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/ai/gemini-status - Reports Gemini integration status without revealing keys
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return errorResponse("Unauthorized", 401);

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const isConfigured = Boolean(apiKey && apiKey.length > 5 && !apiKey.includes("your-gemini-api-key"));
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    return successResponse({
      configured: isConfigured,
      model,
      provider: "Google Gemini",
      zeroTrustShield: "Active",
      fallbackActive: !isConfigured,
      maskedKey: isConfigured && apiKey ? `${apiKey.substring(0, 4)}...${apiKey.slice(-4)}` : null,
    });
  } catch (error) {
    return errorResponse("Failed to query Gemini status", 500);
  }
}
