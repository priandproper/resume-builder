/**
 * WHOLE-STATE BACKUP / RESTORE
 * ===========================
 * One JSON file that captures the ENTIRE app state — every resume plus the
 * content library. Meant to live in an iCloud (or any synced) folder: back up
 * on one device, drop the file in iCloud, open it on your phone via Import to
 * restore everything. Restore is a merge (upsert by id), so it never wipes
 * resumes that aren't in the file.
 *
 * When a passphrase vault is set up, backups are ENCRYPTED (AES-GCM). The file
 * carries the KDF salt so any device with the passphrase can decrypt it.
 */
import type { Resume } from '../types/resume'
import { getAllResumes, upsertResume } from './storage'
import { getLibrary, replaceLibrary, type Library } from './library'
import { normalizeResume } from './normalize'
import * as vault from './vault'

export const BACKUP_TYPE = 'resume-builder-backup' as const
export const ENC_BACKUP_TYPE = 'resume-builder-backup-encrypted' as const

interface StatePayload {
  resumes: Resume[]
  library: Library
}

export interface PlainBackup extends StatePayload {
  type: typeof BACKUP_TYPE
  version: number
  exportedAt: string
}

export interface EncryptedBackup {
  type: typeof ENC_BACKUP_TYPE
  version: number
  exportedAt: string
  kdf: { salt: string; iterations: number }
  cipher: string
}

export function isEncryptedBackup(data: unknown): data is EncryptedBackup {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === ENC_BACKUP_TYPE
}

/** True for either backup form (vs. a single resume). */
export function isBackup(data: unknown): boolean {
  if (isEncryptedBackup(data)) return true
  return (
    !!data &&
    typeof data === 'object' &&
    ((data as { type?: unknown }).type === BACKUP_TYPE ||
      Array.isArray((data as { resumes?: unknown }).resumes))
  )
}

/** Build a backup of the current state — encrypted if a vault is unlocked. */
export async function buildBackup(nowIso: string): Promise<PlainBackup | EncryptedBackup> {
  const payload: StatePayload = { resumes: getAllResumes(), library: getLibrary() }
  if (vault.isConfigured() && vault.isUnlocked()) {
    const kdf = vault.getKdfParams()
    if (kdf) {
      return {
        type: ENC_BACKUP_TYPE,
        version: 1,
        exportedAt: nowIso,
        kdf,
        cipher: await vault.encrypt(JSON.stringify(payload)),
      }
    }
  }
  return { type: BACKUP_TYPE, version: 1, exportedAt: nowIso, ...payload }
}

function applyState(payload: StatePayload): { count: number; selectId?: string } {
  const list = Array.isArray(payload.resumes) ? payload.resumes : []
  let selectId: string | undefined
  list.forEach((r, i) => {
    try {
      const stored = upsertResume(normalizeResume(r))
      if (i === 0) selectId = stored.id
    } catch {
      /* skip malformed entries */
    }
  })
  if (payload.library && Array.isArray(payload.library.experiences)) {
    replaceLibrary(payload.library)
  }
  return { count: list.length, selectId }
}

/** Restore a plaintext backup (upsert resumes, replace library). */
export function restoreBackup(data: PlainBackup): { count: number; selectId?: string } {
  return applyState(data)
}

/**
 * Restore an encrypted backup. Tries the current in-memory key first (same
 * device); if that fails, calls getPassphrase() and derives the key from the
 * backup's own salt (cross-device). Throws if it can't be decrypted.
 */
export async function restoreEncryptedBackup(
  data: EncryptedBackup,
  getPassphrase: () => string | null,
): Promise<{ count: number; selectId?: string }> {
  let plaintext: string | null = null
  if (vault.isUnlocked()) {
    try {
      plaintext = await vault.decrypt(data.cipher)
    } catch {
      plaintext = null
    }
  }
  if (plaintext == null) {
    const pass = getPassphrase()
    if (!pass) throw new Error('Passphrase required to restore this backup.')
    plaintext = await vault.decryptExternal(pass, data.kdf.salt, data.kdf.iterations, data.cipher)
  }
  return applyState(JSON.parse(plaintext) as StatePayload)
}
