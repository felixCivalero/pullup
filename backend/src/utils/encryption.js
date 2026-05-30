// backend/src/utils/encryption.js
//
// Reversible symmetric encryption for secrets we must DECRYPT to use
// (unlike magic-link tokens, which are SHA-256 *hashed* one-way). First
// consumer: Instagram long-lived access tokens stored in
// instagram_connections.access_token.
//
// AES-256-GCM. Key is read from APP_ENCRYPTION_KEY (32 bytes, hex- or
// base64-encoded). Output format: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`
// so we can rotate algorithms later behind the version prefix.

import crypto from "node:crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard

function loadKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept hex (64 chars) or base64.
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "base64");
  }
  if (buf.length !== 32) {
    throw new Error(
      "[encryption] APP_ENCRYPTION_KEY must decode to 32 bytes (got " +
        buf.length +
        ")",
    );
  }
  return buf;
}

/**
 * Encrypt a UTF-8 string. Returns the versioned envelope, or throws if no
 * key is configured (we never silently store plaintext secrets).
 */
export function encryptSecret(plaintext) {
  if (plaintext == null) return null;
  const key = loadKey();
  if (!key) {
    throw new Error(
      "[encryption] APP_ENCRYPTION_KEY not set — refusing to store a secret in plaintext",
    );
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a versioned envelope back to the original UTF-8 string.
 * Returns null for null input; throws on tampered/invalid input.
 */
export function decryptSecret(envelope) {
  if (envelope == null) return null;
  const key = loadKey();
  if (!key) {
    throw new Error("[encryption] APP_ENCRYPTION_KEY not set — cannot decrypt");
  }
  const parts = String(envelope).split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("[encryption] unrecognised ciphertext envelope");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

/** True when an encryption key is configured (for startup/health checks). */
export function hasEncryptionKey() {
  try {
    return !!loadKey();
  } catch {
    return false;
  }
}
