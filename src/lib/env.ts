/**
 * ============================================================
 * CAMPUSVAULT – ENVIRONMENT CONFIGURATION & SECURITY VALIDATION
 * ============================================================
 * Centralized, safe validation of environment variables and secrets.
 * - Enforces zero-exposure: Never prints or logs actual secret values.
 * - Validates required cryptographic key formats and entropy.
 * - Prevents default development secrets from running in production.
 * ============================================================
 */

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // 1. DATABASE_URL Validation
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === "") {
    errors.push("[DATABASE_URL] Missing DATABASE_URL environment variable.");
  } else if (!dbUrl.startsWith("file:") && !dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    warnings.push("[DATABASE_URL] DATABASE_URL does not match standard SQLite ('file:...') or PostgreSQL ('postgresql://...') protocol.");
  }

  // 2. JWT_SECRET Validation
  const jwtSecret = process.env.JWT_SECRET;
  const isDefaultJwtSecret = jwtSecret === "campusvault-default-secret" || jwtSecret === "default-secret";

  if (!jwtSecret || jwtSecret.trim() === "") {
    if (isProduction) {
      errors.push("[JWT_SECRET] JWT_SECRET is missing. In production, a cryptographically secure random secret (min 32 chars) is strictly required.");
    } else {
      warnings.push("[JWT_SECRET] JWT_SECRET is not set in development. Falling back to temporary local secret.");
    }
  } else if (isProduction) {
    if (isDefaultJwtSecret) {
      errors.push("[JWT_SECRET] Default development secret detected in production environment. A unique random secret must be configured.");
    } else if (jwtSecret.length < 32) {
      errors.push(`[JWT_SECRET] Insufficient entropy: JWT_SECRET has ${jwtSecret.length} characters; expected at least 32 characters in production.`);
    }
  }

  // 3. DOCUMENT_ENCRYPTION_KEY Validation (AES-256-GCM)
  const encKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!encKey || encKey.trim() === "") {
    errors.push("[DOCUMENT_ENCRYPTION_KEY] Missing DOCUMENT_ENCRYPTION_KEY. Exactly 64 hex characters (32 bytes) are required for AES-256-GCM.");
  } else {
    const cleanKey = encKey.trim();
    const isHex = /^[0-9a-fA-F]+$/.test(cleanKey);
    if (!isHex) {
      errors.push("[DOCUMENT_ENCRYPTION_KEY] Key format error: DOCUMENT_ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f).");
    } else if (cleanKey.length !== 64) {
      errors.push(`[DOCUMENT_ENCRYPTION_KEY] Key size error: Expected exactly 64 hex characters (32 bytes / 256 bits), got ${cleanKey.length} characters.`);
    }
  }

  // 4. SUPABASE Configuration (Optional / Conditional)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith("https://") && !supabaseUrl.startsWith("http://")) {
    warnings.push("[SUPABASE_URL] NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Ensures environment is valid; throws descriptive startup error if fatal issues exist.
 */
export function ensureValidEnvironment(): void {
  const result = validateEnvironment();
  if (result.warnings.length > 0) {
    result.warnings.forEach((w) => console.warn(`[CONFIG_WARNING] ${w}`));
  }
  if (!result.valid) {
    const errorList = result.errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(`[CAMPUSVAULT CONFIGURATION ERROR]\n${errorList}\nPlease verify your .env configuration.`);
  }
}
