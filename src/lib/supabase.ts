import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * ============================================================
 * CAMPUSVAULT – SUPABASE INTEGRATION CLIENT
 * ============================================================
 * Official Supabase Client with:
 * - Secure Server-Side access patterns
 * - Dual persistence with Zero-Trust Security Engine
 * - RLS policy alignment
 * - Service-role key protection (NEVER exposed to browser)
 * ============================================================
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://campusvault-project.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.campusvault-anon-placeholder";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

/**
 * Public client for client-side or anonymous requests (uses Anon Key).
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Privileged server-side client (uses Service-Role Key when configured).
 * Strictly used on the server in protected route handlers.
 */
export function getServiceSupabase(): SupabaseClient {
  const key = supabaseServiceKey || supabaseAnonKey;
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Checks if a live external Supabase project has been provided in environment variables.
 */
export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  );
}

/**
 * Supabase Profiles Helper
 */
export async function syncUserProfileToSupabase(profile: {
  id: string;
  fullName: string;
  email: string;
  role: string;
  departmentId: string | null;
  status: string;
}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const client = getServiceSupabase();
    const { data, error } = await client.from("profiles").upsert(
      {
        id: profile.id,
        full_name: profile.fullName,
        email: profile.email,
        role: profile.role,
        department_id: profile.departmentId,
        status: profile.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );
    if (error) console.warn("[SUPABASE] Profile sync warning:", error.message);
    return data;
  } catch (err: unknown) {
    console.warn("[SUPABASE] Profile sync non-fatal error:", err);
    return null;
  }
}

/**
 * Supabase Audit Log Helper
 */
export async function syncAuditLogToSupabase(entry: {
  userId: string;
  documentId?: string | null;
  action: string;
  decision?: string | null;
  reason?: string | null;
}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const client = getServiceSupabase();
    const { data, error } = await client.from("audit_logs").insert({
      user_id: entry.userId,
      document_id: entry.documentId || null,
      action: entry.action,
      decision: entry.decision || null,
      reason: entry.reason || null,
    });
    if (error) console.warn("[SUPABASE] Audit sync warning:", error.message);
    return data;
  } catch (err: unknown) {
    console.warn("[SUPABASE] Audit sync non-fatal error:", err);
    return null;
  }
}
