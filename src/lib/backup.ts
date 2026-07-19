/**
 * WHOLE-STATE BACKUP / RESTORE
 * ===========================
 * One JSON file that captures the ENTIRE app state — every resume plus the
 * content library. Meant to live in an iCloud (or any synced) folder: back up
 * on one device, drop the file in iCloud, open it on your phone via Import to
 * restore everything. Restore is a merge (upsert by id), so it never wipes
 * resumes that aren't in the file.
 */
import type { Resume } from '../types/resume'
import { getAllResumes, upsertResume } from './storage'
import { getLibrary, replaceLibrary, type Library } from './library'
import { normalizeResume } from './normalize'

export const BACKUP_TYPE = 'resume-builder-backup' as const

export interface BackupFile {
  type: typeof BACKUP_TYPE
  version: number
  exportedAt: string
  resumes: Resume[]
  library: Library
}

/** True if a parsed JSON blob is a whole-state backup (vs. a single resume). */
export function isBackup(data: unknown): data is BackupFile {
  return (
    !!data &&
    typeof data === 'object' &&
    ((data as { type?: unknown }).type === BACKUP_TYPE ||
      Array.isArray((data as { resumes?: unknown }).resumes))
  )
}

/** Build the backup object for the current state. */
export function buildBackup(nowIso: string): BackupFile {
  return {
    type: BACKUP_TYPE,
    version: 1,
    exportedAt: nowIso,
    resumes: getAllResumes(),
    library: getLibrary(),
  }
}

/**
 * Restore a backup: upsert every resume (merge by id) and, if present, replace
 * the library. Returns how many resumes were restored and the id to select.
 */
export function restoreBackup(data: BackupFile): { count: number; selectId?: string } {
  const list = Array.isArray(data.resumes) ? data.resumes : []
  let selectId: string | undefined
  list.forEach((r, i) => {
    try {
      const stored = upsertResume(normalizeResume(r))
      if (i === 0) selectId = stored.id
    } catch {
      /* skip malformed entries */
    }
  })
  if (data.library && Array.isArray(data.library.experiences)) {
    replaceLibrary(data.library)
  }
  return { count: list.length, selectId }
}
