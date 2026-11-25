import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * ============================================================
 * CAMPUSVAULT – SUPABASE INTEGRATION CLIENT (AUTH & DATABASE)
 * ============================================================
 * Official Supabase Client with:
 * - Supabase Auth (Sign In, Sign Up, Session Verification)
 * - PostgreSQL Cloud Database integration
 * - Dual persistence with Zero-Trust Security Engine
 * - RLS policy alignment
 * - Service-role key protection (NEVER exposed to browser)
 * ============================================================
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://cxaxxdxicgybwqmufemf.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_yJpV2wZW_UJsqaDtgFyNww_l32pPkUr";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  supabaseAnonKey;

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
 * Supabase Auth: Register new user
 */
export async function supabaseSignUp(email: string, password: string, metadata?: Record<string, any>) {
  if (!isSupabaseConfigured()) return { user: null, session: null, error: null };
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata || {},
      },
    });
    return { user: data.user, session: data.session, error: error?.message || null };
  } catch (err: any) {
    console.warn("[SUPABASE AUTH] Sign-up exception:", err?.message || err);
    return { user: null, session: null, error: err?.message || "Auth failed" };
  }
}

/**
 * Supabase Auth: Sign in existing user
 */
export async function supabaseSignIn(email: string, password: string) {
  if (!isSupabaseConfigured()) return { user: null, session: null, error: null };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { user: data.user, session: data.session, error: error?.message || null };
  } catch (err: any) {
    console.warn("[SUPABASE AUTH] Sign-in exception:", err?.message || err);
    return { user: null, session: null, error: err?.message || "Auth failed" };
  }
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
