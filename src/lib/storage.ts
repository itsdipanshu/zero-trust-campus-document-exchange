import fs from "fs";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { getServiceSupabase, isSupabaseConfigured } from "./supabase";

export const VAULT_BUCKET_NAME = "vault-documents";

/**
 * Returns the safest writable directory for local caching:
 * - On serverless (Vercel / AWS Lambda): `/tmp/campusvault-uploads` (the only writable directory)
 * - On local development: `<cwd>/uploads` with graceful fallback to `os.tmpdir()`
 */
export function getLocalUploadDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    return path.join(os.tmpdir(), "campusvault-uploads");
  }
  const localDir = path.join(process.cwd(), "uploads");
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    return path.join(os.tmpdir(), "campusvault-uploads");
  }
}

let bucketEnsured = false;

/**
 * Ensures the private Supabase Storage bucket exists.
 */
async function ensurePrivateBucket(): Promise<boolean> {
  if (bucketEnsured) return true;
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = getServiceSupabase();
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn("[STORAGE] Could not list Supabase buckets:", listError.message);
      return false;
    }

    const exists = buckets?.some((b) => b.name === VAULT_BUCKET_NAME);
    if (!exists) {
      const { error: createError } = await supabase.storage.createBucket(VAULT_BUCKET_NAME, {
        public: false, // Strict private bucket - zero public access
        fileSizeLimit: 25 * 1024 * 1024, // 25MB max
      });
      if (createError && !createError.message.includes("already exists")) {
        console.warn("[STORAGE] Failed to create private bucket:", createError.message);
        return false;
      }
    }

    bucketEnsured = true;
    return true;
  } catch (err: any) {
    console.warn("[STORAGE] Exception ensuring private bucket:", err?.message || err);
    return false;
  }
}

/**
 * Stores an encrypted document buffer.
 * Uploads to Supabase Storage private bucket (production) and writes to local cache.
 */
export async function storeEncryptedDocument(
  storageKey: string,
  encryptedBuffer: Buffer,
  mimeType: string = "application/octet-stream"
): Promise<{ success: boolean; storageLocation: "supabase" | "local" }> {
  let storedInSupabase = false;

  // 1. Try Supabase Storage Private Bucket
  try {
    const hasBucket = await ensurePrivateBucket();
    if (hasBucket) {
      const supabase = getServiceSupabase();
      const { error: uploadError } = await supabase.storage
        .from(VAULT_BUCKET_NAME)
        .upload(storageKey, encryptedBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError) {
        storedInSupabase = true;
      } else {
        console.warn("[STORAGE] Supabase Storage upload failed, falling back to local/tmp:", uploadError.message);
      }
    }
  } catch (cloudErr: any) {
    console.warn("[STORAGE] Cloud storage exception:", cloudErr?.message || cloudErr);
  }

  // 2. Always persist to writable local/tmp cache
  try {
    const uploadDir = getLocalUploadDir();
    await mkdir(uploadDir, { recursive: true });
    const localFilePath = path.join(uploadDir, storageKey);
    await writeFile(localFilePath, encryptedBuffer);
  } catch (fsErr: any) {
    console.warn("[STORAGE] Local write warning:", fsErr?.message || fsErr);
    if (!storedInSupabase) {
      throw new Error(`Failed to store document in cloud or local storage: ${fsErr?.message || "File write error"}`);
    }
  }

  return {
    success: true,
    storageLocation: storedInSupabase ? "supabase" : "local",
  };
}

/**
 * Retrieves the raw encrypted document buffer.
 * Checks local cache first, then Supabase Storage private bucket.
 */
export async function retrieveEncryptedDocument(storageKey: string): Promise<Buffer> {
  const uploadDir = getLocalUploadDir();
  const localFilePath = path.join(uploadDir, storageKey);
  const fallbackCwdPath = path.join(process.cwd(), "uploads", storageKey);

  // 1. Check local/tmp cache
  if (fs.existsSync(localFilePath)) {
    try {
      return await readFile(localFilePath);
    } catch {
      // Continue to next source
    }
  }

  // 2. Check fallback process.cwd()/uploads (for existing local docs)
  if (fs.existsSync(fallbackCwdPath)) {
    try {
      return await readFile(fallbackCwdPath);
    } catch {
      // Continue to next source
    }
  }

  // 3. Download from Supabase Storage private bucket
  if (isSupabaseConfigured()) {
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase.storage.from(VAULT_BUCKET_NAME).download(storageKey);
      if (!error && data) {
        const arrayBuf = await data.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        // Cache locally for subsequent fast reads
        try {
          await mkdir(uploadDir, { recursive: true });
          await writeFile(localFilePath, buf);
        } catch {}
        return buf;
      } else if (error) {
        console.warn("[STORAGE] Cloud retrieve warning:", error.message);
      }
    } catch (err: any) {
      console.warn("[STORAGE] Cloud retrieve exception:", err?.message || err);
    }
  }

  throw new Error(`Encrypted document file '${storageKey}' could not be located in storage.`);
}

/**
 * Deletes an encrypted document from storage.
 */
export async function deleteEncryptedDocument(storageKey: string): Promise<void> {
  // 1. Delete from Supabase Storage
  if (isSupabaseConfigured()) {
    try {
      const supabase = getServiceSupabase();
      await supabase.storage.from(VAULT_BUCKET_NAME).remove([storageKey]);
    } catch (err: any) {
      console.warn("[STORAGE] Failed to delete from cloud:", err?.message || err);
    }
  }

  // 2. Delete from local cache
  const uploadDir = getLocalUploadDir();
  const localFilePath = path.join(uploadDir, storageKey);
  if (fs.existsSync(localFilePath)) {
    try {
      await unlink(localFilePath);
    } catch {}
  }
}
