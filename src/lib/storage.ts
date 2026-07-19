import type { Resume } from '../types/resume'
import { normalizeResume } from './normalize'
import { secureGet, secureSet, subscribeSecure } from './securestore'

const STORAGE_KEY = 'resume-builder:resumes:v1'

/** Notify subscribers (the UI) whenever storage changes. */
type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => fn())
}

// Refresh when the vault locks/unlocks (data appears/disappears).
subscribeSecure(emit)

function readRaw(): Resume[] {
  try {
    const raw = secureGet(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Normalize on read so older/hand-edited data is always safe to render.
    return parsed.map((r) => {
      try {
        return normalizeResume(r)
      } catch {
        return null
      }
    }).filter((r): r is Resume => r !== null)
  } catch {
    return []
  }
}

function writeRaw(resumes: Resume[]) {
  secureSet(STORAGE_KEY, JSON.stringify(resumes))
  emit()
}

export function getAllResumes(): Resume[] {
  return readRaw().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getResume(id: string): Resume | undefined {
  return readRaw().find((r) => r.id === id)
}

/**
 * Insert or update a resume by id. Returns the stored resume. This is the one
 * write path everything funnels through — the editor, imports, and the
 * programmatic ingress API all end up here.
 */
export function upsertResume(resume: Resume): Resume {
  const all = readRaw()
  const stored: Resume = { ...resume, updatedAt: new Date().toISOString() }
  const idx = all.findIndex((r) => r.id === stored.id)
  if (idx >= 0) {
    all[idx] = stored
  } else {
    all.push(stored)
  }
  writeRaw(all)
  return stored
}

export function deleteResume(id: string) {
  writeRaw(readRaw().filter((r) => r.id !== id))
}

export function duplicateResume(id: string): Resume | undefined {
  const source = getResume(id)
  if (!source) return undefined
  const copy = normalizeResume({
    ...source,
    id: undefined, // force a new id
    label: `${source.label} (copy)`,
  })
  return upsertResume(copy)
}
