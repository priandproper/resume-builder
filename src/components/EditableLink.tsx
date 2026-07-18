import { useLayoutEffect, useRef } from 'react'

/**
 * A contact link that DISPLAYS a short label ("LinkedIn") but LINKS to the full
 * URL — the link target survives into the printed PDF, so clicking it in the PDF
 * opens the real page. Still editable: click it and it reveals the raw URL to
 * edit; blur and it snaps back to the label.
 */
export function EditableLink({
  url,
  label,
  placeholder,
  onChange,
}: {
  url: string
  label: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLAnchorElement | null>(null)

  // When not being edited, show the label (or nothing when there's no URL).
  // useLayoutEffect so text is present before the parent measures for one-page fit.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    const shown = url ? label : ''
    if (el.textContent !== shown) el.textContent = shown
  }, [url, label])

  const href = url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : undefined

  return (
    <a
      ref={ref}
      className={`editable editable-link ${url ? '' : 'is-empty'}`}
      href={href}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      role="textbox"
      aria-label={placeholder}
      spellCheck={false}
      // Editing, not navigating: clicking places the caret instead of opening.
      onClick={(e) => e.preventDefault()}
      // Reveal the raw URL to edit on focus.
      onFocus={(e) => {
        e.currentTarget.textContent = url
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent || '').trim()
        e.currentTarget.textContent = next ? label : ''
        if (next !== url) onChange(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}
