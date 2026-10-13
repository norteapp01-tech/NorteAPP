// Criptografia dos tokens do Google (AES-256-GCM) e utilitários de segredo.
//
// Usa só Web Crypto — o mesmo código roda no Deno (Edge Functions) e no Node
// (testes). A chave vem de GOOGLE_TOKEN_ENCRYPTION_KEY e nunca sai do servidor.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const toBase64Url = (bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function fromBase64Url(value: string): Uint8Array {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/** Aceita chave em base64 (32 bytes), hexadecimal (64 caracteres) ou qualquer
 * texto — este último passa por SHA-256, para sempre resultar em 32 bytes. */
export async function importKey(material: string): Promise<CryptoKey> {
  let raw: Uint8Array | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(material))
    raw = Uint8Array.from(material.match(/../g)!.map((h) => parseInt(h, 16)));
  else {
    try {
      const bytes = base64ToBytes(material);
      if (bytes.length === 32) raw = bytes;
    } catch {
      /* não era base64 */
    }
  }
  if (!raw) raw = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(material)));
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** "v1.<iv>.<texto cifrado>", ambos em base64url. IV novo a cada chamada. */
export async function encryptToken(plain: string, material: string): Promise<string> {
  const key = await importKey(material);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(cipher)}`;
}

export async function decryptToken(blob: string, material: string): Promise<string> {
  const [version, iv, cipher] = blob.split(".");
  if (version !== "v1" || !iv || !cipher) throw new Error("Formato de token inválido.");
  const key = await importKey(material);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) as BufferSource },
    key,
    fromBase64Url(cipher) as BufferSource,
  );
  return dec.decode(plain);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Comparação em tempo constante (anti-ataque de tempo). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))));
}
