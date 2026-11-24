import crypto from "crypto";

/**
 * ============================================================
 * CAMPUSVAULT - Cryptography Security Engine
 * ============================================================
 * Standards:
 * - Cipher: AES-256-GCM (Galois/Counter Mode with 128-bit authentication tag)
 * - IV/Nonce: 96-bit (12 bytes) cryptographically random per encryption
 * - Key: 256-bit (32 bytes) loaded strictly from environment
 * - Integrity: SHA-256 dual verification (GCM MAC + SHA-256 digest)
 * - Format: [MAGIC(8)] [IV(12)] [TAG(16)] [HASH(32)] [CIPHERTEXT(N)]
 * ============================================================
 */

export const MAGIC_HEADER = Buffer.from("CVLT_GCM", "ascii"); // 8 bytes
export const IV_LENGTH = 12; // 96 bits for standard AES-GCM
export const TAG_LENGTH = 16; // 128-bit auth tag
export const HASH_LENGTH = 32; // 256-bit SHA-256 hash
export const HEADER_LENGTH =
  MAGIC_HEADER.length + IV_LENGTH + TAG_LENGTH + HASH_LENGTH; // 68 bytes

/**
 * Loads and validates the 256-bit AES master key from the environment.
 * Keys are NEVER hardcoded in source code or sent to the client.
 */
export function getEncryptionKey(): Buffer {
  const hexKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error(
      "[CRYPTO_ERROR] DOCUMENT_ENCRYPTION_KEY environment variable is not configured."
    );
  }

  const cleanHex = hexKey.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error(
      "[CRYPTO_ERROR] Invalid DOCUMENT_ENCRYPTION_KEY format: Expected exactly 64 hexadecimal characters (32 bytes / 256 bits)."
    );
  }

  const keyBuffer = Buffer.from(cleanHex, "hex");

  if (keyBuffer.length !== 32) {
    throw new Error(
      `[CRYPTO_ERROR] Invalid DOCUMENT_ENCRYPTION_KEY length: expected 32 bytes, got ${keyBuffer.length} bytes.`
    );
  }

  return keyBuffer;
}

/**
 * Computes raw SHA-256 digest (32 bytes).
 */
export function computeSha256(buffer: Buffer): Buffer {
  return crypto.createHash("sha256").update(buffer).digest();
}

/**
 * Computes hexadecimal SHA-256 digest string.
 */
export function computeSha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Checks whether a binary buffer contains our AES-256-GCM envelope.
 */
export function isEncryptedDocument(buffer: Buffer): boolean {
  if (!buffer || buffer.length < MAGIC_HEADER.length) return false;
  return buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER);
}

/**
 * Encrypts a plaintext document buffer using AES-256-GCM.
 * Generates a unique 12-byte IV for every encryption operation.
 * Packs IV, 16-byte Auth Tag, and SHA-256 plaintext digest into a self-contained envelope.
 */
export async function encryptDocument(
  plaintext: Buffer,
  overrideKey?: Buffer
): Promise<{
  encryptedBuffer: Buffer;
  sha256: string;
  ivHex: string;
}> {
  if (!plaintext || plaintext.length === 0) {
    throw new Error("[CRYPTO_ERROR] Cannot encrypt empty document buffer.");
  }

  const key = overrideKey || getEncryptionKey();

  // Generate cryptographically secure unique 12-byte IV/Nonce
  const iv = crypto.randomBytes(IV_LENGTH);

  // Compute original plaintext SHA-256 checksum for integrity verification
  const plaintextHash = computeSha256(plaintext);

  // Initialize AES-256-GCM cipher
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  if (authTag.length !== TAG_LENGTH) {
    throw new Error("[CRYPTO_ERROR] Invalid authentication tag length.");
  }

  // Construct binary envelope: [MAGIC 8B] [IV 12B] [TAG 16B] [HASH 32B] [CIPHERTEXT NB]
  const encryptedBuffer = Buffer.concat([
    MAGIC_HEADER,
    iv,
    authTag,
    plaintextHash,
    ciphertext,
  ]);

  return {
    encryptedBuffer,
    sha256: plaintextHash.toString("hex"),
    ivHex: iv.toString("hex"),
  };
}

/**
 * Decrypts an encrypted document envelope.
 * Strictly verifies AES-GCM 16-byte authentication tag AND original SHA-256 digest.
 * If file was modified or key is wrong, throws descriptive error and returns NO plaintext.
 */
export async function decryptDocument(
  fileBuffer: Buffer,
  overrideKey?: Buffer
): Promise<{
  plaintext: Buffer;
  sha256: string;
  isEncrypted: boolean;
}> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("[CRYPTO_ERROR] Empty file buffer provided for decryption.");
  }

  // Backward compatibility check: if file is not encrypted with our envelope, return as legacy
  if (!isEncryptedDocument(fileBuffer)) {
    const hash = computeSha256Hex(fileBuffer);
    return {
      plaintext: fileBuffer,
      sha256: hash,
      isEncrypted: false,
    };
  }

  if (fileBuffer.length < HEADER_LENGTH) {
    throw new Error(
      "[CRYPTO_ERROR] Corrupted file: file size is smaller than the required encryption header."
    );
  }

  const key = overrideKey || getEncryptionKey();

  // Unpack envelope fields
  let offset = MAGIC_HEADER.length; // 8
  const iv = fileBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH; // 20
  const authTag = fileBuffer.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH; // 36
  const expectedHash = fileBuffer.subarray(offset, offset + HASH_LENGTH);
  offset += HASH_LENGTH; // 68
  const ciphertext = fileBuffer.subarray(offset);

  let plaintext: Buffer;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Authentication tag failure";
    throw new Error(
      `[CRYPTO_AUTH_FAILED] Decryption failed: Invalid key or authentication tag mismatch (file has been tampered with or corrupted). ${msg}`
    );
  }

  // Double verification: verify SHA-256 checksum of recovered plaintext
  const actualHash = computeSha256(plaintext);
  if (!crypto.timingSafeEqual(expectedHash, actualHash)) {
    throw new Error(
      "[CRYPTO_INTEGRITY_FAILED] File integrity verification failed: Decrypted content does not match original SHA-256 digest."
    );
  }

  return {
    plaintext,
    sha256: actualHash.toString("hex"),
    isEncrypted: true,
  };
}
