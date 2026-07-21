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

/** Decode base64 (which may hold UTF-8 bytes) back to a JS string. */
function b64ToUtf8(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Try to decode a JSON string that may be raw JSON or base64-encoded JSON. */
function decodeMaybeBase64(value: string): unknown {
  const tryParse = (s: string) => JSON.parse(s)
  // First attempt: treat as (already URL-decoded) raw JSON.
  try {
    return tryParse(value)
  } catch {
    // Second attempt: base64 -> UTF-8 -> JSON (UTF-8 aware so em-dashes,
    // accents, etc. survive; a plain atob would mangle multi-byte chars).
    try {
      return tryParse(b64ToUtf8(value))
    } catch {
      throw new Error('import value is neither valid JSON nor base64-encoded JSON')
    }
  }
}

/**
 * On startup, check the URL for an `import` payload and ingest it. Returns the
 * id of the ingested resume so the app can select it, or null if nothing to
 * import. Cleans the payload out of the URL afterward so a refresh doesn't
 * re-import.
 *
 * The payload is read from the URL *hash* (`#import=...`) first, falling back to
 * the query string (`?import=...`). The hash is preferred because a full resume
 * JSON is large (often 6–10 KB) and, in the query string, that overflows server
 * request-line limits — GitHub Pages returns "414 URI Too Long" before the app
 * ever loads. The hash fragment is never sent to the server, so it always loads.
 */
export function ingestFromUrl(): { id: string } | { error: string } | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const raw = hash.get('import') ?? query.get('import')
  if (!raw) return null

  try {
    const data = decodeMaybeBase64(raw)
    const stored = ingestResume(data as ResumeInput)
    // Remove the payload from both hash and query so refreshes don't re-import.
    query.delete('import')
    hash.delete('import')
    const qs = query.toString()
    const hs = hash.toString()
    const clean = window.location.pathname + (qs ? `?${qs}` : '') + (hs ? `#${hs}` : '')
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
