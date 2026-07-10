/**
 * ZATCA cryptographic primitives (server-only).
 *
 * ZATCA e-invoicing Phase 2 requires ECDSA over the `secp256k1` curve
 * (a.k.a. K-256), which is NOT exposed by the WebCrypto implementation in
 * the Cloudflare Worker runtime. We therefore use `@noble/curves` for the
 * curve maths and WebCrypto for symmetric AES-GCM around the private key at
 * rest.
 *
 * Nothing in this module talks to the DB or to Fatoora — that lives in
 * `zatca-onboarding.functions.ts` and `fatoora-client.server.ts`.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";

// ---------------------------------------------------------------------------
// Key pair
// ---------------------------------------------------------------------------

export type EcKeyPair = {
  /** 32-byte private scalar, hex-encoded (lowercase, no 0x). */
  privateKeyHex: string;
  /** 65-byte uncompressed SEC1 public key (0x04 || X || Y), hex-encoded. */
  publicKeyHex: string;
  /** PEM-encoded PKCS#8 private key (as ZATCA expects for CSR tooling). */
  privateKeyPem: string;
  /** PEM-encoded SubjectPublicKeyInfo public key. */
  publicKeyPem: string;
};

/**
 * Generate a fresh ECDSA `secp256k1` key pair.
 * The PEM forms wrap ASN.1 DER structures hand-built here because WebCrypto
 * on Workers cannot produce `secp256k1` PKCS#8.
 */
export function generateEcKeyPair(): EcKeyPair {
  const priv = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(priv, false); // uncompressed, 65 bytes

  const privateKeyHex = bytesToHex(priv);
  const publicKeyHex = bytesToHex(pub);

  return {
    privateKeyHex,
    publicKeyHex,
    privateKeyPem: encodePkcs8Secp256k1Pem(priv, pub),
    publicKeyPem: encodeSpkiSecp256k1Pem(pub),
  };
}

/** Deterministic SHA-256 over an arbitrary byte buffer. */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

// ---------------------------------------------------------------------------
// Private-key encryption at rest (AES-GCM via WebCrypto)
// ---------------------------------------------------------------------------

const AES_ALGO = "AES-GCM";
const AES_IV_LEN = 12;

function getMasterKeyMaterial(): Uint8Array {
  const raw = process.env.ZATCA_KEY_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ZATCA_KEY_ENCRYPTION_KEY is not configured (expected a 32+ char secret).",
    );
  }
  // Normalize any string length to a stable 32-byte AES key.
  return sha256(new TextEncoder().encode(raw));
}

async function importAesKey(): Promise<CryptoKey> {
  const material = getMasterKeyMaterial();
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: AES_ALGO },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a PEM (or any UTF-8 string) with AES-GCM and return
 * `base64(iv || ciphertext || tag)`. Ciphertext output from WebCrypto
 * already includes the auth tag as the trailing 16 bytes.
 */
export async function encryptPrivateKey(plaintext: string): Promise<string> {
  const key = await importAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LEN));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: AES_ALGO, iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

/**
 * Reverse of `encryptPrivateKey`. Throws if the ciphertext was produced
 * with a different master key or is tampered.
 */
export async function decryptPrivateKey(ciphertextB64: string): Promise<string> {
  const key = await importAesKey();
  const buf = base64ToBytes(ciphertextB64);
  if (buf.length <= AES_IV_LEN) {
    throw new Error("Encrypted private key payload is truncated.");
  }
  const iv = buf.slice(0, AES_IV_LEN);
  const ct = buf.slice(AES_IV_LEN);
  const pt = await crypto.subtle.decrypt({ name: AES_ALGO, iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------------------------------------------------------------------------
// Internal ASN.1 / PEM helpers
// ---------------------------------------------------------------------------

/** DER OID for id-ecPublicKey (1.2.840.10045.2.1). */
const OID_EC_PUBLIC_KEY = new Uint8Array([
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
]);
/** DER OID for secp256k1 (1.3.132.0.10). */
const OID_SECP256K1 = new Uint8Array([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);

function derLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derSequence(...children: Uint8Array[]): Uint8Array {
  const body = concatBytes(...children);
  const header = concatBytes(new Uint8Array([0x30]), derLength(body.length));
  return concatBytes(header, body);
}

function derOctetString(body: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([0x04]), derLength(body.length), body);
}

function derBitString(body: Uint8Array): Uint8Array {
  const inner = concatBytes(new Uint8Array([0x00]), body); // 0 unused bits
  return concatBytes(new Uint8Array([0x03]), derLength(inner.length), inner);
}

function derInteger(n: number): Uint8Array {
  return concatBytes(
    new Uint8Array([0x02, 0x01, n & 0xff]),
  );
}

/** PKCS#8 wrapper for a secp256k1 raw private key + uncompressed public. */
function encodePkcs8Secp256k1Pem(privRaw: Uint8Array, pubRaw: Uint8Array): string {
  // ECPrivateKey (RFC 5915): SEQ { INT 1, OCTET STRING priv, [1] BIT STRING pub }
  const ecPrivateKey = derSequence(
    derInteger(1),
    derOctetString(privRaw),
    // [1] EXPLICIT BIT STRING (context-specific tag 1, constructed)
    concatBytes(
      new Uint8Array([0xa1]),
      derLength(derBitString(pubRaw).length),
      derBitString(pubRaw),
    ),
  );

  const algorithmIdentifier = derSequence(OID_EC_PUBLIC_KEY, OID_SECP256K1);

  // PrivateKeyInfo: SEQ { INT 0, algorithm, OCTET STRING ecPrivateKey }
  const pkcs8 = derSequence(
    derInteger(0),
    algorithmIdentifier,
    derOctetString(ecPrivateKey),
  );

  return derToPem(pkcs8, "PRIVATE KEY");
}

/** SubjectPublicKeyInfo for a secp256k1 uncompressed public key. */
function encodeSpkiSecp256k1Pem(pubRaw: Uint8Array): string {
  const algorithmIdentifier = derSequence(OID_EC_PUBLIC_KEY, OID_SECP256K1);
  const spki = derSequence(algorithmIdentifier, derBitString(pubRaw));
  return derToPem(spki, "PUBLIC KEY");
}

function derToPem(der: Uint8Array, label: string): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
