/**
 * THE VAULT — passphrase-based encryption (WebCrypto).
 * =================================================
 * Your passphrase (the "private key") derives an AES-256-GCM key via PBKDF2.
 * That key encrypts the app's data at rest (localStorage) and backup files.
 * The app code (the "public key") is fully public but reveals nothing without
 * the passphrase — the two must come together to decrypt.
 *
 * Honest limits (client-side, no server): this is real encryption-at-rest, not
 * server-enforced auth. A weak passphrase can be brute-forced offline, so use a
 * strong one. Forgetting it means the data is unrecoverable — by design.
 */

import lockConfig from '../config/lock.json'

const VAULT_META_KEY = 'resume-builder:vault:v1'
const ITERATIONS = 210000
const VERIFIER_TOKEN = 'resume-builder-vault-ok'

interface VaultMeta {
  salt: string // base64
  iterations: number
  verifier: string // AES-GCM(VERIFIER_TOKEN) — proves a passphrase is correct
}

// A GLOBAL lock baked into the code (src/config/lock.json): when enabled, every
// device is locked with the same passphrase, no per-device setup. The committed
// config holds only a salt + verifier (never the passphrase), so it's safe to
// be public — the passphrase is still required to derive the key.
const globalLock =
  lockConfig && lockConfig.enabled && lockConfig.salt && lockConfig.verifier
    ? (lockConfig as VaultMeta & { enabled: boolean })
    : null

// The derived key lives only in memory, only while unlocked.
let cryptoKey: CryptoKey | null = null

// ---- base64 <-> bytes ----
function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function b64decode(str: string): Uint8Array {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// TS's newer Uint8Array<ArrayBufferLike> isn't structurally assignable to
// WebCrypto's BufferSource; this cast is safe at runtime.
const bs = (b: Uint8Array | ArrayBuffer): BufferSource => b as unknown as BufferSource

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    bs(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptWith(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bs(iv) },
    key,
    bs(new TextEncoder().encode(plaintext)),
  )
  const packed = new Uint8Array(iv.length + ct.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ct), iv.length)
  return b64encode(packed)
}

async function decryptWith(key: CryptoKey, packedB64: string): Promise<string> {
  const packed = b64decode(packedB64)
  const iv = packed.slice(0, 12)
  const ct = packed.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(ct))
  return new TextDecoder().decode(pt)
}

// ---- public API ----

/** True if a lock exists — a global one baked in the code, or a per-device one. */
export function isConfigured(): boolean {
  return !!globalLock || !!localStorage.getItem(VAULT_META_KEY)
}

/** True when the lock is the global (code-baked) one — same passphrase everywhere. */
export function isGlobal(): boolean {
  return !!globalLock
}

export function isUnlocked(): boolean {
  return cryptoKey !== null
}

function readMeta(): VaultMeta | null {
  // The global lock takes precedence, so a fresh device is locked with no setup.
  if (globalLock) return { salt: globalLock.salt, iterations: globalLock.iterations, verifier: globalLock.verifier }
  const raw = localStorage.getItem(VAULT_META_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as VaultMeta
  } catch {
    return null
  }
}

/** Generate a global-lock config from a passphrase (for the setup tool). The
 *  returned object is safe to commit to src/config/lock.json — no passphrase. */
export async function generateGlobalConfig(
  passphrase: string,
): Promise<{ enabled: true; salt: string; iterations: number; verifier: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const verifier = await encryptWith(key, VERIFIER_TOKEN)
  return { enabled: true, salt: b64encode(salt), iterations: ITERATIONS, verifier }
}

/** Create a vault from a passphrase and unlock it. */
export async function setupVault(passphrase: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const verifier = await encryptWith(key, VERIFIER_TOKEN)
  const meta: VaultMeta = { salt: b64encode(salt), iterations: ITERATIONS, verifier }
  localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta))
  cryptoKey = key
}

/** Try to unlock with a passphrase. Returns true on success. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const meta = readMeta()
  if (!meta) return false
  const key = await deriveKey(passphrase, b64decode(meta.salt), meta.iterations)
  try {
    const token = await decryptWith(key, meta.verifier)
    if (token !== VERIFIER_TOKEN) return false
    cryptoKey = key
    return true
  } catch {
    return false
  }
}

export function lockVault(): void {
  cryptoKey = null
}

/** Remove the vault entirely (turns encryption off). Caller must re-persist data. */
export function clearVault(): void {
  localStorage.removeItem(VAULT_META_KEY)
  cryptoKey = null
}

export async function encrypt(plaintext: string): Promise<string> {
  if (!cryptoKey) throw new Error('vault is locked')
  return encryptWith(cryptoKey, plaintext)
}

export async function decrypt(packedB64: string): Promise<string> {
  if (!cryptoKey) throw new Error('vault is locked')
  return decryptWith(cryptoKey, packedB64)
}

/** KDF params of the active vault — embedded in encrypted backups so another
 *  device can re-derive the key from the same passphrase. */
export function getKdfParams(): { salt: string; iterations: number } | null {
  const meta = readMeta()
  return meta ? { salt: meta.salt, iterations: meta.iterations } : null
}

/** Decrypt a blob using a passphrase + explicit KDF params (for cross-device
 *  backup restore, where the local vault's salt differs). */
export async function decryptExternal(
  passphrase: string,
  saltB64: string,
  iterations: number,
  packedB64: string,
): Promise<string> {
  const key = await deriveKey(passphrase, b64decode(saltB64), iterations)
  return decryptWith(key, packedB64)
}
