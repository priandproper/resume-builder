/**
 * GLOBAL IDENTITY
 * ===============
 * The contact block — name, email, phone, location, website, LinkedIn, GitHub —
 * is the same person on every resume. So it lives ONCE here (in localStorage,
 * encrypted via the secure store) and every resume renders it. Edit it on any
 * resume and it updates everywhere. Import payloads (from the referral tracker)
 * don't carry it — the app fetches it from here.
 */
import type { ContactInfo } from '../types/resume'
import { secureGet, secureSet, subscribeSecure } from './securestore'

const KEY = 'resume-builder:identity:v1'
const EMPTY: ContactInfo = { fullName: '' }

type Listener = () => void
const listeners = new Set<Listener>()
export function subscribeIdentity(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit() {
  listeners.forEach((fn) => fn())
}
// Refresh when the vault locks/unlocks.
subscribeSecure(emit)

function hasAny(c: ContactInfo | undefined): boolean {
  return (
    !!c &&
    !!(c.fullName || c.email || c.phone || c.location || c.website || c.linkedin || c.github)
  )
}

export function getIdentity(): ContactInfo {
  try {
    const raw = secureGet(KEY)
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as ContactInfo) }
  } catch {
    /* fall through */
  }
  return { ...EMPTY }
}

export function setIdentity(patch: Partial<ContactInfo>): void {
  const next = { ...getIdentity(), ...patch }
  secureSet(KEY, JSON.stringify(next))
  emit()
}

/** Seed the global identity from an existing contact (a resume or the library)
 *  the first time — so a user's already-entered contact carries over. No-op if
 *  identity already has anything, or the source is empty. */
export function seedIdentityIfEmpty(from: ContactInfo | undefined): void {
  if (hasAny(getIdentity()) || !hasAny(from)) return
  secureSet(KEY, JSON.stringify({ ...EMPTY, ...from }))
  emit()
}
