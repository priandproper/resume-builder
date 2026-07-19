import { useState } from 'react'
import { generateGlobalConfig } from '../lib/vault'

/**
 * One-time tool to create the GLOBAL app-lock config. The user types their
 * passphrase here; we output a config blob (salt + verifier only — never the
 * passphrase) to paste into src/config/lock.json. Once committed + deployed,
 * every device shows the lock and the same passphrase unlocks it.
 */
export function SetupGlobalLock({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const wordCount = pass.trim() ? pass.trim().split(/[\s-]+/).filter(Boolean).length : 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (pass.length < 8) return setError('Use at least 8 characters (a 3–4 word phrase is ideal).')
    if (pass !== confirm) return setError('Passphrases don’t match.')
    setBusy(true)
    try {
      const cfg = await generateGlobalConfig(pass)
      const json = JSON.stringify(
        {
          _comment:
            'GLOBAL app lock. Generated from a passphrase (not stored here). Safe to commit publicly.',
          ...cfg,
        },
        null,
        2,
      )
      setResult(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the config.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="lock-overlay no-print">
      <div className="lock-card lock-card-wide">
        {!result ? (
          <form onSubmit={submit}>
            <h1 className="lock-title">Set up the app lock</h1>
            <p className="lock-sub">
              Choose one passphrase you'll type on every device. Use a 3–4 word phrase (e.g.
              “otter-marathon-1987”) — memorable but strong. It's never stored in the code; only a
              verifier is.
            </p>
            <input
              className="lock-input"
              type="password"
              autoFocus
              placeholder="Passphrase"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
            />
            {pass && wordCount < 3 && (
              <div className="lock-hint">Tip: 3+ words is much stronger than one.</div>
            )}
            <input
              className="lock-input"
              type="password"
              placeholder="Confirm passphrase"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {error && <div className="lock-error">{error}</div>}
            <button className="primary-btn lock-submit" type="submit" disabled={busy}>
              {busy ? 'Generating…' : 'Generate config'}
            </button>
            <button type="button" className="lock-cancel" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </form>
        ) : (
          <div>
            <h1 className="lock-title">Config ready</h1>
            <p className="lock-sub">
              This is safe to share — it does <strong>not</strong> contain your passphrase. Send it
              to be committed into <code>src/config/lock.json</code>. After it deploys, every device
              will ask for your passphrase.
            </p>
            <textarea className="lock-config-out" readOnly value={result} rows={8} />
            <button className="primary-btn lock-submit" type="button" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy config'}
            </button>
            <button type="button" className="lock-cancel" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
