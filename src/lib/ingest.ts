/**
 * PROGRAMMATIC INGRESS — how an external app (the referral tracker) gets a
 * resume into this builder without a backend. Three channels, all funneling
 * through normalizeResume() -> upsertResume():
 *
 *  1. URL parameter        ?import=<url-encoded or base64 JSON>
 *  2. window.postMessage   { type: 'resume-builder:ingest', resume: {...} }
 *  3. File / paste import   (wired up in the UI; uses ingestResume directly)
 *
 * The referral tracker only needs to build JSON matching the ResumeInput shape
 * in types/resume.ts and hand it to any of these channels.
 */
import type { Resume, ResumeInput } from '../types/resume'
import { normalizeResume } from './normalize'
import { upsertResume } from './storage'

const POST_MESSAGE_TYPE = 'resume-builder:ingest'
const POST_MESSAGE_ACK = 'resume-builder:ingest-ack'

/** Validate + persist one incoming resume. Returns the stored Resume. */
export function ingestResume(input: ResumeInput | Record<string, unknown>): Resume {
  const normalized = normalizeResume(input)
  return upsertResume(normalized)
}

/** Try to decode a JSON string that may be raw JSON or base64-encoded JSON. */
function decodeMaybeBase64(value: string): unknown {
  const tryParse = (s: string) => JSON.parse(s)
  // First attempt: treat as (already URL-decoded) raw JSON.
  try {
    return tryParse(value)
  } catch {
    // Second attempt: base64 -> JSON.
    try {
      return tryParse(atob(value))
    } catch {
      throw new Error('import value is neither valid JSON nor base64-encoded JSON')
    }
  }
}

/**
 * On startup, check the URL for `?import=...` and ingest it. Returns the id of
 * the ingested resume so the app can select it, or null if nothing to import.
 * Cleans the param out of the URL afterward so a refresh doesn't re-import.
 */
export function ingestFromUrl(): { id: string } | { error: string } | null {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('import')
  if (!raw) return null

  try {
    const data = decodeMaybeBase64(raw)
    const stored = ingestResume(data as ResumeInput)
    // Remove the param so refreshes don't duplicate the import.
    params.delete('import')
    const qs = params.toString()
    const clean = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    window.history.replaceState({}, '', clean)
    return { id: stored.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Listen for resumes pushed via window.postMessage. An external app (or a page
 * that embeds this builder in an iframe) can do:
 *
 *   target.postMessage(
 *     { type: 'resume-builder:ingest', resume: {...}, requestId: 'abc' },
 *     '*'
 *   )
 *
 * On success we post back { type: 'resume-builder:ingest-ack', ok: true,
 * id, requestId }. On failure, { ok: false, error, requestId }.
 *
 * onIngest is called with the new resume id so the UI can focus it.
 * Returns an unsubscribe function.
 */
export function listenForPostMessage(onIngest: (id: string) => void): () => void {
  const handler = (event: MessageEvent) => {
    const data = event.data
    if (!data || typeof data !== 'object' || data.type !== POST_MESSAGE_TYPE) return

    const reply = (payload: Record<string, unknown>) => {
      const source = event.source as Window | null
      try {
        source?.postMessage(
          { type: POST_MESSAGE_ACK, requestId: data.requestId, ...payload },
          { targetOrigin: event.origin && event.origin !== 'null' ? event.origin : '*' },
        )
      } catch {
        /* best-effort ack */
      }
    }

    try {
      const stored = ingestResume(data.resume ?? data)
      onIngest(stored.id)
      reply({ ok: true, id: stored.id })
    } catch (err) {
      reply({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
