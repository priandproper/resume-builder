/**
 * SECURE STORAGE
 * ==============
 * A drop-in replacement for the raw localStorage calls used by storage.ts and
 * library.ts. It keeps the existing SYNCHRONOUS read/write API while persisting
 * data ENCRYPTED (via the vault) when a passphrase is configured.
 *
 * Modes:
 *  - No vault configured  → passthrough to plaintext localStorage (as before).
 *  - Vault configured, LOCKED   → reads return null (nothing is exposed).
 *  - Vault configured, UNLOCKED → reads/writes hit an in-memory plaintext cache
 *    that mirrors the (encrypted) localStorage; writes re-encrypt in the
 *    background.
 */
import * as vault from './vault'

const PREFIX = 'resume-builder:'
const VAULT_META_KEY = 'resume-builder:vault:v1'

const cache = new Map<string, string>()
let unlocked = false

type Listener = () => void
const listeners = new Set<Listener>()
export function subscribeSecure(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit() {
  listeners.forEach((fn) => fn())
}

/** Is the app currently locked (configured but not yet unlocked)? */
export function isLocked(): boolean {
  return vault.isConfigured() && !unlocked
}

export function secureGet(key: string): string | null {
  if (!vault.isConfigured()) return localStorage.getItem(key)
  return unlocked ? cache.get(key) ?? null : null
}

async function persist(key: string): Promise<void> {
  const val = cache.get(key)
  if (val == null) return
  try {
    localStorage.setItem(key, await vault.encrypt(val))
  } catch {
    /* locked mid-flight; ignore */
  }
}

export function secureSet(key: string, value: string): void {
  if (!vault.isConfigured()) {
    localStorage.setItem(key, value)
    return
  }
  if (!unlocked) return
  cache.set(key, value)
  void persist(key) // re-encrypts the latest cache value; last write wins
}

export function secureRemove(key: string): void {
  if (!vault.isConfigured()) {
    localStorage.removeItem(key)
    return
  }
  cache.delete(key)
  localStorage.removeItem(key)
}

function managedKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && k !== VAULT_META_KEY) keys.push(k)
  }
  return keys
}

function looksLikePlaintextJson(v: string): boolean {
  const t = v.trim()
  if (t[0] !== '{' && t[0] !== '[') return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

/** After a successful unlock: decrypt all managed keys into the cache. Any value
 *  that's still plaintext (e.g. data written before a lock was enabled) is
 *  adopted as-is and re-encrypted, so enabling the lock migrates old data. */
export async function hydrate(): Promise<void> {
  cache.clear()
  const migrate: string[] = []
  for (const k of managedKeys()) {
    const raw = localStorage.getItem(k)
    if (raw == null) continue
    try {
      cache.set(k, await vault.decrypt(raw))
    } catch {
      if (looksLikePlaintextJson(raw)) {
        cache.set(k, raw) // legacy plaintext — keep and re-encrypt below
        migrate.push(k)
      }
      /* else: not ours / corrupt — skip */
    }
  }
  unlocked = true
  await Promise.all(migrate.map((k) => persist(k)))
  emit()
}

/** After setupVault(): encrypt the currently-plaintext data in place. */
export async function migratePlaintextToEncrypted(): Promise<void> {
  const keys = managedKeys()
  for (const k of keys) {
    const plain = localStorage.getItem(k)
    if (plain == null) continue
    cache.set(k, plain)
    localStorage.setItem(k, await vault.encrypt(plain))
  }
  unlocked = true
  emit()
}

/** After clearVault(): write the in-memory cache back as plaintext. */
export async function migrateEncryptedToPlaintext(): Promise<void> {
  for (const [k, v] of cache) localStorage.setItem(k, v)
  unlocked = false
  emit()
}

/** Lock: flush pending encryption, then drop the key and clear the cache. */
export async function lockSecure(): Promise<void> {
  await Promise.all(managedKeys().map((k) => persist(k)))
  unlocked = false
  cache.clear()
  vault.lockVault()
  emit()
}
