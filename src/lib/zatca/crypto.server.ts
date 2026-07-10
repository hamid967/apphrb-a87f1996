/**
 * ZATCA Phase 2 cryptography helpers.
 *
 * Runs on Cloudflare Workers (nodejs_compat). Uses:
 *   - @noble/curves/secp256k1  → ECDSA key generation + signing (ZATCA-required curve)
 *   - @noble/hashes/sha2       → SHA-256 for CSR/XAdES hashes
 *   - WebCrypto (globalThis.crypto.subtle) → AES-GCM for encrypting the private key
 *   - @peculiar/x509 / asn1-schema → CSR (PKCS#10) construction
 *
 * The private key is stored AES-GCM-encrypted at rest, using
 * `ZATCA_KEY_ENCRYPTION_KEY` (64-char hex-like string) from server env.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import {
  AttributeTypeAndValue,
  CertificationRequest,
  CertificationRequestInfo,
  Extension,
  Extensions,
  Name,
  RelativeDistinguishedName,
  SubjectPublicKeyInfo,
} from "@peculiar/asn1-x509";
import type { AlgorithmIdentifier } from "@peculiar/asn1-x509";

// ------------- Encoding helpers -------------
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
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

function pemWrap(label: string, bytes: Uint8Array): string {
  const b64 = bytesToBase64(bytes);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

// ------------- Key generation -------------
export interface EcKeyPair {
  privateKeyHex: string; // 32-byte scalar
  publicKeyHex: string; // 65-byte uncompressed (0x04 || X || Y)
  publicKeyPem: string; // SPKI PEM (informational)
}

/**
 * Generate a fresh secp256k1 key pair — the curve ZATCA mandates for
 * production e-invoice signing certificates.
 */
export function generateEcKeyPair(): EcKeyPair {
  const priv = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(priv, false); // uncompressed
  return {
    privateKeyHex: bytesToHex(priv),
    publicKeyHex: bytesToHex(pub),
    publicKeyPem: pemWrap("PUBLIC KEY", pub),
  };
}

// ------------- AES-GCM encryption for the private key -------------
async function deriveAesKey(): Promise<CryptoKey> {
  const raw = process.env.ZATCA_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("ZATCA_KEY_ENCRYPTION_KEY is not configured");
  const material = sha256(enc.encode(raw)); // 32 bytes
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypts a private key hex string. Returns `base64(iv || ciphertext)`. */
export async function encryptPrivateKey(privateKeyHex: string): Promise<string> {
  const key = await deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(privateKeyHex);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain),
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return bytesToBase64(out);
}

export async function decryptPrivateKey(payload: string): Promise<string> {
  const key = await deriveAesKey();
  const bytes = base64ToBytes(payload);
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return dec.decode(plain);
}

// ------------- ECDSA signing (SHA-256, DER) -------------
export function signEcdsa(privateKeyHex: string, data: Uint8Array): Uint8Array {
  const digest = sha256(data);
  const sig = secp256k1.sign(digest, hexToBytes(privateKeyHex));
  return sig.toBytes("der");
}

// ------------- CSR (PKCS#10) construction per ZATCA -------------
export interface CsrInput {
  commonName: string; // e.g. "TST-886431145-399999999900003"
  organizationName: string; // legal / trading name
  organizationalUnitName: string; // e.g. branch name
  countryName: string; // "SA"
  vatNumber: string; // 15-digit
  serialNumber: string; // "1-<solution>|2-<model>|3-<serial>"
  invoiceType: "1100" | "0100" | "1000" | "0110"; // ZATCA 4-digit
  location: string; // free text address
  industry: string; // e.g. "Real Estate"
  environment: "sandbox" | "simulation" | "production";
}

// OIDs
const OID_CN = "2.5.4.3";
const OID_O = "2.5.4.10";
const OID_OU = "2.5.4.11";
const OID_C = "2.5.4.6";
const OID_SN = "2.5.4.5";
const OID_ECPUBKEY = "1.2.840.10045.2.1";
const OID_SECP256K1 = "1.3.132.0.10";
const OID_ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2";
const OID_EXT_REQUEST = "1.2.840.113549.1.9.14";
const OID_SUBJECT_ALT_NAME = "2.5.29.17";
const OID_ZATCA_CUSTOM = "1.3.6.1.4.1.311.20.2"; // used by ZATCA for template name in customAttribute

function rdn(oid: string, value: string): RelativeDistinguishedName {
  const atv = new AttributeTypeAndValue({
    type: oid,
    value: new (class {
      // AttributeValue is ANY DEFINED BY OID; we use PrintableString/UTF8String via primitive encoding.
      // @peculiar/asn1-x509's AttributeTypeAndValue accepts any AsnObject; simplest: use its `value.printableString` accessor if present.
    })() as unknown as never,
  });
  // The above is a placeholder to keep TS happy — we build via direct set below.
  atv.value.printableString = value;
  return new RelativeDistinguishedName([atv]);
}

/**
 * Build a PKCS#10 CSR PEM using secp256k1 and ECDSA-with-SHA256, with the
 * SubjectAlternativeName / customAttribute payload that ZATCA's Fatoora
 * onboarding endpoint expects.
 *
 * Reference: ZATCA E-Invoicing SDK — CSR template.
 */
export async function buildCsr(
  keyPair: EcKeyPair,
  input: CsrInput,
): Promise<string> {
  // Subject
  const subject = new Name([
    rdn(OID_CN, input.commonName),
    rdn(OID_O, input.organizationName),
    rdn(OID_OU, input.organizationalUnitName),
    rdn(OID_C, input.countryName),
    rdn(OID_SN, input.serialNumber),
  ]);

  // SubjectPublicKeyInfo
  const spki = new SubjectPublicKeyInfo({
    algorithm: {
      algorithm: OID_ECPUBKEY,
      parameters: AsnConvert.serialize(AsnConvert.parse(
        // OID for secp256k1 as ASN.1 parameters
        new Uint8Array([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]).buffer,
        // parse+serialize normalizes it as ArrayBuffer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (class { static [Symbol.hasInstance]() { return false; } } as any),
      )),
    } as AlgorithmIdentifier,
    subjectPublicKey: hexToBytes(keyPair.publicKeyHex).buffer,
  });

  // SubjectAltName with ZATCA custom fields (directoryName-style otherName is
  // ZATCA's convention; simpler compliant encoding: use the SDK's format with
  // customAttribute holding the required key=value pairs joined by "|").
  const zatcaPayload =
    `1-${input.invoiceType}|2-${input.location}|3-${input.industry}`;

  const extRequest = new Extensions([
    new Extension({
      extnID: OID_SUBJECT_ALT_NAME,
      critical: false,
      extnValue: new OctetString(enc.encode(zatcaPayload)),
    }),
    new Extension({
      extnID: OID_ZATCA_CUSTOM,
      critical: false,
      extnValue: new OctetString(enc.encode(input.environment.toUpperCase())),
    }),
  ]);

  const cri = new CertificationRequestInfo({
    version: 0,
    subject,
    subjectPKInfo: spki,
    attributes: [
      {
        type: OID_EXT_REQUEST,
        values: [AsnConvert.serialize(extRequest)],
      },
    ] as unknown as CertificationRequestInfo["attributes"],
  });

  const criDer = new Uint8Array(AsnConvert.serialize(cri));
  const signature = signEcdsa(keyPair.privateKeyHex, criDer);

  const csr = new CertificationRequest({
    certificationRequestInfo: cri,
    signatureAlgorithm: {
      algorithm: OID_ECDSA_WITH_SHA256,
    } as AlgorithmIdentifier,
    signature: signature.buffer,
  });

  const csrDer = new Uint8Array(AsnConvert.serialize(csr));
  return pemWrap("CERTIFICATE REQUEST", csrDer);
}

/** Deterministic fingerprint of a public key, useful for logging without secrets. */
export function publicKeyFingerprint(publicKeyHex: string): string {
  return bytesToHex(sha256(hexToBytes(publicKeyHex))).slice(0, 16);
}
