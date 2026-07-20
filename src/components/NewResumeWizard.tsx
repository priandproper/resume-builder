import { useState } from 'react'

/**
 * NEW-RESUME WIZARD
 * =================
 * Dead simple: paste a resume JSON payload, click Create. The payload is the
 * same ResumeInput shape the referral tracker sends (see types/resume.ts). The
 * parent normalizes it, seeds the global identity from its contact, stores it,
 * and selects it. Parsing errors surface inline so the modal stays open.
 */
export function NewResumeWizard({
  onCreate,
  onClose,
}: {
  onCreate: (data: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const create = () => {
    setError('')
    const t = text.trim()
    if (!t) return setError('Paste a resume JSON payload to create from.')
    let data: unknown
    try {
      data = JSON.parse(t)
    } catch {
      return setError('That isn’t valid JSON. Paste a resume payload.')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return setError('Payload must be a single JSON object (a resume).')
    }
    onCreate(data as Record<string, unknown>)
  }

  return (
    <div className="lock-overlay no-print" onClick={onClose}>
      <div className="lock-card lock-card-wide wizard-card" onClick={(e) => e.stopPropagation()}>
        <h1 className="lock-title">New resume</h1>
        <p className="lock-sub">
          Paste a resume JSON payload and it’ll be created as a new resume.
        </p>
        <textarea
          className="lock-config-out wizard-payload"
          placeholder='{ "contact": { "fullName": "…" }, "summary": "…", "experience": [ … ] }'
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          autoFocus
          spellCheck={false}
        />
        {error && <div className="lock-error">{error}</div>}
        <button className="primary-btn lock-submit" type="button" onClick={create}>
          Create resume
        </button>
        <button type="button" className="lock-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
