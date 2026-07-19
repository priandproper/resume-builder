import { useState } from 'react'
import { Logo } from './Logo'

/**
 * Full-screen passphrase gate. Two modes:
 *  - 'unlock' — enter the passphrase to decrypt and open the app.
 *  - 'setup'  — choose a passphrase (with confirmation) to turn encryption on.
 */
export function LockScreen({
  mode,
  onUnlock,
  onSetup,
  onCancelSetup,
}: {
  mode: 'unlock' | 'setup'
  onUnlock?: (passphrase: string) => Promise<boolean>
  onSetup?: (passphrase: string) => Promise<void>
  onCancelSetup?: () => void
}) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'setup') {
      if (pass.length < 6) return setError('Use at least 6 characters.')
      if (pass !== confirm) return setError('Passphrases don’t match.')
      setBusy(true)
      try {
        await onSetup?.(pass)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not set up the lock.')
      } finally {
        setBusy(false)
      }
    } else {
      if (!pass) return
      setBusy(true)
      const ok = await onUnlock?.(pass)
      setBusy(false)
      if (!ok) {
        setError('Incorrect passphrase.')
        setPass('')
      }
    }
  }

  return (
    <div className="lock-overlay no-print">
      <form className="lock-card" onSubmit={submit}>
        <div className="lock-logo">
          <Logo size={40} />
        </div>
        <h1 className="lock-title">{mode === 'setup' ? 'Set a passphrase' : 'Resume Builder'}</h1>
        <p className="lock-sub">
          {mode === 'setup'
            ? 'This encrypts all your resumes and backups. Only this passphrase can unlock them — there’s no reset, so store it somewhere safe.'
            : 'Enter your passphrase to unlock your resumes.'}
        </p>
        <input
          className="lock-input"
          type="password"
          autoFocus
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
        />
        {mode === 'setup' && (
          <input
            className="lock-input"
            type="password"
            placeholder="Confirm passphrase"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        )}
        {error && <div className="lock-error">{error}</div>}
        <button className="primary-btn lock-submit" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'setup' ? 'Enable lock' : 'Unlock'}
        </button>
        {mode === 'setup' && onCancelSetup && (
          <button type="button" className="lock-cancel" onClick={onCancelSetup} disabled={busy}>
            Cancel
          </button>
        )}
      </form>
    </div>
  )
}
