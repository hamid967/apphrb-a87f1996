/**
 * ZATCA Phase 2 cryptography helpers — pure JS, Cloudflare Workers compatible.
 *
 *   - secp256k1 keys (ZATCA-required curve)  via @noble/curves
 *   - SHA-256                                 via @noble/hashes
 *   - AES-GCM at-rest encryption of the key   via WebCrypto
 *   - PKCS#10 CSR                             via a tiny built-in DER encoder
 *
 * The private key is stored AES-GCM-encrypted using the
 * `ZATCA_KEY_ENCRYPTION_KEY` server secret.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";

// ================================================================
// Byte / base64 helpers
// ================================================================
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}
function pemWrap(label: string, bytes: Uint8Array): string {
  const b64 = bytesToBase64(bytes);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

// ================================================================
// Minimal DER encoder
// ================================================================
function derLen(len: number): Uint8Array {
  if (len < 128) return new Uint8Array([len]);
  const buf: number[] = [];
  let n = len;
  while (n > 0) { buf.unshift(n & 0xff); n >>>= 8; }
  return new Uint8Array([0x80 | buf.length, ...buf]);
}
function derTLV(tag: number, value: Uint8Array): Uint8Array {
  return concat(new Uint8Array([tag]), derLen(value.length), value);
}
const SEQ = 0x30;
const SET = 0x31;
const OCT = 0x04;
const BIT = 0x03;
const INT = 0x02;
const OID = 0x06;
const NULL_TAG = 0x05;
const PRINTABLE_STRING = 0x13;
const UTF8_STRING = 0x0c;
const CONTEXT_0 = 0xa0;

function derSequence(...children: Uint8Array[]): Uint8Array {
  return derTLV(SEQ, concat(...children));
}
function derSet(...children: Uint8Array[]): Uint8Array {
  return derTLV(SET, concat(...children));
}
function derInteger(n: number): Uint8Array {
  return derTLV(INT, new Uint8Array([n]));
}
function derNull(): Uint8Array {
  return new Uint8Array([NULL_TAG, 0]);
}
function derBitString(bytes: Uint8Array, unusedBits = 0): Uint8Array {
  return derTLV(BIT, concat(new Uint8Array([unusedBits]), bytes));
}
function derOctetString(bytes: Uint8Array): Uint8Array {
  return derTLV(OCT, bytes);
}
function derPrintable(s: string): Uint8Array {
  return derTLV(PRINTABLE_STRING, enc.encode(s));
}
function derUtf8(s: string): Uint8Array {
  return derTLV(UTF8_STRING, enc.encode(s));
}
/** Encode an OID string like "1.2.840.10045.2.1" to DER value bytes. */
function derOid(oid: string): Uint8Array {
  const parts = oid.split(".").map((n) => parseInt(n, 10));
  const bytes: number[] = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v === 0) { bytes.push(0); continue; }
    const stack: number[] = [];
    while (v > 0) { stack.push(v & 0x7f); v >>>= 7; }
    for (let j = stack.length - 1; j >= 0; j--) {
      bytes.push(j === 0 ? stack[j] : stack[j] | 0x80);
    }
  }
  return derTLV(OID, new Uint8Array(bytes));
}

// OIDs
const OID_CN = "2.5.4.3";
const OID_O = "2.5.4.10";
const OID_OU = "2.5.4.11";
const OID_C = "2.5.4.6";
const OID_SN = "2.5.4.5";
const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";
const OID_SECP256K1 = "1.3.132.0.10";
const OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";
const OID_EXT_REQUEST = "1.2.840.113549.1.9.14";
const OID_SUBJECT_ALT_NAME = "2.5.29.17";
const OID_ZATCA_TEMPLATE = "1.3.6.1.4.1.311.20.2"; // template name attribute

function rdn(oidStr: string, value: string, printable = true): Uint8Array {
  return derSet(
    derSequence(derOid(oidStr), printable ? derPrintable(value) : derUtf8(value)),
  );
}

// ================================================================
// Key generation
// ================================================================
export interface EcKeyPair {
  privateKeyHex: string; // 32-byte scalar
  publicKeyHex: string; // 65-byte uncompressed (0x04 || X || Y)
  publicKeyPem: string; // SPKI PEM
}

export function generateEcKeyPair(): EcKeyPair {
  const priv = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(priv, false);
  const spki = derSequence(
    derSequence(derOid(OID_EC_PUBLIC_KEY), derOid(OID_SECP256K1)),
    derBitString(pub),
  );
  return {
    privateKeyHex: bytesToHex(priv),
    publicKeyHex: bytesToHex(pub),
    publicKeyPem: pemWrap("PUBLIC KEY", spki),
  };
}

// ================================================================
// AES-GCM at-rest encryption of the private key
// ================================================================
async function deriveAesKey(): Promise<CryptoKey> {
  const raw = process.env.ZATCA_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("ZATCA_KEY_ENCRYPTION_KEY is not configured");
  const material = sha256(enc.encode(raw));
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(material),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPrivateKey(privateKeyHex: string): Promise<string> {
  const key = await deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      toArrayBuffer(enc.encode(privateKeyHex)),
    ),
  );
  return bytesToBase64(concat(iv, cipher));
}

export async function decryptPrivateKey(payload: string): Promise<string> {
  const key = await deriveAesKey();
  const bytes = base64ToBytes(payload);
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    toArrayBuffer(cipher),
  );
  return dec.decode(plain);
}

// ================================================================
// ECDSA signing (SHA-256, DER)
// ================================================================
export function signEcdsa(privateKeyHex: string, data: Uint8Array): Uint8Array {
  const digest = sha256(data);
  const sig = secp256k1.sign(digest, hexToBytes(privateKeyHex));
  return sig.toBytes("der");
}

// ================================================================
// CSR (PKCS#10) construction per ZATCA
// ================================================================
export interface CsrInput {
  commonName: string; // e.g. "TST-886431145-399999999900003"
  organizationName: string;
  organizationalUnitName: string;
  countryName: string; // "SA"
  vatNumber: string; // 15-digit
  serialNumber: string; // "1-<solution>|2-<model>|3-<serial>"
  invoiceType: "1100" | "0100" | "1000" | "0110";
  location: string;
  industry: string;
  environment: "sandbox" | "simulation" | "production";
}

/**
 * Builds a PKCS#10 CSR PEM using secp256k1 + ECDSA-with-SHA256 with the
 * SubjectAlternativeName / template payload ZATCA's Fatoora onboarding
 * endpoint expects. The payload uses ZATCA's `key=value` pipe-delimited
 * convention for the SDK-compatible flow.
 */
export function buildCsr(keyPair: EcKeyPair, input: CsrInput): string {
  // 1) Subject
  const subject = derSequence(
    rdn(OID_CN, input.commonName),
    rdn(OID_O, input.organizationName, false),
    rdn(OID_OU, input.organizationalUnitName, false),
    rdn(OID_C, input.countryName),
    rdn(OID_SN, input.serialNumber),
  );

  // 2) SubjectPublicKeyInfo (secp256k1)
  const spki = derSequence(
    derSequence(derOid(OID_EC_PUBLIC_KEY), derOid(OID_SECP256K1)),
    derBitString(hexToBytes(keyPair.publicKeyHex)),
  );

  // 3) ZATCA custom attributes packed into SAN/OtherName (SDK format).
  const templateName = ({
    sandbox: "TSTZATCA-Code-Signing",
    simulation: "PREZATCA-Code-Signing",
    production: "ZATCA-Code-Signing",
  } as const)[input.environment];

  const zatcaPayload =
    `1-${input.invoiceType}|2-${input.location}|3-${input.industry}`;

  const sanExtValue = derOctetString(
    derSequence(
      derTLV(0x84, enc.encode(zatcaPayload)), // dNSName-style tag reused for compact payload
    ),
  );
  const sanExt = derSequence(derOid(OID_SUBJECT_ALT_NAME), sanExtValue);

  const templateExtValue = derOctetString(
    derSequence(derUtf8(templateName)),
  );
  const templateExt = derSequence(derOid(OID_ZATCA_TEMPLATE), templateExtValue);

  const extensions = derSequence(sanExt, templateExt);
  const extRequestAttr = derSequence(
    derOid(OID_EXT_REQUEST),
    derSet(extensions),
  );

  const attributes = derTLV(CONTEXT_0, extRequestAttr);

  // 4) CertificationRequestInfo
  const cri = derSequence(derInteger(0), subject, spki, attributes);

  // 5) Sign & wrap
  const sig = signEcdsa(keyPair.privateKeyHex, cri);
  const csr = derSequence(
    cri,
    derSequence(derOid(OID_ECDSA_SHA256)),
    derBitString(sig),
  );

  // Silence "unused" for vatNumber (kept for callers that log it).
  void input.vatNumber;

  return pemWrap("CERTIFICATE REQUEST", csr);
}

export function publicKeyFingerprint(publicKeyHex: string): string {
  return bytesToHex(sha256(hexToBytes(publicKeyHex))).slice(0, 16);
}
